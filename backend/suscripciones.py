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


def _fila_suscripcion(con, usuario: str) -> Optional[dict]:
    fila = con.execute("SELECT * FROM suscripciones WHERE usuario = %s", (usuario,)).fetchone()
    return dict(fila) if fila else None


def _crear_prueba(con, usuario: str) -> dict:
    """Da de alta la prueba gratis. Arranca desde la fecha de creacion de la
    cuenta (usuarios.creado_en); las cuentas viejas, anteriores a que se
    guardara esa fecha, la tienen en NULL y arrancan la prueba ahora."""
    con.execute(
        """
        INSERT INTO suscripciones (usuario, estado, vigente_hasta)
        SELECT %s, 'prueba', COALESCE(creado_en, now()) + %s
        FROM usuarios WHERE usuario = %s
        ON CONFLICT (usuario) DO NOTHING
        """,
        (usuario, timedelta(days=DIAS_PRUEBA), usuario),
    )
    return _fila_suscripcion(con, usuario)


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
            return {"estado": "sin_cuenta", "tiene_acceso": False, "vigente_hasta": None, "dias_restantes": None}

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
        }


def tiene_acceso(usuario: str) -> bool:
    return estado_de_suscripcion(usuario)["tiene_acceso"]
