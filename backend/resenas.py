"""Puntajes y comentarios de los nautas sobre los POIs.

Una reseña por persona por lugar (UNIQUE en db.py): volver a puntuar edita la
que ya habia en vez de sumar otra. Sin eso, el dueño de un parador podria
dejarse veinte reseñas de cinco estrellas y el promedio no diria nada.
"""
from typing import Optional

from db import conexion, inicializar_db


def listar(poi_id: int) -> list[dict]:
    """Las reseñas de un lugar, de la mas nueva a la mas vieja.

    Devuelve `nombre_completo` del autor y no el nombre de usuario: el usuario
    es una credencial de login, no algo para mostrar al lado de un comentario
    publico.
    """
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT r.id, r.puntaje, r.comentario, r.creado_en, r.actualizado_en, "
            "r.usuario, u.nombre_completo AS autor "
            "FROM poi_resenas r JOIN usuarios u ON u.usuario = r.usuario "
            "WHERE r.poi_id = %s ORDER BY r.creado_en DESC",
            (poi_id,),
        ).fetchall()
    return [dict(f) for f in filas]


def guardar(poi_id: int, usuario: str, puntaje: int, comentario: Optional[str] = None) -> dict:
    """Crea o actualiza la reseña de ese usuario para ese lugar."""
    if not isinstance(puntaje, int) or not 1 <= puntaje <= 5:
        raise ValueError("El puntaje tiene que ser un número del 1 al 5.")

    inicializar_db()
    with conexion() as con:
        existe = con.execute("SELECT 1 FROM pois WHERE id = %s AND estado = 'aprobado'", (poi_id,)).fetchone()
        if not existe:
            raise ValueError("El lugar no existe (o todavía no está publicado).")

        # El dueño no puede reseñar su propio comercio. Es la version minima de
        # moderacion que vale la pena: no evita que se lo puntuen amigos, pero
        # si el caso obvio.
        propio = con.execute(
            "SELECT 1 FROM pois WHERE id = %s AND usuario = %s", (poi_id, usuario)
        ).fetchone()
        if propio:
            raise ValueError("No podés reseñar tu propio comercio.")

        fila = con.execute(
            """
            INSERT INTO poi_resenas (poi_id, usuario, puntaje, comentario)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (poi_id, usuario) DO UPDATE
              SET puntaje = EXCLUDED.puntaje,
                  comentario = EXCLUDED.comentario,
                  actualizado_en = now()
            RETURNING *
            """,
            (poi_id, usuario, puntaje, (comentario or "").strip() or None),
        ).fetchone()
    return dict(fila)


def eliminar(poi_id: int, usuario: str) -> bool:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "DELETE FROM poi_resenas WHERE poi_id = %s AND usuario = %s RETURNING id",
            (poi_id, usuario),
        ).fetchone()
    return fila is not None


def mias(usuario: str) -> list[dict]:
    """Las reseñas que escribio un usuario, con el nombre del lugar. Es la
    pantalla "mis reseñas" del perfil en la app."""
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT r.id, r.poi_id, r.puntaje, r.comentario, r.creado_en, "
            "p.nombre AS poi_nombre, p.tipo AS poi_tipo "
            "FROM poi_resenas r JOIN pois p ON p.id = r.poi_id "
            "WHERE r.usuario = %s ORDER BY r.creado_en DESC",
            (usuario,),
        ).fetchall()
    return [dict(f) for f in filas]


def de_mi_comercio(usuario: str) -> list[dict]:
    """Lo que dicen del comercio de esa cuenta. Lo consume el panel del
    comerciante, que no conoce el id de su propio POI."""
    inicializar_db()
    with conexion() as con:
        poi = con.execute("SELECT id FROM pois WHERE usuario = %s", (usuario,)).fetchone()
    return listar(poi["id"]) if poi else []
