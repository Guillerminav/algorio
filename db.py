"""Conexion compartida a Postgres (Neon), usada por backend/ y data_pipeline/.

Reemplaza al SQLite local (backend/usuarios.db) y a los CSV de data/: todo
lo que antes eran archivos en disco ahora vive en la misma base Postgres,
necesario porque Vercel/Render corren con filesystem efimero.
"""
import atexit
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")

# Pool de conexiones.
#
# Antes cada `conexion()` abria una conexion nueva a Neon y la cerraba al
# salir: TCP + TLS + autenticacion cada vez. Medido contra la base real, eso
# son ~330 ms POR USO, y un solo request del backend abre varias (resolver la
# sesion, chequear la suscripcion, la consulta del endpoint). Reusando una
# conexion ya abierta, la misma consulta baja a ~45 ms.
#
# Se crea perezosamente y no al importar el modulo porque `db` lo importan
# tambien los scripts sueltos y el pipeline, que a veces no tocan la base.
_pool: ConnectionPool | None = None
_candado_pool = threading.Lock()

# `max_size` conservador a proposito: el backend corre en el plan free de
# Render (poca memoria) y Neon tambien limita conexiones. Ocho alcanzan de
# sobra para el trafico de hoy y dejan margen para el pipeline, que corre
# aparte y abre las suyas.
TAMANO_MAX_POOL = int(os.environ.get("POOL_MAX", "8"))


def _obtener_pool() -> ConnectionPool:
    global _pool
    if _pool is not None:
        return _pool
    with _candado_pool:
        if _pool is None:
            if not DATABASE_URL:
                raise RuntimeError("Falta DATABASE_URL en el entorno (ver .env.example).")
            pool = ConnectionPool(
                DATABASE_URL,
                min_size=1,
                max_size=TAMANO_MAX_POOL,
                kwargs={"row_factory": dict_row, "autocommit": True},
                # Neon cierra las conexiones ociosas por su cuenta. Sin este
                # chequeo, el pool entregaria una conexion muerta y el request
                # fallaria con "connection is closed" en vez de reconectar.
                check=ConnectionPool.check_connection,
                max_idle=120,
                open=False,
            )
            pool.open()
            # Cerrarlo a mano al terminar el proceso. Sin esto, el __del__ del
            # pool intenta unir sus hilos ya en el apagado del interprete y
            # Python 3.14 lo rechaza (PythonFinalizationError): los scripts de
            # una sola corrida —el CLI de usuarios, el pipeline— terminaban
            # escupiendo un traceback aunque el trabajo hubiera salido bien.
            atexit.register(cerrar_pool)
            _pool = pool
    return _pool


@contextmanager
def conexion() -> Iterator[psycopg.Connection]:
    """Una conexion del pool. La firma es la de siempre: los ~50 lugares que
    hacen `with conexion() as con:` no cambian, solo dejan de pagar el
    handshake."""
    with _obtener_pool().connection() as con:
        yield con


def cerrar_pool() -> None:
    """Para el apagado ordenado del backend y para los tests."""
    global _pool
    with _candado_pool:
        if _pool is not None:
            _pool.close()
            _pool = None


# El esquema se declara una sola vez por proceso.
#
# `inicializar_db()` corre 34 sentencias (CREATE TABLE IF NOT EXISTS, indices y
# ALTERs de migracion) y esta llamada desde 42 lugares del backend: estaba
# corriendo el esquema entero en CADA operacion. Medido contra la base real,
# 2.737 ms por llamada — o sea que abrir cualquier pantalla pagaba casi tres
# segundos de re-declarar tablas que ya existian.
#
# El candado importa: uvicorn atiende los endpoints sincronicos en un
# threadpool, asi que dos requests simultaneos pueden entrar juntos la primera
# vez. Sin el, los dos correrian el DDL completo.
_esquema_listo = False
_candado_esquema = threading.Lock()


def inicializar_db(forzar: bool = False) -> None:
    """Crea lo que falte del esquema. Idempotente y, desde la segunda llamada,
    gratis. `forzar=True` lo vuelve a correr (migraciones, tests)."""
    global _esquema_listo
    if _esquema_listo and not forzar:
        return
    with _candado_esquema:
        if _esquema_listo and not forzar:
            return
        _crear_esquema()
        _esquema_listo = True


def _crear_esquema() -> None:
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

        # Pedidos de "olvide mi contraseña".
        #
        # Se guarda el HASH del token y no el token: esta tabla es la llave de
        # cualquier cuenta que haya pedido recuperarla, y con los tokens en
        # claro alcanzaria con leer una fila para entrar. Con el hash, quien la
        # lea tiene lo mismo que tiene el servidor cuando valida — nada que
        # sirva para armar el mail.
        #
        # `usado_en` es lo que hace el token de un solo uso: un mail de
        # recuperacion queda para siempre en la casilla, y sin esto seguiria
        # abriendo la cuenta meses despues.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS recuperaciones_password (
                id SERIAL PRIMARY KEY,
                usuario TEXT NOT NULL REFERENCES usuarios (usuario) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                vence_en TIMESTAMPTZ NOT NULL,
                usado_en TIMESTAMPTZ
            )
            """
        )
        # Las dos consultas que hace el modulo: buscar por token al
        # restablecer, y mirar el ultimo pedido de una cuenta para no dejar
        # mandar cien mails seguidos.
        con.execute(
            "CREATE INDEX IF NOT EXISTS recuperaciones_usuario_idx "
            "ON recuperaciones_password (usuario, creado_en DESC)"
        )
        # Que contesto Resend. Sin esto, un mail rechazado se ve exactamente
        # igual que uno entregado —el endpoint contesta lo mismo siempre, a
        # proposito— y la unica forma de saber que paso es adivinar. Es el
        # mismo criterio que mensajes_ayuda.error_envio.
        con.execute(
            "ALTER TABLE recuperaciones_password ADD COLUMN IF NOT EXISTS error_envio TEXT"
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
                cruces JSONB,
                estado TEXT NOT NULL DEFAULT 'pendiente',
                motivo_rechazo TEXT,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        # El tablero de cruces de una lancha-taxi (ver backend/tablero.py): a
        # que hora cruza, cada cuanto, cuanto sale y si hoy va demorada.
        #
        # Va en la misma tabla y como JSONB por lo mismo que horarios y menu:
        # nunca se consulta un cruce suelto, siempre la ficha entera. Y va como
        # columna propia y no dentro de `menu` porque tiene su propia puerta de
        # escritura —la unica que no pasa por moderacion— y mezclarlos haria
        # que actualizar un precio de la carta y declarar una demora fueran la
        # misma operacion con las mismas reglas, que es justo lo que no son.
        con.execute("ALTER TABLE pois ADD COLUMN IF NOT EXISTS cruces JSONB")
        # El mapa siempre filtra por estado='aprobado' y despues por caja de
        # coordenadas; el indice compuesto cubre esa consulta entera.
        con.execute("CREATE INDEX IF NOT EXISTS pois_estado_idx ON pois (estado)")
        con.execute("CREATE INDEX IF NOT EXISTS pois_ubicacion_idx ON pois (estado, lat, lon)")
        # VARIOS comercios por cuenta, y de rubros distintos.
        #
        # Hasta acá era uno solo, con un indice UNICO parcial sobre `usuario`
        # (parcial para no contar los POIs sin dueño entre si). Se cae porque
        # dejo de ser cierto: quien tiene un parador y ademas alquila cabañas
        # es una sola persona con una sola cuenta, y obligarla a manejar dos
        # logins para dos pines es un limite del modelo, no del negocio.
        #
        # El resto del esquema ya soportaba esto sin tocar nada: fotos,
        # reseñas, visitas, reclamos y el tablero cuelgan de `poi_id`, no de la
        # cuenta. Lo unico que ataba era este indice — y las consultas de la
        # aplicacion, que asumian `fetchone()`.
        #
        # DROP explicito y no "IF NOT EXISTS" al reves: las bases que ya
        # existen lo tienen creado, y sin borrarlo el segundo comercio de una
        # cuenta falla con una violacion de unicidad.
        con.execute("DROP INDEX IF EXISTS pois_usuario_key")
        # Sigue haciendo falta un indice, ahora NO unico: el panel pide "los
        # comercios de esta cuenta" en cada pantalla, y son varias filas.
        con.execute(
            "CREATE INDEX IF NOT EXISTS pois_usuario_idx ON pois (usuario) WHERE usuario IS NOT NULL"
        )

        # Las fotos que sube el comerciante, cuando se guardan en la base.
        #
        # Los bytes en Postgres no son la primera opcion de nadie, pero aca es
        # la unica que funciona sin crear cuentas en ningun lado: el disco de
        # Render es efimero (se borra en cada deploy) y Vercel es solo el
        # frontend. Con el plan free de Neon —0,5 GB, de los que hoy se usan
        # 12 MB— entran unas 1.900 fotos de 250 KB, que para este producto es
        # de sobra.
        #
        # Si se configura Cloudinary (ver backend/almacen_fotos.py) las fotos
        # nuevas van alla y esta tabla deja de crecer, sin migrar nada: lo que
        # se guarda en `pois.fotos` es una URL en los dos casos.
        #
        # ON DELETE CASCADE: una foto sin su POI no se muestra en ningun lado.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS poi_fotos (
                id SERIAL PRIMARY KEY,
                poi_id INTEGER NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
                usuario TEXT REFERENCES usuarios (usuario) ON DELETE SET NULL,
                mime TEXT NOT NULL,
                datos BYTEA NOT NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        con.execute("CREATE INDEX IF NOT EXISTS poi_fotos_poi_idx ON poi_fotos (poi_id)")

        # "Ese lugar del mapa es mio": pedido de propiedad de un POI huerfano.
        #
        # Existe porque muchos pines del mapa no los cargo su dueño (sembrados,
        # importados, o de una cuenta que se dio de baja) y quedan con
        # `pois.usuario` en NULL. Obligar al dueño real a cargar todo de cero
        # deja al nauta con dos pines del mismo parador y al comerciante sin
        # las reseñas que su lugar ya tenia.
        #
        # Lo aprueba un admin y no se concede solo: entregar la edicion de un
        # POI es entregar el nombre, la ubicacion y el telefono que ve todo el
        # mundo (ver backend/reclamos.py).
        #
        # ON DELETE CASCADE en las dos puntas: un reclamo sin lugar o sin
        # solicitante no significa nada, a diferencia de un POI sin dueño.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS poi_reclamos (
                id SERIAL PRIMARY KEY,
                poi_id INTEGER NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
                usuario TEXT NOT NULL REFERENCES usuarios (usuario) ON DELETE CASCADE,
                mensaje TEXT,
                estado TEXT NOT NULL DEFAULT 'pendiente',
                motivo_rechazo TEXT,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
                resuelto_en TIMESTAMPTZ
            )
            """
        )
        # Un solo reclamo pendiente por cuenta. Parcial y no UNIQUE a secas:
        # despues de un rechazo se tiene que poder volver a pedir, sea el mismo
        # lugar u otro.
        con.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS poi_reclamos_pendiente_key "
            "ON poi_reclamos (usuario) WHERE estado = 'pendiente'"
        )
        # La cola del admin siempre filtra por estado.
        con.execute(
            "CREATE INDEX IF NOT EXISTS poi_reclamos_estado_idx ON poi_reclamos (estado, creado_en)"
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

        # El ultimo pronostico conocido de cada celda del rio.
        #
        # Es una CACHE, no un dato del producto, y aun asi vive en la base por
        # una razon concreta: el backend corre en el plan free de Render, que
        # apaga el proceso a los 15 minutos sin trafico. Con la cache solo en
        # memoria, cada vez que alguien abre la app despues de un rato el
        # proceso arranca vacio y TIENE que salir a Open-Meteo; si esa llamada
        # falla —y falla, que es el bug que esto arregla— no hay nada que
        # mostrar y la pantalla queda en error.
        #
        # Guardada aca, el proceso nuevo arranca sabiendo como venia el viento
        # hace media hora. Un pronostico viejo se puede mostrar diciendo que es
        # viejo; una pantalla de error no se puede arreglar con nada.
        #
        # `celda` es "lat,lon" ya redondeado a 0,1 grados (ver backend/clima.py:
        # _celda), que es la resolucion real del modelo de Open-Meteo.
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS clima_cache (
                celda TEXT PRIMARY KEY,
                lat DOUBLE PRECISION NOT NULL,
                lon DOUBLE PRECISION NOT NULL,
                datos JSONB NOT NULL,
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )

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
