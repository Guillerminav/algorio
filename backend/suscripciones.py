"""Suscripciones: prueba gratis y control de acceso.

Todavia no hay cobro real (falta integrar Mercado Pago); esta capa es la que
decide si una cuenta tiene acceso, y es la unica que el resto del backend
consulta. Cuando se sume el cobro, el webhook del proveedor va a escribir en
esta misma tabla (estado='activa' y vigente_hasta empujado un mes) y nada
mas del backend va a necesitar cambiar.

Regla: el acceso se decide SIEMPRE en el backend contra la base, nunca con
algo que mande el frontend.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from db import conexion, inicializar_db

# Duracion de la prueba gratis, en dias. Se puede pisar por entorno para
# probar el vencimiento sin esperar dos semanas (ej. DIAS_PRUEBA=0).
DIAS_PRUEBA = int(os.environ.get("DIAS_PRUEBA", "14"))

ESTADOS_CON_ACCESO = {"prueba", "activa"}

# Los tres planes. Este diccionario es la unica fuente de verdad: el
# backend decide con el, y el frontend lo recibe en /api/suscripcion para
# pintar la interfaz. Si manana cambia un tope, se cambia aca y nada mas.
#
# `secciones` son las del producto que el plan habilita; las que no
# figuran no se muestran ni responden por API. `max_activos` y `max_rutas`
# en None significan sin tope (no cero: cero seria "no puede crear ninguno").
SECCIONES_BASE = ("dashboard", "historico", "alertas", "mapa")

# Los precios viven aca y no en el frontend para que la pantalla de registro y
# la landing puedan salir del mismo numero. `precio_usd` en None es "a
# consultar" (no hay tarifa publicada); `precio_lista_usd` es el precio tachado
# al lado del promocional, y va en None cuando no hay promo.
PLANES = {
    "vigia": {
        "etiqueta": "Vigía",
        "resumen": "Para seguir el río y enterarte a tiempo.",
        "secciones": SECCIONES_BASE,
        "max_activos": 0,
        "max_rutas": 0,
        "precio_usd": 15,
        "precio_lista_usd": 20,
        "nota_precio": "Precio early bird",
    },
    "timonel": {
        "etiqueta": "Timonel",
        "resumen": "Todo el sistema, para operar con el río de verdad.",
        "secciones": SECCIONES_BASE + ("flota", "rutas"),
        "max_activos": 20,
        "max_rutas": 5,
        "precio_usd": 75,
        "precio_lista_usd": 95,
        "nota_precio": "Precio early bird",
    },
    "capitan": {
        "etiqueta": "Capitán",
        "resumen": "Para flotas grandes y terminales con sistemas propios.",
        "secciones": SECCIONES_BASE + ("flota", "rutas"),
        "max_activos": None,
        "max_rutas": None,
        "precio_usd": None,
        "precio_lista_usd": None,
        "nota_precio": "Lo armamos con vos",
    },
}

# El plan de una cuenta que no eligio ninguno. Es el mas acotado a proposito:
# las cuentas que se crean sin pasar por el selector (el CLI, o "Continuar con
# Google" desde la pantalla de login) no deberian recibir de arriba la
# plan mas amplio. Las cuentas que ya existian antes de este sistema son
# otro caso y se migran a "capitan" en db.py, para no sacarles nada que hoy
# tienen.
PLAN_POR_DEFECTO = "vigia"


def plan_valido(plan: Optional[str]) -> str:
    """Normaliza lo que venga de afuera (o de una fila vieja) a un plan real."""
    return plan if plan in PLANES else PLAN_POR_DEFECTO


def limites_de_plan(plan: Optional[str]) -> dict:
    """Los topes y secciones de un plan, listos para mandar al frontend."""
    clave = plan_valido(plan)
    definicion = PLANES[clave]
    return {
        "plan": clave,
        "etiqueta": definicion["etiqueta"],
        "resumen": definicion["resumen"],
        "secciones": list(definicion["secciones"]),
        "max_activos": definicion["max_activos"],
        "max_rutas": definicion["max_rutas"],
        "precio_usd": definicion["precio_usd"],
        "precio_lista_usd": definicion["precio_lista_usd"],
        "nota_precio": definicion["nota_precio"],
    }


def _fila_suscripcion(con, usuario: str) -> Optional[dict]:
    fila = con.execute("SELECT * FROM suscripciones WHERE usuario = %s", (usuario,)).fetchone()
    return dict(fila) if fila else None


def _crear_prueba(con, usuario: str, plan: Optional[str] = None) -> dict:
    """Da de alta la prueba gratis. Arranca desde la fecha de creacion de la
    cuenta (usuarios.creado_en); las cuentas viejas, anteriores a que se
    guardara esa fecha, la tienen en NULL y arrancan la prueba ahora."""
    con.execute(
        """
        INSERT INTO suscripciones (usuario, estado, plan, vigente_hasta)
        SELECT %s, 'prueba', %s, COALESCE(creado_en, now()) + %s
        FROM usuarios WHERE usuario = %s
        ON CONFLICT (usuario) DO NOTHING
        """,
        (usuario, plan_valido(plan), timedelta(days=DIAS_PRUEBA), usuario),
    )
    return _fila_suscripcion(con, usuario)


def iniciar_prueba(usuario: str, plan: Optional[str]) -> dict:
    """Arranca la prueba con el plan que eligio el usuario al registrarse.

    Se llama desde el alta de cuenta. Es el unico momento en que el plan
    entra desde afuera: despues, estado_de_suscripcion() solo lee. El
    ON CONFLICT DO NOTHING de _crear_prueba hace que llamar a esto sobre una
    cuenta que ya tiene suscripcion no le cambie el plan, que es justo lo que
    se quiere si alguien reenvia el registro.
    """
    inicializar_db()
    with conexion() as con:
        return _crear_prueba(con, usuario, plan)


def estado_de_suscripcion(usuario: str) -> dict:
    """Estado actual de la cuenta, creando la prueba gratis la primera vez.

    Se crea aca (perezosamente) y no en el alta de usuario para que tambien
    queden cubiertas las cuentas que ya existian antes de este sistema, sin
    tener que tocar los tres caminos por los que se puede crear una cuenta
    (registro web, Google, CLI).
    """
    inicializar_db()
    with conexion() as con:
        suscripcion = _fila_suscripcion(con, usuario) or _crear_prueba(con, usuario)

        if suscripcion is None:  # el usuario no existe
            return {
                "estado": "sin_cuenta", "tiene_acceso": False, "vigente_hasta": None,
                "dias_restantes": None, **limites_de_plan(None),
            }

        vigente_hasta = suscripcion["vigente_hasta"]
        vencida = vigente_hasta is not None and vigente_hasta <= datetime.now(timezone.utc)

        # El estado guardado dice que plan tiene; este dice si hoy puede usar
        # la app (una prueba vencida sigue con estado 'prueba' en la base,
        # pero ya no da acceso).
        tiene_acceso = suscripcion["estado"] in ESTADOS_CON_ACCESO and not vencida

        dias_restantes = None
        if vigente_hasta is not None:
            restantes = (vigente_hasta - datetime.now(timezone.utc)).days
            dias_restantes = max(restantes, 0)

        return {
            "estado": suscripcion["estado"],
            "vencida": vencida,
            "tiene_acceso": tiene_acceso,
            "vigente_hasta": vigente_hasta.isoformat() if vigente_hasta else None,
            "dias_restantes": dias_restantes,
            # El plan y sus topes viajan junto al estado para que el frontend
            # pinte la interfaz de una sola consulta. Es solo para mostrar: el
            # que decide de verdad es el backend, en cada endpoint.
            **limites_de_plan(suscripcion["plan"]),
        }


def tiene_acceso(usuario: str) -> bool:
    return estado_de_suscripcion(usuario)["tiene_acceso"]


def cambiar_plan(usuario: str, plan: str) -> dict:
    """Cambia el plan de una cuenta que ya existe.

    No toca `estado` ni `vigente_hasta`: cambiar de plan en el medio de la
    prueba gratis no la reinicia ni la acorta. Cuando se sume el cobro real,
    esta funcion es la que va a tener que consultarle al proveedor antes de
    aplicar el cambio.

    Si el plan nuevo es mas chico que lo que el usuario ya cargo, no se borra
    nada: los activos y las rutas de mas siguen estando, se pueden ver y
    borrar, y lo unico que no se puede es agregar mas (el tope lo aplica
    _exigir_cupo al crear). Borrarlos solo porque bajo de plan seria destruir
    datos del usuario sin que los pida.
    """
    if plan not in PLANES:
        raise ValueError(f"Plan desconocido: {plan!r}.")

    inicializar_db()
    with conexion() as con:
        # Una cuenta que nunca consulto su suscripcion todavia no tiene fila:
        # se crea antes de actualizar, si no el UPDATE no afectaria nada.
        _crear_prueba(con, usuario)
        con.execute(
            "UPDATE suscripciones SET plan = %s, actualizado_en = now() WHERE usuario = %s",
            (plan, usuario),
        )
    return estado_de_suscripcion(usuario)


def plan_de(usuario: str) -> str:
    """El plan vigente de la cuenta, normalizado."""
    inicializar_db()
    with conexion() as con:
        suscripcion = _fila_suscripcion(con, usuario)
    return plan_valido(suscripcion["plan"] if suscripcion else None)


def habilita_seccion(plan: str, seccion: str) -> bool:
    return seccion in PLANES[plan_valido(plan)]["secciones"]


def tope_alcanzado(plan: str, recurso: str, cantidad_actual: int) -> bool:
    """Si crear uno mas pasaria el tope del plan. `recurso` es "activos" o
    "rutas". Un tope en None es sin limite; en 0, el plan directamente no
    habilita ese recurso."""
    tope = PLANES[plan_valido(plan)][f"max_{recurso}"]
    return tope is not None and cantidad_actual >= tope
