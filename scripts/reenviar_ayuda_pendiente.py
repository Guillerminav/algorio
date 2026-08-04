"""Reenvia los mensajes de Ayuda que quedaron guardados sin poder mandarse
por mail (RESEND_API_KEY sin configurar, caida del servicio, etc).

backend/ayuda.py guarda todo mensaje en la base aunque el envio falle, para
no perder lo que escribio el usuario; esto es la contraparte: una vez
resuelto el problema, vacia esa cola.

Uso (desde algorio/, con el entorno virtual activado, DATABASE_URL y
RESEND_API_KEY seteadas):
    python -m scripts.reenviar_ayuda_pendiente
"""
from backend.ayuda import _enviar_mail
from db import conexion, inicializar_db


def main() -> None:
    inicializar_db()
    with conexion() as con:
        pendientes = con.execute(
            "SELECT id, usuario, mensaje FROM mensajes_ayuda "
            "WHERE enviado_por_mail = FALSE ORDER BY creado_en"
        ).fetchall()

        if not pendientes:
            print("No hay mensajes pendientes de envio.")
            return

        print(f"{len(pendientes)} mensajes pendientes.")
        enviados = 0
        for fila in pendientes:
            try:
                _enviar_mail(fila["usuario"], fila["mensaje"])
            except Exception as e:
                # Si falla el primero por configuracion, van a fallar todos:
                # se corta para no golpear la API en vano.
                print(f"  #{fila['id']} sigue fallando: {e}")
                break

            con.execute(
                "UPDATE mensajes_ayuda SET enviado_por_mail = TRUE, error_envio = NULL WHERE id = %s",
                (fila["id"],),
            )
            enviados += 1
            print(f"  #{fila['id']} enviado ({fila['usuario']}).")

        print(f"{enviados} de {len(pendientes)} enviados.")


if __name__ == "__main__":
    main()
