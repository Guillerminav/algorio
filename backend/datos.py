"""Lectura y preparacion de los datasets por fuente para exponerlos via API.

Lee de Postgres (tabla mediciones_fuente, ver db.py) lo que guarda
data_pipeline/ en cada corrida.
"""
import re
import unicodedata
from typing import Optional

import pandas as pd

from backend.coordenadas_estaciones import COORDENADAS_ESTACIONES
from db import conexion


def _leer_fuente(nombre_fuente: str) -> pd.DataFrame:
    with conexion() as con:
        filas = con.execute(
            "SELECT datos FROM mediciones_fuente WHERE fuente = %s", (nombre_fuente,)
        ).fetchall()
    if not filas:
        return pd.DataFrame()
    return pd.DataFrame([f["datos"] for f in filas])


def leer_ina() -> pd.DataFrame:
    return _leer_fuente("ina")


def leer_yacyreta() -> pd.DataFrame:
    return _leer_fuente("yacyreta")


def leer_prefectura() -> pd.DataFrame:
    return _leer_fuente("prefectura_naval")


def _a_registros(df: pd.DataFrame) -> list[dict]:
    """Convierte un DataFrame a una lista de dicts serializable en JSON (NaN -> None).

    df.where(pd.notnull(df), None) no alcanza: en una columna numerica pandas
    vuelve a convertir ese None en NaN para mantener el dtype float64, y NaN
    no es JSON valido. Por eso se recorre registro por registro.
    """
    if df.empty:
        return []
    registros = df.to_dict(orient="records")
    for registro in registros:
        for clave, valor in registro.items():
            if isinstance(valor, float) and pd.isna(valor):
                registro[clave] = None
    return registros


def _normalizar_texto(valor: Optional[str]) -> str:
    """Quita tildes/puntuacion y pasa a mayusculas, para comparar texto libre que
    cada fuente escribe distinto (ej. 'Iguazú' vs 'IGUAZU')."""
    if not valor:
        return ""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", valor) if unicodedata.category(c) != "Mn"
    )
    limpio = re.sub(r"[.,]", "", sin_tildes).upper()
    return re.sub(r"\s+", " ", limpio).strip()


def normalizar_estacion(nombre: Optional[str]) -> str:
    """Normaliza un nombre de estacion para poder cruzar INA con Prefectura Naval."""
    return _normalizar_texto(nombre)


# Nombre "bonito" (con tildes y mayusculas/minusculas correctas) por rio
# normalizado. Prefectura Naval manda todo en MAYUSCULAS sin tildes; INA a
# veces si trae tildes. Se unifica a esta grafia sin importar de que fuente
# vino el dato. Si aparece un rio nuevo que no esta mapeado, se usa Title Case
# como mejor esfuerzo (no puede inventar tildes que ninguna fuente mando).
RIOS_CANONICOS = {
    "PARANA": "Paraná",
    "PARAGUAY": "Paraguay",
    "URUGUAY": "Uruguay",
    "IGUAZU": "Iguazú",
    "ALTO PARANA": "Alto Paraná",
    "PARANA / IGUAZU": "Paraná / Iguazú",
    # "Paraná/Delta" (como lo escribe INA) y "Delta Paraná" (como lo escribe
    # Prefectura Naval) son el mismo tramo; se unifican a esta unica grafia.
    "PARANA/DELTA": "Delta Paraná",
    "DE LA PLATA": "De la Plata",
    "DELTA PARANA": "Delta Paraná",
    "GUALEGUAY": "Gualeguay",
    "GUALEGUAYCHU": "Gualeguaychú",
    "IBICUY": "Ibicuy",
    "SAN JAVIER": "San Javier",
}


def canonizar_rio(nombre: Optional[str]) -> Optional[str]:
    """Unifica el nombre de un rio a una unica grafia sin importar la fuente."""
    if not nombre or (isinstance(nombre, float) and pd.isna(nombre)):
        return None
    return RIOS_CANONICOS.get(_normalizar_texto(nombre), nombre.title())


def _parsear_numero(valor) -> Optional[float]:
    """Convierte un valor numerico que puede venir con coma decimal (ej. '-0,40')."""
    if valor is None:
        return None
    try:
        if isinstance(valor, str):
            valor = valor.replace(",", ".")
        numero = float(valor)
        return None if pd.isna(numero) else numero
    except (ValueError, TypeError):
        return None


def _fila_por_estacion_en_posicion(df: pd.DataFrame, posicion: int) -> pd.DataFrame:
    """De un dataset que acumula varios dias, devuelve por estacion la fila que
    ocupa `posicion` contando desde la mas reciente (0 = hoy, 1 = el dia
    anterior con dato, etc). Si a una estacion le falta esa posicion, no
    aparece en el resultado.
    """
    if df.empty:
        return df
    df = df.copy()
    df["_fecha_dt"] = pd.to_datetime(df["fecha_boletin"], errors="coerce")
    df = df.dropna(subset=["_fecha_dt"]).drop_duplicates(subset=["estacion", "_fecha_dt"])
    df = df.sort_values("_fecha_dt", ascending=False)
    resultado = df.groupby("estacion", group_keys=False).nth(posicion)
    return resultado.drop(columns="_fecha_dt")


def _ultima_fila_por_estacion(df: pd.DataFrame) -> pd.DataFrame:
    return _fila_por_estacion_en_posicion(df, 0)


def _promedio_por_estacion(*dataframes_por_fuente: pd.DataFrame) -> dict[str, float]:
    """Promedia nivel_actual_m por estacion (normalizada) entre los DataFrames pasados."""
    valores: dict[str, list[float]] = {}
    for df in dataframes_por_fuente:
        if df.empty:
            continue
        for _, fila in df.iterrows():
            clave = normalizar_estacion(fila.get("estacion"))
            numero = _parsear_numero(fila.get("nivel_actual_m"))
            if clave and numero is not None:
                valores.setdefault(clave, []).append(numero)
    return {clave: round(sum(v) / len(v), 2) for clave, v in valores.items()}


def datos_ina() -> list[dict]:
    """Fecha, estacion, rio, nivel actual y tendencia de cada estacion del Cuadro del INA."""
    df = leer_ina()
    if df.empty:
        return []
    df = df.sort_values("fecha_boletin", ascending=False)
    df = df.assign(rio=df["rio"].apply(canonizar_rio))
    return _a_registros(df[["fecha_boletin", "estacion", "rio", "nivel_actual_m", "tendencia"]])


def datos_yacyreta() -> list[dict]:
    """Fecha, nivel del rio en Ituzaingo, caudal afluente y nivel del embalse."""
    df = leer_yacyreta()
    if df.empty:
        return []
    df = df.sort_values("fecha_boletin", ascending=False)
    columnas = ["fecha_boletin", "altura_ituzaingo_m", "caudal_afluente_hoy_m3s", "nivel_embalse_hoy_msnm"]
    return _a_registros(df[columnas])


def datos_prefectura() -> list[dict]:
    """Estacion, rio, fecha y hora, nivel actual, variacion, tendencia y nivel anterior."""
    df = leer_prefectura()
    if df.empty:
        return []
    df = df.sort_values("fecha_boletin", ascending=False)
    df = df.assign(rio=df["rio"].apply(canonizar_rio))
    columnas = [
        "estacion", "rio", "fecha_boletin", "hora_registro",
        "nivel_actual_m", "variacion_m", "tendencia", "nivel_anterior_m",
    ]
    return _a_registros(df[columnas])


def _severidad(nivel, umbral_alerta, umbral_evacuacion) -> Optional[str]:
    """Compara un nivel contra los umbrales oficiales: 'evacuacion', 'alerta' o
    None (ni el nivel ni los umbrales alcanzan para decidir, o esta normal)."""
    if nivel is None or (umbral_alerta is None and umbral_evacuacion is None):
        return None
    if umbral_evacuacion is not None and nivel >= umbral_evacuacion:
        return "evacuacion"
    if umbral_alerta is not None and nivel >= umbral_alerta:
        return "alerta"
    return None


def mapa_estado_estaciones() -> dict[str, dict]:
    """Combina INA y Prefectura Naval por estacion (normalizando el nombre):
    nivel promedio, tendencia dia contra dia, y los umbrales oficiales de
    Prefectura Naval (los unicos que traen umbral_alerta_m/umbral_evacuacion_m).
    Es la base compartida de dashboard_estaciones(), alertas_activas() y del
    estado de cada "activo" que un usuario guarde (backend/activos.py).
    """
    ina_todo = leer_ina()
    prefectura_todo = leer_prefectura()

    ina_hoy = _fila_por_estacion_en_posicion(ina_todo, 0)
    prefectura_hoy = _fila_por_estacion_en_posicion(prefectura_todo, 0)
    promedio_ayer = _promedio_por_estacion(
        _fila_por_estacion_en_posicion(ina_todo, 1),
        _fila_por_estacion_en_posicion(prefectura_todo, 1),
    )

    combinado: dict[str, dict] = {}

    def _agregar(df: pd.DataFrame, fuente: str) -> None:
        if df.empty:
            return
        for _, fila in df.iterrows():
            clave = normalizar_estacion(fila["estacion"])
            if not clave:
                continue
            entrada = combinado.setdefault(clave, {
                "estacion": fila["estacion"],
                "rio": canonizar_rio(fila.get("rio")),
                "nivel_ina_m": None,
                "nivel_prefectura_m": None,
                "umbral_alerta_m": None,
                "umbral_evacuacion_m": None,
                "fecha_boletin": None,
                "fuentes": [],
            })
            entrada[f"nivel_{fuente}_m"] = _parsear_numero(fila.get("nivel_actual_m"))
            entrada["fuentes"].append(fuente)
            if not entrada.get("rio") and fila.get("rio"):
                entrada["rio"] = canonizar_rio(fila["rio"])
            if fila.get("fecha_boletin"):
                entrada["fecha_boletin"] = fila["fecha_boletin"]
            if fuente == "prefectura":
                entrada["umbral_alerta_m"] = _parsear_numero(fila.get("umbral_alerta_m"))
                entrada["umbral_evacuacion_m"] = _parsear_numero(fila.get("umbral_evacuacion_m"))

    _agregar(ina_hoy, "ina")
    _agregar(prefectura_hoy, "prefectura")

    for clave, entrada in combinado.items():
        niveles = [v for v in (entrada["nivel_ina_m"], entrada["nivel_prefectura_m"]) if v is not None]
        promedio_hoy = round(sum(niveles) / len(niveles), 2) if niveles else None
        entrada["nivel_actual_m"] = promedio_hoy

        ayer = promedio_ayer.get(clave)
        entrada["tendencia"] = None
        entrada["tendencia_diferencia_m"] = None
        if promedio_hoy is not None and ayer is not None:
            diferencia = round(promedio_hoy - ayer, 2)
            entrada["tendencia"] = (
                "subiendo" if diferencia > 0 else "bajando" if diferencia < 0 else "estable"
            )
            entrada["tendencia_diferencia_m"] = diferencia

    return combinado


def dashboard_estaciones() -> list[dict]:
    """Listado de estaciones para el dashboard general (ver mapa_estado_estaciones)."""
    resultado = []
    for entrada in mapa_estado_estaciones().values():
        resultado.append({
            "estacion": entrada["estacion"],
            "rio": entrada["rio"],
            "nivel_ina_m": entrada["nivel_ina_m"],
            "nivel_prefectura_m": entrada["nivel_prefectura_m"],
            "nivel_promedio_m": entrada["nivel_actual_m"],
            "tendencia": entrada["tendencia"],
            "tendencia_diferencia_m": entrada["tendencia_diferencia_m"],
            "fuentes": entrada["fuentes"],
        })
    resultado.sort(key=lambda e: e["estacion"])
    return resultado


def estaciones_disponibles() -> list[dict]:
    """Lista simple de {estacion, rio} para poblar el selector de estacion de
    referencia al cargar un activo (embarcacion/draga/muelle/tramo)."""
    resultado = [
        {"estacion": e["estacion"], "rio": e["rio"]} for e in mapa_estado_estaciones().values()
    ]
    resultado.sort(key=lambda e: e["estacion"])
    return resultado


def estado_de_estacion(nombre_estacion: str) -> Optional[dict]:
    """Estado actual (nivel promedio + umbrales oficiales) de una estacion,
    buscada por nombre normalizado. None si no hay datos para esa estacion."""
    return mapa_estado_estaciones().get(normalizar_estacion(nombre_estacion))


def mapa_estaciones() -> list[dict]:
    """Estaciones para el mapa interactivo: nivel actual, tendencia, estado de
    alerta (verde/amarillo/rojo, mismo criterio que alertas_activas()) y
    coordenadas aproximadas (backend/coordenadas_estaciones.py, armadas a
    mano porque INA/Prefectura Naval no las publican). Una estacion sin
    coordenada conocida no aparece en el mapa; no rompe nada, solo se omite."""
    resultado = []
    for entrada in mapa_estado_estaciones().values():
        coords = COORDENADAS_ESTACIONES.get(entrada["estacion"])
        if coords is None:
            continue

        severidad = _severidad(entrada["nivel_actual_m"], entrada["umbral_alerta_m"], entrada["umbral_evacuacion_m"])
        estado = "rojo" if severidad == "evacuacion" else "amarillo" if severidad == "alerta" else "verde"

        resultado.append({
            "id": normalizar_estacion(entrada["estacion"]),
            "nombre": entrada["estacion"],
            "rio": entrada["rio"],
            "lat": coords[0],
            "lon": coords[1],
            "nivel_actual_m": entrada["nivel_actual_m"],
            "tendencia": entrada["tendencia"],
            "estado": estado,
            # Todavia no hay una fuente de pronostico; el frontend ya muestra
            # "Sin pronostico disponible." cuando este campo viene null.
            "pronostico_resumen": None,
            "ultima_actualizacion": entrada.get("fecha_boletin"),
        })

    resultado.sort(key=lambda e: e["nombre"])
    return resultado


def estado_de_activo(activo: dict) -> dict:
    """Enriquece un "activo" (embarcacion/draga/muelle/tramo guardado por un
    usuario, ver backend/activos.py) con el nivel actual de su estacion de
    referencia y la severidad segun SU umbral propio si lo definio, o el
    umbral oficial de Prefectura Naval como respaldo si no."""
    estacion = estado_de_estacion(activo["estacion_referencia"])

    nivel_actual_m = estacion["nivel_actual_m"] if estacion else None
    rio = estacion["rio"] if estacion else None
    umbral_alerta_oficial = estacion["umbral_alerta_m"] if estacion else None
    umbral_evacuacion_oficial = estacion["umbral_evacuacion_m"] if estacion else None

    umbral_alerta_efectivo = activo.get("umbral_alerta_m")
    if umbral_alerta_efectivo is None:
        umbral_alerta_efectivo = umbral_alerta_oficial
    umbral_evacuacion_efectivo = activo.get("umbral_evacuacion_m")
    if umbral_evacuacion_efectivo is None:
        umbral_evacuacion_efectivo = umbral_evacuacion_oficial

    return {
        **activo,
        "rio": rio,
        "nivel_actual_m": nivel_actual_m,
        "umbral_alerta_oficial_m": umbral_alerta_oficial,
        "umbral_evacuacion_oficial_m": umbral_evacuacion_oficial,
        "umbral_alerta_efectivo_m": umbral_alerta_efectivo,
        "umbral_evacuacion_efectivo_m": umbral_evacuacion_efectivo,
        "usa_umbral_propio": activo.get("umbral_alerta_m") is not None or activo.get("umbral_evacuacion_m") is not None,
        "severidad": _severidad(nivel_actual_m, umbral_alerta_efectivo, umbral_evacuacion_efectivo),
        "tiene_datos": estacion is not None,
    }


def alertas_activas() -> list[dict]:
    """Estaciones de Prefectura Naval cuyo nivel actual llego al umbral de
    alerta o de evacuacion definido para esa estacion. Solo devuelve las que
    estan efectivamente en alerta (no el listado completo de estaciones)."""
    df = _fila_por_estacion_en_posicion(leer_prefectura(), 0)
    if df.empty:
        return []

    resultado = []
    for _, fila in df.iterrows():
        nivel = _parsear_numero(fila.get("nivel_actual_m"))
        umbral_alerta = _parsear_numero(fila.get("umbral_alerta_m"))
        umbral_evacuacion = _parsear_numero(fila.get("umbral_evacuacion_m"))

        severidad = _severidad(nivel, umbral_alerta, umbral_evacuacion)
        if severidad is None:
            continue

        resultado.append({
            "estacion": fila["estacion"],
            "rio": canonizar_rio(fila.get("rio")),
            "fecha_boletin": fila.get("fecha_boletin"),
            "nivel_actual_m": nivel,
            "umbral_alerta_m": umbral_alerta,
            "umbral_evacuacion_m": umbral_evacuacion,
            "severidad": severidad,
        })

    resultado.sort(key=lambda e: (e["severidad"] != "evacuacion", e["estacion"]))
    return resultado
