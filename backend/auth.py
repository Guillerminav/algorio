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


def crear_usuario(usuario: str, password: str, nombre_completo: str) -> None:
    """Crea un usuario nuevo. Lanza psycopg.errors.UniqueViolation si el usuario ya existe."""
    inicializar_db()
    salt = secrets.token_hex(16)
    password_hash = _hashear_password(password, salt)
    with conexion() as con:
        con.execute(
            "INSERT INTO usuarios (usuario, nombre_completo, salt, password_hash) VALUES (%s, %s, %s, %s)",
            (usuario, nombre_completo, salt, password_hash),
        )


def verificar_credenciales(usuario: str, password: str) -> Optional[dict]:
    """Devuelve el perfil publico si la contraseña es correcta, sino None."""
    inicializar_db()
    with conexion() as con:
        fila = con.execute("SELECT * FROM usuarios WHERE usuario = %s", (usuario,)).fetchone()
    if fila is None:
        return None
    if _hashear_password(password, fila["salt"]) != fila["password_hash"]:
        return None
    return obtener_usuario(usuario)


def obtener_usuario(usuario: str) -> Optional[dict]:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT usuario, nombre_completo, unidad_nivel, unidad_caudal FROM usuarios WHERE usuario = %s",
            (usuario,),
        ).fetchone()
    return dict(fila) if fila else None


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
