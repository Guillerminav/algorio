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


def _hashear_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), ITERACIONES_PBKDF2
    ).hex()


def crear_usuario(usuario: str, password: str, nombre_completo: str, email: Optional[str] = None) -> None:
    """Crea un usuario nuevo. Lanza psycopg.errors.UniqueViolation si el usuario
    o el email ya existen."""
    inicializar_db()
    salt = secrets.token_hex(16)
    password_hash = _hashear_password(password, salt)
    with conexion() as con:
        con.execute(
            "INSERT INTO usuarios (usuario, nombre_completo, salt, password_hash, email) VALUES (%s, %s, %s, %s, %s)",
            (usuario, nombre_completo, salt, password_hash, email),
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


def crear_usuario_google(email: str, nombre_completo: str) -> dict:
    """Da de alta (o, si ya existe por email, no deberia llamarse) una cuenta
    sin contraseña local: solo se puede ingresar con "Continuar con Google"."""
    inicializar_db()
    with conexion() as con:
        usuario = _generar_username_unico(con, email.split("@")[0])
        con.execute(
            "INSERT INTO usuarios (usuario, nombre_completo, salt, password_hash, email) VALUES (%s, %s, NULL, NULL, %s)",
            (usuario, nombre_completo, email),
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
            "SELECT usuario, nombre_completo, email, unidad_nivel, unidad_caudal, creado_en "
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
) -> dict:
    """Actualiza nombre, contraseña y/o preferencias de unidades. Para cambiar
    la contraseña hay que mandar password_actual correcta. Devuelve el perfil
    ya actualizado."""
    if unidad_nivel is not None and unidad_nivel not in UNIDADES_NIVEL_VALIDAS:
        raise ValueError(f"unidad_nivel debe ser una de {UNIDADES_NIVEL_VALIDAS}.")
    if unidad_caudal is not None and unidad_caudal not in UNIDADES_CAUDAL_VALIDAS:
        raise ValueError(f"unidad_caudal debe ser una de {UNIDADES_CAUDAL_VALIDAS}.")

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

    return obtener_usuario(usuario)
