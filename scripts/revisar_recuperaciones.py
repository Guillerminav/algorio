"""Que paso con los pedidos de "olvide mi contraseña".

    python -m scripts.revisar_recuperaciones

Existe porque el endpoint contesta lo mismo salga o no el mail —a proposito,
para no delatar que direcciones tienen cuenta— y eso deja al que administra sin
ninguna forma de saber si el correo se esta entregando. Esto la da: por cada
pedido, si Resend lo acepto y, si no, con que se quejo.

Con --email revisa ademas esa direccion en particular: si tiene cuenta, si esa
cuenta entra con Google (en cuyo caso el mail que recibe es el de CREAR una
contraseña, con otro asunto), y que paso con sus pedidos.
"""
import argparse

from db import conexion, inicializar_db


def revisar(email: str | None = None) -> None:
    inicializar_db()
    with conexion() as con:
        if email:
            cuenta = con.execute(
                "SELECT usuario, email, rol, (password_hash IS NULL) AS es_google "
                "FROM usuarios WHERE lower(email) = lower(%s)",
                (email,),
            ).fetchone()
            print(f"\n=== {email} ===")
            if cuenta is None:
                print("  No hay ninguna cuenta con ese mail.")
                print("  (El formulario contesta lo mismo igual: es lo que evita")
                print("   que sirva para averiguar que direcciones estan registradas.)")
                return
            print(f"  Cuenta: {cuenta['usuario']}  ·  rol: {cuenta['rol']}")
            if cuenta["es_google"]:
                print("  ENTRA CON GOOGLE y todavia no tiene contraseña local.")
                print("  El mail que recibe es el de CREAR una (asunto distinto), y")
                print("  al usarlo va a poder entrar de las dos formas.")
            else:
                print("  Tiene contraseña local: le corresponde el link de siempre.")

    with conexion() as con:
        filas = con.execute(
            """
            SELECT r.usuario, u.email, r.creado_en, r.vence_en, r.usado_en, r.error_envio
              FROM recuperaciones_password r
              LEFT JOIN usuarios u ON u.usuario = r.usuario
             ORDER BY r.creado_en DESC
             LIMIT 30
            """
        ).fetchall()

    print("\n=== Ultimos pedidos ===")
    if not filas:
        print("  Ninguno. Si alguien lo pidio y no aparece aca, es porque no se")
        print("  llego a generar token: no hay cuenta con ese mail, o se pidio")
        print("  dos veces seguidas muy rapido.")
        return

    for f in filas:
        estado = "usado" if f["usado_en"] else "sin usar"
        print(f"\n  {f['creado_en']:%Y-%m-%d %H:%M}  {f['usuario']} <{f['email'] or '-'}>  [{estado}]")
        if f["error_envio"]:
            print(f"    EL MAIL NO SALIO: {f['error_envio']}")
        else:
            print("    Resend lo acepto.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="Revisa ademas que pasa con esa direccion.")
    revisar(parser.parse_args().email)
