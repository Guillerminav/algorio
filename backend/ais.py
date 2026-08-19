"""Trafico de embarcaciones en tiempo real (AIS), para saber cuando cruzar.

Los barcos de porte emiten su posicion por AIS y aisstream.io la reparte por
WebSocket. Para el nauta esto contesta una pregunta muy concreta y muy suya:
si viene un buque, cuanto falta y por donde va a pasar — que es lo que decide
si cruzas ahora o esperas dos minutos.

POR QUE ESTO VIVE EN EL BACKEND Y NO EN EL NAVEGADOR
----------------------------------------------------
aisstream manda la API key DENTRO del mensaje de suscripcion del WebSocket. Si
el mapa se conectara directo, la clave viajaria en el bundle y en la pestaña de
red: cualquiera que abra la web se la lleva. Ademas seria una conexion por
visitante contra un servicio que limita por clave.

Aca hay UNA sola conexion para todo el mundo: este modulo mantiene el stream
abierto, guarda las ultimas posiciones en memoria y el frontend las pide por
HTTP cada tantos segundos. La clave nunca sale del servidor.

POR QUE EN MEMORIA Y NO EN LA BASE
-----------------------------------
Una posicion AIS vale minutos. Guardarla en Postgres seria escribir cientos de
filas por minuto para leer siempre la ultima y tirar el resto — y encima
pagando el viaje a Neon en cada lectura. Si el proceso se reinicia, en un
minuto el stream vuelve a llenar el diccionario.
"""
import asyncio
import json
import os
import time
from typing import Optional

URL_STREAM = "wss://stream.aisstream.io/v0/stream"

CLAVE = os.environ.get("AISSTREAM_API_KEY", "").strip()

# El tramo del Parana frente a Rosario y Granadero Baigorria, que es donde se
# cruza de costa a isla. Formato de aisstream: [[[lat, lon] esquina SO,
# [lat, lon] esquina NE]].
#
# Va de un poco al sur del puerto de Rosario hasta arriba de Granadero
# Baigorria, y de la costa oeste hasta pasada la linea de islas: el canal
# principal y los brazos de enfrente entran enteros.
CAJA_ROSARIO = [[[-33.00, -60.78], [-32.78, -60.55]]]

# Cuanto vale una posicion antes de darla por vieja. Un barco que sale de la
# caja deja de reportar, y su ultimo punto no puede quedar clavado en el mapa
# como si siguiera ahi: a los 15 minutos ya navego varios kilometros.
VALIDEZ_SEGUNDOS = 15 * 60

# Tope defensivo. En este tramo de rio no hay ni cerca esa cantidad de barcos;
# existe para que un error de recuadro no llene la memoria del proceso.
MAX_EMBARCACIONES = 500

# Reconexion con espera creciente. El stream se corta por mil razones (la red
# de Render, un reinicio del proveedor) y reintentar cada un segundo para
# siempre seria maltratar un servicio ajeno.
ESPERAS_RECONEXION = [2, 5, 15, 30, 60]

_embarcaciones: dict[int, dict] = {}
_estado = {"conectado": False, "ultimo_mensaje": None, "ultimo_error": None}
_tarea: Optional[asyncio.Task] = None


def hay_clave() -> bool:
    """Sin clave la funcion simplemente no existe, y el mapa lo dice."""
    return bool(CLAVE)


def _guardar(mensaje: dict) -> None:
    """Una posicion nueva. Se queda solo con lo que el mapa dibuja."""
    reporte = (mensaje.get("Message") or {}).get("PositionReport") or {}
    meta = mensaje.get("MetaData") or {}

    mmsi = meta.get("MMSI") or reporte.get("UserID")
    lat = reporte.get("Latitude")
    lon = reporte.get("Longitude")
    if mmsi is None or lat is None or lon is None:
        return

    # `Cog` es el rumbo sobre el fondo (hacia donde va de verdad) y
    # `TrueHeading` hacia donde apunta la proa. Para dibujar la flecha sirve el
    # primero; el segundo llega en 511 cuando el barco no lo informa.
    rumbo = reporte.get("Cog")
    proa = reporte.get("TrueHeading")
    if proa is not None and proa >= 360:
        proa = None

    _embarcaciones[mmsi] = {
        "mmsi": mmsi,
        # El nombre llega con relleno de espacios al ancho fijo del campo AIS.
        "nombre": (meta.get("ShipName") or "").strip() or None,
        "lat": lat,
        "lon": lon,
        "rumbo": rumbo if rumbo is not None and rumbo < 360 else None,
        "proa": proa,
        "velocidad_nudos": reporte.get("Sog"),
        "estado_navegacion": reporte.get("NavigationalStatus"),
        "actualizado": time.time(),
    }

    if len(_embarcaciones) > MAX_EMBARCACIONES:
        _purgar(forzar=True)


def _purgar(forzar: bool = False) -> None:
    limite = time.time() - VALIDEZ_SEGUNDOS
    for mmsi in [m for m, e in _embarcaciones.items() if e["actualizado"] < limite]:
        del _embarcaciones[mmsi]

    # Si aun asi sobran (recuadro enorme por error), se tiran las mas viejas.
    if forzar and len(_embarcaciones) > MAX_EMBARCACIONES:
        sobrantes = sorted(_embarcaciones.items(), key=lambda par: par[1]["actualizado"])
        for mmsi, _ in sobrantes[: len(_embarcaciones) - MAX_EMBARCACIONES]:
            del _embarcaciones[mmsi]


async def _escuchar() -> None:
    """Un ciclo de conexion. Sale cuando el stream se corta."""
    import websockets  # viene con uvicorn[standard]

    async with websockets.connect(URL_STREAM, open_timeout=20) as ws:
        # La suscripcion tiene que salir dentro de los 3 segundos o el servidor
        # cierra: por eso es lo primero, antes de cualquier otra cosa.
        await ws.send(json.dumps({
            "APIKey": CLAVE,
            "BoundingBoxes": CAJA_ROSARIO,
            "FilterMessageTypes": ["PositionReport"],
        }))
        _estado["conectado"] = True
        _estado["ultimo_error"] = None
        print(f"AIS: conectado y suscripto al recuadro {CAJA_ROSARIO[0]}")

        async for crudo in ws:
            try:
                mensaje = json.loads(crudo)
            except ValueError:
                continue
            if mensaje.get("MessageType") == "PositionReport":
                _guardar(mensaje)
                _estado["ultimo_mensaje"] = time.time()


async def _bucle() -> None:
    """Mantiene el stream abierto para siempre, reconectando."""
    intento = 0
    while True:
        try:
            await _escuchar()
            intento = 0  # se corto despues de haber funcionado
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 — cualquier corte se reintenta
            _estado["ultimo_error"] = f"{type(e).__name__}: {e}"[:200]
            print(f"AIS: se corto el stream ({_estado['ultimo_error']})")
        finally:
            _estado["conectado"] = False

        espera = ESPERAS_RECONEXION[min(intento, len(ESPERAS_RECONEXION) - 1)]
        intento += 1
        await asyncio.sleep(espera)


def arrancar() -> None:
    """Lanza el stream. Lo llama el arranque del backend (lifespan)."""
    global _tarea
    if _tarea is not None:
        return
    if not hay_clave():
        print("AIS: sin AISSTREAM_API_KEY, la capa de embarcaciones queda apagada")
        return
    _tarea = asyncio.create_task(_bucle(), name="ais")


async def detener() -> None:
    global _tarea
    if _tarea is None:
        return
    _tarea.cancel()
    try:
        await _tarea
    except (asyncio.CancelledError, Exception):  # noqa: BLE001
        pass
    _tarea = None


def estado() -> dict:
    """Lo que ve el frontend.

    Manda `activo` y `conectado` aparte de la lista para que el mapa pueda
    distinguir tres cosas que se ven igual si solo mandaras una lista vacia:
    la funcion no esta configurada, el stream se cayo, o esta todo bien y
    justo no hay barcos en el tramo.
    """
    _purgar()
    return {
        "activo": hay_clave(),
        "conectado": _estado["conectado"],
        # Distingue "el tramo esta vacio" de "el stream nunca dijo nada". Se
        # ven igual —una lista vacia— y significan cosas opuestas: la primera
        # es informacion, la segunda es que la fuente no esta entregando.
        "recibio_datos": _estado["ultimo_mensaje"] is not None,
        "ultimo_mensaje": _estado["ultimo_mensaje"],
        "ultimo_error": _estado["ultimo_error"],
        "embarcaciones": sorted(
            _embarcaciones.values(), key=lambda e: e["actualizado"], reverse=True
        ),
    }
