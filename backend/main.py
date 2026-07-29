"""Backend API: autenticacion + datasets de data_pipeline/ + sirve el frontend.

Uso (desde algorio/, con el entorno virtual activado):
    uvicorn backend.main:app --reload
Despues abrir http://127.0.0.1:8000 en el navegador. Antes hay que crear un
usuario con `python -m backend.crear_usuario` (no hay alta de usuarios desde
el frontend a proposito).
"""
import os
import secrets
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from backend import activos, auth, datos

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


app = FastAPI(title="Algorio API")
app.add_middleware(SessionMiddleware, secret_key=_obtener_o_crear_secreto(), same_site="lax")


def usuario_actual(request: Request) -> dict:
    """Dependency que exige sesion iniciada; se usa en todos los endpoints de datos."""
    usuario = request.session.get("usuario")
    if not usuario:
        raise HTTPException(status_code=401, detail="No hay sesion iniciada.")
    return {"usuario": usuario, "nombre_completo": request.session.get("nombre_completo")}


class CredencialesLogin(BaseModel):
    usuario: str
    password: str


class PerfilActualizacion(BaseModel):
    nombre_completo: Optional[str] = None
    password_actual: Optional[str] = None
    password_nueva: Optional[str] = None
    unidad_nivel: Optional[str] = None
    unidad_caudal: Optional[str] = None


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
    umbral_alerta_m: Optional[float] = None
    umbral_evacuacion_m: Optional[float] = None
    caracteristicas_embarcacion: Optional[CaracteristicasEmbarcacion] = None


class ActivoActualizacion(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    estacion_referencia: Optional[str] = None
    umbral_alerta_m: Optional[float] = None
    umbral_evacuacion_m: Optional[float] = None
    caracteristicas_embarcacion: Optional[CaracteristicasEmbarcacion] = None


@app.post("/api/login")
def login(credenciales: CredencialesLogin, request: Request):
    usuario = auth.verificar_credenciales(credenciales.usuario, credenciales.password)
    if usuario is None:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    request.session["usuario"] = usuario["usuario"]
    request.session["nombre_completo"] = usuario["nombre_completo"]
    return usuario


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
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    request.session["nombre_completo"] = perfil["nombre_completo"]
    return perfil


@app.get("/api/ina")
def api_ina(usuario: dict = Depends(usuario_actual)):
    return datos.datos_ina()


@app.get("/api/yacyreta")
def api_yacyreta(usuario: dict = Depends(usuario_actual)):
    return datos.datos_yacyreta()


@app.get("/api/prefectura-naval")
def api_prefectura_naval(usuario: dict = Depends(usuario_actual)):
    return datos.datos_prefectura()


@app.get("/api/dashboard")
def api_dashboard(usuario: dict = Depends(usuario_actual)):
    return datos.dashboard_estaciones()


@app.get("/api/alertas")
def api_alertas(usuario: dict = Depends(usuario_actual)):
    return datos.alertas_activas()


@app.get("/api/estaciones-disponibles")
def api_estaciones_disponibles(usuario: dict = Depends(usuario_actual)):
    """Estaciones conocidas (INA + Prefectura Naval) para elegir como
    'estacion de referencia' al cargar un activo."""
    return datos.estaciones_disponibles()


@app.get("/api/mapa-estaciones")
def api_mapa_estaciones(usuario: dict = Depends(usuario_actual)):
    """Estaciones reales (INA + Prefectura Naval) con coordenadas conocidas,
    para el mapa interactivo. Reemplaza al mock del frontend."""
    return datos.mapa_estaciones()


@app.get("/api/activos")
def api_listar_activos(usuario: dict = Depends(usuario_actual)):
    return [datos.estado_de_activo(a) for a in activos.listar_activos(usuario["usuario"])]


@app.post("/api/activos")
def api_crear_activo(entrada: ActivoEntrada, usuario: dict = Depends(usuario_actual)):
    try:
        nuevo = activos.crear_activo(
            usuario["usuario"],
            nombre=entrada.nombre,
            tipo=entrada.tipo,
            estacion_referencia=entrada.estacion_referencia,
            umbral_alerta_m=entrada.umbral_alerta_m,
            umbral_evacuacion_m=entrada.umbral_evacuacion_m,
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
    activo_id: int, cambios: ActivoActualizacion, usuario: dict = Depends(usuario_actual)
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
def api_eliminar_activo(activo_id: int, usuario: dict = Depends(usuario_actual)):
    if not activos.eliminar_activo(activo_id, usuario["usuario"]):
        raise HTTPException(status_code=404, detail="El activo no existe (o no pertenece a este usuario).")
    return {"ok": True}


# Se monta al final y en "/": las rutas /api/* de arriba, al estar declaradas
# antes, tienen prioridad. Cualquier otra ruta sirve el build de React (index.html,
# JS, CSS con hash) desde el mismo proceso, sin CORS. El frontend decide si
# muestra el login o el dashboard llamando a /api/perfil.
# Condicional: en produccion el frontend se despliega aparte (Vercel) y este
# directorio no existe en el backend.
if DIR_FRONTEND.exists():
    app.mount("/", StaticFiles(directory=DIR_FRONTEND, html=True), name="frontend")
