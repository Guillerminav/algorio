"""Crea una cuenta de usuario nueva para poder iniciar sesion en Algorio.

Se corre a mano, una vez por persona (no hay pantalla de "registrarse" en el
frontend a proposito, para no dejar el alta de usuarios abierta a cualquiera).

Uso (desde algorio/, con el entorno virtual activado):
    python -m backend.crear_usuario
"""
import getpass

import psycopg

from backend.auth import crear_usuario


def main() -> None:
    usuario = input("Usuario (para iniciar sesion): ").strip()
    nombre_completo = input("Nombre completo: ").strip()
    password = getpass.getpass("Contraseña: ")
    confirmacion = getpass.getpass("Repetir contraseña: ")

    if not usuario or not password:
        print("Usuario y contraseña son obligatorios.")
        return
    if password != confirmacion:
        print("Las contraseñas no coinciden.")
        return

    try:
        crear_usuario(usuario, password, nombre_completo or usuario)
    except psycopg.errors.UniqueViolation:
        print(f"Ya existe un usuario '{usuario}'.")
        return

    print(f"Usuario '{usuario}' creado correctamente.")


if __name__ == "__main__":
    main()
