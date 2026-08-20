"""Llena la cache de pronostico (clima_cache) desde afuera del backend.

    python -m scripts.refrescar_clima            # refresca las celdas en uso
    python -m scripts.refrescar_clima --estado   # que tan fresca esta la cache
    python -m scripts.refrescar_clima --listar   # solo muestra cuales serian
    python -m scripts.refrescar_clima --lat -32.9 --lon -60.6   # una puntual

POR QUE EXISTE

`backend/clima.py` consulta Open-Meteo y guarda el resultado en `clima_cache`,
que es de donde sale el pronostico cuando la consulta falla. Eso alcanza
mientras el backend PUEDA consultar de vez en cuando: la cache se llena sola
con el uso normal.

El problema es el caso duro. Open-Meteo es gratis y sin API key, o sea cuota
por IP, y el backend corre en el plan free de Render con una IP de salida
compartida con otros inquilinos. Si esa IP queda del lado equivocado de la
cuota de forma sostenida, el backend no consigue ni una sola respuesta buena
—y una cache que no se llena nunca no sirve de respaldo de nada.

Este script rompe esa dependencia: corre desde cualquier lado con salida a
internet (tu maquina, una Action, un cron en otro lado) y deja el pronostico
escrito en la base. El backend lo lee sin salir a la ruta, y el nauta ve el
viento aunque Render este bloqueado.

Las celdas no se inventan: salen de donde de verdad hay gente mirando el mapa
—los POIs publicados y el centro por defecto—, mas las que se pidan a mano.
"""
import argparse
import time

from backend import clima
from db import conexion, inicializar_db

# El centro que usa la app cuando todavia no hay permiso de ubicacion (ver
# frontend/src/mapaSatelital.js: CENTRO_POR_DEFECTO). Es la primera celda que
# consulta cualquiera que abre la app, asi que es la que mas conviene tener.
CENTRO_POR_DEFECTO = (-27.47, -58.83)

# Pausa entre consultas. Open-Meteo no la pide para este volumen, pero el
# sentido de este script es NO ser el que agota la cuota.
PAUSA_SEGUNDOS = 1.0


def celdas_en_uso() -> list[tuple[float, float]]:
    """Las celdas que la app va a pedir: la de cada POI publicado y la del
    centro por defecto, sin repetir."""
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT DISTINCT lat, lon FROM pois WHERE estado = 'aprobado'"
        ).fetchall()

    puntos = [CENTRO_POR_DEFECTO] + [(f["lat"], f["lon"]) for f in filas]
    # Se deduplica por celda y no por coordenada: dos paradores del mismo brazo
    # del rio comparten pronostico, que es justo la razon de la celda.
    por_celda: dict[str, tuple[float, float]] = {}
    for lat, lon in puntos:
        por_celda.setdefault(clima._celda(lat, lon), (lat, lon))
    return sorted(por_celda.values())


def estado() -> None:
    """Que tan fresca esta cada celda de la cache.

    Sirve para contestar la unica pregunta que queda abierta: si el backend
    puede o no llegar a Open-Meteo por su cuenta. Si las celdas se refrescan
    solas con el uso de la app, puede; si se quedan clavadas en la fecha de la
    ultima corrida de este script, no — y entonces este script tiene que correr
    periodicamente desde afuera de Render.
    """
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT celda, ROUND(EXTRACT(EPOCH FROM (now() - actualizado_en)) / 60) AS hace_min "
            "FROM clima_cache ORDER BY celda"
        ).fetchall()

    if not filas:
        print("La cache esta vacia. Corré el script sin argumentos para llenarla.")
        return

    for fila in filas:
        minutos = int(fila["hace_min"])
        # 15 minutos es la validez que usa backend/clima.py: por encima de eso
        # el backend intenta salir a la ruta de nuevo.
        marca = "fresca" if minutos < clima.VALIDEZ_CACHE_SEGUNDOS / 60 else "vencida"
        print(f"  {fila['celda']:<14} hace {minutos:>4} min  ({marca})")

    mas_nueva = min(int(f["hace_min"]) for f in filas)
    print(
        f"\nLa mas reciente es de hace {mas_nueva} min. "
        "Si despues de usar la app este numero no baja, el backend no esta "
        "llegando a Open-Meteo y conviene dejar este script en un cron."
    )


def refrescar(puntos: list[tuple[float, float]]) -> int:
    ok = 0
    for lat, lon in puntos:
        celda = clima._celda(lat, lon)
        try:
            crudo = clima._pedir_open_meteo(lat, lon)
        except Exception as e:
            print(f"  ! {celda}: {type(e).__name__}: {e}")
            continue

        clima._guardar_db(
            celda,
            round(lat, clima.GRADOS_CELDA),
            round(lon, clima.GRADOS_CELDA),
            crudo,
        )
        viento = (crudo.get("current") or {}).get("wind_speed_10m")
        print(f"  + {celda}: viento {viento} km/h")
        ok += 1
        time.sleep(PAUSA_SEGUNDOS)
    return ok


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--estado", action="store_true", help="Muestra que tan fresca esta la cache.")
    parser.add_argument("--listar", action="store_true", help="Solo muestra las celdas.")
    parser.add_argument("--lat", type=float, help="Refresca una coordenada puntual.")
    parser.add_argument("--lon", type=float, help="Va junto con --lat.")
    argumentos = parser.parse_args()

    if (argumentos.lat is None) != (argumentos.lon is None):
        parser.error("--lat y --lon van juntos.")

    if argumentos.estado:
        estado()
        raise SystemExit(0)

    puntos = (
        [(argumentos.lat, argumentos.lon)]
        if argumentos.lat is not None
        else celdas_en_uso()
    )

    if argumentos.listar:
        for lat, lon in puntos:
            print(f"  {clima._celda(lat, lon)}  (desde {lat}, {lon})")
        print(f"\n{len(puntos)} celdas.")
    else:
        print(f"Refrescando {len(puntos)} celdas…")
        ok = refrescar(puntos)
        print(f"\n{ok} de {len(puntos)} celdas actualizadas en clima_cache.")
