"""Backend API: autenticacion + datasets de data_pipeline/ + sirve el frontend.

Uso (desde algorio/, con el entorno virtual activado):
    uvicorn backend.main:app --reload
Despues abrir http://127.0.0.1:8000 en el navegador. Antes hay que crear un
usuario con `python -m backend.crear_usuario` (no hay alta de usuarios desde
el frontend a proposito).
"""
import os
from contextlib import asynccontextmanager
import secrets
from pathlib import Path
from typing import Optional

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.sessions import SessionMiddleware

from db import cerrar_pool, inicializar_db

from backend import activos, ais, auth, ayuda, clima, datos, pois, reportes, resenas, rutas, suscripciones
from backend import tokens, tramos_navegacion

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
# El frontend es una app de React (Vite); esto sirve el build de produccion,
# no el codigo fuente. Generarlo con: cd frontend && npm install && npm run build.
# En produccion (Render) el backend se despliega solo, sin este build al lado
# (el frontend va aparte, a Vercel) - el mount de abajo se salta si no existe.
DIR_FRONTEND = RAIZ_PROYECTO / "frontend" / "dist"
ARCHIVO_SECRETO = Path(__file__).resolve().parent / ".session_secret"


def _obtener_o_crear_secreto() -> str:
    """Clave para firmar la cookie de sesion. En produccion (Render) viene de
    la env var SESSION_SECRET, que persiste entre deploys. En desarrollo
    local, a falta de esa env var, se genera una sola vez y se guarda en
    disco: si se regenerara en cada arranque del servidor, se cerraria la
    sesion de todo el mundo cada vez que se reinicia."""
    desde_entorno = os.environ.get("SESSION_SECRET")
    if desde_entorno:
        return desde_entorno
    if ARCHIVO_SECRETO.exists():
        return ARCHIVO_SECRETO.read_text().strip()
    secreto = secrets.token_hex(32)
    ARCHIVO_SECRETO.write_text(secreto)
    return secreto


SECRETO_SESION = _obtener_o_crear_secreto()

# Origenes que pueden llamar a la API desde un navegador. La app movil no
# entra por aca (React Native no aplica CORS: no es un navegador), pero
# `expo start --web` si, y sirve para probarla en la compu.
#
# Lista explicita y no "*": con allow_credentials=True el comodin es invalido
# segun la especificacion y los navegadores lo rechazan.
ORIGENES_PERMITIDOS = [
    o.strip()
    for o in os.environ.get(
        "ORIGENES_CORS", "http://localhost:8081,http://localhost:19006,http://localhost:5173"
    ).split(",")
    if o.strip()
]

@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    """El esquema y el pool se preparan al arrancar, no en el primer request.

    `inicializar_db()` es idempotente y ahora se cachea por proceso (ver db.py),
    asi que corre una sola vez igual; hacerlo aca evita que ese segundo y pico
    se lo coma quien entre primero. Levantar el pool en el arranque hace lo
    mismo con el handshake de la primera conexion.

    Ninguno de los dos rompe el arranque si falla: si la base no esta
    disponible el backend igual tiene que levantar para poder responder (y para
    que Render no lo reinicie en loop). El error vuelve a aparecer, con su
    mensaje, en el primer request que necesite datos.
    """
    try:
        inicializar_db()
    except Exception as e:  # noqa: BLE001 — arrancar igual es lo que se busca
        print(f"AVISO: no se pudo preparar la base al arrancar: {e}")

    # El stream de trafico AIS: una sola conexion para todos los visitantes,
    # con la clave del lado del servidor (ver backend/ais.py). Sin
    # AISSTREAM_API_KEY no arranca nada y el mapa lo refleja.
    ais.arrancar()

    yield

    await ais.detener()
    cerrar_pool()


app = FastAPI(title="Algorio API", lifespan=ciclo_de_vida)
app.add_middleware(SessionMiddleware, secret_key=SECRETO_SESION, same_site="lax")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENES_PERMITIDOS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def usuario_actual(request: Request) -> dict:
    """Dependency que exige sesion iniciada.

    Acepta las dos formas de autenticarse que tiene el producto: el token
    Bearer que manda la app movil y la cookie de sesion que usa la web. El
    token va primero porque es explicito — si un cliente se molesto en
    mandarlo, es con el que quiere identificarse.

    Las dos ramas devuelven lo mismo, asi que ningun endpoint necesita saber
    por cual entro el usuario.
    """
    autorizacion = request.headers.get("Authorization", "")
    if autorizacion.startswith("Bearer "):
        nombre = tokens.leer(autorizacion[7:].strip(), SECRETO_SESION)
        if not nombre:
            raise HTTPException(status_code=401, detail="Tu sesión venció. Iniciá sesión de nuevo.")
        perfil = auth.obtener_usuario(nombre)
        if perfil is None:
            # El token es valido pero la cuenta ya no existe (se dio de baja).
            raise HTTPException(status_code=401, detail="La cuenta ya no existe.")
        return {"usuario": perfil["usuario"], "nombre_completo": perfil["nombre_completo"]}

    usuario = request.session.get("usuario")
    if not usuario:
        raise HTTPException(status_code=401, detail="No hay sesion iniciada.")
    return {"usuario": usuario, "nombre_completo": request.session.get("nombre_completo")}


def usuario_con_rol(*roles_permitidos: str):
    """Fabrica de dependencies: exige que la cuenta tenga uno de esos roles.

    Es el limite entre las tres experiencias del producto. Va aparte de
    `exige_seccion` (que mira el plan) porque son cosas distintas: el rol dice
    a que producto pertenece la cuenta, el plan dice cuanto de ese producto
    pago.
    """
    def dependencia(usuario: dict = Depends(usuario_actual)) -> dict:
        perfil = auth.obtener_usuario(usuario["usuario"])
        if perfil is None or perfil.get("rol") not in roles_permitidos:
            raise HTTPException(
                status_code=403, detail="Tu tipo de cuenta no tiene acceso a esta sección."
            )
        return {**usuario, "rol": perfil["rol"], "es_admin": perfil.get("es_admin", False)}

    return dependencia


def usuario_admin(usuario: dict = Depends(usuario_actual)) -> dict:
    """Dependency para la cola de moderacion de POIs."""
    perfil = auth.obtener_usuario(usuario["usuario"])
    if perfil is None or not perfil.get("es_admin"):
        raise HTTPException(status_code=403, detail="Necesitás permisos de administrador.")
    return usuario


def usuario_con_suscripcion(usuario: dict = Depends(usuario_actual)) -> dict:
    """Dependency que ademas exige suscripcion vigente (o prueba gratis sin
    vencer). Se usa en los endpoints de datos; los de cuenta (perfil, logout,
    ayuda, estado de suscripcion) quedan accesibles aunque haya vencido, para
    que el usuario pueda ver que le pasa, escribirnos y suscribirse.

    Devuelve 402 (Payment Required) en vez de 401/403 para que el frontend
    distinga "no estas logueado" de "te falta pagar" y muestre la pantalla
    correcta."""
    if not suscripciones.tiene_acceso(usuario["usuario"]):
        raise HTTPException(status_code=402, detail="Tu prueba gratis venció. Suscribite para seguir usando AlgoRío.")
    return usuario


def exige_seccion(seccion: str):
    """Fabrica de dependencies: exige, ademas de sesion y suscripcion, que la
    plan de la cuenta habilite esa seccion.

    Devuelve 403 y no 402 a proposito. El 402 significa "se te vencio la
    prueba" y el frontend lo usa para mandar a la pantalla de suscripcion;
    esto es otra cosa: la cuenta esta al dia, pero su plan no incluye la
    seccion, y mandarla a esa pantalla seria confuso.

    Agrega "plan" al dict del usuario para que el endpoint no tenga que
    volver a consultarlo cuando ademas necesita chequear un tope.
    """
    def dependencia(usuario: dict = Depends(usuario_con_suscripcion)) -> dict:
        plan = suscripciones.plan_de(usuario["usuario"])
        if not suscripciones.habilita_seccion(plan, seccion):
            etiqueta = suscripciones.PLANES[plan]["etiqueta"]
            raise HTTPException(
                status_code=403,
                detail=f"Tu plan {etiqueta} no incluye esta sección.",
            )
        return {**usuario, "plan": plan}

    return dependencia


def _exigir_cupo(plan: str, recurso: str, cantidad_actual: int, singular: str) -> None:
    """Corta la creacion si el plan ya llego a su tope. 409 (y no 403) para
    que el frontend distinga "tu plan no llega hasta aca" de "llegaste al
    limite de lo que podes cargar con este plan"."""
    if not suscripciones.tope_alcanzado(plan, recurso, cantidad_actual):
        return
    tope = suscripciones.PLANES[plan][f"max_{recurso}"]
    etiqueta = suscripciones.PLANES[plan]["etiqueta"]
    raise HTTPException(
        status_code=409,
        detail=(
            f"El plan {etiqueta} permite hasta {tope} {recurso}. "
            f"Para cargar {singular} más, cambiá de plan."
        ),
    )


class CredencialesLogin(BaseModel):
    usuario: str
    password: str


class RegistroRequest(BaseModel):
    usuario: str
    email: EmailStr
    password: str
    # El plan que eligio en el formulario. Opcional para no romper a
    # ningun cliente viejo: si no viene, suscripciones.plan_valido() la baja
    # al plan por defecto en vez de fallar.
    plan: Optional[str] = None
    # Con que perfil se da de alta. Tambien opcional por lo mismo, y por lo
    # mismo el default lo decide auth.rol_valido(): 'naviera', que es lo que
    # era toda cuenta antes de que el producto se bifurcara.
    rol: Optional[str] = None
    # Solo para el rol recreativo (kayak, lancha, velero...). La app movil lo
    # manda en el onboarding; desde la web nunca viene.
    tipo_embarcacion: Optional[str] = None


class CredencialGoogle(BaseModel):
    credential: str  # ID token JWT que entrega Google Identity Services
    # Solo se usa si el token da de alta una cuenta nueva: el boton de Google
    # vive tanto en Registro (donde hay plan elegido) como en Login (donde
    # no). Si la cuenta ya existe, se ignora - el plan no se cambia por
    # volver a entrar.
    plan: Optional[str] = None
    rol: Optional[str] = None


class CambioPlan(BaseModel):
    plan: str


class AyudaRequest(BaseModel):
    mensaje: str


class PerfilActualizacion(BaseModel):
    nombre_completo: Optional[str] = None
    password_actual: Optional[str] = None
    password_nueva: Optional[str] = None
    unidad_nivel: Optional[str] = None
    unidad_caudal: Optional[str] = None
    tipo_embarcacion: Optional[str] = None


class CaracteristicasEmbarcacion(BaseModel):
    """Solo aplican cuando el activo es tipo 'embarcacion'; texto libre porque
    la tabla de referencia trae rangos ("65000-80000") o texto ("Segun linea
    de carga (SOLAS)") en varias columnas, no numeros limpios."""
    categoria_embarcacion: Optional[str] = None
    eslora_m: Optional[str] = None
    manga_m: Optional[str] = None
    puntal_m: Optional[str] = None
    calado_max_pies: Optional[str] = None
    borde_libre_min_m: Optional[str] = None
    dwt_capacidad_t: Optional[str] = None
    ton_por_pie: Optional[str] = None
    radar_apto_rio: Optional[str] = None


class ActivoEntrada(BaseModel):
    nombre: str
    tipo: str
    estacion_referencia: str
    umbral_minimo_m: Optional[float] = None
    umbral_maximo_m: Optional[float] = None
    alertas_email: bool = False
    caracteristicas_embarcacion: Optional[CaracteristicasEmbarcacion] = None


class ActivoActualizacion(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    estacion_referencia: Optional[str] = None
    umbral_minimo_m: Optional[float] = None
    umbral_maximo_m: Optional[float] = None
    alertas_email: Optional[bool] = None
    caracteristicas_embarcacion: Optional[CaracteristicasEmbarcacion] = None


class RutaEntrada(BaseModel):
    """`estaciones` va ordenada: el orden es el trayecto. `activo_id` es
    opcional (una ruta sin embarcacion muestra los niveles pero no calcula
    calado ni carga), igual que `profundidades_pies`, el diccionario
    {id_tramo: pies} con el que el usuario pisa la profundidad sugerida."""
    nombre: str
    estaciones: list[str]
    plantilla: Optional[str] = None
    activo_id: Optional[int] = None
    sentido: Optional[str] = None
    cantidad_barcazas: Optional[int] = None
    resguardo_quilla_pies: Optional[float] = None
    profundidades_pies: Optional[dict[str, float]] = None


class RutaActualizacion(BaseModel):
    nombre: Optional[str] = None
    estaciones: Optional[list[str]] = None
    plantilla: Optional[str] = None
    activo_id: Optional[int] = None
    sentido: Optional[str] = None
    cantidad_barcazas: Optional[int] = None
    resguardo_quilla_pies: Optional[float] = None
    profundidades_pies: Optional[dict[str, float]] = None


class ComercioEntrada(BaseModel):
    """La ficha que carga el comerciante. `estado` no esta y no puede estar:
    lo decide la moderacion, no el dueño (ver pois.CAMPOS_EDITABLES).

    horarios/menu/servicios/fotos van sin tipar por dentro a proposito: la
    forma de cada uno depende del rubro (un parador tiene platos, una cabaña
    tipos de habitacion, una lancha-taxi recorridos) y encorsetarlos en un
    esquema unico obligaria a migrar el backend cada vez que el panel agrega
    un campo.
    """
    tipo: str
    nombre: str
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    descripcion: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram: Optional[str] = None
    horarios: Optional[dict] = None
    menu: Optional[list] = None
    servicios: Optional[list] = None
    fotos: Optional[list] = None


class ComercioActualizacion(BaseModel):
    tipo: Optional[str] = None
    nombre: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    descripcion: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram: Optional[str] = None
    horarios: Optional[dict] = None
    menu: Optional[list] = None
    servicios: Optional[list] = None
    fotos: Optional[list] = None


class ResenaEntrada(BaseModel):
    puntaje: int = Field(..., ge=1, le=5)
    comentario: Optional[str] = None


class VisitaEntrada(BaseModel):
    tipo: str  # ficha | telefono | whatsapp | como_llegar


class RechazoEntrada(BaseModel):
    motivo: Optional[str] = None


class ReporteEntrada(BaseModel):
    """Un aviso del nauta sobre un punto del rio.

    `vence_en` no esta y no puede estar: lo calcula el backend a partir de
    `duracion_horas`, que es una de tres opciones cerradas. Si la fecha viniera
    de afuera, cualquiera podria dejar un reporte que no vence nunca.
    """
    tipo: str  # animal | banco_arena | arbol | basura | otro
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    severidad: str = "comentario"  # comentario | advertencia | alerta
    # Cual animal, cuando tipo == "animal". Texto libre corto.
    detalle: Optional[str] = None
    comentario: Optional[str] = None
    duracion_horas: int = reportes.DURACION_POR_DEFECTO


class RenovacionEntrada(BaseModel):
    duracion_horas: int = reportes.DURACION_POR_DEFECTO


def _iniciar_sesion(request: Request, usuario: dict) -> dict:
    """Deja la sesion abierta por los dos caminos y devuelve el perfil.

    Guarda la cookie (que es lo que usa la web) y ademas agrega `token` al
    cuerpo de la respuesta (que es lo que guarda la app movil en
    expo-secure-store). El cliente usa el que le sirve e ignora el otro.
    """
    request.session["usuario"] = usuario["usuario"]
    request.session["nombre_completo"] = usuario["nombre_completo"]
    return {**usuario, "token": tokens.firmar(usuario["usuario"], SECRETO_SESION)}


@app.post("/api/login")
def login(credenciales: CredencialesLogin, request: Request):
    usuario = auth.verificar_credenciales(credenciales.usuario, credenciales.password)
    if usuario is None:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    return _iniciar_sesion(request, usuario)


@app.post("/api/registro", status_code=201)
def registro(datos_registro: RegistroRequest, request: Request):
    if len(datos_registro.password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")

    rol = auth.rol_valido(datos_registro.rol)
    try:
        auth.crear_usuario(
            datos_registro.usuario,
            datos_registro.password,
            nombre_completo=datos_registro.usuario,
            email=datos_registro.email,
            rol=rol,
            tipo_embarcacion=datos_registro.tipo_embarcacion,
        )
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=400, detail="El usuario o el email ya estan registrados.")

    # La prueba se arranca aca, con el plan elegido, en vez de dejar que la
    # cree sola el primer /api/suscripcion: ahi no habria forma de saber que
    # plan habia pedido. El rol acota que planes son elegibles: un nauta no
    # puede pedir el plan de una naviera aunque lo mande en el cuerpo.
    suscripciones.iniciar_prueba(
        datos_registro.usuario, suscripciones.plan_valido(datos_registro.plan, rol)
    )

    return _iniciar_sesion(request, auth.obtener_usuario(datos_registro.usuario))


@app.post("/api/login/google")
def login_google(payload: CredencialGoogle, request: Request):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Falta configurar GOOGLE_CLIENT_ID en el servidor.")

    try:
        info = google_id_token.verify_oauth2_token(
            payload.credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Token de Google invalido.")

    email = info.get("email")
    if not email or not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="No se pudo verificar el email de la cuenta de Google.")

    usuario = auth.obtener_usuario_por_email(email)
    if usuario is None:
        rol = auth.rol_valido(payload.rol)
        usuario = auth.crear_usuario_google(
            email, info.get("name") or email.split("@")[0], rol=rol
        )
        suscripciones.iniciar_prueba(
            usuario["usuario"], suscripciones.plan_valido(payload.plan, rol)
        )

    return _iniciar_sesion(request, usuario)


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/perfil")
def obtener_perfil(usuario: dict = Depends(usuario_actual)):
    return auth.obtener_usuario(usuario["usuario"])


@app.put("/api/perfil")
def actualizar_perfil(
    cambios: PerfilActualizacion, request: Request, usuario: dict = Depends(usuario_actual)
):
    try:
        perfil = auth.actualizar_perfil(
            usuario["usuario"],
            nombre_completo=cambios.nombre_completo,
            password_actual=cambios.password_actual,
            password_nueva=cambios.password_nueva,
            unidad_nivel=cambios.unidad_nivel,
            unidad_caudal=cambios.unidad_caudal,
            tipo_embarcacion=cambios.tipo_embarcacion,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    request.session["nombre_completo"] = perfil["nombre_completo"]
    return perfil


@app.post("/api/ayuda", status_code=201)
def api_ayuda(payload: AyudaRequest, usuario: dict = Depends(usuario_actual)):
    """El mensaje queda guardado en la base incluso si el mail no sale (ver
    backend/ayuda.py), asi que esto no devuelve error por un fallo de envio:
    informa `enviado_por_mail` para que el frontend ajuste el texto que le
    muestra al usuario."""
    try:
        return ayuda.registrar_mensaje_ayuda(usuario["usuario"], payload.mensaje)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/planes")
def api_planes(rol: Optional[str] = None):
    """Catalogo de planes con sus precios. Sin sesion a proposito: lo consume
    la pantalla de registro, donde todavia no hay usuario.

    `rol` filtra el catalogo al perfil que se esta dando de alta: los planes
    de naviera no le sirven de nada a un parador. Sin el parametro devuelve
    todo, que es lo que esperan los clientes viejos.

    `dias_prueba` viaja junto al catalogo para que la pantalla pueda decir
    cuantos dias dura la prueba sin hardcodearlo: sale de la misma constante
    que usa el control de acceso, asi no pueden desincronizarse."""
    claves = suscripciones.planes_de_rol(rol) if rol else list(suscripciones.PLANES)
    return {
        "dias_prueba": suscripciones.DIAS_PRUEBA,
        "planes": [suscripciones.limites_de_plan(clave) for clave in claves],
    }


def _suscripcion_con_uso(nombre: str, estado: Optional[dict] = None) -> dict:
    """El estado de la suscripcion mas cuanto tiene cargado el usuario.

    Los dos contadores van aca y no dentro de suscripciones.py para que ese
    modulo no tenga que saber que existen los activos ni las rutas. Los usa la
    pantalla de Suscripcion para avisar, antes de confirmar, cuando el plan
    elegido deja los topes por debajo de lo que la cuenta ya tiene cargado.
    """
    return {
        **(estado or suscripciones.estado_de_suscripcion(nombre)),
        "activos_usados": activos.contar_activos(nombre),
        "rutas_usadas": rutas.contar_rutas(nombre),
    }


@app.get("/api/suscripcion")
def api_suscripcion(usuario: dict = Depends(usuario_actual)):
    """Estado de la suscripcion. Deliberadamente NO exige suscripcion
    vigente: es lo que el frontend consulta para saber que mostrar cuando
    justamente esta vencida."""
    return _suscripcion_con_uso(usuario["usuario"])


@app.post("/api/suscripcion/plan")
def api_cambiar_plan(entrada: CambioPlan, usuario: dict = Depends(usuario_actual)):
    """Cambia el plan de la cuenta.

    Tampoco exige suscripcion vigente: con la prueba vencida el usuario tiene
    que poder entrar a esta pantalla y cambiar de plan, que es justo lo que se
    le ofrece ahi."""
    try:
        estado = suscripciones.cambiar_plan(usuario["usuario"], entrada.plan)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _suscripcion_con_uso(usuario["usuario"], estado)


@app.get("/api/ina")
def api_ina(usuario: dict = Depends(usuario_con_suscripcion)):
    return datos.datos_ina()


@app.get("/api/yacyreta")
def api_yacyreta(usuario: dict = Depends(usuario_con_suscripcion)):
    return datos.datos_yacyreta()


@app.get("/api/prefectura-naval")
def api_prefectura_naval(usuario: dict = Depends(usuario_con_suscripcion)):
    return datos.datos_prefectura()


@app.get("/api/dashboard")
def api_dashboard(usuario: dict = Depends(usuario_con_suscripcion)):
    return datos.dashboard_historico()


@app.get("/api/alertas")
def api_alertas(usuario: dict = Depends(usuario_con_suscripcion)):
    return datos.alertas_activas()


@app.get("/api/estaciones-disponibles")
def api_estaciones_disponibles(usuario: dict = Depends(usuario_con_suscripcion)):
    """Estaciones conocidas (INA + Prefectura Naval) para elegir como
    'estacion de referencia' al cargar un activo."""
    return datos.estaciones_disponibles()


@app.get("/api/mapa-estaciones")
def api_mapa_estaciones(usuario: dict = Depends(usuario_con_suscripcion)):
    """Estaciones reales (INA + Prefectura Naval) con coordenadas conocidas,
    para el mapa interactivo. Reemplaza al mock del frontend."""
    return datos.mapa_estaciones()


@app.get("/api/activos")
def api_listar_activos(usuario: dict = Depends(exige_seccion("flota"))):
    # El mapa de estado se calcula una sola vez para toda la lista: recorre el
    # dataset completo, asi que pedirlo por activo multiplicaba ese costo por
    # la cantidad de activos del usuario.
    mapa_estado = datos.mapa_estado_estaciones()
    return [
        datos.estado_de_activo(a, mapa_estado)
        for a in activos.listar_activos(usuario["usuario"])
    ]


@app.post("/api/activos")
def api_crear_activo(entrada: ActivoEntrada, usuario: dict = Depends(exige_seccion("flota"))):
    _exigir_cupo(
        usuario["plan"], "activos",
        activos.contar_activos(usuario["usuario"]), "otra embarcación",
    )
    try:
        nuevo = activos.crear_activo(
            usuario["usuario"],
            nombre=entrada.nombre,
            tipo=entrada.tipo,
            estacion_referencia=entrada.estacion_referencia,
            umbral_minimo_m=entrada.umbral_minimo_m,
            umbral_maximo_m=entrada.umbral_maximo_m,
            alertas_email=entrada.alertas_email,
            caracteristicas_embarcacion=(
                entrada.caracteristicas_embarcacion.model_dump()
                if entrada.caracteristicas_embarcacion
                else None
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return datos.estado_de_activo(nuevo)


@app.put("/api/activos/{activo_id}")
def api_actualizar_activo(
    activo_id: int, cambios: ActivoActualizacion, usuario: dict = Depends(exige_seccion("flota"))
):
    datos_cambios = cambios.model_dump(exclude_unset=True)
    caracteristicas = datos_cambios.pop("caracteristicas_embarcacion", None)
    if caracteristicas:
        datos_cambios.update(caracteristicas)

    try:
        actualizado = activos.actualizar_activo(activo_id, usuario["usuario"], datos_cambios)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return datos.estado_de_activo(actualizado)


@app.delete("/api/activos/{activo_id}")
def api_eliminar_activo(activo_id: int, usuario: dict = Depends(exige_seccion("flota"))):
    if not activos.eliminar_activo(activo_id, usuario["usuario"]):
        raise HTTPException(status_code=404, detail="El activo no existe (o no pertenece a este usuario).")
    return {"ok": True}


def _calcular_rutas(usuario: str, solo_id: Optional[int] = None, recalcular: bool = False) -> list[dict]:
    """Devuelve las rutas del usuario con su analisis.

    Por defecto entrega la foto guardada, sin recalcular: la ruta es una
    evaluacion fechada y tiene que seguir diciendo lo mismo que cuando se
    genero el informe. Se recalcula solo al crear, al editar, al pedirlo
    explicitamente, o si la ruta todavia no tiene foto (guardada antes de
    que existiera esta columna).

    mapa_estado_estaciones() recorre el dataset completo, asi que se llama una
    sola vez y se reusa para todas las rutas que haya que recalcular.
    """
    guardadas = rutas.listar_rutas(usuario)
    if solo_id is not None:
        guardadas = [r for r in guardadas if r["id"] == solo_id]
    if not guardadas:
        return []

    a_recalcular = [r for r in guardadas if recalcular or not r.get("calculo")]
    if not a_recalcular:
        return [rutas.con_calculo_guardado(r) for r in guardadas]

    mapa_estado = datos.mapa_estado_estaciones()
    por_id = {a["id"]: a for a in activos.listar_activos(usuario)}
    ids_a_recalcular = {r["id"] for r in a_recalcular}
    return [
        rutas.calcular_y_guardar(ruta, por_id.get(ruta["activo_id"]), mapa_estado)
        if ruta["id"] in ids_a_recalcular
        else rutas.con_calculo_guardado(ruta)
        for ruta in guardadas
    ]


# Declarado antes que /api/rutas/{ruta_id} para que "plantillas" no se lea como
# un id de ruta.
@app.get("/api/rutas/plantillas")
def api_plantillas_rutas(usuario: dict = Depends(exige_seccion("rutas"))):
    """Las rutas principales precargadas (botones de ruta rápida) y la tabla de
    tramos con su profundidad sugerida, que el usuario puede pisar por ruta."""
    return {
        "plantillas": tramos_navegacion.plantillas_para_frontend(),
        "tramos": tramos_navegacion.TRAMOS,
        "estacion_a_tramo": tramos_navegacion.ESTACION_A_TRAMO,
    }


@app.get("/api/rutas")
def api_listar_rutas(usuario: dict = Depends(exige_seccion("rutas"))):
    return _calcular_rutas(usuario["usuario"])


@app.post("/api/rutas", status_code=201)
def api_crear_ruta(entrada: RutaEntrada, usuario: dict = Depends(exige_seccion("rutas"))):
    _exigir_cupo(usuario["plan"], "rutas", rutas.contar_rutas(usuario["usuario"]), "otra ruta")
    try:
        nueva = rutas.crear_ruta(usuario["usuario"], **entrada.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    calculadas = _calcular_rutas(usuario["usuario"], solo_id=nueva["id"], recalcular=True)
    return calculadas[0]


@app.put("/api/rutas/{ruta_id}")
def api_actualizar_ruta(
    ruta_id: int, cambios: RutaActualizacion, usuario: dict = Depends(exige_seccion("rutas"))
):
    try:
        rutas.actualizar_ruta(ruta_id, usuario["usuario"], cambios.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    # Editar recalcula siempre: si no, cambiar una estacion o la profundidad de
    # un tramo dejaria el trayecto nuevo con el analisis viejo al lado.
    calculadas = _calcular_rutas(usuario["usuario"], solo_id=ruta_id, recalcular=True)
    return calculadas[0]


@app.post("/api/rutas/{ruta_id}/recalcular")
def api_recalcular_ruta(ruta_id: int, usuario: dict = Depends(exige_seccion("rutas"))):
    """Vuelve a sacar la foto del analisis con los niveles de hoy y actualiza
    la fecha de calculo. Es la unica forma de mover una ruta ya guardada."""
    calculadas = _calcular_rutas(usuario["usuario"], solo_id=ruta_id, recalcular=True)
    if not calculadas:
        raise HTTPException(status_code=404, detail="La ruta no existe (o no pertenece a este usuario).")
    return calculadas[0]


@app.delete("/api/rutas/{ruta_id}")
def api_eliminar_ruta(ruta_id: int, usuario: dict = Depends(exige_seccion("rutas"))):
    if not rutas.eliminar_ruta(ruta_id, usuario["usuario"]):
        raise HTTPException(status_code=404, detail="La ruta no existe (o no pertenece a este usuario).")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Nauta recreativo (app movil) y comercios: POIs, reseñas y clima.
# ---------------------------------------------------------------------------


@app.get("/api/pois")
def api_listar_pois(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radio_km: Optional[float] = Query(default=None, gt=0, le=500),
    tipo: Optional[str] = None,
    usuario: dict = Depends(usuario_actual),
):
    """Los pines del mapa. Solo publicados: pois.listar_aprobados() nunca
    devuelve pendientes ni rechazados."""
    return pois.listar_aprobados(lat=lat, lon=lon, radio_km=radio_km, tipo=tipo)


@app.get("/api/pois/{poi_id}")
def api_obtener_poi(poi_id: int, usuario: dict = Depends(usuario_actual)):
    poi = pois.obtener(poi_id)
    if poi is None:
        raise HTTPException(status_code=404, detail="El lugar no existe o todavía no está publicado.")
    return {**poi, "resenas": resenas.listar(poi_id)}


@app.post("/api/pois/{poi_id}/visita", status_code=204)
def api_registrar_visita(
    poi_id: int, entrada: VisitaEntrada, usuario: dict = Depends(usuario_actual)
):
    """Telemetria de interes para el comerciante. Devuelve 204 siempre: es un
    contador disparado desde la app y no debe poder romper una pantalla."""
    pois.registrar_visita(poi_id, entrada.tipo)
    return None


@app.get("/api/pois/{poi_id}/resenas")
def api_listar_resenas(poi_id: int, usuario: dict = Depends(usuario_actual)):
    return resenas.listar(poi_id)


@app.post("/api/pois/{poi_id}/resenas", status_code=201)
def api_guardar_resena(
    poi_id: int, entrada: ResenaEntrada, usuario: dict = Depends(usuario_actual)
):
    try:
        return resenas.guardar(poi_id, usuario["usuario"], entrada.puntaje, entrada.comentario)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/pois/{poi_id}/resenas")
def api_eliminar_resena(poi_id: int, usuario: dict = Depends(usuario_actual)):
    if not resenas.eliminar(poi_id, usuario["usuario"]):
        raise HTTPException(status_code=404, detail="No tenés una reseña en este lugar.")
    return {"ok": True}


@app.get("/api/mis-resenas")
def api_mis_resenas(usuario: dict = Depends(usuario_actual)):
    return resenas.mias(usuario["usuario"])


@app.get("/api/reportes")
def api_listar_reportes(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radio_km: Optional[float] = Query(default=None, gt=0, le=500),
    tipo: Optional[str] = None,
    usuario: dict = Depends(usuario_actual),
):
    """Los avisos vigentes de otros nautas. Los vencidos no salen nunca."""
    return reportes.listar(lat=lat, lon=lon, radio_km=radio_km, tipo=tipo)


@app.post("/api/reportes", status_code=201)
def api_crear_reporte(entrada: ReporteEntrada, usuario: dict = Depends(usuario_actual)):
    """Cualquier cuenta puede reportar, sin pasar por moderacion.

    Es deliberado: un banco de arena avisado hoy y aprobado el martes no le
    sirve a nadie, porque el valor de este dato es que es de hace dos horas
    (ver backend/reportes.py).
    """
    try:
        return reportes.crear(
            usuario["usuario"],
            tipo=entrada.tipo,
            lat=entrada.lat,
            lon=entrada.lon,
            severidad=entrada.severidad,
            detalle=entrada.detalle,
            comentario=entrada.comentario,
            duracion_horas=entrada.duracion_horas,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/mis-reportes")
def api_mis_reportes(usuario: dict = Depends(usuario_actual)):
    """Incluye los vencidos, para poder renovarlos si lo reportado sigue ahi."""
    return reportes.mios(usuario["usuario"])


@app.post("/api/reportes/{reporte_id}/renovar")
def api_renovar_reporte(
    reporte_id: int, entrada: RenovacionEntrada, usuario: dict = Depends(usuario_actual)
):
    try:
        reporte = reportes.renovar(reporte_id, usuario["usuario"], entrada.duracion_horas)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if reporte is None:
        raise HTTPException(status_code=404, detail="El reporte no existe (o no es tuyo).")
    return reporte


@app.delete("/api/reportes/{reporte_id}")
def api_eliminar_reporte(reporte_id: int, usuario: dict = Depends(usuario_actual)):
    perfil = auth.obtener_usuario(usuario["usuario"])
    borrado = reportes.eliminar(
        reporte_id, usuario["usuario"], es_admin=bool((perfil or {}).get("es_admin"))
    )
    if not borrado:
        raise HTTPException(status_code=404, detail="El reporte no existe (o no es tuyo).")
    return {"ok": True}


@app.get("/api/nivel-rio")
def api_nivel_rio(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    usuario: dict = Depends(usuario_actual),
):
    """El nivel del rio en las estaciones, para el nauta y el comerciante.

    Es el mismo dato que alimenta el mapa de estaciones de las navieras
    (datos.mapa_estaciones), pero servido con `usuario_actual` y no con
    `usuario_con_suscripcion`: saber cuanto bajo el rio es informacion basica
    de seguridad para cualquiera que se meta al agua, no una funcion premium.
    Lo que si es del producto de navieras es cruzarlo con calado y rutas.

    Con lat/lon vienen ordenadas por cercania y con la distancia calculada, que
    es como las quiere ver alguien que esta parado en la costa.
    """
    estaciones = datos.mapa_estaciones()

    if lat is not None and lon is not None:
        for estacion in estaciones:
            estacion["distancia_km"] = round(
                pois.distancia_km(lat, lon, estacion["lat"], estacion["lon"]), 1
            )
        estaciones.sort(key=lambda e: e["distancia_km"])

    return estaciones


@app.get("/api/embarcaciones")
def api_embarcaciones(usuario: dict = Depends(usuario_actual)):
    """Los barcos que estan ahora en el tramo de Rosario, para saber cuando
    cruzar. Lee del diccionario en memoria que mantiene backend/ais.py: no
    consulta nada afuera, asi que responde en microsegundos y el mapa la puede
    pedir cada pocos segundos sin costo."""
    return ais.estado()


@app.get("/api/clima")
def api_clima(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    usuario: dict = Depends(usuario_actual),
):
    """Viento, rafagas y pronostico, mas el veredicto de si el rio esta picado
    para la embarcacion de este usuario (ver backend/clima.py)."""
    perfil = auth.obtener_usuario(usuario["usuario"])
    try:
        return clima.obtener(lat, lon, (perfil or {}).get("tipo_embarcacion"))
    except RuntimeError as e:
        # 503 y no 500: el backend esta bien, el que no contesta es Open-Meteo.
        raise HTTPException(status_code=503, detail=str(e))


# --- Panel del comerciante -------------------------------------------------


@app.get("/api/mi-comercio")
def api_mi_comercio(usuario: dict = Depends(usuario_con_rol("comercio"))):
    """La ficha de esta cuenta, en cualquier estado. Devuelve null (y no 404)
    cuando todavia no cargo nada: "no tengo comercio" es un estado normal del
    panel, el que dispara el asistente de alta."""
    return pois.obtener_de_usuario(usuario["usuario"])


@app.post("/api/mi-comercio", status_code=201)
def api_crear_mi_comercio(
    entrada: ComercioEntrada, usuario: dict = Depends(usuario_con_rol("comercio"))
):
    if pois.obtener_de_usuario(usuario["usuario"]) is not None:
        raise HTTPException(status_code=409, detail="Esta cuenta ya tiene un comercio cargado.")
    try:
        return pois.crear(usuario["usuario"], entrada.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/mi-comercio")
def api_actualizar_mi_comercio(
    cambios: ComercioActualizacion, usuario: dict = Depends(usuario_con_rol("comercio"))
):
    try:
        return pois.actualizar(usuario["usuario"], cambios.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/mi-comercio/metricas")
def api_metricas_mi_comercio(
    dias: int = Query(default=30, ge=1, le=365),
    usuario: dict = Depends(usuario_con_rol("comercio")),
):
    poi = pois.obtener_de_usuario(usuario["usuario"])
    if poi is None:
        raise HTTPException(status_code=404, detail="Todavía no cargaste tu comercio.")
    return pois.metricas(poi["id"], dias)


@app.get("/api/mi-comercio/resenas")
def api_resenas_mi_comercio(usuario: dict = Depends(usuario_con_rol("comercio"))):
    return resenas.de_mi_comercio(usuario["usuario"])


# --- Moderacion ------------------------------------------------------------


@app.get("/api/admin/pois")
def api_pois_a_moderar(estado: str = "pendiente", usuario: dict = Depends(usuario_admin)):
    return pois.listar_para_moderar(estado)


@app.post("/api/admin/pois/{poi_id}/aprobar")
def api_aprobar_poi(poi_id: int, usuario: dict = Depends(usuario_admin)):
    poi = pois.moderar(poi_id, aprobado=True)
    if poi is None:
        raise HTTPException(status_code=404, detail="El lugar no existe.")
    return poi


@app.post("/api/admin/pois/{poi_id}/rechazar")
def api_rechazar_poi(
    poi_id: int, entrada: RechazoEntrada, usuario: dict = Depends(usuario_admin)
):
    poi = pois.moderar(poi_id, aprobado=False, motivo=entrada.motivo)
    if poi is None:
        raise HTTPException(status_code=404, detail="El lugar no existe.")
    return poi


# Se monta al final y en "/": las rutas /api/* de arriba, al estar declaradas
# antes, tienen prioridad. Cualquier otra ruta sirve el build de React (index.html,
# JS, CSS con hash) desde el mismo proceso, sin CORS. El frontend decide si
# muestra el login o el dashboard llamando a /api/perfil.
# Condicional: en produccion el frontend se despliega aparte (Vercel) y este
# directorio no existe en el backend.
if DIR_FRONTEND.exists():
    app.mount("/", StaticFiles(directory=DIR_FRONTEND, html=True), name="frontend")
