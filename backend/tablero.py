"""El tablero de cruces de una lancha-taxi.

Es el equivalente fluvial del tablero de salidas de un aeropuerto: una fila por
cruce, con la proxima salida, cada cuanto sale, cuanto cuesta, a que hora es el
ultimo regreso y en que estado esta.

DOS COSAS QUE PARECEN UNA

La confusion mas facil de este modulo es mezclar el PLAN con el ESTADO, y estan
separados a proposito:

- El **plan** son los horarios de la semana: `salidas` es un diccionario de dia
  a lista de horas. Es informacion estable — la carga el lanchero una vez y
  vale hasta que la cambie. No caduca nunca.
- El **estado** es lo de hoy: "el de las 09:30 va demorado", "hoy no cruzo".
  Eso si caduca, porque un "cancelado" del sabado que sigue el martes es peor
  que no tener tablero.

Que la planilla sea semanal y no de un solo dia importa de verdad: casi ningun
lanchero cruza igual un martes que un domingo, y con una sola lista tenia que
reescribirla cada vez.

TAMPOCO PASA POR MODERACION

Todo lo demas de una ficha (nombre, ubicacion, rubro) lo revisa un admin porque
publica algo nuevo en el mapa; el tablero no publica nada nuevo, actualiza un
dato operativo que envejece en minutos. Un "demorado" esperando aprobacion no
sirve para nada: cuando lo aprueben, la lancha ya salio. Por eso el tablero
tiene su propia puerta de entrada (main.py: /api/mi-comercio/tablero) y no esta
en pois.CAMPOS_EDITABLES.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

# Argentina esta en UTC-3 todo el año: no mueve la hora desde 2009. Se usa un
# offset fijo y no ZoneInfo para no arrastrar `tzdata` como dependencia solo
# para esto (en Windows, zoneinfo no trae la base de datos de zonas).
HORA_ARGENTINA = timezone(timedelta(hours=-3))

# Las mismas claves que usa pois.horarios, y en el mismo orden: lunes primero,
# como se lee un cartel en Argentina. Python.weekday() da 0 para el lunes, asi
# que el indice coincide sin traducir nada.
DIAS = ("lun", "mar", "mie", "jue", "vie", "sab", "dom")

# Los estados del tablero, en el orden en que se muestran los interruptores.
#
# `alterado` marca los que no son la normalidad: son los que caducan y los que
# el mapa le levanta al pin. `pide_demora` es el unico que ademas necesita un
# numero — "demorado" a secas no le dice nada a nadie.
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
# lanchero no opera ese recorrido por ahora, y eso es del cruce entero.
ESTADOS_SALIDA = {"a_horario", "por_salir", "demorado", "completo", "cancelado"}

# "Por salir" es de otra naturaleza que el resto: no describe el dia, describe
# los proximos minutos. Dejarlo prendido cuatro horas seria mentir.
MINUTOS_VIGENCIA_POR_SALIR = 45

MAX_CRUCES = 12
MAX_SALIDAS_POR_DIA = 24
MAX_LARGO_TEXTO = 80
MAX_LARGO_NOTA = 140


def _ahora_ar() -> datetime:
    return datetime.now(HORA_ARGENTINA)


def dia_de_hoy(ahora: Optional[datetime] = None) -> str:
    """La clave del dia de la semana en Argentina."""
    return DIAS[(ahora or _ahora_ar()).weekday()]


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
    asi la mañana arranca limpia sin depender de que alguien apague lo de ayer.
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


def _semana(crudas) -> dict:
    """Las salidas de la semana: {dia: [horas]}.

    Acepta tambien la forma vieja —una lista suelta de horas o de objetos— y
    la copia a los siete dias. Es la migracion de los tableros que se cargaron
    cuando la planilla era de un solo dia: quien tenia "07:00, 12:00" queria
    decir que cruza a esas horas, y repetirlo toda la semana es la lectura mas
    fiel de esa intencion.
    """
    if isinstance(crudas, list):
        horas = _horas_de(crudas)
        return {dia: list(horas) for dia in DIAS}

    if not isinstance(crudas, dict):
        return {dia: [] for dia in DIAS}

    return {dia: _horas_de(crudas.get(dia)) for dia in DIAS}


def _horas_de(lista) -> list:
    """Una lista de horas, ordenada y sin repetir. Acepta strings y objetos
    `{hora: ...}`, que es como venian antes las salidas."""
    if not isinstance(lista, list):
        return []
    horas = set()
    for cruda in lista:
        valor = cruda.get("hora") if isinstance(cruda, dict) else cruda
        hora = _hora(valor)
        if hora:
            horas.add(hora)
    # Ordenadas: el tablero se lee de arriba abajo. Dos veces la misma hora es
    # un error de tipeo, no una salida mas.
    return sorted(horas)[:MAX_SALIDAS_POR_DIA]


def _estados_salida(crudos, ahora: datetime, previos=None) -> dict:
    """Los estados de las salidas de HOY, indexados por hora.

    Van aparte de la planilla y no dentro de cada salida porque son cosas
    distintas: la planilla es el plan de la semana y esto es lo que pasa hoy.
    Mezclarlos obligaba a decidir si "el de las 09:30 esta demorado" se referia
    al 09:30 de todos los martes o al de hoy — y siempre es al de hoy.
    """
    anteriores = previos if isinstance(previos, dict) else {}
    limpios = {}

    for hora_cruda, valor in (crudos or {}).items():
        hora = _hora(hora_cruda)
        if hora is None or not isinstance(valor, dict):
            continue
        estado = valor.get("estado")
        if estado not in ESTADOS_SALIDA:
            continue

        previo = anteriores.get(hora, {})
        cambio = previo.get("estado") != estado
        limpios[hora] = {
            "estado": estado,
            "demora_min": _entero(valor.get("demora_min"), 5, 720) if estado == "demorado" else None,
            "estado_desde": (
                ahora.isoformat(timespec="seconds")
                if cambio or not previo.get("estado_desde")
                else previo.get("estado_desde")
            ),
        }
    return limpios


def normalizar(cruces, ahora: Optional[datetime] = None) -> list:
    """Los cruces como los tiene que ver quien lee: con la planilla completa de
    la semana y con los estados vencidos ya limpiados.

    La caducidad se resuelve al leer y no con una tarea programada, igual que
    la vigencia de los reportes: sin cron no hay nada que pueda fallar en
    silencio y dejar el tablero mintiendo un lunes a la mañana.
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

        copia["salidas"] = _semana(copia.get("salidas"))

        # Los estados de salida caducan por su cuenta, no con el del cruce: son
        # dos decisiones distintas tomadas en momentos distintos.
        vigentes = {}
        for hora, valor in (copia.get("estados_salida") or {}).items():
            if not isinstance(valor, dict) or valor.get("estado") not in ESTADOS_SALIDA:
                continue
            if _caduco(valor.get("estado_desde"), ahora, valor["estado"] == "por_salir"):
                continue
            vigentes[hora] = {
                "estado": valor["estado"],
                "demora_min": valor.get("demora_min"),
                "estado_desde": valor.get("estado_desde"),
            }
        copia["estados_salida"] = vigentes

        normalizados.append(copia)
    return normalizados


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

        salidas = _semana(crudo.get("salidas"))
        # Un estado sin su salida en la planilla de hoy no significa nada: si
        # el lanchero borro el horario de las 09:30, el "demorado" de las 09:30
        # sobra. Se descartan aca y no al leer para que no queden en la base.
        horas_de_hoy = set(salidas[dia_de_hoy(ahora)])
        estados = {
            hora: valor
            for hora, valor in _estados_salida(
                crudo.get("estados_salida"), ahora, previo.get("estados_salida")
            ).items()
            if hora in horas_de_hoy
        }

        limpios.append({
            "id": identificador,
            "origen": _texto(crudo.get("origen")),
            "destino": destino,
            "salidas": salidas,
            "estados_salida": estados,
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
    """Mueve el interruptor de UNA salida de hoy y deja el resto intacto.

    `estado` en None borra el estado propio de esa salida y la devuelve a
    heredar el del cruce, que no es lo mismo que marcarla "a horario": si
    manana el recorrido entero va demorado, la que hereda va demorada y la que
    afirma "a horario" seguiria diciendo que sale bien. El editor hoy siempre
    manda un estado —su botonera arranca con el que la salida ya tiene, asi que
    deshacer es tocar el que va—, pero la distincion es del dato, no de la
    pantalla, y quien la necesite la tiene.
    """
    if estado is not None and estado not in ESTADOS_SALIDA:
        raise ValueError(f"Estado desconocido para una salida: {estado}.")

    objetivo = _hora(hora)
    if objetivo is None:
        raise ValueError("Esa hora no se entiende.")

    ahora = _ahora_ar()
    actuales = normalizar(cruces, ahora)
    cruce = next((c for c in actuales if c.get("id") == cruce_id), None)
    if cruce is None:
        raise ValueError("Ese cruce no existe en tu tablero.")
    if objetivo not in cruce["salidas"][dia_de_hoy(ahora)]:
        raise ValueError(f"Hoy no tenés una salida a las {objetivo} en ese cruce.")

    nuevos = []
    for c in actuales:
        if c.get("id") != cruce_id:
            nuevos.append(c)
            continue
        estados = dict(c.get("estados_salida") or {})
        if estado is None:
            estados.pop(objetivo, None)
        else:
            estados[objetivo] = {"estado": estado, "demora_min": demora_min}
        nuevos.append({**c, "estados_salida": estados})

    return validar(nuevos, previos=actuales)


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
    pisaria con una copia vieja cualquier cambio hecho desde otro dispositivo.
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
