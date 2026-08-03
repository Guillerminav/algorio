"""Script re-corrible: normaliza estacion y rio en mediciones_fuente segun el
registro canonico (ver normalizacion.py: ESTACIONES_CANONICAS).

Arregla los tres tipos de duplicado que quedaron en la base de datos porque
la normalizacion al guardar se agrego despues de haber cargado datos:
  - Mayusculas: "ROSARIO" y "Rosario" convivian como estaciones distintas.
  - Tildes: "ITUZAINGO" vs "Ituzaingó".
  - Rios distintos para la misma estacion: "Rosario" figuraba en "Paraná" y
    en "Paraná/Delta"; se unifica al nombre de rio mas corto.

Como la clave de deduplicacion (clave_dedup) incluye la estacion, unificar
nombres puede dejar dos filas apuntando a la misma clave: son la misma
medicion escrita distinto, asi que se conserva la de fecha_extraccion mas
reciente.

Al final reconstruye `historico`, que se deriva de estas filas.

Uso (desde algorio/, con el entorno virtual activado y DATABASE_URL seteada):
    python -m scripts.normalizar_estaciones
"""
from psycopg.types.json import Jsonb

from data_pipeline.storage.unify import actualizar_historico
from db import conexion, inicializar_db
from normalizacion import canonizar_estacion, rio_de_estacion


def normalizar_estaciones() -> None:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT id, fuente, clave_dedup, datos, fecha_extraccion FROM mediciones_fuente "
            "WHERE datos->>'estacion' IS NOT NULL"
        ).fetchall()

        actualizadas = fusionadas = 0
        for fila in filas:
            estacion_vieja = fila["datos"].get("estacion")
            rio_viejo = fila["datos"].get("rio")
            estacion_nueva = canonizar_estacion(estacion_vieja)
            rio_nuevo = rio_de_estacion(estacion_vieja, rio_viejo)

            if estacion_nueva == estacion_vieja and rio_nuevo == rio_viejo:
                continue

            datos_nuevos = dict(fila["datos"])
            datos_nuevos["estacion"] = estacion_nueva
            if "rio" in datos_nuevos:
                datos_nuevos["rio"] = rio_nuevo
            clave_nueva = fila["clave_dedup"].replace(estacion_vieja, estacion_nueva)

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

            # Misma medicion escrita de dos formas: se conserva la mas reciente.
            fusionadas += 1
            if fila["fecha_extraccion"] >= existente["fecha_extraccion"]:
                con.execute("DELETE FROM mediciones_fuente WHERE id = %s", (existente["id"],))
                con.execute(
                    "UPDATE mediciones_fuente SET datos = %s, clave_dedup = %s WHERE id = %s",
                    (Jsonb(datos_nuevos), clave_nueva, fila["id"]),
                )
            else:
                con.execute("DELETE FROM mediciones_fuente WHERE id = %s", (fila["id"],))

        print(f"{len(filas)} filas revisadas: {actualizadas} normalizadas, {fusionadas} duplicados fusionados.")


def main() -> None:
    normalizar_estaciones()
    with conexion() as con:
        con.execute("DELETE FROM historico")
    actualizar_historico()


if __name__ == "__main__":
    main()
