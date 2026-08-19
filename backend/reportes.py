"""Reportes del rio: lo que un nauta ve y le avisa al resto.

Un yacare en la costa, un banco de arena que se corrio, un tronco a la deriva,
basura acumulada. Es informacion que ningun organismo publica y que solo tiene
el que estuvo ahi hace un rato.

LA DIFERENCIA CON LOS POIs (backend/pois.py) ES QUE ESTOS VENCEN.

Un parador esta donde esta; un tronco se va con la correntada y un banco de
arena se mueve con la proxima creciente. Un aviso sin fecha de vencimiento se
convierte, en dos meses, en un mapa lleno de peligros que ya no existen — y eso
es peor que no tener nada, porque el nauta deja de creerle al mapa entero.

Por eso cada reporte nace con `vence_en` y las consultas filtran por ahi. No
hay cron ni tarea programada: un reporte vencido simplemente deja de aparecer,
igual que una suscripcion vencida deja de dar acceso.

Tampoco pasan por moderacion, a diferencia de los comercios. Un banco de arena
avisado hoy y aprobado el martes no le sirve a nadie: el valor de este dato es
que es de hace dos horas. El control es social — quien lo puso lo puede borrar,
y el resto ve quien lo reporto y cuando.
"""
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from db import conexion, inicializar_db

# Que se puede reportar. `animal` lleva ademas `detalle` con cual (carpincho,
# yacare, vibora...), porque "hay un animal" no le dice nada a nadie: una cosa
# es un carpincho y otra un yacare en el lugar donde ibas a bajar los chicos.
TIPOS_VALIDOS = {"animal", "banco_arena", "arbol", "basura", "otro"}

# Cuanto pesa el aviso. No es lo mismo "vi carpinchos, lindo lugar" que "hay un
# tronco cruzado en el paso": el mapa los pinta distinto y el nauta decide de
# un vistazo a que prestarle atencion.
SEVERIDADES_VALIDAS = {"comentario", "advertencia", "alerta"}

# Cuanto dura el aviso, en horas. Las tres opciones cubren los casos reales:
# un dia para algo que vi hoy (un animal, un tronco suelto), dos para un fin de
# semana largo, una semana para algo que va a seguir ahi (un banco de arena que
# se formo, basura acumulada).
DURACIONES_VALIDAS = {24, 48, 168}
DURACION_POR_DEFECTO = 24

# Un grado de latitud son ~111 km; el de longitud se achica con el coseno de la
# latitud. Alcanza para acotar la consulta a una caja y filtrar el radio exacto
# despues, igual que en pois.py.
KM_POR_GRADO_LAT = 111.0

MAX_COMENTARIO = 500


def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine. Igual que en pois.py: se calcula en Python porque PostGIS no
    esta instalado y, para el volumen de un tramo de rio, filtrar unos cientos
    de filas en memoria es de sobra."""
    radio = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * radio * math.asin(math.sqrt(a))


def listar(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radio_km: Optional[float] = None,
    tipo: Optional[str] = None,
) -> list[dict]:
    """Los reportes vigentes. Los vencidos no se devuelven nunca.

    Ordenados del mas nuevo al mas viejo: entre dos avisos del mismo lugar, el
    de hace una hora vale mas que el de anteayer.
    """
    inicializar_db()
    condiciones = ["r.vence_en > now()"]
    parametros: list = []

    if tipo in TIPOS_VALIDOS:
        condiciones.append("r.tipo = %s")
        parametros.append(tipo)

    if lat is not None and lon is not None and radio_km:
        margen_lat = radio_km / KM_POR_GRADO_LAT
        coseno = max(math.cos(math.radians(lat)), 0.01)
        margen_lon = radio_km / (KM_POR_GRADO_LAT * coseno)
        condiciones.append("r.lat BETWEEN %s AND %s AND r.lon BETWEEN %s AND %s")
        parametros += [lat - margen_lat, lat + margen_lat, lon - margen_lon, lon + margen_lon]

    with conexion() as con:
        filas = [
            dict(f)
            for f in con.execute(
                "SELECT r.*, u.nombre_completo AS autor "
                "FROM reportes r LEFT JOIN usuarios u ON u.usuario = r.usuario "
                f"WHERE {' AND '.join(condiciones)} ORDER BY r.creado_en DESC",
                parametros,
            ).fetchall()
        ]

    if lat is not None and lon is not None:
        for fila in filas:
            fila["distancia_km"] = round(distancia_km(lat, lon, fila["lat"], fila["lon"]), 2)
        if radio_km:
            filas = [f for f in filas if f["distancia_km"] <= radio_km]

    return filas


def crear(
    usuario: str,
    tipo: str,
    lat: float,
    lon: float,
    severidad: str = "comentario",
    detalle: Optional[str] = None,
    comentario: Optional[str] = None,
    duracion_horas: int = DURACION_POR_DEFECTO,
) -> dict:
    if tipo not in TIPOS_VALIDOS:
        raise ValueError(f"El tipo debe ser uno de {sorted(TIPOS_VALIDOS)}.")
    if severidad not in SEVERIDADES_VALIDAS:
        raise ValueError(f"La severidad debe ser una de {sorted(SEVERIDADES_VALIDAS)}.")
    if duracion_horas not in DURACIONES_VALIDAS:
        raise ValueError(f"La duración debe ser una de {sorted(DURACIONES_VALIDAS)} horas.")

    vence_en = datetime.now(timezone.utc) + timedelta(hours=duracion_horas)

    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            """
            INSERT INTO reportes (usuario, tipo, detalle, severidad, comentario, lat, lon, vence_en)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                usuario,
                tipo,
                (detalle or "").strip() or None,
                severidad,
                (comentario or "").strip()[:MAX_COMENTARIO] or None,
                lat,
                lon,
                vence_en,
            ),
        ).fetchone()
    return dict(fila)


def eliminar(reporte_id: int, usuario: str, es_admin: bool = False) -> bool:
    """Borra el reporte. Solo el autor, o un admin.

    Que el autor pueda borrar el suyo es el unico control que tiene este
    sistema: si el tronco ya no esta, quien lo aviso lo saca sin esperar a que
    venza.
    """
    inicializar_db()
    with conexion() as con:
        if es_admin:
            fila = con.execute(
                "DELETE FROM reportes WHERE id = %s RETURNING id", (reporte_id,)
            ).fetchone()
        else:
            fila = con.execute(
                "DELETE FROM reportes WHERE id = %s AND usuario = %s RETURNING id",
                (reporte_id, usuario),
            ).fetchone()
    return fila is not None


def renovar(reporte_id: int, usuario: str, duracion_horas: int = DURACION_POR_DEFECTO) -> Optional[dict]:
    """Empuja el vencimiento: "sigue estando".

    Es lo que evita que un banco de arena real desaparezca del mapa solo porque
    pasaron 24 horas. Solo el autor puede renovarlo, y se cuenta desde ahora y
    no desde la creacion: lo que se esta afirmando es que hoy sigue ahi.
    """
    if duracion_horas not in DURACIONES_VALIDAS:
        raise ValueError(f"La duración debe ser una de {sorted(DURACIONES_VALIDAS)} horas.")

    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "UPDATE reportes SET vence_en = now() + %s WHERE id = %s AND usuario = %s RETURNING *",
            (timedelta(hours=duracion_horas), reporte_id, usuario),
        ).fetchone()
    return dict(fila) if fila else None


def mios(usuario: str) -> list[dict]:
    """Los reportes que hizo un usuario, incluidos los vencidos.

    Los vencidos se muestran acá (y no en el mapa) para que pueda ver que
    reporto y renovar lo que siga estando.
    """
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT *, (vence_en <= now()) AS vencido FROM reportes "
            "WHERE usuario = %s ORDER BY creado_en DESC LIMIT 50",
            (usuario,),
        ).fetchall()
    return [dict(f) for f in filas]


def borrar_vencidos(dias_de_gracia: int = 30) -> int:
    """Limpieza de los que vencieron hace rato.

    No hace falta para que el mapa funcione —listar() ya los filtra— pero sin
    esto la tabla crece para siempre con datos que nadie va a volver a mirar.
    Se deja un margen para poder revisar que se reporto la semana pasada.
    """
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "DELETE FROM reportes WHERE vence_en < now() - %s RETURNING id",
            (timedelta(days=dias_de_gracia),),
        ).fetchall()
    return len(filas)
