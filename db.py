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
                unidad_caudal TEXT NOT NULL DEFAULT 'm3s',
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        # salt/password_hash nullable: una cuenta creada con "Continuar con
        # Google" no tiene contraseña local. Migracion para tablas ya
        # existentes (creadas cuando estas columnas eran NOT NULL).
        con.execute("ALTER TABLE usuarios ALTER COLUMN salt DROP NOT NULL")
        con.execute("ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL")
        con.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT")
        # Fecha de alta de la cuenta (base del sistema de suscripcion: desde
        # cuando corre una prueba gratis, antiguedad del usuario, etc.). Se
        # agrega en dos pasos a proposito: si se agregara con DEFAULT en el
        # mismo ALTER, Postgres rellenaria las cuentas ya existentes con la
        # fecha de la migracion, que seria un dato inventado. Asi, las cuentas
        # viejas quedan en NULL (no sabemos cuando se crearon) y solo las
        # nuevas traen fecha real.
        con.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ")
        con.execute("ALTER TABLE usuarios ALTER COLUMN creado_en SET DEFAULT now()")
        # Indice unico parcial (no "UNIQUE" en la columna): permite muchas
        # cuentas viejas sin email (NULL) sin que colisionen entre si.
        con.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key ON usuarios (email) WHERE email IS NOT NULL"
        )

        # Perfil de la cuenta. El producto se bifurca en tres experiencias sobre
        # esta misma base: 'recreativo' (nautas, app movil, gratis), 'comercio'
        # (paradores/alojamientos/lanchas-taxi, panel web) y 'naviera' (el
        # dashboard de datos hidrologicos que existia desde el principio).
        #
        # El default 'naviera' aplica tambien a las filas que ya estaban, y es
        # el dato correcto y no una suposicion: hasta hoy la unica manera de
        # tener cuenta era usar ese producto.
        con.execute(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'naviera'"
        )
        # Con que sale al rio el usuario recreativo. No es cosmetico: calibra
        # los umbrales de viento con los que la app le dice si el rio esta
        # picado (un kayak se complica con viento que a una lancha no la toca).
        # Uno solo por cuenta, editable; si algun dia hay que declarar varias,
        # se promueve a tabla.
        con.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_embarcacion TEXT")
        # Habilita la cola de moderacion de POIs. Se otorga a mano por SQL: son
        # un par de cuentas, no justifica una pantalla de administracion.
        con.execute(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT FALSE"
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS activos (
                id SERIAL PRIMARY KEY,
                usuario TEXT NOT NULL REFERENCES usuarios (usuario),
                nombre TEXT NOT NULL,
                tipo TEXT NOT NULL,
                estacion_referencia TEXT NOT NULL,
                umbral_minimo_m DOUBLE PRECISION,
                umbral_maximo_m DOUBLE PRECISION,
                creado_en TEXT NOT NULL
            )
            """
        )
        # Umbrales de "Mi flota": antes eran alerta/evacuacion (dos niveles del
        # lado de la crecida, copiando el criterio oficial de Prefectura); ahora
        # son minimo/maximo, que es lo que le sirve a un operador (bajante que
        # impide navegar / crecida). Migracion para tablas ya existentes: el
        # umbral de alerta viejo era de crecida, asi que pasa a ser el maximo;
        # el de evacuacion se descarta. Las columnas viejas se borran al final,
        # asi esto corre una sola vez (inicializar_db se llama en cada request).
        con.execute("ALTER TABLE activos ADD COLUMN IF NOT EXISTS umbral_minimo_m DOUBLE PRECISION")
        con.execute("ALTER TABLE activos ADD COLUMN IF NOT EXISTS umbral_maximo_m DOUBLE PRECISION")
        tiene_columnas_viejas = con.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'activos' AND column_name = 'umbral_alerta_m'"
        ).fetchone()
        if tiene_columnas_viejas:
            con.execute(
                "UPDATE activos SET umbral_maximo_m = umbral_alerta_m "
                "WHERE umbral_maximo_m IS NULL AND umbral_alerta_m IS NOT NULL"
            )
            con.execute("ALTER TABLE activos DROP COLUMN IF EXISTS umbral_alerta_m")
            con.execute("ALTER TABLE activos DROP COLUMN IF EXISTS umbral_evacuacion_m")
        # Caracteristicas de embarcacion (solo aplican cuando activos.tipo =
        # 'embarcacion'; texto libre porque la tabla de referencia trae rangos
        # o texto en vez de numeros limpios, ver frontend/src/embarcaciones.js).
        for columna in (
            "categoria_embarcacion", "eslora_m", "manga_m", "puntal_m",
            "calado_max_pies", "borde_libre_min_m", "dwt_capacidad_t",
            "ton_por_pie", "radar_apto_rio",
        ):
            con.execute(f"ALTER TABLE activos ADD COLUMN IF NOT EXISTS {columna} TEXT")

        # Aviso por mail cuando el nivel toca el umbral minimo o el maximo.
        # Arranca apagado: mandar mails no pedidos a los activos que ya estaban
        # cargados seria spam el dia que se despliega esto.
        con.execute(
            "ALTER TABLE activos ADD COLUMN IF NOT EXISTS alertas_email BOOLEAN NOT NULL DEFAULT FALSE"
        )

        # Ultimo aviso mandado por activo, para no repetir el mismo mail todos
        # los dias mientras dura la bajante. Una fila por activo (no un log):
        # se compara la severidad de hoy contra la guardada y solo se manda
        # cuando cambia. Cuando el activo vuelve a normal la fila se borra, y
        # asi el proximo cruce del umbral vuelve a avisar.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS alertas_notificadas (
                activo_id INTEGER PRIMARY KEY REFERENCES activos (id) ON DELETE CASCADE,
                severidad TEXT NOT NULL,
                nivel_m DOUBLE PRECISION,
                fecha_boletin TEXT,
                enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                error_envio TEXT
            )
            """
        )

        # Rutas guardadas (pantalla "Rutas"). `estaciones` es la lista ordenada
        # de estaciones del trayecto: el orden ES la ruta, por eso va como
        # JSONB y no como tabla hija (nunca se consulta una estacion suelta,
        # siempre la secuencia completa).
        #
        # activo_id es opcional y con ON DELETE SET NULL a proposito: se puede
        # guardar una ruta sin embarcacion (muestra los niveles del trayecto
        # pero no calcula calado ni carga), y borrar una embarcacion no debe
        # llevarse puestas las rutas que la usaban, solo degradarlas a ese modo.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS rutas (
                id SERIAL PRIMARY KEY,
                usuario TEXT NOT NULL REFERENCES usuarios (usuario),
                nombre TEXT NOT NULL,
                plantilla TEXT,
                activo_id INTEGER REFERENCES activos (id) ON DELETE SET NULL,
                estaciones JSONB NOT NULL,
                sentido TEXT,
                cantidad_barcazas INTEGER,
                resguardo_quilla_pies DOUBLE PRECISION,
                profundidades_pies JSONB,
                calculo JSONB,
                calculado_en TIMESTAMPTZ,
                creado_en TEXT NOT NULL
            )
            """
        )
        # Foto del analisis (calado por estacion, punto critico, carga) tal
        # como dio en el momento de crear o editar la ruta, con la hora exacta.
        # No se recalcula al listar a proposito: una ruta es una evaluacion
        # fechada, no un tablero en vivo. Si el nivel de una estacion cambiara
        # debajo de la ruta guardada, el punto critico se movaria solo y el
        # informe que el usuario ya mando por mail dejaria de coincidir con lo
        # que muestra la pantalla. Para traerla al dia esta el boton
        # "Recalcular", que vuelve a sacar la foto y actualiza la fecha.
        con.execute("ALTER TABLE rutas ADD COLUMN IF NOT EXISTS calculo JSONB")
        con.execute("ALTER TABLE rutas ADD COLUMN IF NOT EXISTS calculado_en TIMESTAMPTZ")
        # Profundidad garantizada propia por tramo, {id_tramo: pies}. La tabla
        # de backend/tramos_navegacion.py es solo un valor sugerido: el rio se
        # mueve (un banco nuevo, una draga parada, un paso que Prefectura
        # acaba de limitar) y el operador que esta ahi sabe antes que nosotros.
        # Lo que cargue aca pisa al sugerido en el calculo de esa ruta.
        con.execute("ALTER TABLE rutas ADD COLUMN IF NOT EXISTS profundidades_pies JSONB")

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
        # Suscripciones. `vigente_hasta` es el corazon del control de acceso:
        # en vez de preguntar "pago este mes?" se pregunta "hoy es anterior a
        # esa fecha?". Cada pago confirmado la empuja un mes; si el cobro
        # falla, la fecha no se mueve y el acceso caduca solo, sin cron.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS suscripciones (
                usuario TEXT PRIMARY KEY REFERENCES usuarios (usuario),
                estado TEXT NOT NULL,
                plan TEXT,
                proveedor_id TEXT,
                vigente_hasta TIMESTAMPTZ,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        # La columna `plan` existia sin usar desde antes de que hubiera
        # licencias. Las cuentas creadas hasta ahora la tienen en NULL y
        # vienen usando el producto entero sin topes, asi que se migran a
        # "capitan": normalizarlas al plan por defecto (el mas acotado) les
        # sacaria Mi flota y Rutas de un dia para el otro, con los activos y
        # las rutas que ya cargaron adentro.
        con.execute("UPDATE suscripciones SET plan = 'capitan' WHERE plan IS NULL")

        # Mensajes del boton "Ayuda". Se guardan siempre, ademas de mandarse
        # por mail: si el envio falla (falta la API key, se cayo el servicio),
        # el mensaje del usuario no se pierde.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS mensajes_ayuda (
                id BIGSERIAL PRIMARY KEY,
                usuario TEXT NOT NULL,
                mensaje TEXT NOT NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                enviado_por_mail BOOLEAN NOT NULL DEFAULT FALSE,
                error_envio TEXT
            )
            """
        )

        # Puntos de interes del rio: paradores, alojamientos y lanchas-taxi. Es
        # la tabla que ven las dos puntas del producto nuevo — el comerciante
        # carga la suya, el nauta las ve en el mapa.
        #
        # `usuario` es el dueño y va con ON DELETE SET NULL: si el comerciante
        # se da de baja, el lugar sigue existiendo en el mapa (queda huerfano y
        # se puede reasignar), en vez de desaparecerle al nauta que lo tenia
        # marcado.
        #
        # horarios/menu/servicios/fotos van como JSONB y no como tablas hijas
        # por la misma razon que rutas.estaciones: nunca se consulta un item de
        # menu suelto ni el horario de un martes, siempre la ficha entera.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS pois (
                id SERIAL PRIMARY KEY,
                usuario TEXT REFERENCES usuarios (usuario) ON DELETE SET NULL,
                tipo TEXT NOT NULL,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                lat DOUBLE PRECISION NOT NULL,
                lon DOUBLE PRECISION NOT NULL,
                telefono TEXT,
                whatsapp TEXT,
                instagram TEXT,
                horarios JSONB,
                menu JSONB,
                servicios JSONB,
                fotos JSONB,
                estado TEXT NOT NULL DEFAULT 'pendiente',
                motivo_rechazo TEXT,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        # El mapa siempre filtra por estado='aprobado' y despues por caja de
        # coordenadas; el indice compuesto cubre esa consulta entera.
        con.execute("CREATE INDEX IF NOT EXISTS pois_estado_idx ON pois (estado)")
        con.execute("CREATE INDEX IF NOT EXISTS pois_ubicacion_idx ON pois (estado, lat, lon)")
        # Un comercio por cuenta: el panel del comerciante es "mi comercio", no
        # una lista. Indice unico parcial para no contar los POIs sin dueño.
        con.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS pois_usuario_key ON pois (usuario) WHERE usuario IS NOT NULL"
        )

        # Puntaje y comentario del nauta sobre un lugar. UNIQUE (poi_id,
        # usuario): una reseña por persona por lugar, que se edita en vez de
        # acumularse. Sin esa restriccion, el dueño de un parador podria
        # inflarse el promedio dejandose veinte reseñas.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS poi_resenas (
                id SERIAL PRIMARY KEY,
                poi_id INTEGER NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
                usuario TEXT NOT NULL REFERENCES usuarios (usuario) ON DELETE CASCADE,
                puntaje SMALLINT NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
                comentario TEXT,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (poi_id, usuario)
            )
            """
        )

        # Lo que los nautas ven en el rio y avisan al resto: un yacare, un banco
        # de arena que se movio, un tronco a la deriva, basura.
        #
        # Son efimeros por diseño y esa es la diferencia con los POIs. Un banco
        # de arena se corre con la proxima creciente y un tronco se va con la
        # correntada: un aviso sin fecha de vencimiento se convierte, en dos
        # meses, en un mapa lleno de peligros que ya no estan, y eso es peor
        # que no tener nada — el nauta deja de creerle.
        #
        # `vence_en` es el corazon: en vez de preguntar "sigue vigente?" se
        # pregunta "hoy es anterior a esa fecha?". No hace falta ningun cron
        # para que desaparezcan; es el mismo criterio que suscripciones.
        #
        # `usuario` va con ON DELETE SET NULL: si alguien se da de baja, el
        # aviso de que hay un tronco en el paso sigue sirviendo a los demas.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS reportes (
                id SERIAL PRIMARY KEY,
                usuario TEXT REFERENCES usuarios (usuario) ON DELETE SET NULL,
                tipo TEXT NOT NULL,
                detalle TEXT,
                severidad TEXT NOT NULL DEFAULT 'comentario',
                comentario TEXT,
                lat DOUBLE PRECISION NOT NULL,
                lon DOUBLE PRECISION NOT NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                vence_en TIMESTAMPTZ NOT NULL
            )
            """
        )
        # El mapa siempre filtra por "no vencido" y despues por caja de
        # coordenadas; el indice compuesto cubre esa consulta entera.
        con.execute("CREATE INDEX IF NOT EXISTS reportes_vigencia_idx ON reportes (vence_en, lat, lon)")

        # Interes medido: cuanta gente abrio la ficha o toco "WhatsApp".
        # Agregado por dia y tipo (una fila por combinacion, con contador) y no
        # un log fila-por-click: es exactamente lo que muestra la pantalla del
        # comerciante ("50 personas te clickearon este fin de semana") y no
        # crece sin control con el uso.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS poi_visitas (
                poi_id INTEGER NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
                fecha DATE NOT NULL,
                tipo TEXT NOT NULL,
                cantidad INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (poi_id, fecha, tipo)
            )
            """
        )
