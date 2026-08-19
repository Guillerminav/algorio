"""Puntos de interes del rio: paradores, alojamientos y lanchas-taxi.

Es la tabla que une las dos puntas del producto nuevo. El comerciante carga
su ficha desde el panel web y queda en 'pendiente'; recien cuando un admin la
aprueba aparece en el mapa de la app del nauta. Ese estado intermedio es
deliberado: sin el, cualquiera que se registre publica un pin en el mapa.

Tambien vive aca el conteo de interes (poi_visitas), que es lo que el
comerciante ve como "cuanta gente me miro".
"""
import json
import math
from datetime import date, timedelta
from typing import Optional

from db import conexion, inicializar_db

TIPOS_VALIDOS = {"parador", "alojamiento", "lancha_taxi"}

ESTADOS_VALIDOS = {"pendiente", "aprobado", "rechazado"}

# Que se cuenta como interes. 'ficha' es abrir el detalle; el resto son las
# acciones que de verdad valen para el comerciante (que lo llamen, que le
# escriban, que arranquen a navegar hacia el).
TIPOS_VISITA = {"ficha", "telefono", "whatsapp", "como_llegar"}

# Campos que el dueño puede editar de su ficha. Lista blanca explicita: sin
# ella, un PUT podria mandar `estado: "aprobado"` y saltearse la moderacion.
CAMPOS_EDITABLES = {
    "tipo", "nombre", "descripcion", "lat", "lon", "telefono", "whatsapp",
    "instagram", "horarios", "menu", "servicios", "fotos",
}

# Los que van a la base como JSONB y por lo tanto hay que serializar.
CAMPOS_JSON = {"horarios", "menu", "servicios", "fotos"}

# Un grado de latitud son ~111 km en cualquier parte; el de longitud se achica
# con el coseno de la latitud. Alcanza para acotar la consulta a una caja: el
# radio exacto se filtra despues en Python con la distancia real.
KM_POR_GRADO_LAT = 111.0


def _serializar(valores: dict) -> dict:
    """psycopg no convierte dicts/listas de Python a JSONB solo."""
    return {
        clave: (json.dumps(valor) if clave in CAMPOS_JSON and valor is not None else valor)
        for clave, valor in valores.items()
    }


def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine. Se calcula en Python y no con PostGIS porque la extension no
    esta instalada en la base y, para el volumen de POIs de un tramo de rio,
    filtrar unos cientos de filas en memoria es de sobra."""
    radio = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * radio * math.asin(math.sqrt(a))


def _con_promedio(con, filas: list[dict]) -> list[dict]:
    """Agrega puntaje promedio y cantidad de reseñas a cada POI.

    Una sola consulta agrupada para toda la lista, en vez de una por POI: el
    mapa pide decenas de pines de una y no vale la pena pagar un round-trip
    por cada uno.
    """
    if not filas:
        return []
    ids = [f["id"] for f in filas]
    resumen = con.execute(
        "SELECT poi_id, AVG(puntaje)::float AS promedio, COUNT(*) AS cantidad "
        "FROM poi_resenas WHERE poi_id = ANY(%s) GROUP BY poi_id",
        (ids,),
    ).fetchall()
    por_id = {r["poi_id"]: r for r in resumen}
    for fila in filas:
        datos = por_id.get(fila["id"])
        fila["puntaje_promedio"] = round(datos["promedio"], 1) if datos else None
        fila["cantidad_resenas"] = datos["cantidad"] if datos else 0
    return filas


def listar_aprobados(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radio_km: Optional[float] = None,
    tipo: Optional[str] = None,
) -> list[dict]:
    """Los POIs que ve el nauta en el mapa. Solo aprobados, nunca pendientes.

    Con lat/lon/radio devuelve los de esa zona ordenados por cercania; sin
    ellos, todos (que es lo que necesita el mapa cuando todavia no hay permiso
    de ubicacion).
    """
    inicializar_db()
    condiciones = ["estado = 'aprobado'"]
    parametros: list = []

    if tipo in TIPOS_VALIDOS:
        condiciones.append("tipo = %s")
        parametros.append(tipo)

    # Prefiltro por caja de coordenadas para que el indice (estado, lat, lon)
    # haga su trabajo; el radio exacto se aplica despues.
    if lat is not None and lon is not None and radio_km:
        margen_lat = radio_km / KM_POR_GRADO_LAT
        coseno = max(math.cos(math.radians(lat)), 0.01)
        margen_lon = radio_km / (KM_POR_GRADO_LAT * coseno)
        condiciones.append("lat BETWEEN %s AND %s AND lon BETWEEN %s AND %s")
        parametros += [lat - margen_lat, lat + margen_lat, lon - margen_lon, lon + margen_lon]

    with conexion() as con:
        filas = [
            dict(f)
            for f in con.execute(
                f"SELECT * FROM pois WHERE {' AND '.join(condiciones)} ORDER BY nombre",
                parametros,
            ).fetchall()
        ]

        if lat is not None and lon is not None:
            for fila in filas:
                fila["distancia_km"] = round(distancia_km(lat, lon, fila["lat"], fila["lon"]), 2)
            if radio_km:
                filas = [f for f in filas if f["distancia_km"] <= radio_km]
            filas.sort(key=lambda f: f["distancia_km"])

        return _con_promedio(con, filas)


def obtener(poi_id: int, solo_aprobado: bool = True) -> Optional[dict]:
    """La ficha completa. `solo_aprobado` es lo que consulta la app; el panel
    del comerciante y la moderacion lo pasan en False para ver los pendientes."""
    inicializar_db()
    with conexion() as con:
        consulta = "SELECT * FROM pois WHERE id = %s"
        if solo_aprobado:
            consulta += " AND estado = 'aprobado'"
        fila = con.execute(consulta, (poi_id,)).fetchone()
        if fila is None:
            return None
        return _con_promedio(con, [dict(fila)])[0]


def obtener_de_usuario(usuario: str) -> Optional[dict]:
    """El comercio de esa cuenta, en cualquier estado. Uno por cuenta (ver el
    indice unico parcial en db.py): el panel es "mi comercio", no una lista."""
    inicializar_db()
    with conexion() as con:
        fila = con.execute("SELECT * FROM pois WHERE usuario = %s", (usuario,)).fetchone()
        if fila is None:
            return None
        return _con_promedio(con, [dict(fila)])[0]


def crear(usuario: str, datos: dict) -> dict:
    """Da de alta el comercio de una cuenta. Nace en 'pendiente' siempre: el
    estado no se acepta desde afuera."""
    if datos.get("tipo") not in TIPOS_VALIDOS:
        raise ValueError(f"El tipo debe ser uno de {sorted(TIPOS_VALIDOS)}.")
    if not (datos.get("nombre") or "").strip():
        raise ValueError("El nombre no puede estar vacío.")
    if datos.get("lat") is None or datos.get("lon") is None:
        raise ValueError("Hay que marcar la ubicación en el mapa.")

    campos = _serializar({k: v for k, v in datos.items() if k in CAMPOS_EDITABLES})
    columnas = ", ".join(campos)
    marcadores = ", ".join(["%s"] * len(campos))

    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            f"INSERT INTO pois (usuario, {columnas}) VALUES (%s, {marcadores}) RETURNING *",
            [usuario, *campos.values()],
        ).fetchone()
    return dict(fila)


def actualizar(usuario: str, cambios: dict) -> dict:
    """Edita el comercio del usuario.

    Editar una ficha ya aprobada la devuelve a 'pendiente' solo si cambio algo
    que se publica en el mapa (nombre, tipo o ubicacion). Corregir un horario
    o agregar un plato no deberia sacar al parador del mapa hasta la proxima
    revision, pero mudar el pin a otro lado o renombrarlo entero si amerita
    que alguien lo vuelva a mirar.
    """
    campos = {k: v for k, v in cambios.items() if k in CAMPOS_EDITABLES}
    if not campos:
        raise ValueError("No hay nada para actualizar.")
    if "tipo" in campos and campos["tipo"] not in TIPOS_VALIDOS:
        raise ValueError(f"El tipo debe ser uno de {sorted(TIPOS_VALIDOS)}.")

    inicializar_db()
    with conexion() as con:
        actual = con.execute("SELECT * FROM pois WHERE usuario = %s", (usuario,)).fetchone()
        if actual is None:
            raise ValueError("Todavía no cargaste tu comercio.")

        vuelve_a_revision = actual["estado"] == "aprobado" and any(
            clave in campos and campos[clave] != actual[clave]
            for clave in ("nombre", "tipo", "lat", "lon")
        )

        serializados = _serializar(campos)
        asignaciones = ", ".join(f"{clave} = %s" for clave in serializados)
        if vuelve_a_revision:
            asignaciones += ", estado = 'pendiente', motivo_rechazo = NULL"

        fila = con.execute(
            f"UPDATE pois SET {asignaciones}, actualizado_en = now() WHERE usuario = %s RETURNING *",
            [*serializados.values(), usuario],
        ).fetchone()
    return dict(fila)


def registrar_visita(poi_id: int, tipo: str) -> None:
    """Suma uno al contador del dia. No falla si el POI no existe: es
    telemetria disparada desde la app, y romper una pantalla porque no se pudo
    contar un click seria peor que perder el dato."""
    if tipo not in TIPOS_VISITA:
        return
    inicializar_db()
    with conexion() as con:
        con.execute(
            """
            INSERT INTO poi_visitas (poi_id, fecha, tipo, cantidad)
            VALUES (%s, CURRENT_DATE, %s, 1)
            ON CONFLICT (poi_id, fecha, tipo) DO UPDATE SET cantidad = poi_visitas.cantidad + 1
            """,
            (poi_id, tipo),
        )


def metricas(poi_id: int, dias: int = 30) -> dict:
    """Interes recibido en los ultimos `dias`.

    Devuelve el total por tipo (las tarjetas de arriba) y la serie diaria (el
    grafico), con los dias sin visitas en cero: si se devolvieran solo los
    dias con datos, el grafico dibujaria una linea continua entre dos fines de
    semana y pareceria que hubo trafico un martes que no lo hubo.
    """
    inicializar_db()
    desde = date.today() - timedelta(days=dias - 1)
    with conexion() as con:
        filas = con.execute(
            "SELECT fecha, tipo, cantidad FROM poi_visitas "
            "WHERE poi_id = %s AND fecha >= %s ORDER BY fecha",
            (poi_id, desde),
        ).fetchall()

    totales = {tipo: 0 for tipo in sorted(TIPOS_VISITA)}
    por_dia: dict[str, dict] = {
        (desde + timedelta(days=i)).isoformat(): {"fecha": (desde + timedelta(days=i)).isoformat(),
                                                  **{t: 0 for t in sorted(TIPOS_VISITA)}}
        for i in range(dias)
    }

    for fila in filas:
        if fila["tipo"] not in totales:
            continue
        totales[fila["tipo"]] += fila["cantidad"]
        clave = fila["fecha"].isoformat()
        if clave in por_dia:
            por_dia[clave][fila["tipo"]] = fila["cantidad"]

    return {"dias": dias, "totales": totales, "serie": list(por_dia.values())}


def listar_para_moderar(estado: str = "pendiente") -> list[dict]:
    inicializar_db()
    if estado not in ESTADOS_VALIDOS:
        estado = "pendiente"
    with conexion() as con:
        filas = con.execute(
            "SELECT p.*, u.email AS email_dueno FROM pois p "
            "LEFT JOIN usuarios u ON u.usuario = p.usuario "
            "WHERE p.estado = %s ORDER BY p.creado_en",
            (estado,),
        ).fetchall()
    return [dict(f) for f in filas]


def moderar(poi_id: int, aprobado: bool, motivo: Optional[str] = None) -> Optional[dict]:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "UPDATE pois SET estado = %s, motivo_rechazo = %s, actualizado_en = now() "
            "WHERE id = %s RETURNING *",
            ("aprobado" if aprobado else "rechazado", None if aprobado else motivo, poi_id),
        ).fetchone()
    return dict(fila) if fila else None
