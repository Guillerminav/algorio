"""Guarda las filas extraidas de cada fuente en Postgres (tabla mediciones_fuente,
una fila = un boletin/estacion, con la fila completa en la columna JSONB
`datos`), con upsert/dedup para no acumular boletines repetidos al re-correr
el pipeline.
"""
from typing import Optional

from psycopg.types.json import Jsonb

from db import conexion, inicializar_db
from normalizacion import canonizar_estacion, canonizar_rio, normalizar_fecha, rio_de_estacion


def _normalizar_fila(fila: dict) -> dict:
    """Unifica fecha/estacion/rio a un unico formato antes de guardar, sin
    importar como los haya mandado cada fuente (ver normalizacion.py). Se
    hace aca, en el unico lugar por el que pasa cualquier boletin nuevo antes
    de guardarse, para no depender de que cada modulo de sources/ se acuerde
    de normalizar por su cuenta."""
    fila = dict(fila)
    if "fecha_boletin" in fila:
        fila["fecha_boletin"] = normalizar_fecha(fila["fecha_boletin"])
    if "rio" in fila:
        # El rio se resuelve a partir de la estacion cuando se la conoce: una
        # misma estacion aparece con rios distintos segun la fuente (ej.
        # "Rosario" en "Paraná" y en "Paraná/Delta") y el registro ya tiene
        # decidido cual gana.
        fila["rio"] = (
            rio_de_estacion(fila.get("estacion"), fila["rio"])
            if "estacion" in fila
            else canonizar_rio(fila["rio"])
        )
    if "estacion" in fila:
        fila["estacion"] = canonizar_estacion(fila["estacion"])
    return fila


def existe_boletin(nombre_fuente: str, fecha_boletin: str) -> bool:
    """True si ya hay al menos una fila guardada para esa fuente y fecha.

    Se usa para fuentes cuya URL depende de la fecha (ver
    DIAS_ATRAS_SI_FALTA en data_pipeline/main.py) y evitar volver a
    descargar/mandar a Gemini un boletin de un dia anterior que ya esta en
    la base."""
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT 1 FROM mediciones_fuente WHERE fuente = %s AND datos->>'fecha_boletin' = %s LIMIT 1",
            (nombre_fuente, fecha_boletin),
        ).fetchone()
    return fila is not None


def guardar_filas_fuente(
    filas: list[dict], nombre_fuente: str, columnas_clave: Optional[list[str]] = None
) -> None:
    """Guarda `filas` en mediciones_fuente, dedupeando por columnas_clave.

    Si una fila ya existia con la misma clave (ej. mismo fecha_boletin), se
    reemplaza por la nueva version (ON CONFLICT ... DO UPDATE), asi una
    re-corrida del mismo dia no duplica boletines.
    """
    if not filas:
        print(f"Sin datos para guardar de la fuente '{nombre_fuente}' (extraccion fallo o vacia).")
        return

    columnas_clave = columnas_clave or ["fecha_boletin"]

    inicializar_db()
    with conexion() as con:
        for fila in filas:
            fila = _normalizar_fila(fila)
            clave_dedup = "|".join(str(fila.get(c)) for c in columnas_clave)
            con.execute(
                """
                INSERT INTO mediciones_fuente (fuente, clave_dedup, datos, fecha_extraccion, url_origen)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (fuente, clave_dedup) DO UPDATE SET
                    datos = EXCLUDED.datos,
                    fecha_extraccion = EXCLUDED.fecha_extraccion,
                    url_origen = EXCLUDED.url_origen
                """,
                (
                    nombre_fuente,
                    clave_dedup,
                    Jsonb(fila),
                    fila.get("fecha_extraccion"),
                    fila.get("url_origen"),
                ),
            )
    print(f"Guardado en mediciones_fuente (fuente={nombre_fuente}) — {len(filas)} filas procesadas.")
