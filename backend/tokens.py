"""Tokens de sesion para la app movil.

La web usa la cookie firmada de SessionMiddleware y le alcanza: el frontend
llama a `/api/...` relativo y Vercel lo reescribe al backend (ver
frontend/vercel.json), asi que para el navegador es el mismo origen. La app
movil no tiene ese reverse proxy — pega directo al dominio de Render — y ahi
la cookie depende del manejo nativo de cookies de cada plataforma, que es
justo lo que no conviene que sostenga la sesion de una app.

Por eso la app manda `Authorization: Bearer <token>`. El token se firma con
itsdangerous, que ya es dependencia del proyecto (SessionMiddleware la usa
para firmar la cookie), asi que esto no agrega ninguna libreria: es el mismo
mecanismo y el mismo secreto, con otro transporte.

No es un JWT y no lleva datos adentro mas que el nombre de usuario: todo lo
demas (rol, plan, acceso) se lee de la base en cada request. Un token viejo
nunca puede afirmar un permiso que la cuenta ya no tiene.
"""
from typing import Optional

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

# Tres meses. Es una app de uso estacional: quien la abre en noviembre y
# vuelve en enero no deberia tener que loguearse de nuevo.
VALIDEZ_SEGUNDOS = 90 * 24 * 60 * 60

SAL = "algorio.token.movil"


def _serializador(secreto: str) -> URLSafeTimedSerializer:
    # La sal separa estos tokens de la cookie de sesion aunque compartan el
    # secreto: una cookie robada no sirve como token ni al reves.
    return URLSafeTimedSerializer(secreto, salt=SAL)


def firmar(usuario: str, secreto: str) -> str:
    return _serializador(secreto).dumps(usuario)


def leer(token: str, secreto: str) -> Optional[str]:
    """Devuelve el nombre de usuario, o None si el token es invalido o vencido.

    No distingue un caso del otro a proposito: para quien llama, los dos
    significan lo mismo (volver a loguearse) y detallarlo solo le daria
    informacion a quien este probando tokens.
    """
    try:
        return _serializador(secreto).loads(token, max_age=VALIDEZ_SEGUNDOS)
    except (BadSignature, SignatureExpired):
        return None
