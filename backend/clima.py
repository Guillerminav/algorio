"""Viento y clima para el nauta, y la lectura de si el rio "esta picado".

Los datos salen de Open-Meteo: es gratis, no pide API key y publica viento
sostenido, rafagas y direccion por hora, que es exactamente lo que decide si
se sale o no. Se consulta con httpx, que ya es dependencia del proyecto.

El dato crudo no es el producto. Un viento de 20 km/h es una tarde tranquila
para una lancha de 7 metros y un problema serio para un kayak. Por eso el
resultado incluye `estado_rio`, que cruza el pronostico con el tipo de
embarcacion del usuario (usuarios.tipo_embarcacion). Ese cruce es lo que la
app muestra arriba de todo en el mapa.

SOBRE LA CACHE Y LOS RESPALDOS

Buena parte de este modulo es aguante, y no por gusto. Open-Meteo es gratis y
sin API key, lo que en la practica significa cuota por IP; el backend corre en
el plan free de Render, cuya IP de salida es compartida con otros inquilinos.
Cuando esa cuota se agota, la llamada falla y el nauta ve una pantalla de error
en vez del viento — que es el dato por el que abrio la app.

Tres decisiones atacan eso, en orden de importancia:

1. **La celda de cache es de 0,1 grados**, no de 0,01. Es la resolucion real
   del modelo global de Open-Meteo: pedir mas fino no da un pronostico mas
   preciso, da el mismo dato interpolado. Con celdas de 1 km, dos personas a
   diez cuadras generaban dos llamadas distintas y una lancha en movimiento
   generaba una nueva cada kilometro. Ese era el grueso del trafico.
2. **La cache sobrevive al reinicio** (tabla clima_cache). Render apaga el
   proceso a los 15 minutos sin uso, asi que la cache en memoria arrancaba
   vacia varias veces por dia y obligaba a salir a la ruta justo cuando mas
   probable era fallar.
3. **Si no hay dato fresco, se sirve el viejo diciendo que es viejo**, y con
   dos limites que no son negociables: nada de mas de seis horas
   (MAX_SEGUNDOS_RESPALDO) y nada de mas de ~65 km (GRADOS_MAX_VECINA). Fuera
   de eso se devuelve el 503, porque un numero que no hay que creerle es peor
   que no tener numero.

   Y lo que se sirve como "ahora" no es la medicion vieja sino la fila de la
   serie horaria que corresponde a esta hora: la serie es un pronostico y
   sigue prediciendo el presente aunque se haya traido hace rato, mientras que
   `current` es una medicion de un momento que ya paso. Ver _formatear.
"""
import json
import math
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from db import conexion, inicializar_db

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

# El pronostico de una zona no cambia entre dos consultas seguidas, y la app lo
# pide cada vez que se abre el mapa.
#
# La celda es de 0,1 grados (~11 km) y ese numero no es arbitrario: es la
# resolucion del modelo global de Open-Meteo. Pedir por celdas de 0,01 —como se
# hacia antes— no daba un pronostico mas fino, daba el mismo dato interpolado
# multiplicado por cien llamadas.
GRADOS_CELDA = 1  # decimales de redondeo
_CACHE: dict[str, tuple[float, dict]] = {}
VALIDEZ_CACHE_SEGUNDOS = 15 * 60
MAX_ENTRADAS_CACHE = 500

# Hasta donde se acepta el pronostico de una celda vecina cuando la propia no
# tiene nada. 0,6 grados son ~65 km, cinco o seis celdas del modelo: sobre el
# mismo tramo de rio el viento no cambia de signo en esa distancia. Mas lejos
# que eso ya seria inventar — el viento de Rosario no dice nada del de
# Corrientes, y estan a 700 km.
GRADOS_MAX_VECINA = 0.6

# Cuanto puede envejecer un respaldo antes de que deje de servir.
#
# Es el limite que separa "dato viejo pero util" de "dato que no hay que
# mostrar". Seis horas es lo que aguanta la parte que de verdad se respalda: la
# serie horaria, que es un PRONOSTICO y por lo tanto sigue cubriendo la hora
# actual aunque se haya traido hace rato. Pasado eso preferimos fallar y
# decirlo, porque alguien se mete al rio con esto.
MAX_SEGUNDOS_RESPALDO = 6 * 3600

# Reintentos de la llamada a Open-Meteo. Cortos y pocos: el endpoint es
# sincronico y ocupa un hilo del threadpool de uvicorn mientras espera, asi que
# insistir mucho aca es quitarle atencion al resto de la app. Con un 429 por
# cuota no van a servir; con un corte de red de un segundo, si.
REINTENTOS = 3
ESPERAS_REINTENTO = (0.4, 1.2)


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
    ultimo = None
    with httpx.Client(timeout=10) as cliente:
        for intento in range(REINTENTOS):
            try:
                respuesta = cliente.get(URL_OPEN_METEO, params=parametros)
                respuesta.raise_for_status()
                return respuesta.json()
            except (httpx.HTTPError, ValueError) as e:
                ultimo = e
                # No se reintenta un 4xx que no sea 429: si el pedido esta mal
                # formado o la cuota es diaria, volver a preguntar lo mismo da
                # lo mismo y solo suma latencia.
                codigo = getattr(getattr(e, "response", None), "status_code", None)
                if codigo is not None and 400 <= codigo < 500 and codigo != 429:
                    break
                if intento < len(ESPERAS_REINTENTO):
                    time.sleep(ESPERAS_REINTENTO[intento])
    raise ultimo


def _indice_hora_actual(crudo: dict) -> Optional[int]:
    """Donde cae la hora de ahora dentro de la serie horaria, o None.

    Open-Meteo devuelve los tiempos en la hora local del punto consultado
    (`timezone=auto`), asi que la comparacion se hace corriendo el reloj UTC
    por `utc_offset_seconds` y no con la hora de este servidor — que en Render
    esta en UTC y en la maquina de desarrollo, en Argentina.
    """
    desfase = crudo.get("utc_offset_seconds")
    if desfase is None:
        return None
    ahora_local = datetime.now(timezone.utc) + timedelta(seconds=desfase)
    buscada = ahora_local.strftime("%Y-%m-%dT%H:00")
    tiempos = (crudo.get("hourly") or {}).get("time") or []
    try:
        return tiempos.index(buscada)
    except ValueError:
        return None


def _formatear(crudo: dict, tipo_embarcacion: Optional[str], edad_segundos: float = 0.0) -> dict:
    actual = crudo.get("current") or {}
    horas = crudo.get("hourly") or {}

    # Las dos mitades de la respuesta envejecen distinto y eso cambia que se
    # puede mostrar de cada una:
    #
    # - `current` es una MEDICION de un momento (`interval` 900 s). A las tres
    #   horas es simplemente falsa.
    # - `hourly` es un PRONOSTICO que cubre las horas siguientes. Una serie
    #   traida hace tres horas todavia tiene una prediccion para esta hora, y
    #   esa prediccion es un dato legitimo — hecha con mas anticipacion, nada
    #   mas.
    #
    # Por eso, cuando lo que se esta sirviendo es un respaldo, el "ahora" se
    # arma con la fila de la serie que corresponde a esta hora en vez de
    # repetir la medicion vieja. Mostrar "viento 3 km/h" porque eso medimos a
    # las 9 de la mañana, cuando el pronostico de las 15 decia 13 km/h, seria
    # exactamente la informacion falsa que hay que evitar.
    estimado = False
    if edad_segundos > VALIDEZ_CACHE_SEGUNDOS:
        i = _indice_hora_actual(crudo)
        if i is not None:
            estimado = True
            actual = {
                "time": _en(horas.get("time"), i),
                "temperature_2m": _en(horas.get("temperature_2m"), i),
                # La serie horaria no trae sensacion termica ni precipitacion
                # acumulada: van en None y la pantalla no los dibuja, que es
                # mejor que arrastrar los de hace tres horas.
                "apparent_temperature": None,
                "precipitation": None,
                "wind_speed_10m": _en(horas.get("wind_speed_10m"), i),
                "wind_gusts_10m": _en(horas.get("wind_gusts_10m"), i),
                "wind_direction_10m": _en(horas.get("wind_direction_10m"), i),
            }

    viento = actual.get("wind_speed_10m")
    rafagas = actual.get("wind_gusts_10m")
    direccion = actual.get("wind_direction_10m")

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
    edad_min = int(edad_segundos // 60)
    return {
        # Cuan viejo es esto. Va en la respuesta y no se esconde: si el
        # pronostico se sirvio de la cache vencida porque Open-Meteo no
        # contesto, el nauta tiene derecho a saber que esta mirando el viento
        # de hace dos horas antes de decidir si sale. Es el mismo criterio que
        # los reportes vencidos y que el estado del AIS.
        "edad_min": edad_min,
        "desactualizado": edad_segundos > VALIDEZ_CACHE_SEGUNDOS,
        # El "ahora" salio de la serie horaria y no de una medicion. La app lo
        # dice con todas las letras: no es lo mismo "el viento es" que "el
        # viento previsto para esta hora es".
        "actual_estimado": estimado,
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


def _celda(lat: float, lon: float) -> str:
    """La clave de cache de esa coordenada. Ver GRADOS_CELDA."""
    return f"{round(lat, GRADOS_CELDA)},{round(lon, GRADOS_CELDA)}"


def _leer_db(celda: str):
    """El ultimo pronostico guardado de esa celda, o None.

    Todo el acceso a la base va envuelto: la cache es una mejora, no un
    requisito. Si Neon no contesta, el clima tiene que seguir funcionando
    contra Open-Meteo como antes en vez de arrastrar a la pantalla al error.
    """
    try:
        inicializar_db()
        with conexion() as con:
            fila = con.execute(
                "SELECT datos, EXTRACT(EPOCH FROM (now() - actualizado_en)) AS edad "
                "FROM clima_cache WHERE celda = %s",
                (celda,),
            ).fetchone()
        return (float(fila["edad"]), fila["datos"]) if fila else None
    except Exception:
        return None


def _guardar_db(celda: str, lat: float, lon: float, crudo: dict) -> None:
    try:
        inicializar_db()
        with conexion() as con:
            con.execute(
                """
                INSERT INTO clima_cache (celda, lat, lon, datos, actualizado_en)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (celda) DO UPDATE
                    SET datos = EXCLUDED.datos,
                        lat = EXCLUDED.lat,
                        lon = EXCLUDED.lon,
                        actualizado_en = now()
                """,
                (celda, lat, lon, json.dumps(crudo)),
            )
    except Exception:
        # Que no se pueda guardar la cache no es motivo para no devolver el
        # pronostico que ya tenemos en la mano.
        pass


def _vecina_mas_cercana(lat: float, lon: float):
    """El pronostico guardado mas cercano, dentro de GRADOS_MAX_VECINA.

    Ultimo recurso, para cuando Open-Meteo no contesta y esta celda nunca se
    consulto. Sobre el mismo tramo de rio el viento de la celda de al lado es
    una respuesta razonable; una pantalla de error no es ninguna.

    La distancia se mide en grados con correccion por coseno y no con haversine
    exacto: solo hay que elegir cual de un puñado de celdas esta mas cerca, no
    informar kilometros.
    """
    try:
        inicializar_db()
        with conexion() as con:
            filas = con.execute(
                "SELECT lat, lon, datos, EXTRACT(EPOCH FROM (now() - actualizado_en)) AS edad "
                "FROM clima_cache"
            ).fetchall()
    except Exception:
        return None

    coseno = max(math.cos(math.radians(lat)), 0.01)
    mejor = None
    for fila in filas:
        d_lat = fila["lat"] - lat
        d_lon = (fila["lon"] - lon) * coseno
        distancia = math.hypot(d_lat, d_lon)
        if distancia <= GRADOS_MAX_VECINA and (mejor is None or distancia < mejor[0]):
            mejor = (distancia, float(fila["edad"]), fila["datos"])
    return (mejor[1], mejor[2]) if mejor else None


def obtener(lat: float, lon: float, tipo_embarcacion: Optional[str] = None) -> dict:
    """Clima de esa coordenada, ya cruzado con la embarcacion del usuario.

    La respuesta cruda se cachea (no la formateada): dos usuarios en el mismo
    lugar con embarcaciones distintas comparten el pronostico pero no el
    veredicto, asi que el cruce se recalcula por llamada, que es gratis.
    """
    celda = _celda(lat, lon)
    ahora = time.time()

    # 1. Memoria, si esta fresca. Es el caso normal y no toca ni la red ni la base.
    en_memoria = _CACHE.get(celda)
    if en_memoria and ahora - en_memoria[0] < VALIDEZ_CACHE_SEGUNDOS:
        return _formatear(en_memoria[1], tipo_embarcacion, ahora - en_memoria[0])

    # 2. La base, si esta fresca. Es lo que hace que el primer usuario despues
    #    de que Render apago el proceso no tenga que salir a Open-Meteo.
    en_db = _leer_db(celda)
    if en_db and en_db[0] < VALIDEZ_CACHE_SEGUNDOS:
        _CACHE[celda] = (ahora - en_db[0], en_db[1])
        return _formatear(en_db[1], tipo_embarcacion, en_db[0])

    # 3. Open-Meteo.
    try:
        crudo = _pedir_open_meteo(lat, lon)
    except (httpx.HTTPError, ValueError) as e:
        # Cuota agotada, corte de red, lo que sea: antes de rendirse se busca
        # el dato viejo, primero el propio y despues el de la celda vecina mas
        # cercana. Se devuelve marcado como desactualizado, no disfrazado de
        # fresco.
        respaldo = en_db or (
            (ahora - en_memoria[0], en_memoria[1]) if en_memoria else None
        ) or _vecina_mas_cercana(lat, lon)
        # El techo importa tanto como el respaldo: un pronostico de hace tres
        # dias no es "viejo pero util", es un numero que no hay que mostrar por
        # mas que se aclare de cuando es. Pasado el limite se prefiere fallar.
        if respaldo and respaldo[0] <= MAX_SEGUNDOS_RESPALDO:
            return _formatear(respaldo[1], tipo_embarcacion, respaldo[0])
        raise RuntimeError(f"No se pudo consultar el pronóstico: {e}") from e

    if len(_CACHE) >= MAX_ENTRADAS_CACHE:
        _CACHE.clear()
    _CACHE[celda] = (ahora, crudo)
    _guardar_db(celda, round(lat, GRADOS_CELDA), round(lon, GRADOS_CELDA), crudo)
    return _formatear(crudo, tipo_embarcacion, 0.0)
