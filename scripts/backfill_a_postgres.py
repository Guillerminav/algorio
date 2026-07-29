"""Script de un solo uso: carga en Postgres los CSV que ya existen en
data/per_source/ (datos scrapeados antes de migrar la persistencia), para no
perder ese historial. Despues de correrlo una vez, se puede borrar tanto
este script como la carpeta data/ (ya no la lee nadie).

Uso (desde algorio/, con el entorno virtual activado y DATABASE_URL seteada):
    python -m scripts.backfill_a_postgres
"""
from pathlib import Path

import pandas as pd

from data_pipeline.sources import ina, prefectura_naval, yacyreta
from data_pipeline.storage.per_source import guardar_filas_fuente
from data_pipeline.storage.unify import actualizar_historico

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
DIR_PER_SOURCE = RAIZ_PROYECTO / "data" / "per_source"

FUENTES = [ina, yacyreta, prefectura_naval]


def _filas_sin_nan(df: pd.DataFrame) -> list[dict]:
    """df.where(pd.notnull(df), None) no alcanza: pandas puede reconvertir ese
    None de nuevo en NaN para mantener el dtype de la columna, y NaN no es
    JSON valido (ver mismo comentario en backend/datos.py). Por eso se
    recorre registro por registro."""
    filas = df.to_dict(orient="records")
    for fila in filas:
        for clave, valor in fila.items():
            if isinstance(valor, float) and pd.isna(valor):
                fila[clave] = None
    return filas


def main() -> None:
    for fuente in FUENTES:
        archivo = DIR_PER_SOURCE / f"dataset_{fuente.NOMBRE}.csv"
        if not archivo.exists():
            print(f"[{fuente.NOMBRE}] no hay CSV en {archivo}, se omite.")
            continue

        df = pd.read_csv(archivo, dtype=str)
        filas = _filas_sin_nan(df)
        guardar_filas_fuente(filas, fuente.NOMBRE, columnas_clave=fuente.COLUMNAS_CLAVE)

    actualizar_historico()


if __name__ == "__main__":
    main()
