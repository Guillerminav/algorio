"""Gestiona quien puede aprobar los comercios que se dan de alta.

    python -m scripts.aprobador                     # lista los aprobadores
    python -m scripts.aprobador --dar <usuario>     # da el permiso
    python -m scripts.aprobador --quitar <usuario>  # lo saca

Un comercio nuevo nace en `estado = 'pendiente'` y no se ve en el mapa hasta
que alguien lo aprueba (ver backend/pois.py). Ese permiso es la columna
`usuarios.es_admin`, y se otorga a mano a proposito: son una o dos cuentas, no
justifica una pantalla de administracion de permisos.

El permiso NO depende del rol. Un aprobador puede tener cuenta de naviera, de
comercio o de nauta: la seccion "Moderación" aparece en la barra lateral de
los tres, y el backend valida es_admin en cada endpoint /api/admin/*.
"""
import argparse

from db import conexion, inicializar_db


def listar() -> None:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT usuario, email, rol FROM usuarios WHERE es_admin ORDER BY usuario"
        ).fetchall()
        pendientes = con.execute(
            "SELECT COUNT(*) AS n FROM pois WHERE estado = 'pendiente'"
        ).fetchone()["n"]

    if not filas:
        print("No hay ningun aprobador todavia.")
        print("Dale el permiso a una cuenta con:  python -m scripts.aprobador --dar <usuario>")
    else:
        print(f"Aprobadores ({len(filas)}):")
        for f in filas:
            print(f"  {f['usuario']:<22} rol={f['rol']:<11} {f['email'] or '(sin email)'}")
        print('\nEntran con su cuenta de siempre; la seccion "Moderación" les aparece')
        print("al final de la barra lateral.")

    print(f"\nComercios esperando aprobacion: {pendientes}")


def cambiar(usuario: str, valor: bool) -> None:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "UPDATE usuarios SET es_admin = %s WHERE usuario = %s RETURNING usuario, email, rol",
            (valor, usuario),
        ).fetchone()

    if fila is None:
        print(f"No existe la cuenta {usuario!r}.")
        print("Ojo con las mayusculas: el nombre de usuario distingue.")
        raise SystemExit(1)

    accion = "ahora puede aprobar comercios" if valor else "ya no puede aprobar comercios"
    print(f"{fila['usuario']} ({fila['rol']}) {accion}.")
    if valor:
        print('Al entrar le va a aparecer "Moderación" al final de la barra lateral.')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dar", metavar="USUARIO", help="Le da el permiso de aprobar.")
    parser.add_argument("--quitar", metavar="USUARIO", help="Le saca el permiso.")
    argumentos = parser.parse_args()

    if argumentos.dar:
        cambiar(argumentos.dar, True)
    elif argumentos.quitar:
        cambiar(argumentos.quitar, False)
    else:
        listar()
