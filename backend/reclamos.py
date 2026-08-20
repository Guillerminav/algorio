"""Reclamos de propiedad: "ese lugar del mapa es mio, dejame editarlo".

Los POIs del mapa no siempre los carga su dueño. Los hay sembrados por el
equipo, importados, o cargados por un comerciante que despues perdio la cuenta:
todos esos quedan con `pois.usuario` en NULL (ver db.py, que es huerfano a
proposito para que borrar una cuenta no se lleve el pin puesto).

Cuando el dueño de verdad se registra, obligarlo a cargar todo de cero seria
mal negocio para las dos puntas: el nauta termina con dos pines del mismo
parador y el comerciante pierde las reseñas y las metricas que su lugar ya
tenia. Por eso puede **reclamarlo**.

Y por eso el reclamo lo aprueba un admin y no se concede solo: entregar la
edicion de un POI es entregar el nombre, la ubicacion y el telefono que ve todo
el mundo. Con aprobacion automatica, cualquiera que se registre se queda con el
parador de otro.

La aprobacion hace UNA cosa: pone `pois.usuario`. De ahi en mas el comerciante
edita su ficha por el camino de siempre (backend/pois.py) y con las mismas
reglas —los cambios de nombre o ubicacion vuelven a revision—, asi que reclamar
no es un atajo para publicar cualquier cosa.
"""
from typing import Optional

from db import conexion, inicializar_db

ESTADOS_VALIDOS = {"pendiente", "aprobado", "rechazado"}

MAX_LARGO_MENSAJE = 600

# Cuantos lugares devuelve la busqueda. Es un buscador para encontrar el
# propio, no un catalogo: si hacen falta mas de treinta resultados, lo que
# falta es escribir mejor el nombre.
MAX_RESULTADOS = 30


def _fila(fila) -> dict:
    return dict(fila) if fila else None


def listar_reclamables(busqueda: Optional[str] = None) -> list[dict]:
    """Los lugares que se pueden reclamar: publicados y sin dueño.

    Solo aprobados: un POI pendiente todavia lo esta revisando alguien y no
    tiene sentido pelearse por el. Y solo sin dueño, obviamente — para
    disputar uno que ya tiene dueño no alcanza con un formulario, eso es
    soporte.
    """
    inicializar_db()
    condiciones = ["estado = 'aprobado'", "usuario IS NULL"]
    parametros: list = []

    if busqueda and busqueda.strip():
        # ILIKE y no full-text: son unos cientos de filas y el usuario busca
        # por el nombre de su propio local, que ya sabe como se escribe.
        condiciones.append("(nombre ILIKE %s OR descripcion ILIKE %s)")
        patron = f"%{busqueda.strip()}%"
        parametros += [patron, patron]

    with conexion() as con:
        filas = con.execute(
            f"SELECT id, tipo, nombre, descripcion, lat, lon, telefono, whatsapp, fotos "
            f"FROM pois WHERE {' AND '.join(condiciones)} ORDER BY nombre LIMIT {MAX_RESULTADOS}",
            parametros,
        ).fetchall()
    return [dict(f) for f in filas]


def mio(usuario: str) -> Optional[dict]:
    """El ultimo reclamo de esa cuenta, con el lugar que pide.

    Devuelve el ultimo y no solo el pendiente porque un rechazo tambien hay
    que mostrarlo: si no, el comerciante vuelve a entrar, ve la pantalla de
    alta igual que antes y no se entera de que le dijeron que no.
    """
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            """
            SELECT r.*, p.nombre AS nombre_poi, p.tipo AS tipo_poi, p.lat, p.lon
            FROM poi_reclamos r
            JOIN pois p ON p.id = r.poi_id
            WHERE r.usuario = %s
            ORDER BY r.creado_en DESC
            LIMIT 1
            """,
            (usuario,),
        ).fetchone()
    return _fila(fila)


def crear(usuario: str, poi_id: int, mensaje: Optional[str] = None) -> dict:
    """Pide la propiedad de un lugar.

    Las tres validaciones son las tres formas de romper esto: reclamar
    teniendo comercio propio, reclamar uno que ya tiene dueño, y acumular
    reclamos pendientes. La primera es la importante — sin ella una cuenta
    podria terminar con dos POIs y el panel es "mi comercio", en singular.
    """
    inicializar_db()
    with conexion() as con:
        propio = con.execute(
            "SELECT id FROM pois WHERE usuario = %s", (usuario,)
        ).fetchone()
        if propio:
            raise ValueError("Esta cuenta ya tiene un comercio asociado.")

        poi = con.execute(
            "SELECT id, nombre, usuario, estado FROM pois WHERE id = %s", (poi_id,)
        ).fetchone()
        if poi is None:
            raise ValueError("Ese lugar no existe.")
        if poi["usuario"] is not None:
            raise ValueError("Ese lugar ya tiene un dueño asignado.")
        if poi["estado"] != "aprobado":
            raise ValueError("Ese lugar todavía no está publicado.")

        pendiente = con.execute(
            "SELECT id FROM poi_reclamos WHERE usuario = %s AND estado = 'pendiente'",
            (usuario,),
        ).fetchone()
        if pendiente:
            raise ValueError("Ya tenés un reclamo esperando respuesta.")

        fila = con.execute(
            """
            INSERT INTO poi_reclamos (poi_id, usuario, mensaje)
            VALUES (%s, %s, %s) RETURNING *
            """,
            (poi_id, usuario, (mensaje or "").strip()[:MAX_LARGO_MENSAJE] or None),
        ).fetchone()
    return dict(fila)


def cancelar(usuario: str) -> bool:
    """Da de baja el reclamo pendiente. Sirve para arrepentirse y cargar el
    comercio de cero sin esperar a que alguien conteste."""
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "DELETE FROM poi_reclamos WHERE usuario = %s AND estado = 'pendiente' RETURNING id",
            (usuario,),
        ).fetchone()
    return fila is not None


def listar_para_moderar(estado: str = "pendiente") -> list[dict]:
    """La cola del admin, con lo que hace falta para decidir sin salir de la
    pantalla: quien pide, que lugar, y como contactarlo."""
    inicializar_db()
    if estado not in ESTADOS_VALIDOS:
        estado = "pendiente"
    with conexion() as con:
        filas = con.execute(
            """
            SELECT r.*,
                   p.nombre AS nombre_poi, p.tipo AS tipo_poi, p.lat, p.lon,
                   p.telefono AS telefono_poi, p.whatsapp AS whatsapp_poi,
                   u.nombre_completo AS nombre_usuario, u.email AS email_usuario
            FROM poi_reclamos r
            JOIN pois p ON p.id = r.poi_id
            LEFT JOIN usuarios u ON u.usuario = r.usuario
            WHERE r.estado = %s
            ORDER BY r.creado_en
            """,
            (estado,),
        ).fetchall()
    return [dict(f) for f in filas]


def resolver(reclamo_id: int, aprobado: bool, motivo: Optional[str] = None) -> Optional[dict]:
    """Aprueba o rechaza. Aprobar es lo unico que toca `pois.usuario`.

    Se vuelve a chequear que el POI siga sin dueño DENTRO de la operacion: un
    reclamo puede quedar dias en la cola y en el medio el lugar pudo haber
    quedado asignado por otro reclamo. Sin ese chequeo, aprobar el segundo le
    sacaria el comercio al primero sin avisarle a nadie.

    Al aprobar se rechazan de una los otros reclamos pendientes del mismo
    lugar: ya no hay nada que decidir ahi, y dejarlos en la cola es hacer que
    alguien los mire dos veces.
    """
    inicializar_db()
    with conexion() as con:
        reclamo = con.execute(
            "SELECT * FROM poi_reclamos WHERE id = %s", (reclamo_id,)
        ).fetchone()
        if reclamo is None:
            return None
        if reclamo["estado"] != "pendiente":
            raise ValueError("Ese reclamo ya estaba resuelto.")

        if aprobado:
            poi = con.execute(
                "SELECT usuario FROM pois WHERE id = %s", (reclamo["poi_id"],)
            ).fetchone()
            if poi is None:
                raise ValueError("El lugar del reclamo ya no existe.")
            if poi["usuario"] is not None:
                raise ValueError("Ese lugar ya fue asignado a otra cuenta.")
            if con.execute(
                "SELECT id FROM pois WHERE usuario = %s", (reclamo["usuario"],)
            ).fetchone():
                raise ValueError("Esa cuenta ya tiene otro comercio asociado.")

            con.execute(
                "UPDATE pois SET usuario = %s, actualizado_en = now() WHERE id = %s",
                (reclamo["usuario"], reclamo["poi_id"]),
            )
            con.execute(
                "UPDATE poi_reclamos SET estado = 'rechazado', resuelto_en = now(), "
                "motivo_rechazo = 'El lugar fue asignado a otra cuenta.' "
                "WHERE poi_id = %s AND estado = 'pendiente' AND id <> %s",
                (reclamo["poi_id"], reclamo_id),
            )

        fila = con.execute(
            """
            UPDATE poi_reclamos
               SET estado = %s, resuelto_en = now(), motivo_rechazo = %s
             WHERE id = %s
            RETURNING *
            """,
            ("aprobado" if aprobado else "rechazado", None if aprobado else motivo, reclamo_id),
        ).fetchone()
    return dict(fila)
