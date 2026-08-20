"""Carga (o borra) un puñado de POIs de demostracion para mirar la app.

    python -m scripts.sembrar_demo          # carga
    python -m scripts.sembrar_demo --borrar # borra lo que cargo

El mapa del nauta esta vacio hasta que exista un comercio aprobado, y llegar a
tener uno a mano son varios pasos (crear cuenta de comercio, cargar la ficha,
darse es_admin, aprobarla). Este script deja el circuito listo para poder ver
las pantallas con contenido.

SON DATOS INVENTADOS, no comercios reales: nombres, telefonos y precios son de
juguete. Van todos con el prefijo de abajo justamente para poder borrarlos de
un saque y no confundirlos nunca con un parador de verdad.
"""
import argparse

from backend import pois, tablero
from db import conexion, inicializar_db

# Todo lo que crea este script queda marcado con esto en la descripcion, que es
# lo unico que se ve en la app. Asi nadie confunde un pin de demo con uno real.
MARCA_DEMO = "[DEMO]"

# Los estados del tablero caducan al terminar el dia (ver backend/tablero.py),
# asi que el demo los sella al momento de sembrar: sin esto naceria ya vencido
# y el tablero se veria todo en verde, que es justo lo que no se quiere mostrar.
_AHORA = tablero._ahora_ar().isoformat(timespec="seconds")

LUGARES = [
    {
        "tipo": "parador",
        "nombre": "Parador El Remanso",
        "descripcion": "Vista al río, amarre propio y pescado del día. Se llega en lancha o por tierra.",
        "lat": -27.4712,
        "lon": -58.8341,
        "whatsapp": "3794000000",
        "telefono": "3794111111",
        "servicios": ["Amarre", "Baños", "Wifi", "Sombrillas"],
        "menu": [
            {"seccion": "Bebidas", "items": [
                {"nombre": "Cerveza artesanal", "precio": "4500"},
                {"nombre": "Agua saborizada", "precio": "2000"},
            ]},
            {"seccion": "Para picar", "items": [
                {"nombre": "Rabas", "precio": "12000"},
                {"nombre": "Tabla de fiambres", "precio": "18000"},
            ]},
        ],
        "horarios": {
            "vie": {"abre": "18:00", "cierra": "23:59", "cerrado": False},
            "sab": {"abre": "11:00", "cierra": "23:59", "cerrado": False},
            "dom": {"abre": "11:00", "cierra": "20:00", "cerrado": False},
            "lun": {"cerrado": True, "abre": "", "cierra": ""},
        },
    },
    {
        "tipo": "lancha_taxi",
        "nombre": "Lancha-taxi Don Pedro",
        "descripcion": "Traslados a las islas y paseos de una hora.",
        "lat": -27.4620,
        "lon": -58.8410,
        "whatsapp": "3794222222",
        "servicios": ["Chalecos incluidos", "Apto grupos"],
        "menu": [
            {"seccion": "Traslados", "items": [
                {"nombre": "Ida y vuelta a la isla", "precio": "15000"},
                {"nombre": "Paseo de una hora", "precio": "25000"},
            ]},
        ],
        # El unico rubro con tablero de cruces. Va uno a horario y otro
        # demorado a proposito: con los dos en verde no se ve para que sirve
        # la pantalla, que es justo lo que un demo tiene que mostrar.
        "cruces": [
            {
                "destino": "Isla del Cerrito",
                "origen": "Puerto Corrientes",
                "salidas": ["07:00", "09:30", "12:00", "15:00", "17:30"],
                "frecuencia_min": 150,
                "precio": 3500,
                "duracion_min": 25,
                "ultimo_regreso": "19:30",
                "estado": "a_horario",
            },
            {
                "destino": "Paso de la Patria",
                "origen": "Puerto Corrientes",
                # El recorrido va bien, pero una salida suelta esta demorada
                # y otra se cayo: es el caso que muestra para que sirven los
                # dos niveles de estado, y con todo en verde no se ve.
                "salidas": [
                    "08:00",
                    {"hora": "14:00", "estado": "demorado", "demora_min": 20,
                     "estado_desde": _AHORA},
                    {"hora": "18:00", "estado": "cancelado", "estado_desde": _AHORA},
                ],
                "frecuencia_min": 360,
                "precio": 5200,
                "duracion_min": 40,
                "ultimo_regreso": "18:45",
                "estado": "a_horario",
            },
        ],
    },
    {
        "tipo": "alojamiento",
        "nombre": "Cabañas del Paraná",
        "descripcion": "Cuatro cabañas sobre la barranca, con bajada al río.",
        "lat": -27.4805,
        "lon": -58.8215,
        "whatsapp": "3794333333",
        "servicios": ["Amarre", "Wifi", "Parrilla", "Apto mascotas"],
        "menu": [
            {"seccion": "Cabañas", "items": [
                {"nombre": "Para 2 personas", "precio": "45000"},
                {"nombre": "Para 4 personas", "precio": "70000"},
            ]},
        ],
    },
]


def _sin_dueno(datos: dict) -> None:
    """Inserta el POI ya aprobado y sin dueño.

    Sin dueño (usuario NULL) a proposito: son de demostracion, no de nadie. La
    columna es nullable justamente para esto y para que borrar una cuenta no se
    lleve puesto el lugar (ver db.py).
    """
    import json

    with conexion() as con:
        con.execute(
            """
            INSERT INTO pois (tipo, nombre, descripcion, lat, lon, telefono, whatsapp,
                              servicios, menu, horarios, cruces, estado)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'aprobado')
            """,
            (
                datos["tipo"],
                datos["nombre"],
                f"{MARCA_DEMO} {datos['descripcion']}",
                datos["lat"],
                datos["lon"],
                datos.get("telefono"),
                datos.get("whatsapp"),
                json.dumps(datos.get("servicios")),
                json.dumps(datos.get("menu")),
                json.dumps(datos.get("horarios")),
                # Por tablero.validar y no crudo: asi el demo lleva los ids y
                # las marcas de tiempo que pone el servidor, y el "demorado"
                # caduca esta noche igual que uno de verdad.
                json.dumps(tablero.validar(datos["cruces"]) if datos.get("cruces") else None),
            ),
        )


def cargar() -> None:
    inicializar_db()
    borrar(silencioso=True)
    for datos in LUGARES:
        _sin_dueno(datos)
        print(f"  + {datos['nombre']}")
    print(f"\n{len(LUGARES)} lugares de demo cargados y aprobados.")
    print("Entra como nauta recreativo y van a estar en el mapa.")


def borrar(silencioso: bool = False) -> None:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "DELETE FROM pois WHERE descripcion LIKE %s RETURNING nombre",
            (f"{MARCA_DEMO}%",),
        ).fetchall()
    if not silencioso:
        for fila in filas:
            print(f"  - {fila['nombre']}")
        print(f"\n{len(filas)} lugares de demo borrados.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--borrar", action="store_true", help="Borra los POIs de demo.")
    argumentos = parser.parse_args()

    borrar() if argumentos.borrar else cargar()
