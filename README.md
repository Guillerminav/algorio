# Algorio — pipeline de datos hidrologicos

Consolida en un unico lugar la informacion no estructurada que publican
distintos organismos hidrologicos de la region (EBY/Yacyreta, Itaipu, INA
Argentina, Prefectura Naval Argentina, y las que se vayan sumando). La mayoria
de las fuentes vienen en HTML/PDF no estructurado y se procesan con Gemini;
las que ya publican una tabla HTML bien armada (como Prefectura Naval) se
parsean directo, sin pasar por el modelo.

`data_pipeline/` es la capa de datos (scraping + extraccion + unificacion).
`backend/` expone esos CSV via una API (FastAPI) y `frontend/` es la interfaz
de consulta (HTML/CSS/JS simple, sin build ni frameworks), servida por el
mismo backend.

## Versionado

La version vive en el archivo `VERSION` de la raiz y es la unica fuente de
verdad: `frontend/vite.config.js` la lee al buildear y la inyecta como
`__APP_VERSION__`, que se muestra al pie de la barra lateral.

Se arranco en `0.0.0` y **se sube el ultimo numero (patch) en cada
modificacion**: editar `VERSION` como parte del mismo cambio, antes de
commitear. Si algun dia hay que subir minor o major, se hace a mano ahi
mismo.

## Instalacion

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Copia `.env.example` a `.env` y completa tu clave de Gemini:

```
GEMINI_API_KEY=tu_clave_real
```

## Uso

```bash
python -m data_pipeline.main
```

Cada corrida:

1. Recorre las fuentes registradas en `data_pipeline/main.py` (`FUENTES`).
2. Para cada una: descarga el boletin del dia, le pide a Gemini que lo
   estructure segun el esquema Pydantic de esa fuente, y guarda el resultado
   en `data/per_source/dataset_<fuente>.csv` (formato ancho, sin duplicar
   boletines ya guardados).
3. Al final, reconstruye `data/historical/dataset_historico_largo.csv`: un
   unico dataset en **formato largo** que junta todas las fuentes pese a que
   cada una tiene columnas distintas (ver columnas abajo).

La fuente Yacyreta no calcula la URL a partir de la fecha (el numero de
boletin de la EBY no es predecible): en cambio, entra a la categoria del
sitio donde se listan todos los resumenes ejecutivos
(`https://www.eby.gov.py/category/nivelembalse/`) y toma el primer enlace
publicado, que es siempre el mas reciente. No requiere completar nada a mano.

**Itaipu esta en pausa** (`FUENTES` en `main.py` no la incluye): Itaipu
Binacional movio su boletin hidrologico a un link de SharePoint con acceso
restringido — ni el boton oficial "Baixar boletim hidrologico" de su propio
sitio sirve el PDF a un request sin sesion iniciada. El modulo
`data_pipeline/sources/itaipu.py` queda listo para reactivar (agregarlo de
nuevo a `FUENTES`) si en el futuro aparece una URL publica real o
credenciales de acceso.

## Datasets generados

**Por fuente** (`data/per_source/dataset_<fuente>.csv`): una fila por boletin
(o por estacion, en el caso de INA), con las columnas propias de esa fuente
mas `fecha_extraccion` y `url_origen`.

**Historico unificado** (`data/historical/dataset_historico_largo.csv`),
formato largo/tidy:

| columna | descripcion |
|---|---|
| `fuente` | `yacyreta`, `ina`, `prefectura_naval`, ... |
| `fecha_boletin` | fecha del boletin (YYYY-MM-DD) |
| `estacion` | nombre de estacion si la fuente tiene sub-entidades (INA, Prefectura Naval); `None` si no |
| `variable` | nombre del campo extraido (ej. `nivel_embalse_hoy_msnm`) |
| `valor` | valor de esa variable (como texto, para soportar numeros y strings como "Cerrado") |
| `fecha_extraccion` | cuando corrio el scraper (las fuentes publican en horarios distintos) |
| `url_origen` | URL exacta consultada ese dia |

## Agregar una fuente nueva

No hay clases que heredar: cada fuente es simplemente un modulo de Python en
`data_pipeline/sources/` con estas constantes y funciones:

- `NOMBRE` — identificador de la fuente (se usa en los nombres de archivo).
- `COLUMNAS_CLAVE` — columnas que identifican una fila unica (para no duplicar
  boletines al re-correr el pipeline); normalmente `["fecha_boletin"]`.
- `construir_url(fecha)` — arma la URL del boletin del dia.
- `obtener_contenido(url)` — descarga el boletin (texto, HTML crudo o bytes de PDF).
- `extraer(contenido)` — estructura el contenido en uno o varios registros.
- `a_filas(datos)` — convierte el resultado en una lista de filas (1 fila si
  es un boletin simple, N filas si trae varias entidades).

Hay dos maneras de implementar `extraer()`, segun como venga la fuente:

- **Contenido no estructurado** (texto/PDF libre, ej. `yacyreta.py`, `ina.py`):
  se define un esquema Pydantic en `data_pipeline/extraction/schemas.py` y
  `extraer()` le pide a Gemini que lo complete (`extraer_datos` o
  `extraer_datos_de_pdf` de `extraction/gemini_client.py`).
- **Tabla HTML ya estructurada** (ej. `prefectura_naval.py`): `extraer()`
  parsea directo con BeautifulSoup, sin Gemini — mas rapido, sin costo de
  modelo y sin depender de que el modelo interprete bien el texto.

Pasos para sumar una fuente:

1. Elegir el enfoque de extraccion segun el formato de la fuente (ver arriba).
2. Crear `data_pipeline/sources/<nueva_fuente>.py` con esas funciones.
3. Importarlo y agregarlo a la lista `FUENTES` en `data_pipeline/main.py`.

`data_pipeline/storage/unify.py` no necesita cambios: detecta automaticamente
cualquier `dataset_*.csv` en `data/per_source/` y lo incorpora al historico.

## Frontend: sistema de monitoreo y alertas

Es una app con login (usuario y contraseña), no un dashboard publico. Antes
de levantarla hay que crear al menos un usuario:

```bash
python -m backend.crear_usuario
```

(pide usuario, nombre y contraseña por consola con `getpass`; no hay pantalla
de alta de usuarios en el frontend a proposito). Despues:

El frontend es una app de **React (Vite)**; hay que compilarla antes de
levantar el backend, porque `backend/main.py` sirve el build de produccion
(`frontend/dist/`), no el codigo fuente:

```bash
cd frontend
npm install
npm run build     # genera frontend/dist/
cd ..
uvicorn backend.main:app --reload --port 8010
```

Abrir `http://127.0.0.1:8010`. El backend (`backend/main.py`) expone la API,
maneja la sesion (cookie firmada con `itsdangerous`) y sirve el build de
React desde el mismo proceso — no hace falta CORS ni un segundo servidor.
Los usuarios y sus "activos" quedan en `backend/usuarios.db` (SQLite, no se
sube a git). Cada vez que se edita algo en `frontend/src/` hay que correr
`npm run build` de nuevo para que el backend sirva la version actualizada
(o usar `npm run dev` durante desarrollo: levanta Vite en otro puerto con
recarga en caliente y proxea `/api/*` al backend, ver `frontend/vite.config.js`).

**Navegacion** (`frontend/src/components/AppShell.jsx`): una barra lateral
con cuatro secciones y un circulo de perfil arriba a la derecha:

- **Dashboard** — vista general (todas las estaciones, con filtros por
  estacion/rio) y, dentro de la misma seccion, sub-pestañas para entrar a cada
  fuente particular (INA, Prefectura Naval, Yacyreta).
- **Alertas** — estaciones de Prefectura Naval cuyo nivel actual llego al
  umbral oficial de alerta o evacuacion (`GET /api/alertas`).
- **Mi flota** — activos que el usuario guarda una vez (embarcacion, draga,
  muelle o tramo), cada uno con su estacion de referencia y, opcionalmente,
  un **umbral de alerta propio** que pisa al oficial para ese activo
  (`backend/activos.py` + `GET/POST/PUT/DELETE /api/activos`). Si el tipo es
  "embarcacion", se puede elegir una **categoria** (Panamax, Handymax, Handy,
  fluviomaritimo, convoy, barcaza, draga, remolcador) que autocompleta eslora,
  manga, puntal, calado, borde libre, DWT/capacidad, ton. por pie y radar
  apto rio segun una tabla de referencia (`frontend/src/embarcaciones.js`);
  esos valores quedan editables despues. Las categorias de buque oceanico
  (Panamax/Handymax/Handy) solo se ofrecen si la estacion elegida esta rio
  abajo del complejo Timbúes-San Lorenzo-Rosario (km ~460 de la Hidrovia),
  porque esos buques no navegan mas arriba — es una lista aproximada de
  estaciones conocidas, no una carta nautica oficial.
- **Mapa** (`frontend/src/components/MapaEstaciones.jsx`) — estaciones sobre
  un mapa interactivo (Leaflet + tiles de OpenStreetMap, gratis, sin API key),
  con clustering de marcadores (Leaflet.markercluster) y un color por
  estado (verde/amarillo/rojo, mismas variables CSS que el resto del panel).
  Al hacer click en un marcador se abre un popup corto y se expande el panel
  lateral con el detalle completo (nivel, tendencia, pronostico, ultima
  actualizacion). **Usa datos de ejemplo (mock)** por ahora
  (`frontend/src/mockMapaEstaciones.js`, 8 estaciones reales del Parana con
  coordenadas aproximadas) porque los CSV de INA/Prefectura Naval todavia no
  traen lat/lon; el punto exacto para reemplazar el mock por el endpoint real
  esta comentado en `MapaEstaciones.jsx` (buscar "REEMPLAZAR").
- **Circulo de perfil** — nombre, cerrar sesion, y "Editar perfil" (nombre,
  contraseña, y preferencia de unidades: metros/pies y m³/s / ft³/s — la
  conversion es solo de despliegue, el backend siempre guarda y devuelve
  metros y m³/s).

**Endpoints de datos** (todos requieren sesion iniciada, devuelven 401 si no):
`GET /api/ina`, `GET /api/yacyreta`, `GET /api/prefectura-naval`,
`GET /api/dashboard`, `GET /api/alertas`, `GET /api/estaciones-disponibles`
(para el selector de estacion al cargar un activo). El nombre de rio ya viene
unificado desde el backend (`backend/datos.py: canonizar_rio`) sin importar
que cada fuente lo escriba distinto (`PARANA` vs `Paraná`).

**Stack de frontend**: React 18 + Vite, sin router (la navegacion es estado
de React, no cambia la URL) — ver estructura abajo. `usuario` (perfil +
preferencia de unidades) vive en `AuthContext`; cada seccion pide sus propios
datos con un hook chico (`useFetchLista`) al montarse.

## Dominios

Son dos apps separadas, cada una con su repo y su proyecto de Vercel, bajo el
mismo dominio:

| URL | Que atiende |
| --- | --- |
| `algorio.com.ar` | La landing (repo `algorio_landing`) |
| `app.algorio.com.ar` | Este sistema (`frontend/`) |
| `app.algorio.com.ar/api/*` | Proxeado al backend en Render (`frontend/vercel.json`) |

El backend nunca se expone directo: `/api/*` sale del mismo origen que la app
porque Vercel lo reescribe hacia Render. Por eso no hace falta CORS y la
cookie de sesion viaja como cookie propia del dominio.

## Estructura

```
algorio/
├── data_pipeline/
│   ├── config.py            # variables de entorno, rutas, constantes
│   ├── main.py               # orquestador (punto de entrada)
│   ├── fetchers/             # descarga HTML/PDF (con reintentos)
│   ├── extraction/            # cliente Gemini + esquemas Pydantic
│   ├── sources/                # un modulo de funciones por fuente (arquitectura plugin)
│   └── storage/                # guardado por fuente + unificacion al historico
├── backend/
│   ├── main.py               # API (FastAPI): auth, datos, activos + sirve el frontend
│   ├── auth.py                # usuarios en SQLite, hash de contraseñas, preferencias
│   ├── activos.py              # CRUD de "Mi flota" (embarcaciones/dragas/muelles/tramos)
│   ├── crear_usuario.py         # CLI para dar de alta un usuario (getpass, no via web)
│   └── datos.py                # lectura de los CSV, normalizacion, umbrales y alertas
├── frontend/                    # app de React (Vite) — ver "Frontend" arriba para como buildearla
│   ├── package.json
│   ├── vite.config.js            # proxy /api/* -> backend en modo dev (npm run dev)
│   ├── index.html                 # entry point de Vite (no confundir con frontend/dist/index.html)
│   ├── dist/                       # build de produccion (generado, no versionado)
│   └── src/
│       ├── main.jsx                 # monta <App/>, importa CSS de Leaflet + index.css
│       ├── App.jsx                    # AuthProvider + Login vs AppShell
│       ├── index.css                   # estilos globales (mismas variables/paleta que antes)
│       ├── api.js                       # fetch + formato (unidades, tendencia)
│       ├── embarcaciones.js              # tabla de referencia por categoria + regla Timbúes
│       ├── mockMapaEstaciones.js          # mock de 8 estaciones para MapaEstaciones.jsx
│       ├── context/
│       │   └── AuthContext.jsx              # usuario, login/logout/actualizarPerfil
│       ├── hooks/
│       │   └── useFetchLista.js               # pedir una lista a la API con estado de carga/error
│       └── components/
│           ├── Login.jsx, AppShell.jsx, Sidebar.jsx, TopBar.jsx,
│           │   PerfilMenu.jsx, ModalPerfil.jsx        # shell + autenticacion
│           ├── Dashboard.jsx, DashboardGeneral.jsx,
│           │   TablaIna.jsx, TablaPrefectura.jsx, TablaYacyreta.jsx
│           ├── Alertas.jsx
│           ├── MapaEstaciones.jsx                        # Leaflet + clustering + panel lateral
│           └── MiFlota.jsx, FormActivo.jsx                # CRUD de "Mi flota"
└── data/
    ├── per_source/            # dataset_<fuente>.csv
    └── historical/             # dataset_historico_largo.csv
```
