"""«Olvidé mi contraseña»: un mail con un link que la deja cambiar una vez.

El flujo tiene dos pasos y cada uno es un endpoint:

1. `pedir(email)` — genera un token, guarda su hash y manda el mail.
2. `restablecer(token, password)` — valida el token y escribe la contraseña.

Las decisiones que no se ven en el código de arriba:

**Nunca dice si ese mail existe.** `pedir` no lanza ni devuelve nada distinto
cuando la cuenta no está: el endpoint contesta lo mismo siempre. Un formulario
que contesta "no encontramos esa dirección" es un verificador de casillas —
alguien con una lista de mails filtrada de otro lado descubre cuáles tienen
cuenta acá, y esa lista vale para el phishing que viene después.

**Se guarda el hash del token, no el token.** Esta tabla es la llave de toda
cuenta que haya pedido recuperarla. Con los tokens en claro, leer una fila
alcanza para entrar; con el hash, quien la lea tiene lo mismo que tiene el
servidor al validar, que no sirve para armar el mail.

**Un solo uso y una hora de vida.** El mail queda para siempre en la casilla:
sin `usado_en` seguiría abriendo la cuenta meses después, y en una casilla
compartida —o en un teléfono que se presta— eso es una puerta abierta. Al
usarlo se borran además los otros pedidos de esa cuenta: si alguien pidió tres
mails, el que valga tiene que ser uno.

**Una cuenta de Google también puede pedir contraseña por acá**, y eso le
agrega una forma de entrar que antes no tenía. Es una decisión de producto y
tiene un costo que conviene tener escrito: quien tenga acceso a la casilla
puede ponerle una contraseña local a una cuenta que su dueño había elegido que
abriera solo con Google. Se aceptó porque el mail ya era el factor de
recuperación de la cuenta de Google también — quien controla la casilla puede
recuperar la cuenta de Google y entrar igual—, así que no abre una puerta que
estuviera cerrada, la abre más rápido.

Lo que compensa: el mail de esa cuenta dice otra cosa. No habla de "cambiar" tu
contraseña sino de crear una que no tenías, y el renglón final le avisa a quien
no pidió nada que alguien está intentando abrirle una segunda puerta. Poner
contraseña no saca el botón de Google: la cuenta pasa a entrar de las dos
formas.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from backend import auth, correo
from db import conexion, inicializar_db

# Cuánto vive el link. Una hora es lo que tarda alguien en ir a buscar el mail
# al teléfono y volver; más que eso es dejar abierta una puerta que ya nadie
# está mirando.
DURACION_MINUTOS = 60

# Entre dos pedidos de la misma cuenta. No es tanto contra un ataque —el token
# es irrepetible— como contra la casilla del usuario: sin esto, tocar el botón
# cinco veces le deja cinco mails y ninguna pista de cuál sirve.
ESPERA_ENTRE_PEDIDOS_SEGUNDOS = 60

LARGO_MINIMO_PASSWORD = 8

# A dónde apunta el link del mail. Son dos webs sobre el mismo backend (ver
# frontend/src/producto.js) y el rol de la cuenta decide cuál: mandar a un
# naviera a app.algorio lo deja en una pantalla que le dice que su cuenta es
# del otro producto, justo cuando no puede entrar a ninguno.
URL_APP = os.environ.get("URL_APP", "https://app.algorio.com.ar")
URL_PRO = os.environ.get("URL_PRO", "https://pro.algorio.com.ar")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _hashear(token: str) -> str:
    """SHA-256 pelado y no PBKDF2 como las contraseñas.

    La diferencia es la entropía de lo que se hashea: una contraseña la elige
    una persona y hay que encarecer cada intento porque el diccionario es
    chico. Esto son 256 bits de `secrets`, y no existe diccionario — estirar el
    hash solo agregaría trabajo al servidor en cada validación.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _url_para(rol: str) -> str:
    return URL_PRO if rol == "naviera" else URL_APP


def pedir(email: str) -> None:
    """Manda el mail de recuperación. No devuelve nada y no lanza nunca.

    El silencio es la interfaz: el endpoint contesta lo mismo exista o no la
    cuenta, así que cualquier cosa que este módulo quisiera avisar terminaría
    siendo justo el dato que no hay que dar.
    """
    email = (email or "").strip().lower()
    if not email:
        return

    inicializar_db()
    with conexion() as con:
        # El email se guarda tal como lo escribieron al registrarse, así que la
        # comparación va en minúsculas de los dos lados: nadie se acuerda de si
        # puso mayúscula en su propio mail.
        cuenta = con.execute(
            "SELECT usuario, nombre_completo, email, rol, password_hash "
            "FROM usuarios WHERE lower(email) = %s",
            (email,),
        ).fetchone()
        if cuenta is None:
            return

        ultimo = con.execute(
            "SELECT creado_en FROM recuperaciones_password "
            "WHERE usuario = %s ORDER BY creado_en DESC LIMIT 1",
            (cuenta["usuario"],),
        ).fetchone()
        if ultimo and (_ahora() - ultimo["creado_en"]).total_seconds() < ESPERA_ENTRE_PEDIDOS_SEGUNDOS:
            return

        token = secrets.token_urlsafe(32)
        fila = con.execute(
            "INSERT INTO recuperaciones_password (usuario, token_hash, vence_en) "
            "VALUES (%s, %s, %s) RETURNING id",
            (cuenta["usuario"], _hashear(token), _ahora() + timedelta(minutes=DURACION_MINUTOS)),
        ).fetchone()

    # Fuera de la transacción: el token ya está guardado, y que el mail no
    # salga no puede dejar la fila a medio escribir.
    error = _mandar(dict(cuenta), token)

    # Lo que contestó Resend queda en la fila. El endpoint contesta lo mismo
    # salga o no el mail —eso es a propósito, para no delatar qué direcciones
    # tienen cuenta—, así que sin esto no habría absolutamente ninguna forma de
    # enterarse de que los mails se están rechazando.
    if error:
        with conexion() as con:
            con.execute(
                "UPDATE recuperaciones_password SET error_envio = %s WHERE id = %s",
                (error[:500], fila["id"]),
            )


def _mandar(cuenta: dict, token: str) -> "str | None":
    """El mail con el link.

    Dice otra cosa si la cuenta todavía no tiene contraseña: para esa persona
    esto no es "cambiar" nada, es estrenar una forma de entrar que hasta ahora
    no tenía. Y sobre todo cambia el renglón final, que es el que de verdad
    protege: quien no pidió nada tiene que entender, leyendo por arriba, que
    alguien está intentando abrirle una segunda puerta a su cuenta.
    """
    enlace = f"{_url_para(cuenta['rol'])}/?restablecer={token}"
    primera_vez = cuenta.get("password_hash") is None
    nombre = cuenta["nombre_completo"] or cuenta["usuario"]

    if primera_vez:
        asunto = "AlgoRío - crear tu contraseña"
        motivo = (
            f"Pediste una contraseña para tu cuenta de AlgoRío ({cuenta['usuario']}). "
            "Hasta ahora entrabas con «Continuar con Google» y no tenías ninguna. "
            "Entrá acá y elegí una:"
        )
        aclaracion = (
            "Poner una contraseña no te saca el botón de Google: vas a poder entrar "
            "de las dos formas.\n\n"
        )
        cierre = (
            "Si no pediste nada, ignorá este mail y no hagas clic: tu cuenta sigue "
            "entrando solo con Google, como hasta ahora."
        )
    else:
        asunto = "AlgoRío - cambiar tu contraseña"
        motivo = (
            "Pediste cambiar la contraseña de tu cuenta de AlgoRío "
            f"({cuenta['usuario']}). Entrá acá y elegí una nueva:"
        )
        aclaracion = ""
        cierre = (
            "Si no pediste nada, no hace falta que hagas nada: tu contraseña sigue "
            "siendo la de siempre."
        )

    return correo.enviar(
        asunto=asunto,
        destinatario=cuenta["email"],
        texto=(
            f"Hola {nombre},\n\n"
            f"{motivo}\n\n"
            f"{enlace}\n\n"
            f"El link vale por {DURACION_MINUTOS} minutos y se puede usar una sola vez.\n\n"
            "Si estás en la app del celular, abrí «Olvidé mi contraseña» y pegá "
            f"este código:\n\n{token}\n\n"
            f"{aclaracion}"
            f"{cierre}\n"
        ),
    )


def restablecer(token: str, password_nueva: str) -> str:
    """Escribe la contraseña nueva. Devuelve el usuario, o lanza ValueError.

    Acá sí se habla claro: quien llega con un token es alguien que abrió el
    mail, y decirle "el link venció" es la diferencia entre pedir otro y creer
    que la app está rota. Lo que no se distingue es *por qué* no sirve —vencido,
    usado o inventado son el mismo mensaje—, porque esa diferencia solo le
    serviría a quien esté probando tokens.
    """
    if len(password_nueva or "") < LARGO_MINIMO_PASSWORD:
        raise ValueError(
            f"La contraseña debe tener al menos {LARGO_MINIMO_PASSWORD} caracteres."
        )

    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT id, usuario FROM recuperaciones_password "
            "WHERE token_hash = %s AND usado_en IS NULL AND vence_en > now()",
            (_hashear(token or ""),),
        ).fetchone()
        if fila is None:
            raise ValueError(
                "Ese link no sirve más. Puede haber vencido o ya haberse usado: "
                "pedí uno nuevo desde «Olvidé mi contraseña»."
            )

        # El UPDATE va acá y no en auth para que entre en la MISMA transacción
        # que marca el token como usado: sueltos, fallar entre medio dejaría la
        # contraseña cambiada y el token todavía vivo.
        salt, password_hash = auth.credencial_nueva(password_nueva)
        con.execute(
            "UPDATE usuarios SET salt = %s, password_hash = %s WHERE usuario = %s",
            (salt, password_hash, fila["usuario"]),
        )
        con.execute(
            "UPDATE recuperaciones_password SET usado_en = now() WHERE id = %s", (fila["id"],)
        )
        # Los otros pedidos de esa cuenta dejan de valer. Si alguien tocó el
        # botón tres veces, los dos mails viejos no pueden seguir abriendo la
        # puerta después de que la contraseña ya cambió.
        con.execute(
            "DELETE FROM recuperaciones_password WHERE usuario = %s AND usado_en IS NULL",
            (fila["usuario"],),
        )

    return fila["usuario"]


def limpiar_vencidos() -> int:
    """Borra los pedidos que ya no sirven. Devuelve cuántos borró.

    No hay cron que lo llame: lo corre `restablecer` para la cuenta que toca, y
    esto está para el mantenimiento de a ratos. La tabla crece con los pedidos
    que nadie llegó a usar, que son pocos y chicos, así que no vale un job.
    """
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "DELETE FROM recuperaciones_password "
            "WHERE vence_en < now() OR usado_en IS NOT NULL RETURNING id"
        ).fetchall()
    return len(filas)
