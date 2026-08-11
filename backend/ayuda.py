"""Mensajes del formulario de "Ayuda" del sidebar: se guardan en la base y se
mandan por mail.

El envio usa Resend (https://resend.com) via su API HTTP, con la API key en
la env var RESEND_API_KEY. El mensaje se guarda en mensajes_ayuda en
cualquier caso (con el error si hubo): si falta la key o el servicio falla,
no se pierde lo que escribio el usuario.
"""
import os

import httpx

from db import conexion, inicializar_db

# A donde llegan los mensajes del boton "Ayuda" (soporte). Sale del entorno
# para no tener que tocar codigo el dia que cambie la casilla: hasta ahora
# estaba fija aca, y justamente por eso no coincidia con el mail de la cuenta
# de AlgoRio, que es a donde van las alertas de "Mi flota".
DESTINATARIO = os.environ.get("MAIL_SOPORTE", "guillermina2000b@gmail.com")

# Sin un dominio propio verificado, Resend solo permite mandar desde su
# dominio de prueba (onboarding@resend.dev) y unicamente al mail de la cuenta
# que creo la API key - que es justo el caso de uso aca. Si mas adelante se
# verifica un dominio propio, se cambia con la env var MAIL_REMITENTE.
REMITENTE = os.environ.get("MAIL_REMITENTE", "AlgoRio <onboarding@resend.dev>")

URL_API_RESEND = "https://api.resend.com/emails"


def _enviar_mail(usuario: str, mensaje: str) -> None:
    """Manda el mensaje por Resend. Lanza excepcion si no se pudo enviar."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("Falta configurar RESEND_API_KEY en el servidor.")

    respuesta = httpx.post(
        URL_API_RESEND,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": REMITENTE,
            "to": [DESTINATARIO],
            "subject": f"AlgoRío - mensaje de ayuda de {usuario}",
            "text": f"Usuario: {usuario}\n\n{mensaje}",
        },
        timeout=15,
    )
    respuesta.raise_for_status()


def registrar_mensaje_ayuda(usuario: str, mensaje: str) -> dict:
    """Guarda el mensaje e intenta mandarlo por mail. Devuelve si el mail
    salio o no, para poder avisarle al usuario con precision (el mensaje
    queda registrado en cualquier caso)."""
    mensaje = (mensaje or "").strip()
    if not mensaje:
        raise ValueError("El mensaje no puede estar vacio.")

    enviado = True
    error = None
    try:
        _enviar_mail(usuario, mensaje)
    except Exception as e:  # httpx.HTTPError, RuntimeError, etc.
        enviado = False
        error = str(e)

    inicializar_db()
    with conexion() as con:
        con.execute(
            "INSERT INTO mensajes_ayuda (usuario, mensaje, enviado_por_mail, error_envio) "
            "VALUES (%s, %s, %s, %s)",
            (usuario, mensaje, enviado, error),
        )

    return {"enviado_por_mail": enviado, "error_envio": error}
