"""Mandar un mail suelto por Resend, sin plantilla ni base de datos.

Existe porque el envio ya estaba escrito dos veces —backend/ayuda.py para los
mensajes de soporte y backend/notificaciones.py para las alertas de la flota— y
esta iba a ser la tercera. Lo que se repite es siempre lo mismo: la API key del
entorno, el remitente, el POST a Resend. Lo que no se repite —que cuerpo tiene
el mail, si se guarda en la base, si se reintenta— se queda en cada modulo.

No se reescribieron los dos que ya existian: el de las alertas arma un HTML con
logo adjunto y el de ayuda guarda el mensaje pase lo que pase, y meterlos aca
sin necesidad era tocar dos caminos que andan.

Nunca lanza: los avisos son avisos. Que el mail no salga no puede voltear la
operacion que lo disparo — si el reclamo se guardo, el reclamo esta hecho,
aunque el admin se entere entrando al panel en vez de por la casilla.

Pero no lanzar no es callarse: cada fallo se imprime con el destinatario y el
motivo. La primera version devolvia el error y confiaba en que quien llamara lo
mirara, y ninguno de los dos lo miraba — asi que un mail que Resend rechazaba
se veia exactamente igual que uno entregado, del lado del servidor y del lado
del usuario. Un canal de avisos que falla en silencio es peor que no tenerlo:
al menos sin el nadie espera el mail.
"""
import os
from typing import Optional

import dns.exception
import dns.resolver
import httpx

# Igual que en ayuda.py: sale del entorno para no tener que tocar codigo el dia
# que cambie la casilla.
DESTINATARIO_POR_DEFECTO = os.environ.get("MAIL_SOPORTE", "guillermina2000b@gmail.com")

# Sin un dominio propio verificado, Resend solo deja mandar desde su dominio de
# prueba y unicamente al mail de la cuenta que creo la API key.
REMITENTE = os.environ.get("MAIL_REMITENTE", "AlgoRio <onboarding@resend.dev>")

URL_API_RESEND = "https://api.resend.com/emails"


def enviar(asunto: str, texto: str, destinatario: Optional[str] = None) -> Optional[str]:
    """Manda el mail. Devuelve None si salio, o el error como texto si no.

    Ademas de devolverlo, lo imprime: quien llama puede guardarlo si tiene
    donde, pero el aviso en el log no depende de que se acuerde de mirarlo.
    """
    para = destinatario or DESTINATARIO_POR_DEFECTO
    error = _intentar(asunto, texto, para)
    if error:
        # El cuerpo de la respuesta de Resend viene en el mensaje de httpx
        # cuando es un 4xx, y ahi esta lo que hace falta para entenderlo: el
        # 403 de "solo podes mandarte a vos mismo" del dominio de prueba se lee
        # distinto del 401 de una clave vencida.
        print(f"AVISO: no salio el mail a {para} ({asunto}): {error}")
    return error


def _intentar(asunto: str, texto: str, para: str) -> Optional[str]:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        return "Falta configurar RESEND_API_KEY en el servidor."

    try:
        respuesta = httpx.post(
            URL_API_RESEND,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": REMITENTE,
                "to": [para],
                "subject": asunto,
                "text": texto,
            },
            timeout=15,
        )
        if respuesta.status_code >= 400:
            # El texto de la respuesta y no solo el codigo: Resend explica ahi
            # por que rechazo, y sin eso un 403 es indistinguible de otro.
            return f"{respuesta.status_code} — {respuesta.text[:300]}"
    except Exception as e:  # httpx.HTTPError y cualquier cosa de la red
        return str(e)
    return None


# Cuanto se espera al DNS antes de dejar pasar. Corto a proposito: esto corre
# adentro del alta, y hacer esperar diez segundos a alguien que se esta
# registrando con un mail perfecto es peor que dejar entrar un dominio malo.
TIMEOUT_DNS_SEGUNDOS = 4


def dominio_acepta_mail(email: str) -> bool:
    """Si el dominio de esa direccion puede recibir correo. Pregunta al DNS.

    Es lo que separa "el mail esta bien escrito" de "el mail existe". Pydantic
    valida la forma —que haya una arroba y un dominio con puntos— y con eso
    `guillerminabousono@gmail.com.ar` pasa perfecto: es una direccion valida de
    un dominio que no recibe correo. La cuenta queda creada, el mail de
    recuperacion sale, y no llega a ningun lado. Eso ya paso.

    Lo que NO puede hacer: saber si la casilla existe. `alguien@gmail.com`
    tiene MX aunque no exista ninguna casilla con ese nombre, y `gmial.com`
    —el typo clasico— es un dominio registrado de verdad, con MX. Para eso hace
    falta mandar un mail con un link y esperar el clic; esto ataja el error
    mas comun y mas barato de atajar.

    **Ante la duda deja pasar.** El DNS se cae, tarda, o lo bloquea la red del
    servidor: ninguna de esas es razon para rechazarle el alta a alguien. Solo
    dice que no cuando el DNS contesta y contesta que no.
    """
    dominio = (email or "").rsplit("@", 1)[-1].strip().rstrip(".").lower()
    if not dominio or "." not in dominio:
        return False

    resolvedor = dns.resolver.Resolver()
    resolvedor.timeout = TIMEOUT_DNS_SEGUNDOS
    resolvedor.lifetime = TIMEOUT_DNS_SEGUNDOS

    try:
        respuesta = resolvedor.resolve(dominio, "MX")
    except dns.resolver.NXDOMAIN:
        # El dominio no existe. Es la respuesta mas clara que da el DNS.
        return False
    except dns.resolver.NoAnswer:
        # Existe pero no declara MX. Por RFC 5321 el correo cae al A/AAAA del
        # dominio, asi que todavia puede recibir: hay que preguntarlo.
        return _tiene_direccion(resolvedor, dominio)
    except (dns.exception.Timeout, dns.resolver.NoNameservers, dns.exception.DNSException):
        # No sabemos. Dejar pasar.
        return True

    # "Null MX" (RFC 7505): un MX vacio es la forma explicita que tiene un
    # dominio de decir "yo no recibo correo". Es lo que contesta example.com.
    return any(str(r.exchange).rstrip(".") for r in respuesta)


def _tiene_direccion(resolvedor, dominio: str) -> bool:
    for tipo in ("A", "AAAA"):
        try:
            if resolvedor.resolve(dominio, tipo):
                return True
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            continue
        except (dns.exception.Timeout, dns.resolver.NoNameservers, dns.exception.DNSException):
            return True  # ante la duda, pasa
    return False
