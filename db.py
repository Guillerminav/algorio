"""Conexion compartida a Postgres (Neon), usada por backend/ y data_pipeline/.

Reemplaza al SQLite local (backend/usuarios.db) y a los CSV de data/: todo
lo que antes eran archivos en disco ahora vive en la misma base Postgres,
necesario porque Vercel/Render corren con filesystem efimero.
"""
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")


@contextmanager
def conexion() -> Iterator[psycopg.Connection]:
    if not DATABASE_URL:
        raise RuntimeError("Falta DATABASE_URL en el entorno (ver .env.example).")
    con = psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True)
    try:
        yield con
    finally:
        con.close()


def inicializar_db() -> None:
    with conexion() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS usuarios (
                usuario TEXT PRIMARY KEY,
                nombre_completo TEXT NOT NULL,
                salt TEXT,
                password_hash TEXT,
                unidad_nivel TEXT NOT NULL DEFAULT 'm',
                unidad_caudal TEXT NOT NULL DEFAULT 'm3s'
            )
            """
        )
        # salt/password_hash nullable: una cuenta creada con "Continuar con
        # Google" no tiene contraseña local. Migracion para tablas ya
        # existentes (creadas cuando estas columnas eran NOT NULL).
        con.execute("ALTER TABLE usuarios ALTER COLUMN salt DROP NOT NULL")
        con.execute("ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL")
        con.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT")
        # Indice unico parcial (no "UNIQUE" en la columna): permite muchas
        # cuentas viejas sin email (NULL) sin que colisionen entre si.
        con.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key ON usuarios (email) WHERE email IS NOT NULL"
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS activos (
                id SERIAL PRIMARY KEY,
                usuario TEXT NOT NULL REFERENCES usuarios (usuario),
                nombre TEXT NOT NULL,
                tipo TEXT NOT NULL,
                estacion_referencia TEXT NOT NULL,
                umbral_alerta_m DOUBLE PRECISION,
                umbral_evacuacion_m DOUBLE PRECISION,
                creado_en TEXT NOT NULL
            )
            """
        )
        # Caracteristicas de embarcacion (solo aplican cuando activos.tipo =
        # 'embarcacion'; texto libre porque la tabla de referencia trae rangos
        # o texto en vez de numeros limpios, ver frontend/src/embarcaciones.js).
        for columna in (
            "categoria_embarcacion", "eslora_m", "manga_m", "puntal_m",
            "calado_max_pies", "borde_libre_min_m", "dwt_capacidad_t",
            "ton_por_pie", "radar_apto_rio",
        ):
            con.execute(f"ALTER TABLE activos ADD COLUMN IF NOT EXISTS {columna} TEXT")

        con.execute(
            """
            CREATE TABLE IF NOT EXISTS mediciones_fuente (
                id BIGSERIAL PRIMARY KEY,
                fuente TEXT NOT NULL,
                clave_dedup TEXT NOT NULL,
                datos JSONB NOT NULL,
                fecha_extraccion TIMESTAMPTZ NOT NULL,
                url_origen TEXT,
                UNIQUE (fuente, clave_dedup)
            )
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS historico (
                fuente TEXT NOT NULL,
                fecha_boletin TEXT NOT NULL,
                estacion TEXT NOT NULL DEFAULT '',
                variable TEXT NOT NULL,
                valor TEXT,
                fecha_extraccion TIMESTAMPTZ,
                url_origen TEXT,
                UNIQUE (fuente, fecha_boletin, estacion, variable)
            )
            """
        )
