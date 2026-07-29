"""Script de un solo uso (re-corrible sin problema): normaliza fecha_boletin
en mediciones_fuente a formato ISO 'YYYY-MM-DD' usando normalizar_fecha()
(ver normalizacion.py), que ademas de unificar el separador reordena
dia/mes/anio si hace falta (INA a veces manda 'DD/MM/YYYY', formato
argentino, no ISO).

Como la clave de deduplicacion (clave_dedup) se arma con fecha_boletin tal
cual vino, cualquier cambio de formato puede haber generado FILAS
DUPLICADAS para el mismo dia real (una vieja mal formada, otra nueva ya
correcta): este script tambien detecta y resuelve esos duplicados,
quedandose con la version mas reciente (por fecha_extraccion).

Al final reconstruye `historico` desde cero (se borra y se recalcula con
actualizar_historico(), que ya es idempotente) para no dejar filas viejas
con el formato anterior dando vueltas ahi tambien.

Uso (desde algorio/, con el entorno virtual activado y DATABASE_URL seteada):
    python -m scripts.normalizar_fechas
"""
from psycopg.types.json import Jsonb

from data_pipeline.storage.unify import actualizar_historico
from db import conexion, inicializar_db
from normalizacion import normalizar_fecha


def normalizar_mediciones_fuente() -> None:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT id, fuente, clave_dedup, datos, fecha_extraccion FROM mediciones_fuente"
        ).fetchall()

        actualizadas = fusionadas = 0
        for fila in filas:
            fecha_vieja = fila["datos"].get("fecha_boletin")
            fecha_nueva = normalizar_fecha(fecha_vieja)
            if not fecha_vieja or fecha_nueva == fecha_vieja:
                continue

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

        print(f"{len(filas)} filas revisadas: {actualizadas} normalizadas sin conflicto, "
              f"{fusionadas} duplicados resueltos.")


def main() -> None:
    normalizar_mediciones_fuente()
    with conexion() as con:
        con.execute("DELETE FROM historico")
    actualizar_historico()


if __name__ == "__main__":
    main()
