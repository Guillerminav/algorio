"""Fuente: Prefectura Naval Argentina - Altura de los rios.

A diferencia de las demas fuentes, los datos ya vienen en una tabla HTML bien
estructurada, asi que se parsean directo con BeautifulSoup en vez de
mandarselos a Gemini: es mas rapido, no tiene costo de modelo y no depende de
que el modelo interprete bien el texto.

Hay DOS origenes posibles para el mismo dato:

1. El sitio oficial de Prefectura Naval (URL_OFICIAL). Es la fuente primaria,
   pero desde infraestructura de nube (ej. los runners de GitHub Actions)
   suele dar timeout de conexion: aparentemente filtra trafico por rango de
   IP, aunque desde una conexion domestica ande bien.
2. El Centro de Informatica y Modelado (CIM) de la Universidad Nacional del
   Litoral (URL_RESPALDO), que publica exactamente los mismos datos de
   Prefectura (lo aclara al pie de su propia tabla) y ademas lista mas
   estaciones. Se usa como respaldo cuando el sitio oficial no responde.

Cada origen tiene su propio parser porque el HTML es distinto; ambos
devuelven filas con las mismas claves.
"""
import re
from datetime import date
from typing import Optional

from bs4 import BeautifulSoup

from data_pipeline.fetchers.web import obtener_html_pagina

NOMBRE = "prefectura_naval"
COLUMNAS_CLAVE = ["fecha_boletin", "estacion"]

URL_OFICIAL = "https://contenidosweb.prefecturanaval.gob.ar/alturas/"
URL_RESPALDO = "http://wfich1.unl.edu.ar/cim/rios/parana/alturas"

MESES_ES = {
    "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AGO": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12,
}

MESES_ES_COMPLETOS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

TENDENCIA_POR_ICONO = {
    # Sitio oficial de Prefectura Naval.
    "abajo.svg": "bajando",
    "arriba.svg": "subiendo",
    "igual.svg": "estable",
    # Respaldo de UNL/CIM.
    "baja.png": "bajando",
    "crece.png": "subiendo",
    "estacionario.png": "estable",
}


def construir_url(fecha: date) -> str:
    # Ambos sitios muestran siempre el ultimo registro vigente de cada
    # estacion; no hay URL por fecha.
    return URL_OFICIAL


def obtener_contenido(url: str) -> Optional[dict]:
    """Intenta el sitio oficial y, si no responde, el respaldo de UNL.

    Devuelve un dict (no solo el HTML) porque extraer() necesita saber de
    cual de los dos origenes vino para elegir el parser, y las filas guardan
    la URL real de la que salio el dato.
    """
    html = obtener_html_pagina(url)
    if html is not None:
        return {"html": html, "url": url, "origen": "oficial"}

    print(f"[{NOMBRE}] el sitio oficial no respondio, pruebo con el respaldo de UNL/CIM...")
    html = obtener_html_pagina(URL_RESPALDO)
    if html is not None:
        return {"html": html, "url": URL_RESPALDO, "origen": "respaldo_unl"}

    return None


def _parsear_fecha_hora(texto: str) -> Optional[tuple[str, str]]:
    """Convierte 'DD/MES/AA - HHMM' (ej. '28/JUL/26 - 0900') a ('YYYY-MM-DD', 'HH:MM')."""
    texto = (texto or "").strip()
    if not texto or " - " not in texto:
        return None
    try:
        parte_fecha, parte_hora = texto.split(" - ")
        dia, mes_abr, anio_corto = parte_fecha.split("/")
        mes = MESES_ES[mes_abr.upper()]
        fecha_iso = f"{2000 + int(anio_corto):04d}-{mes:02d}-{int(dia):02d}"
        hora_iso = f"{parte_hora[:2]}:{parte_hora[2:]}"
        return fecha_iso, hora_iso
    except (ValueError, KeyError):
        return None


def _numero(texto: str) -> Optional[float]:
    """Convierte el texto de una celda a numero. Ambos sitios usan coma
    decimal y marcan el dato faltante con un guion ('-' en el oficial, '—'
    en el de UNL)."""
    texto = (texto or "").strip()
    if not texto or texto in {"-", "—", "–"}:
        return None
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return None


def _tendencia_de_celda(celda) -> Optional[str]:
    icono = celda.find("img")
    if not icono or not icono.get("src"):
        return None
    return TENDENCIA_POR_ICONO.get(icono["src"].split("/")[-1])


def _extraer_oficial(html: str) -> Optional[list[dict]]:
    soup = BeautifulSoup(html, "html.parser")
    tabla = soup.find("table", class_="fpTable")
    cuerpo = tabla.find("tbody") if tabla else None
    if cuerpo is None:
        print("No se encontro la tabla de estaciones en la pagina de Prefectura Naval.")
        return None

    estaciones = []
    for fila in cuerpo.find_all("tr"):
        celdas = fila.find_all(["th", "td"])
        if len(celdas) < 12:
            continue

        fecha_hora = _parsear_fecha_hora(celdas[5].get_text(strip=True))
        if fecha_hora is None:
            continue
        fecha_iso, hora_iso = fecha_hora
        fecha_hora_anterior = _parsear_fecha_hora(celdas[9].get_text(strip=True))

        estaciones.append({
            "estacion": celdas[0].get_text(strip=True),
            "rio": celdas[1].get_text(strip=True),
            "fecha_boletin": fecha_iso,
            "hora_registro": hora_iso,
            "nivel_actual_m": _numero(celdas[2].get_text(strip=True)),
            "variacion_m": _numero(celdas[3].get_text(strip=True)),
            "periodo_horas": _numero(celdas[4].get_text(strip=True)),
            "estado": celdas[6].get_text(strip=True) or None,
            "tendencia": _tendencia_de_celda(celdas[7]),
            "nivel_anterior_m": _numero(celdas[8].get_text(strip=True)),
            "fecha_anterior": fecha_hora_anterior[0] if fecha_hora_anterior else None,
            "hora_registro_anterior": fecha_hora_anterior[1] if fecha_hora_anterior else None,
            "umbral_alerta_m": _numero(celdas[10].get_text(strip=True)),
            "umbral_evacuacion_m": _numero(celdas[11].get_text(strip=True)),
        })

    return estaciones or None


def _fecha_boletin_unl(soup: BeautifulSoup) -> Optional[str]:
    """La pagina de UNL publica la fecha en texto ('jueves 30 de julio de
    2026'), no en un atributo: se busca ese patron en todo el texto en vez de
    depender de una etiqueta puntual del maquetado."""
    texto = soup.get_text(" ", strip=True)
    coincidencia = re.search(r"(\d{1,2})\s+de\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)\s+de\s+(\d{4})", texto)
    if not coincidencia:
        return None
    dia, mes_texto, anio = coincidencia.groups()
    mes = MESES_ES_COMPLETOS.get(mes_texto.lower())
    if not mes:
        return None
    return f"{int(anio):04d}-{mes:02d}-{int(dia):02d}"


def _extraer_respaldo_unl(html: str) -> Optional[list[dict]]:
    """Parser del respaldo de UNL/CIM. Columnas: Puerto | Rio |
    Altura/Caudal | Variacion | Cambio (icono) | Alt. Ant | Alerta |
    Evacuacion | Historico (link, se ignora)."""
    soup = BeautifulSoup(html, "html.parser")
    tabla = soup.find("table", class_="table-striped")
    if tabla is None:
        print("No se encontro la tabla de estaciones en la pagina de UNL/CIM.")
        return None

    fecha_iso = _fecha_boletin_unl(soup)
    if fecha_iso is None:
        print("No se pudo determinar la fecha del boletin en la pagina de UNL/CIM.")
        return None

    estaciones = []
    for fila in tabla.find_all("tr"):
        celdas = fila.find_all(["th", "td"])
        # Se saltan la fila de encabezado (que trae th) y cualquier fila corta.
        if len(celdas) < 8 or fila.find("th"):
            continue

        estacion = celdas[0].get_text(strip=True)
        if not estacion:
            continue

        estaciones.append({
            "estacion": estacion,
            "rio": celdas[1].get_text(strip=True),
            "fecha_boletin": fecha_iso,
            "nivel_actual_m": _numero(celdas[2].get_text(strip=True)),
            "variacion_m": _numero(celdas[3].get_text(strip=True)),
            "tendencia": _tendencia_de_celda(celdas[4]),
            "nivel_anterior_m": _numero(celdas[5].get_text(strip=True)),
            "umbral_alerta_m": _numero(celdas[6].get_text(strip=True)),
            "umbral_evacuacion_m": _numero(celdas[7].get_text(strip=True)),
        })

    return estaciones or None


def extraer(contenido: Optional[dict]) -> Optional[list[dict]]:
    if not contenido:
        return None

    if contenido["origen"] == "oficial":
        estaciones = _extraer_oficial(contenido["html"])
    else:
        estaciones = _extraer_respaldo_unl(contenido["html"])

    # Cada fila declara de que URL salio realmente: si se uso el respaldo, no
    # es la que devolvio construir_url() (ver ejecutar_fuente en main.py, que
    # respeta el url_origen que ya venga puesto).
    for estacion in estaciones or []:
        estacion["url_origen"] = contenido["url"]

    return estaciones


def a_filas(datos: Optional[list[dict]]) -> list[dict]:
    """La tabla ya trae una fila por estacion; extraer() devuelve la lista lista para guardar."""
    return datos or []
