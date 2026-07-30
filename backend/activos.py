"""CRUD de "activos" (embarcaciones, dragas, muelles o tramos de interes que
un usuario guarda una sola vez para no tener que re-ingresar la estacion de
referencia y su umbral propio en cada consulta).
"""
from datetime import datetime
from typing import Optional

from db import conexion, inicializar_db

TIPOS_VALIDOS = {"embarcacion", "draga", "muelle", "tramo"}

# Caracteristicas de la embarcacion (solo tienen sentido cuando tipo ==
# "embarcacion"; se guardan como texto libre, editable, ver frontend/js/embarcaciones.js).
CAMPOS_EMBARCACION = [
    "categoria_embarcacion", "eslora_m", "manga_m", "puntal_m",
    "calado_max_pies", "borde_libre_min_m", "dwt_capacidad_t",
    "ton_por_pie", "radar_apto_rio",
]


def _fila_a_dict(fila) -> dict:
    return dict(fila)


def listar_activos(usuario: str) -> list[dict]:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT * FROM activos WHERE usuario = %s ORDER BY creado_en", (usuario,)
        ).fetchall()
    return [_fila_a_dict(f) for f in filas]


def obtener_activo(activo_id: int, usuario: str) -> Optional[dict]:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT * FROM activos WHERE id = %s AND usuario = %s", (activo_id, usuario)
        ).fetchone()
    return _fila_a_dict(fila) if fila else None


def crear_activo(
    usuario: str,
    nombre: str,
    tipo: str,
    estacion_referencia: str,
    umbral_minimo_m: Optional[float] = None,
    umbral_maximo_m: Optional[float] = None,
    caracteristicas_embarcacion: Optional[dict] = None,
) -> dict:
    if tipo not in TIPOS_VALIDOS:
        raise ValueError(f"tipo debe ser uno de {TIPOS_VALIDOS}.")
    if not nombre or not estacion_referencia:
        raise ValueError("nombre y estacion_referencia son obligatorios.")

    caracteristicas_embarcacion = caracteristicas_embarcacion or {}
    columnas = ["usuario", "nombre", "tipo", "estacion_referencia", "umbral_minimo_m", "umbral_maximo_m", "creado_en"]
    valores = [
        usuario, nombre, tipo, estacion_referencia, umbral_minimo_m, umbral_maximo_m,
        datetime.now().isoformat(timespec="seconds"),
    ]
    for campo in CAMPOS_EMBARCACION:
        columnas.append(campo)
        valores.append(caracteristicas_embarcacion.get(campo))

    inicializar_db()
    with conexion() as con:
        marcadores = ", ".join("%s" for _ in valores)
        cursor = con.execute(
            f"INSERT INTO activos ({', '.join(columnas)}) VALUES ({marcadores}) RETURNING id", valores
        )
        activo_id = cursor.fetchone()["id"]
    return obtener_activo(activo_id, usuario)


def actualizar_activo(activo_id: int, usuario: str, cambios: dict) -> dict:
    existente = obtener_activo(activo_id, usuario)
    if existente is None:
        raise ValueError("El activo no existe (o no pertenece a este usuario).")

    if cambios.get("tipo") and cambios["tipo"] not in TIPOS_VALIDOS:
        raise ValueError(f"tipo debe ser uno de {TIPOS_VALIDOS}.")

    campos_editables = [
        "nombre", "tipo", "estacion_referencia", "umbral_minimo_m", "umbral_maximo_m",
        *CAMPOS_EMBARCACION,
    ]
    sets, valores = [], []
    for campo in campos_editables:
        if campo in cambios:
            sets.append(f"{campo} = %s")
            valores.append(cambios[campo])

    if sets:
        valores.extend([activo_id, usuario])
        with conexion() as con:
            con.execute(f"UPDATE activos SET {', '.join(sets)} WHERE id = %s AND usuario = %s", valores)

    return obtener_activo(activo_id, usuario)


def eliminar_activo(activo_id: int, usuario: str) -> bool:
    inicializar_db()
    with conexion() as con:
        cursor = con.execute("DELETE FROM activos WHERE id = %s AND usuario = %s", (activo_id, usuario))
    return cursor.rowcount > 0
