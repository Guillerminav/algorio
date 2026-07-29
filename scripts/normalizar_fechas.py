"""Script de un solo uso: normaliza fecha_boletin en mediciones_fuente (el
fix de ina.py que unifico el separador a "-" solo aplica a datos nuevos; lo
que ya estaba guardado en la base con "/" se quedo asi).

Como la clave de deduplicacion (clave_dedup) se arma con fecha_boletin tal
cual vino, el cambio de formato puede haber generado FILAS DUPLICADAS para
el mismo dia real (una vieja con "/", otra nueva con "-"): este script
tambien detecta y resuelve esos duplicados, quedandose con la version mas
reciente (por fecha_extraccion).

Al final reconstruye `historico` desde cero (se borra y se recalcula con
actualizar_historico(), que ya es idempotente) para no dejar filas viejas
con el formato anterior dando vueltas ahi tambien.

Uso (desde algorio/, con el entorno virtual activado y DATABASE_URL seteada):
    python -m scripts.normalizar_fechas
"""
from psycopg.types.json import Jsonb

from data_pipeline.storage.unify import actualizar_historico
from db import conexion, inicializar_db


def normalizar_mediciones_fuente() -> None:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT id, fuente, clave_dedup, datos, fecha_extraccion "
            "FROM mediciones_fuente WHERE datos->>'fecha_boletin' LIKE '%%/%%'"
        ).fetchall()
        print(f"{len(filas)} filas con fecha_boletin en formato '/' a normalizar.")

        actualizadas = fusionadas = 0
        for fila in filas:
            fecha_vieja = fila["datos"]["fecha_boletin"]
            fecha_nueva = fecha_vieja.replace("/", "-")
            datos_nuevos = dict(fila["datos"])
            datos_nuevos["fecha_boletin"] = fecha_nueva
            clave_nueva = fila["clave_dedup"].replace(fecha_vieja, fecha_nueva)

            existente = con.execute(
                "SELECT id, fecha_extraccion FROM mediciones_fuente "
                "WHERE fuente = %s AND clave_dedup = %s AND id != %s",
                (fila["fuente"], clave_nueva, fila["id"]),
            ).fetchone()

            if existente is None:
                con.execute(
                    "UPDATE mediciones_fuente SET datos = %s, clave_dedup = %s WHERE id = %s",
                    (Jsonb(datos_nuevos), clave_nueva, fila["id"]),
                )
                actualizadas += 1
                continue

            # Ya existe una fila con la clave nueva (duplicado real: mismo
            # dia, distinto formato de fecha) - nos quedamos con la mas
            # reciente y borramos la otra.
            fusionadas += 1
            if fila["fecha_extraccion"] >= existente["fecha_extraccion"]:
                con.execute("DELETE FROM mediciones_fuente WHERE id = %s", (existente["id"],))
                con.execute(
                    "UPDATE mediciones_fuente SET datos = %s, clave_dedup = %s WHERE id = %s",
                    (Jsonb(datos_nuevos), clave_nueva, fila["id"]),
                )
            else:
                con.execute("DELETE FROM mediciones_fuente WHERE id = %s", (fila["id"],))

        print(f"{actualizadas} filas normalizadas sin conflicto, {fusionadas} duplicados resueltos.")


def main() -> None:
    normalizar_mediciones_fuente()
    with conexion() as con:
        con.execute("DELETE FROM historico")
    actualizar_historico()


if __name__ == "__main__":
    main()
