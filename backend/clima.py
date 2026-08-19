"""Viento y clima para el nauta, y la lectura de si el rio "esta picado".

Los datos salen de Open-Meteo: es gratis, no pide API key y publica viento
sostenido, rafagas y direccion por hora, que es exactamente lo que decide si
se sale o no. Se consulta con httpx, que ya es dependencia del proyecto.

El dato crudo no es el producto. Un viento de 20 km/h es una tarde tranquila
para una lancha de 7 metros y un problema serio para un kayak. Por eso el
resultado incluye `estado_rio`, que cruza el pronostico con el tipo de
embarcacion del usuario (usuarios.tipo_embarcacion). Ese cruce es lo que la
app muestra arriba de todo en el mapa.
"""
import math
import time
from typing import Optional

import httpx

URL_OPEN_METEO = "https://api.open-meteo.com/v1/forecast"

# Umbrales de viento sostenido en km/h: (empieza a picarse, mejor no salir).
# Son criterios de navegacion recreativa, no una escala oficial: un kayak se
# complica cuando la lancha todavia ni se entera.
UMBRALES_POR_EMBARCACION = {
    "kayak": (15, 25),
    "canoa": (15, 25),
    "sup": (12, 20),
    "moto_agua": (25, 40),
    "semirrigido": (25, 40),
    "lancha": (30, 45),
    "velero": (30, 45),
    "otro": (20, 35),
}

# Para quien todavia no eligio embarcacion. Es el criterio mas conservador de
# los "generales": preferimos avisar de mas a alguien que no sabemos que
# maneja, antes que decirle que esta lindo y que se encuentre con olas.
UMBRALES_POR_DEFECTO = UMBRALES_POR_EMBARCACION["otro"]

# Una rafaga pesa menos que el viento sostenido a igual velocidad (dura
# segundos), pero una rafaga muy por encima del promedio es justo lo que da
# vuelta un kayak. Se la compara contra el umbral multiplicado por esto.
FACTOR_RAFAGA = 1.4

ROSA_VIENTOS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"]

# El pronostico de una zona no cambia entre dos consultas seguidas, y la app
# lo pide cada vez que se abre el mapa. Se cachea por celda de ~1 km y por
# hora: es el detalle util (dos paradores del mismo brazo del rio comparten
# clima) sin que el dato quede viejo.
_CACHE: dict[tuple, tuple[float, dict]] = {}
VALIDEZ_CACHE_SEGUNDOS = 15 * 60
MAX_ENTRADAS_CACHE = 500


def _umbrales(tipo_embarcacion: Optional[str]) -> tuple[int, int]:
    return UMBRALES_POR_EMBARCACION.get(tipo_embarcacion, UMBRALES_POR_DEFECTO)


def _redondear(valor: float) -> int:
    """Redondeo comercial: el 0,5 siempre para arriba.

    `round()` de Python usa redondeo bancario y lleva el 0,5 al par mas
    cercano: round(10.5) da 10. Math.round() de JavaScript da 11. Como el
    cartel del mapa arma su texto aca y la tarjeta "Ahora" redondea en el
    navegador, con 10,5 km/h de viento la misma pantalla mostraba 10 en un
    lado y 11 en el otro.
    """
    return math.floor(valor + 0.5)


def rumbo(grados: Optional[float]) -> Optional[str]:
    """Direccion del viento en letras. "Viento del SE" se entiende de un
    vistazo; "135°" hay que traducirlo mentalmente."""
    if grados is None:
        return None
    return ROSA_VIENTOS[round(grados / 22.5) % 16]


def evaluar_estado(
    viento_kmh: Optional[float],
    rafagas_kmh: Optional[float],
    tipo_embarcacion: Optional[str] = None,
) -> dict:
    """Traduce viento + rafagas a `calmo` / `picado` / `muy_picado` para esa
    embarcacion, con un texto listo para mostrar."""
    if viento_kmh is None:
        return {"estado": "sin_datos", "titulo": "Sin datos de viento", "detalle": None}

    pica, no_salir = _umbrales(tipo_embarcacion)
    rafagas = rafagas_kmh if rafagas_kmh is not None else viento_kmh

    if viento_kmh >= no_salir or rafagas >= no_salir * FACTOR_RAFAGA:
        estado, titulo = "muy_picado", "Río muy picado"
    elif viento_kmh >= pica or rafagas >= pica * FACTOR_RAFAGA:
        estado, titulo = "picado", "Río picado"
    else:
        estado, titulo = "calmo", "Río calmo"

    detalle = f"Viento {_redondear(viento_kmh)} km/h"
    if rafagas_kmh is not None and rafagas_kmh > viento_kmh:
        detalle += f", ráfagas {_redondear(rafagas_kmh)}"
    return {"estado": estado, "titulo": titulo, "detalle": detalle}


def _pedir_open_meteo(lat: float, lon: float) -> dict:
    parametros = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
        "hourly": "temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
        "wind_speed_unit": "kmh",
        "timezone": "auto",
        "forecast_days": 3,
    }
    with httpx.Client(timeout=10) as cliente:
        respuesta = cliente.get(URL_OPEN_METEO, params=parametros)
        respuesta.raise_for_status()
        return respuesta.json()


def _formatear(crudo: dict, tipo_embarcacion: Optional[str]) -> dict:
    actual = crudo.get("current") or {}
    viento = actual.get("wind_speed_10m")
    rafagas = actual.get("wind_gusts_10m")
    direccion = actual.get("wind_direction_10m")

    horas = crudo.get("hourly") or {}
    tiempos = horas.get("time") or []
    # 48 horas alcanzan para decidir "salgo hoy" y "salgo mañana", que es el
    # horizonte real de quien va a remar el fin de semana.
    pronostico = [
        {
            "hora": tiempos[i],
            "temperatura_c": _en(horas.get("temperature_2m"), i),
            "prob_lluvia": _en(horas.get("precipitation_probability"), i),
            "viento_kmh": _en(horas.get("wind_speed_10m"), i),
            "rafagas_kmh": _en(horas.get("wind_gusts_10m"), i),
            "direccion_grados": _en(horas.get("wind_direction_10m"), i),
            "direccion": rumbo(_en(horas.get("wind_direction_10m"), i)),
            "estado": evaluar_estado(
                _en(horas.get("wind_speed_10m"), i),
                _en(horas.get("wind_gusts_10m"), i),
                tipo_embarcacion,
            )["estado"],
        }
        for i in range(min(len(tiempos), 48))
    ]

    umbral_pica, umbral_no_salir = _umbrales(tipo_embarcacion)
    return {
        "actual": {
            "temperatura_c": actual.get("temperature_2m"),
            "sensacion_c": actual.get("apparent_temperature"),
            "precipitacion_mm": actual.get("precipitation"),
            "viento_kmh": viento,
            "rafagas_kmh": rafagas,
            "direccion_grados": direccion,
            "direccion": rumbo(direccion),
            "hora": actual.get("time"),
        },
        # El cruce con la embarcacion del usuario: lo que la app muestra arriba
        # del mapa antes que cualquier numero.
        "estado_rio": evaluar_estado(viento, rafagas, tipo_embarcacion),
        "tipo_embarcacion": tipo_embarcacion,
        "umbrales_kmh": {"picado": umbral_pica, "muy_picado": umbral_no_salir},
        "pronostico": pronostico,
    }


def _en(lista, indice):
    """Open-Meteo devuelve las series como listas paralelas y omite la clave
    entera si esa variable no esta disponible para la zona."""
    if not lista or indice >= len(lista):
        return None
    return lista[indice]


def obtener(lat: float, lon: float, tipo_embarcacion: Optional[str] = None) -> dict:
    """Clima de esa coordenada, ya cruzado con la embarcacion del usuario.

    La respuesta cruda se cachea (no la formateada): dos usuarios en el mismo
    lugar con embarcaciones distintas comparten el pronostico pero no el
    veredicto, asi que el cruce se recalcula por llamada, que es gratis.
    """
    clave = (round(lat, 2), round(lon, 2))
    ahora = time.time()

    guardado = _CACHE.get(clave)
    if guardado and ahora - guardado[0] < VALIDEZ_CACHE_SEGUNDOS:
        return _formatear(guardado[1], tipo_embarcacion)

    try:
        crudo = _pedir_open_meteo(lat, lon)
    except (httpx.HTTPError, ValueError) as e:
        # Si Open-Meteo no responde y hay algo cacheado, aunque este vencido,
        # es mejor que nada: un pronostico de hace una hora sigue siendo util
        # y la alternativa es una pantalla vacia en medio del rio.
        if guardado:
            return _formatear(guardado[1], tipo_embarcacion)
        raise RuntimeError(f"No se pudo consultar el pronóstico: {e}") from e

    if len(_CACHE) >= MAX_ENTRADAS_CACHE:
        _CACHE.clear()
    _CACHE[clave] = (ahora, crudo)
    return _formatear(crudo, tipo_embarcacion)
