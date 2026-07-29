"""Fuente: Prefectura Naval Argentina - Altura de los rios.

A diferencia de las demas fuentes, esta pagina ya publica los datos en una
tabla HTML bien estructurada (con th/td por estacion), asi que se parsea
directo con BeautifulSoup en vez de mandarsela a Gemini: es mas rapido, no
tiene costo de modelo y no depende de que el modelo interprete bien el texto.

Cada estacion (Puerto) trae su propia fecha/hora de ultimo registro (no
comparten un unico "boletin del dia" como las demas fuentes), asi que
fecha_boletin sale de esa fecha/hora de cada fila, no de la fecha de la
corrida del scraper.
"""
from datetime import date
from typing import Optional

from bs4 import BeautifulSoup

from data_pipeline.fetchers.web import obtener_html_pagina

NOMBRE = "prefectura_naval"
COLUMNAS_CLAVE = ["fecha_boletin", "estacion"]

URL_ALTURAS = "https://contenidosweb.prefecturanaval.gob.ar/alturas/"

MESES_ES = {
    "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AGO": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12,
}

TENDENCIA_POR_ICONO = {
    "abajo.svg": "bajando",
    "arriba.svg": "subiendo",
    "igual.svg": "estable",
}


def construir_url(fecha: date) -> str:
    # La pagina siempre muestra el ultimo registro vigente de cada estacion; no hay URL por fecha.
    return URL_ALTURAS


def obtener_contenido(url: str) -> Optional[str]:
    return obtener_html_pagina(url)


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
    texto = (texto or "").strip()
    if not texto or texto == "-":
        return None
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return None


def extraer(contenido: str) -> Optional[list[dict]]:
    """Parsea la tabla de estaciones directo del HTML (sin pasar por Gemini)."""
    soup = BeautifulSoup(contenido, "html.parser")
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

        icono = celdas[7].find("img")
        tendencia = TENDENCIA_POR_ICONO.get(icono["src"].split("/")[-1]) if icono else None

        estaciones.append({
            "estacion": celdas[0].get_text(strip=True),
            "rio": celdas[1].get_text(strip=True),
            "fecha_boletin": fecha_iso,
            "hora_registro": hora_iso,
            "nivel_actual_m": _numero(celdas[2].get_text(strip=True)),
            "variacion_m": _numero(celdas[3].get_text(strip=True)),
            "periodo_horas": _numero(celdas[4].get_text(strip=True)),
            "estado": celdas[6].get_text(strip=True) or None,
            "tendencia": tendencia,
            "nivel_anterior_m": _numero(celdas[8].get_text(strip=True)),
            "fecha_anterior": fecha_hora_anterior[0] if fecha_hora_anterior else None,
            "hora_registro_anterior": fecha_hora_anterior[1] if fecha_hora_anterior else None,
            "umbral_alerta_m": _numero(celdas[10].get_text(strip=True)),
            "umbral_evacuacion_m": _numero(celdas[11].get_text(strip=True)),
        })

    return estaciones or None


def a_filas(datos: Optional[list[dict]]) -> list[dict]:
    """La tabla ya trae una fila por estacion; extraer() devuelve la lista lista para guardar."""
    return datos or []
