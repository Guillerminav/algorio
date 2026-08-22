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

from backend import correo
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

    Ya no importa si la cuenta tiene comercios propios: podes tener un parador
    cargado y reclamar ademas la cabaña que alguien sembro en el mapa. Antes
    esto se rechazaba, y con razon mientras el panel era "mi comercio" en
    singular — con dos POIs asignados no habia pantalla que los mostrara.

    Quedan las dos validaciones que siguen siendo ciertas: no se puede
    reclamar un lugar que ya tiene dueño, y no se acumulan reclamos pendientes.
    """
    inicializar_db()
    with conexion() as con:
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
        quien = con.execute(
            "SELECT nombre_completo, email FROM usuarios WHERE usuario = %s", (usuario,)
        ).fetchone()

    # Fuera de la transaccion y despues del commit: un reclamo guardado no
    # puede quedar deshecho porque la casilla de soporte no contesto.
    _avisar(dict(fila), poi["nombre"], dict(quien) if quien else {})
    return dict(fila)


def _avisar(reclamo: dict, nombre_poi: str, quien: dict) -> None:
    """Le avisa a soporte que entro un reclamo.

    Un reclamo que nadie mira es un comerciante esperando: el pedido no le
    llega a nadie por si solo, queda en una cola que hay que acordarse de
    abrir. El mail trae lo mismo con lo que se decide en el panel —quien pide,
    que lugar y con que argumento— para poder resolverlo sin entrar, o al menos
    saber que hay algo que resolver.

    El contador del panel (`contar_pendientes`) es la otra mitad de esto y la
    que no depende de nada: si falta RESEND_API_KEY, el mail no sale y el
    numerito sigue apareciendo igual.
    """
    correo.enviar(
        asunto=f"AlgoRío - reclamo de propiedad: {nombre_poi}",
        texto=(
            f"{quien.get('nombre_completo') or reclamo['usuario']} "
            f"({quien.get('email') or 'sin mail'}) dice ser el dueño de "
            f"«{nombre_poi}».\n\n"
            f"Lo que escribió:\n{reclamo.get('mensaje') or '(no escribió nada)'}\n\n"
            "Se aprueba o se rechaza en el panel, en Reclamos."
        ),
    )


def contar_pendientes() -> int:
    """Cuantos reclamos estan esperando respuesta. Es el numerito del panel."""
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT COUNT(*) AS cantidad FROM poi_reclamos WHERE estado = 'pendiente'"
        ).fetchone()
    return fila["cantidad"]


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


MOTIVO_REASIGNADO = "El lugar fue asignado a otra cuenta."


def transferir(poi_id: int, usuario: Optional[str]) -> dict:
    """Cambia de mano un lugar desde el panel del admin: lo libera o lo asigna.

    Es la puerta que faltaba. `resolver` solo sabe entregar un POI **sin
    dueño**, asi que un lugar cargado desde una cuenta —la de prueba con la que
    se llena el mapa antes de salir a vender, sin ir mas lejos— no habia forma
    de pasarselo a su dueño real: no aparecia entre los reclamables y nadie
    podia pedirlo.

    Las dos formas existen porque son dos situaciones:

    - `usuario=None` **libera**: el lugar queda sin dueño y vuelve a la lista
      de reclamables. Es el camino largo y el que deja rastro — el titular lo
      pide desde su cuenta y alguien aprueba —, y el correcto cuando al dueño
      se lo conoce por telefono y no esta ahi.
    - `usuario='alguien'` **asigna** derecho. Es para cuando lo tenes sentado
      al lado: hacerle crear la cuenta, buscar su propio local en una lista y
      esperar una aprobacion que le vas a dar vos mismo es un tramite inventado.

    Asignar no pisa a nadie sin decirlo: si el lugar ya tenia dueño, se lo
    saca, y por eso lo hace un admin y no un formulario. Los otros reclamos
    pendientes de ese lugar se cierran solos, igual que al aprobar uno: ya no
    hay nada que decidir ahi.

    Que la cuenta destino ya tenga comercios no molesta: puede tener varios.
    """
    inicializar_db()
    with conexion() as con:
        poi = con.execute(
            "SELECT id, nombre, usuario FROM pois WHERE id = %s", (poi_id,)
        ).fetchone()
        if poi is None:
            raise ValueError("Ese lugar no existe.")

        if usuario is not None:
            cuenta = con.execute(
                "SELECT usuario, rol FROM usuarios WHERE usuario = %s", (usuario,)
            ).fetchone()
            if cuenta is None:
                raise ValueError(f"No existe la cuenta «{usuario}».")
            # El panel de comercio es de las cuentas de comercio: asignarle un
            # POI a un nauta le da un lugar que no puede editar desde ningun
            # lado, porque su app ni siquiera tiene esa pantalla.
            if cuenta["rol"] != "comercio":
                raise ValueError(
                    f"La cuenta «{usuario}» no es de comercio, así que no tiene panel "
                    "donde editar la ficha."
                )
        fila = con.execute(
            "UPDATE pois SET usuario = %s, actualizado_en = now() WHERE id = %s RETURNING *",
            (usuario, poi_id),
        ).fetchone()

        # Al asignar, el pedido de esa cuenta —si lo habia— queda como lo que
        # termino siendo, y los demas dejan de tener sentido. Al liberar no se
        # toca nada: los pendientes de ese lugar recien ahora se pueden aprobar.
        if usuario is not None:
            con.execute(
                "UPDATE poi_reclamos SET estado = 'aprobado', resuelto_en = now() "
                "WHERE poi_id = %s AND usuario = %s AND estado = 'pendiente'",
                (poi_id, usuario),
            )
            con.execute(
                "UPDATE poi_reclamos SET estado = 'rechazado', resuelto_en = now(), "
                "motivo_rechazo = %s WHERE poi_id = %s AND estado = 'pendiente'",
                (MOTIVO_REASIGNADO, poi_id),
            )

    return dict(fila)
