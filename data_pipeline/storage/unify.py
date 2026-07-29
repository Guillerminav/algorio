"""Unifica los datasets por fuente (formato ancho, con esquemas distintos entre
si) en un unico dataset historico en Postgres (tabla `historico`), en formato
largo/tidy, con columnas comunes a todas las fuentes sin importar cuantas
variables tenga cada una.
"""
import pandas as pd

from db import conexion, inicializar_db

COLUMNAS_HISTORICO = [
    "fuente",
    "fecha_boletin",
    "estacion",
    "variable",
    "valor",
    "fecha_extraccion",
    "url_origen",
]

# Columnas de bookkeeping que ya vienen en cada fila por fuente (las agrega
# main.py antes de guardar) y que no hay que "despivotear" como si fueran
# variables del boletin.
COLUMNAS_ID_COMUNES = ["fecha_boletin", "fecha_extraccion", "url_origen"]


def _fuentes_existentes(con) -> list[str]:
    filas = con.execute("SELECT DISTINCT fuente FROM mediciones_fuente ORDER BY fuente").fetchall()
    return [f["fuente"] for f in filas]


def _melt_fuente(con, nombre_fuente: str) -> pd.DataFrame:
    """Convierte las filas (JSONB) de una fuente en filas largas (una fila por variable)."""
    filas = con.execute(
        "SELECT datos FROM mediciones_fuente WHERE fuente = %s", (nombre_fuente,)
    ).fetchall()
    df = pd.DataFrame([f["datos"] for f in filas], dtype=str)

    tiene_estacion = "estacion" in df.columns
    columnas_id = COLUMNAS_ID_COMUNES + (["estacion"] if tiene_estacion else [])
    columnas_valor = [c for c in df.columns if c not in columnas_id]

    largo = df.melt(id_vars=columnas_id, value_vars=columnas_valor, var_name="variable", value_name="valor")
    largo = largo.dropna(subset=["valor"])

    largo["estacion"] = largo["estacion"] if tiene_estacion else ""
    largo["estacion"] = largo["estacion"].fillna("")
    largo["fuente"] = nombre_fuente

    return largo[COLUMNAS_HISTORICO]


def actualizar_historico() -> None:
    """Reconstruye la tabla `historico` a partir de todo lo que haya en
    mediciones_fuente.

    Se recalcula entero en cada corrida (el melt es barato) para que el
    historico quede siempre consistente con las mediciones por fuente, sin
    necesitar logica incremental propia ni conocer de antemano que fuentes
    existen.
    """
    inicializar_db()
    with conexion() as con:
        fuentes = _fuentes_existentes(con)
        partes = [_melt_fuente(con, fuente) for fuente in fuentes]

        historico = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=COLUMNAS_HISTORICO)
        historico = historico.drop_duplicates(subset=["fuente", "fecha_boletin", "estacion", "variable"], keep="last")

        for _, fila in historico.iterrows():
            con.execute(
                """
                INSERT INTO historico (fuente, fecha_boletin, estacion, variable, valor, fecha_extraccion, url_origen)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (fuente, fecha_boletin, estacion, variable) DO UPDATE SET
                    valor = EXCLUDED.valor,
                    fecha_extraccion = EXCLUDED.fecha_extraccion,
                    url_origen = EXCLUDED.url_origen
                """,
                (
                    fila["fuente"], fila["fecha_boletin"], fila["estacion"], fila["variable"],
                    fila["valor"], fila["fecha_extraccion"], fila["url_origen"],
                ),
            )
    print(f"Historico actualizado — {len(historico)} filas totales.")
