"""Gestiona quien puede moderar: aprobar fichas nuevas y reclamos de propiedad.

    python -m scripts.aprobador                     # lista los aprobadores
    python -m scripts.aprobador --dar <usuario>     # da el permiso
    python -m scripts.aprobador --quitar <usuario>  # lo saca

Son dos colas y las dos las abre el mismo permiso:

- **Moderación** — fichas nuevas. Un comercio nace en `estado = 'pendiente'` y
  no se ve en el mapa hasta que alguien lo aprueba (ver backend/pois.py). Desde
  ahi tambien se libera o se reasigna la titularidad de un lugar publicado.
- **Reclamos** — "ese lugar del mapa es mio". Aprobar le entrega la edicion de
  un POI existente a una cuenta (ver backend/reclamos.py).

El permiso es la columna `usuarios.es_admin`, y se otorga a mano a proposito:
son una o dos cuentas, no justifica una pantalla de administracion de permisos.

El permiso NO depende del rol ni de tener un comercio cargado. Un aprobador
puede tener cuenta de naviera, de comercio o de nauta: las dos secciones
aparecen en la barra lateral de los tres, y el backend valida es_admin en cada
endpoint /api/admin/*.
"""
import argparse

from db import conexion, inicializar_db


def listar() -> None:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT usuario, email, rol FROM usuarios WHERE es_admin ORDER BY usuario"
        ).fetchall()
        fichas = con.execute(
            "SELECT COUNT(*) AS n FROM pois WHERE estado = 'pendiente'"
        ).fetchone()["n"]
        reclamos = con.execute(
            "SELECT COUNT(*) AS n FROM poi_reclamos WHERE estado = 'pendiente'"
        ).fetchone()["n"]

    if not filas:
        print("No hay ningun aprobador todavia.")
        print("Dale el permiso a una cuenta con:  python -m scripts.aprobador --dar <usuario>")
    else:
        print(f"Aprobadores ({len(filas)}):")
        for f in filas:
            print(f"  {f['usuario']:<22} rol={f['rol']:<11} {f['email'] or '(sin email)'}")
        print('\nEntran con su cuenta de siempre; "Moderación" y "Reclamos" les')
        print("aparecen al final de la barra lateral.")

    print(f"\nEsperando: {fichas} fichas nuevas, {reclamos} reclamos de propiedad.")


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

    accion = "ahora puede moderar" if valor else "ya no puede moderar"
    print(f"{fila['usuario']} ({fila['rol']}) {accion}.")
    if valor:
        print('Al entrar le van a aparecer "Moderación" y "Reclamos" al final de la barra.')


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
