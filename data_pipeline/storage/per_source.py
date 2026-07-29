"""Guarda las filas extraidas de cada fuente en Postgres (tabla mediciones_fuente,
una fila = un boletin/estacion, con la fila completa en la columna JSONB
`datos`), con upsert/dedup para no acumular boletines repetidos al re-correr
el pipeline.
"""
from typing import Optional

from psycopg.types.json import Jsonb

from db import conexion, inicializar_db


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
