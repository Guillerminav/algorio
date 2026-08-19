"""Autenticacion basica: usuarios en Postgres y contraseñas con hash PBKDF2.

Las sesiones en si (cookie firmada) las maneja SessionMiddleware en
backend/main.py; este modulo solo se encarga de validar credenciales y
guardar/actualizar el perfil (incluidas las preferencias de unidades) de
cada usuario.
"""
import hashlib
import secrets
from typing import Optional

from db import conexion, inicializar_db

ITERACIONES_PBKDF2 = 200_000

UNIDADES_NIVEL_VALIDAS = {"m", "ft"}
UNIDADES_CAUDAL_VALIDAS = {"m3s", "ft3s"}

# Los tres perfiles del producto. El mismo backend y la misma base, tres
# experiencias distintas: 'recreativo' es el nauta (app movil, gratis),
# 'comercio' el parador/alojamiento/lancha-taxi (panel web), 'naviera' el
# dashboard de datos hidrologicos de siempre.
ROLES_VALIDOS = {"recreativo", "comercio", "naviera"}

# El rol de una cuenta que no eligio ninguno. Es 'naviera' porque es lo que
# era toda cuenta antes de que el producto se bifurcara: un cliente viejo que
# no manda el campo tiene que seguir entrando donde entraba.
ROL_POR_DEFECTO = "naviera"

# Con que sale al rio el usuario recreativo. La lista vive en el backend
# (y no solo en la app) para que el calculo de "¿esta picado?" pueda
# apoyarse en ella; ver backend/clima.py.
TIPOS_EMBARCACION_VALIDOS = {
    "kayak", "canoa", "sup", "lancha", "semirrigido", "velero", "moto_agua", "otro",
}


def rol_valido(rol: Optional[str]) -> str:
    """Normaliza lo que venga de afuera a un rol real."""
    return rol if rol in ROLES_VALIDOS else ROL_POR_DEFECTO


def tipo_embarcacion_valido(tipo: Optional[str]) -> Optional[str]:
    """A diferencia del rol, aca None es un valor legitimo (todavia no eligio)
    y por eso no hay default: solo se descarta lo que no esta en la lista."""
    return tipo if tipo in TIPOS_EMBARCACION_VALIDOS else None


def _hashear_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), ITERACIONES_PBKDF2
    ).hex()


def crear_usuario(
    usuario: str,
    password: str,
    nombre_completo: str,
    email: Optional[str] = None,
    rol: Optional[str] = None,
    tipo_embarcacion: Optional[str] = None,
) -> None:
    """Crea un usuario nuevo. Lanza psycopg.errors.UniqueViolation si el usuario
    o el email ya existen."""
    inicializar_db()
    salt = secrets.token_hex(16)
    password_hash = _hashear_password(password, salt)
    with conexion() as con:
        con.execute(
            "INSERT INTO usuarios (usuario, nombre_completo, salt, password_hash, email, rol, tipo_embarcacion) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                usuario, nombre_completo, salt, password_hash, email,
                rol_valido(rol), tipo_embarcacion_valido(tipo_embarcacion),
            ),
        )


def _generar_username_unico(con, base: str) -> str:
    """A partir del local-part de un email ('juan' de 'juan@gmail.com'),
    prueba 'juan', 'juan2', 'juan3'... hasta encontrar uno libre. Se usa para
    dar de alta cuentas creadas con "Continuar con Google", que no traen un
    nombre de usuario elegido a mano."""
    base = base or "usuario"
    candidato = base
    sufijo = 1
    while con.execute("SELECT 1 FROM usuarios WHERE usuario = %s", (candidato,)).fetchone():
        sufijo += 1
        candidato = f"{base}{sufijo}"
    return candidato


def crear_usuario_google(email: str, nombre_completo: str, rol: Optional[str] = None) -> dict:
    """Da de alta (o, si ya existe por email, no deberia llamarse) una cuenta
    sin contraseña local: solo se puede ingresar con "Continuar con Google"."""
    inicializar_db()
    with conexion() as con:
        usuario = _generar_username_unico(con, email.split("@")[0])
        con.execute(
            "INSERT INTO usuarios (usuario, nombre_completo, salt, password_hash, email, rol) "
            "VALUES (%s, %s, NULL, NULL, %s, %s)",
            (usuario, nombre_completo, email, rol_valido(rol)),
        )
    return obtener_usuario(usuario)


def verificar_credenciales(usuario: str, password: str) -> Optional[dict]:
    """Devuelve el perfil publico si la contraseña es correcta, sino None."""
    inicializar_db()
    with conexion() as con:
        fila = con.execute("SELECT * FROM usuarios WHERE usuario = %s", (usuario,)).fetchone()
    if fila is None:
        return None
    if fila["password_hash"] is None:
        # Cuenta creada con "Continuar con Google": no tiene contraseña local.
        return None
    if _hashear_password(password, fila["salt"]) != fila["password_hash"]:
        return None
    return obtener_usuario(usuario)


def obtener_usuario(usuario: str) -> Optional[dict]:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT usuario, nombre_completo, email, unidad_nivel, unidad_caudal, creado_en, "
            "rol, tipo_embarcacion, es_admin "
            "FROM usuarios WHERE usuario = %s",
            (usuario,),
        ).fetchone()
    return dict(fila) if fila else None


def obtener_usuario_por_email(email: str) -> Optional[dict]:
    inicializar_db()
    with conexion() as con:
        fila = con.execute("SELECT usuario FROM usuarios WHERE email = %s", (email,)).fetchone()
    return obtener_usuario(fila["usuario"]) if fila else None


def actualizar_perfil(
    usuario: str,
    nombre_completo: Optional[str] = None,
    password_actual: Optional[str] = None,
    password_nueva: Optional[str] = None,
    unidad_nivel: Optional[str] = None,
    unidad_caudal: Optional[str] = None,
    tipo_embarcacion: Optional[str] = None,
) -> dict:
    """Actualiza nombre, contraseña y/o preferencias de unidades. Para cambiar
    la contraseña hay que mandar password_actual correcta. Devuelve el perfil
    ya actualizado."""
    if unidad_nivel is not None and unidad_nivel not in UNIDADES_NIVEL_VALIDAS:
        raise ValueError(f"unidad_nivel debe ser una de {UNIDADES_NIVEL_VALIDAS}.")
    if unidad_caudal is not None and unidad_caudal not in UNIDADES_CAUDAL_VALIDAS:
        raise ValueError(f"unidad_caudal debe ser una de {UNIDADES_CAUDAL_VALIDAS}.")
    # Este si se valida contra la lista y se rechaza: es un valor que la app
    # manda desde una grilla cerrada, no algo que el usuario escriba. Si llega
    # otra cosa, es un bug del cliente y conviene que se note.
    if tipo_embarcacion is not None and tipo_embarcacion not in TIPOS_EMBARCACION_VALIDOS:
        raise ValueError(f"tipo_embarcacion debe ser uno de {TIPOS_EMBARCACION_VALIDOS}.")

    inicializar_db()
    with conexion() as con:
        fila = con.execute("SELECT * FROM usuarios WHERE usuario = %s", (usuario,)).fetchone()
        if fila is None:
            raise ValueError("El usuario no existe.")

        if password_nueva:
            if fila["salt"] is None:
                raise ValueError("Esta cuenta se creo con Google, no tiene contraseña local para cambiar.")
            if not password_actual or _hashear_password(password_actual, fila["salt"]) != fila["password_hash"]:
                raise ValueError("La contraseña actual no es correcta.")
            nuevo_salt = secrets.token_hex(16)
            nuevo_hash = _hashear_password(password_nueva, nuevo_salt)
            con.execute(
                "UPDATE usuarios SET salt = %s, password_hash = %s WHERE usuario = %s",
                (nuevo_salt, nuevo_hash, usuario),
            )

        if nombre_completo:
            con.execute(
                "UPDATE usuarios SET nombre_completo = %s WHERE usuario = %s",
                (nombre_completo, usuario),
            )

        if unidad_nivel:
            con.execute("UPDATE usuarios SET unidad_nivel = %s WHERE usuario = %s", (unidad_nivel, usuario))

        if unidad_caudal:
            con.execute("UPDATE usuarios SET unidad_caudal = %s WHERE usuario = %s", (unidad_caudal, usuario))

        if tipo_embarcacion:
            con.execute(
                "UPDATE usuarios SET tipo_embarcacion = %s WHERE usuario = %s",
                (tipo_embarcacion, usuario),
            )

    return obtener_usuario(usuario)
