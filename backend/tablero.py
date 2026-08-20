"""El tablero de cruces de una lancha-taxi.

Es el equivalente fluvial del tablero de salidas de un aeropuerto: una fila por
cruce, con la proxima salida, cada cuanto sale, cuanto cuesta, a que hora es el
ultimo regreso y —lo unico que cambia varias veces por dia— en que estado esta.

El estado vive en DOS niveles y esa es la parte importante del modelo:

- El del **cruce** es el default del dia: "hoy no cruzo a Apipe", "todo el
  recorrido va demorado". Un toque y vale para todas las salidas.
- El de cada **salida** lo pisa cuando hace falta: la de las 09:30 se demoro
  media hora pero la de las 12:00 sale bien. Una salida sin estado propio
  (`estado` en None) hereda el del cruce; no es lo mismo que estar "a horario".

Sin el primer nivel, marcar un dia entero serian quince toques. Sin el segundo,
un tablero de aeropuerto no seria un tablero de aeropuerto: ahi la demora es de
un vuelo, no de la aerolinea.

Vive aparte de pois.py por una razon de fondo: **las ediciones del tablero no
pasan por moderacion**. Todo lo demas de una ficha (nombre, ubicacion, rubro)
lo revisa un admin porque publica algo nuevo en el mapa; el tablero no publica
nada nuevo, actualiza un dato operativo que envejece en minutos. Un "demorado"
esperando aprobacion no sirve para nada: cuando lo aprueben, la lancha ya
salio. Por eso el tablero tiene su propia puerta de entrada (ver main.py:
/api/mi-comercio/tablero) y no esta en pois.CAMPOS_EDITABLES, que es la lista
blanca del PUT que si puede mandar la ficha a revision.

El estado tampoco es eterno. Un "cancelado" cargado un sabado a la mañana que
sigue ahi el martes es peor que no tener tablero: el nauta deja de creerle,
igual que pasaria con los reportes si no vencieran (ver reportes.py). Aca la
caducidad no necesita cron ni columna: se calcula al leer, comparando contra la
fecha en la que el lanchero toco el interruptor.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

# Argentina esta en UTC-3 todo el año: no mueve la hora desde 2009. Se usa un
# offset fijo y no ZoneInfo para no arrastrar `tzdata` como dependencia solo
# para esto (en Windows, zoneinfo no trae la base de datos de zonas).
HORA_ARGENTINA = timezone(timedelta(hours=-3))

# Los estados del tablero, en el orden en que se muestran los interruptores.
#
# `alterado` marca los que no son la normalidad: son los que caducan y los que
# el mapa le levanta al pin. `pide_demora` es el unico que ademas necesita un
# numero — "demorado" a secas no le dice nada a nadie: media hora se espera,
# dos horas se cambia de plan.
ESTADOS = {
    "a_horario": {"etiqueta": "A horario", "alterado": False, "pide_demora": False},
    "por_salir": {"etiqueta": "Por salir", "alterado": True, "pide_demora": False},
    "demorado": {"etiqueta": "Demorado", "alterado": True, "pide_demora": True},
    "completo": {"etiqueta": "Completo", "alterado": True, "pide_demora": False},
    "cancelado": {"etiqueta": "Cancelado", "alterado": True, "pide_demora": False},
    "sin_servicio": {"etiqueta": "Sin servicio", "alterado": True, "pide_demora": False},
}

ESTADO_NORMAL = "a_horario"

# Los que puede tener una salida suelta. `sin_servicio` no esta: describe que el
# lanchero no opera ese recorrido por ahora, y eso es del cruce entero — no hay
# tal cosa como "no opero la salida de las 12".
ESTADOS_SALIDA = {"a_horario", "por_salir", "demorado", "completo", "cancelado"}

# "Por salir" es de otra naturaleza que el resto: no describe el dia, describe
# los proximos minutos ("ya esta amarrando, corre"). Dejarlo prendido cuatro
# horas seria mentir, asi que se apaga solo mucho antes que los demas.
MINUTOS_VIGENCIA_POR_SALIR = 45

# Cuantos cruces y cuantas salidas por cruce se aceptan. No es una restriccion
# tecnica: un tablero de veinte filas no se lee de un vistazo desde una lancha
# en movimiento, que es la unica situacion en la que se mira esto.
MAX_CRUCES = 12
MAX_SALIDAS = 24
MAX_LARGO_TEXTO = 80
MAX_LARGO_NOTA = 140


def _ahora_ar() -> datetime:
    return datetime.now(HORA_ARGENTINA)


def _texto(valor, maximo: int = MAX_LARGO_TEXTO) -> Optional[str]:
    if valor is None:
        return None
    limpio = str(valor).strip()[:maximo]
    return limpio or None


def _hora(valor) -> Optional[str]:
    """Normaliza a "HH:MM" de 24 h. Devuelve None si no se entiende.

    Se aceptan "7", "7:5", "0730" y "7.30" porque el lanchero carga el horario
    desde el celular, a veces con una mano y en movimiento: rechazar "7:5" y
    pedirle que vuelva a tipear seria hacerle perder el unico dato que vino a
    cargar.
    """
    if valor is None:
        return None
    crudo = str(valor).strip().replace(".", ":").replace("h", ":")
    if not crudo:
        return None

    if ":" in crudo:
        partes = crudo.split(":", 1)
    elif crudo.isdigit() and len(crudo) == 4:
        partes = [crudo[:2], crudo[2:]]
    else:
        partes = [crudo, "0"]

    try:
        horas, minutos = int(partes[0]), int(partes[1] or 0)
    except ValueError:
        return None
    if not (0 <= horas <= 23 and 0 <= minutos <= 59):
        return None
    return f"{horas:02d}:{minutos:02d}"


def _entero(valor, minimo: int, maximo: int) -> Optional[int]:
    try:
        numero = int(float(valor))
    except (TypeError, ValueError):
        return None
    return numero if minimo <= numero <= maximo else None


def _precio(valor) -> Optional[float]:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return None
    if not (0 <= numero <= 10_000_000):
        return None
    # Los precios se cargan redondos; devolver 3500.0 y no 3500 obligaria a
    # cada pantalla a decidir por su cuenta como imprimirlo.
    return int(numero) if numero == int(numero) else round(numero, 2)


def _caduco(estado_desde: Optional[str], ahora: datetime, es_por_salir: bool) -> bool:
    """Si lo que el lanchero marco en ese momento ya no vale.

    La regla es "hasta que termine el dia de servicio" y no "N horas": el
    lanchero piensa por jornada ("hoy no cruzo por el viento"), no por reloj.
    Cuando cambia el dia en Argentina el tablero vuelve solo a la normalidad, y
    asi la mañana arranca limpio en vez de depender de que alguien se acuerde de
    apagar lo de ayer.

    La usan los dos niveles —el del cruce y el de cada salida— con la misma
    cuenta: lo que caduca no es el estado, es la decision de haberlo puesto.
    """
    if not estado_desde:
        # Marcado sin marca de tiempo: viene de una version anterior o de un
        # cliente que no la mando. Se lo trata como vencido en vez de dejarlo
        # fijo para siempre, que es el unico final peor.
        return True
    try:
        desde = datetime.fromisoformat(estado_desde).astimezone(HORA_ARGENTINA)
    except ValueError:
        return True

    if es_por_salir:
        return ahora - desde > timedelta(minutes=MINUTOS_VIGENCIA_POR_SALIR)
    return desde.date() < ahora.date()


def _vencido(estado: str, estado_desde: Optional[str], ahora: datetime) -> bool:
    """La caducidad del estado del cruce. `a_horario` no caduca: es el default,
    no algo que alguien haya decidido."""
    if not ESTADOS.get(estado, {}).get("alterado"):
        return False
    return _caduco(estado_desde, ahora, estado == "por_salir")


def _salida_normalizada(cruda) -> Optional[dict]:
    """Una salida, venga como "07:00" o como objeto con su estado.

    Se sigue aceptando el string suelto porque asi se guardaban los tableros
    antes de que cada salida tuviera estado propio, y porque es lo comodo para
    cargarlas de a muchas desde el editor ("07:00, 09:30, 12:00").
    """
    if isinstance(cruda, dict):
        hora = _hora(cruda.get("hora"))
        if hora is None:
            return None
        estado = cruda.get("estado") if cruda.get("estado") in ESTADOS_SALIDA else None
        return {
            "hora": hora,
            "estado": estado,
            "demora_min": _entero(cruda.get("demora_min"), 5, 720) if estado == "demorado" else None,
            "estado_desde": cruda.get("estado_desde"),
        }

    hora = _hora(cruda)
    if hora is None:
        return None
    # `estado` en None y no en "a_horario": la salida hereda el del cruce, que
    # no es lo mismo que afirmar que va bien.
    return {"hora": hora, "estado": None, "demora_min": None, "estado_desde": None}


def normalizar(cruces, ahora: Optional[datetime] = None) -> list:
    """Los cruces como los tiene que ver quien lee: con los estados vencidos ya
    devueltos a "a horario".

    Se resuelve al leer y no con una tarea programada, igual que la vigencia de
    los reportes: sin cron no hay nada que pueda fallar en silencio y dejar el
    tablero mintiendo un lunes a la mañana.
    """
    if not cruces:
        return []
    ahora = ahora or _ahora_ar()

    normalizados = []
    for cruce in cruces:
        if not isinstance(cruce, dict):
            continue
        copia = dict(cruce)
        estado = copia.get("estado") or ESTADO_NORMAL
        if estado not in ESTADOS or _vencido(estado, copia.get("estado_desde"), ahora):
            copia["estado"] = ESTADO_NORMAL
            copia["demora_min"] = None
            copia["nota"] = None
            copia["estado_desde"] = None
        else:
            copia["estado"] = estado

        # Las salidas caducan por su cuenta y no con la del cruce: son dos
        # decisiones distintas, tomadas en momentos distintos.
        salidas = []
        for cruda in (copia.get("salidas") or []):
            salida = _salida_normalizada(cruda)
            if salida is None:
                continue
            if salida["estado"] is not None and _caduco(
                salida["estado_desde"], ahora, salida["estado"] == "por_salir"
            ):
                salida["estado"] = None
                salida["demora_min"] = None
                salida["estado_desde"] = None
            salidas.append(salida)
        copia["salidas"] = salidas

        normalizados.append(copia)
    return normalizados


def _validar_salidas(crudas, previas, ahora: datetime) -> list:
    """Las salidas de un cruce, saneadas y con la marca de tiempo del servidor.

    Se indexan por hora y no por posicion: la hora ES el identificador de una
    salida dentro de su cruce (no puede haber dos a las 09:30), asi que agregar
    un horario al principio de la lista no le mueve el estado a los demas.

    De `previas` se rescata `estado_desde` cuando el estado no cambio, por lo
    mismo que en el cruce: si corregir un precio reiniciara el reloj, un
    "demorado" no caducaria nunca.
    """
    anteriores = {s.get("hora"): s for s in (previas or []) if isinstance(s, dict)}
    limpias: dict[str, dict] = {}

    for cruda in (crudas or []):
        salida = _salida_normalizada(cruda)
        # Dos veces la misma hora es un error de tipeo, no una salida mas.
        if salida is None or salida["hora"] in limpias:
            continue

        previa = anteriores.get(salida["hora"], {})
        # A diferencia del cruce, aca "a_horario" tambien es algo que alguien
        # decidio —es el override de una salida que va bien dentro de un
        # recorrido demorado— y por lo tanto tambien caduca.
        marcada = salida["estado"] is not None
        cambio = previa.get("estado") != salida["estado"]
        salida["estado_desde"] = (
            ahora.isoformat(timespec="seconds")
            if marcada and (cambio or not previa.get("estado_desde"))
            else (previa.get("estado_desde") if marcada else None)
        )
        limpias[salida["hora"]] = salida

    # Ordenadas: el tablero se lee de arriba abajo.
    return [limpias[hora] for hora in sorted(limpias)][:MAX_SALIDAS]


def validar(cruces, previos=None) -> list:
    """Sanea lo que manda el dueño antes de guardarlo.

    `previos` son los cruces que ya estaban: de ahi se rescata `estado_desde`
    cuando el estado no cambio. Sin eso, cada vez que el lanchero corrigiera un
    precio se reiniciaria el reloj de vigencia de un "cancelado" y ese estado
    no caducaria nunca.

    El estado si se acepta desde afuera —a diferencia de pois.estado, que no—
    pero su marca de tiempo la pone el servidor: es lo unico que decide cuando
    caduca, y un celular con la hora mal puesta la dejaria colgada.
    """
    if not isinstance(cruces, list):
        raise ValueError("El tablero tiene que ser una lista de cruces.")
    if len(cruces) > MAX_CRUCES:
        raise ValueError(f"No se pueden cargar más de {MAX_CRUCES} cruces.")

    anteriores = {c.get("id"): c for c in (previos or []) if isinstance(c, dict)}
    ahora = _ahora_ar()
    vistos: set[str] = set()
    limpios = []

    for crudo in cruces:
        if not isinstance(crudo, dict):
            raise ValueError("Cada cruce tiene que ser un objeto.")

        destino = _texto(crudo.get("destino"))
        if not destino:
            raise ValueError("Cada cruce necesita un destino.")

        # El id lo genera el servidor la primera vez y despues no se toca: es
        # lo que ata el interruptor de estado a su fila. Con el indice del
        # arreglo, reordenar el tablero le moveria el estado a otro cruce.
        identificador = _texto(crudo.get("id"), 24) or secrets.token_hex(4)
        while identificador in vistos:
            identificador = secrets.token_hex(4)
        vistos.add(identificador)

        estado = crudo.get("estado") if crudo.get("estado") in ESTADOS else ESTADO_NORMAL
        previo = anteriores.get(identificador, {})
        alterado = ESTADOS[estado]["alterado"]
        cambio_estado = previo.get("estado") != estado

        salidas = _validar_salidas(crudo.get("salidas"), previo.get("salidas"), ahora)

        limpios.append({
            "id": identificador,
            "origen": _texto(crudo.get("origen")),
            "destino": destino,
            "salidas": salidas,
            "frecuencia_min": _entero(crudo.get("frecuencia_min"), 5, 1440),
            "precio": _precio(crudo.get("precio")),
            "duracion_min": _entero(crudo.get("duracion_min"), 1, 1440),
            "ultimo_regreso": _hora(crudo.get("ultimo_regreso")),
            "estado": estado,
            "demora_min": _entero(crudo.get("demora_min"), 5, 720) if estado == "demorado" else None,
            "nota": _texto(crudo.get("nota"), MAX_LARGO_NOTA) if alterado else None,
            "estado_desde": (
                ahora.isoformat(timespec="seconds")
                if alterado and (cambio_estado or not previo.get("estado_desde"))
                else (previo.get("estado_desde") if alterado else None)
            ),
        })

    return limpios


def cambiar_estado_salida(
    cruces,
    cruce_id: str,
    hora: str,
    estado: Optional[str],
    demora_min: Optional[int] = None,
) -> list:
    """Mueve el interruptor de UNA salida y deja el resto intacto.

    `estado` en None borra el estado propio de esa salida y la devuelve a
    heredar el del cruce. Es lo que hace falta para deshacer: sin eso, la unica
    forma de sacar un "demorado" de las 09:30 seria marcarla "a horario", que
    afirma algo distinto —y quedaria pisando al cruce para siempre.
    """
    if estado is not None and estado not in ESTADOS_SALIDA:
        raise ValueError(f"Estado desconocido para una salida: {estado}.")

    objetivo = _hora(hora)
    if objetivo is None:
        raise ValueError("Esa hora no se entiende.")

    actuales = normalizar(cruces)
    cruce = next((c for c in actuales if c.get("id") == cruce_id), None)
    if cruce is None:
        raise ValueError("Ese cruce no existe en tu tablero.")
    if not any(s.get("hora") == objetivo for s in cruce.get("salidas") or []):
        raise ValueError(f"Ese cruce no tiene una salida a las {objetivo}.")

    return validar(
        [
            {
                **c,
                "salidas": [
                    {**s, "estado": estado, "demora_min": demora_min}
                    if s.get("hora") == objetivo
                    else s
                    for s in c.get("salidas") or []
                ],
            }
            if c.get("id") == cruce_id
            else c
            for c in actuales
        ],
        previos=actuales,
    )


def cambiar_estado(
    cruces,
    cruce_id: str,
    estado: str,
    demora_min: Optional[int] = None,
    nota: Optional[str] = None,
) -> list:
    """Mueve el interruptor de UN cruce y deja el resto intacto.

    Existe aparte del guardado completo porque es la operacion del dia a dia y
    la unica que se hace apurado: el lanchero abre la app, toca "Demorado" y
    guarda el telefono. Mandar el tablero entero tambien funcionaria, pero
    pisaria con una copia vieja cualquier cambio hecho desde otro dispositivo
    —o desde la web, con la pantalla del celular abierta al mismo tiempo.
    """
    if estado not in ESTADOS:
        raise ValueError(f"Estado desconocido: {estado}.")

    actuales = normalizar(cruces)
    if not any(c.get("id") == cruce_id for c in actuales):
        raise ValueError("Ese cruce no existe en tu tablero.")

    return validar(
        [
            {**c, "estado": estado, "demora_min": demora_min, "nota": nota}
            if c.get("id") == cruce_id
            else c
            for c in actuales
        ],
        previos=actuales,
    )
