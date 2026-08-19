# AlgoRío móvil

App para los dos perfiles de río, con pantallas distintas según `usuarios.rol`:

| Rol | Qué ve | Grupo de rutas |
| --- | --- | --- |
| `recreativo` | Mapa, clima, reseñas | `app/(tabs)/` |
| `comercio` | Su ficha, horarios, métricas, reseñas | `app/(comercio)/` |
| `naviera` | Una pantalla que lo manda a la web | `app/solo-web.jsx` |

El de naviera no tiene versión móvil y no es por falta de tiempo: ese producto
son tablas densas de niveles, calado por estación y rutas con punto crítico,
que se leen en pantalla ancha y se exportan a CSV o PDF. Achicarlo al teléfono
daría una versión peor de algo que ya funciona bien en la web.

Quién entra a dónde lo decide `app/index.jsx` al abrir la app, y `app/login.jsx`
después de iniciar sesión.

Comparte backend y base con el resto del proyecto (`../backend`).

## Navegación: menú lateral, no barra de tabs

Los dos perfiles navegan con un **menú hamburguesa** (`expo-router/drawer`), con
el contenido compartido en `src/MenuLateral.jsx`. Se abre con el botón de arriba
a la izquierda o arrastrando desde el borde.

Antes eran tabs abajo, y se cambió por dos razones concretas: la barra le comía
58 px de alto permanentes al mapa —que es *la* pantalla de la app— y ponía techo
a cuántas secciones podía haber, algo que ya se notaba en el perfil de comercio
(horarios, menú y ubicación viven como pantallas sueltas justamente porque no
entraban). En el cajón entran todas y sobra lugar.

El mapa es la única pantalla sin header: el botón de menú va flotando en la
misma fila que el cartel del río, para no gastar una franja de alto.

> Las carpetas de rutas se siguen llamando `(tabs)` y `(comercio)` aunque ya no
> haya tabs: renombrar `(tabs)` cambiaría la URL de todas las rutas del nauta y
> obligaría a tocar cada `router.push` del proyecto. El nombre de un grupo no se
> ve en ningún lado.

## Esta app y la web del nauta son dos interfaces sobre los mismos datos

El mismo perfil también existe en la web, en `../frontend/src/nauta/`: misma
cuenta, mismos POIs, mismas reseñas. No es una app y su folleto — quien reseña
un parador desde el navegador lo ve reseñado acá, y al revés.

Lo que cambia es para qué sirve cada una. La app es donde el producto se usa de
verdad: GPS en vivo, mapa satelital nativo a pantalla completa, el teléfono en
la mano arriba del agua. La web es para planificar antes de salir, con pantalla
grande, y para el que todavía no descargó nada.

Como son dos stacks distintos (React Native y DOM), no comparten componentes.
Lo que sí tiene que coincidir son las **claves que viajan al backend**: los
tipos de embarcación y de POI están duplicados en `src/embarcaciones.js` /
`src/tema.js` acá y en `../frontend/src/nauta/constantes.js`. Si cambia una
clave, hay que tocar los dos lados.

## Pantallas

**Comunes**

| Pantalla | Archivo | Para qué |
|---|---|---|
| Login / Registro | `app/login.jsx`, `app/registro.jsx` | El registro elige perfil: nauta (por defecto) o comercio |

**Nauta**

| Pantalla | Archivo | Para qué |
|---|---|---|
| Elegir embarcación | `app/embarcacion.jsx` | Onboarding de una pregunta (ver abajo) |
| Mapa | `app/(tabs)/index.jsx` | Home: satelital, pines, cartel del río |
| Clima | `app/(tabs)/clima.jsx` | 48 h de viento, ráfagas y dirección |
| Perfil | `app/(tabs)/perfil.jsx` | Embarcación y mis reseñas |
| Ficha del lugar | `app/lugar/[id].jsx` | Menú, horarios, contacto y reseñas |

**Comerciante**

| Pantalla | Archivo | Para qué |
|---|---|---|
| Alta | `app/comercio/alta.jsx` | Asistente de 3 pasos, si la cuenta no tiene ficha |
| Mi comercio | `app/(comercio)/index.jsx` | Datos, contacto, servicios y estado de publicación |
| Métricas | `app/(comercio)/metricas.jsx` | Cuánta gente lo miró, por acción y período |
| Reseñas | `app/(comercio)/resenas.jsx` | Lo que dicen de él |
| Cuenta | `app/(comercio)/cuenta.jsx` | Sus datos, nivel del río y cerrar sesión |
| Horarios | `app/comercio/horarios.jsx` | Por día, con "cerrado" |
| Menú | `app/comercio/carta.jsx` | Solo para paradores |
| Ubicación | `app/comercio/ubicacion.jsx` | Mover el pin (devuelve la ficha a revisión) |

Las cuatro últimas se abren desde "Mi comercio" y no gastan una tab: se editan
de vez en cuando, no en cada visita. Mover el pin vive aparte a propósito —
devuelve el comercio a moderación, así que tiene que ser deliberado y con el
aviso a la vista, no un arrastre accidental mientras se corrige un teléfono.

## El tipo de embarcación no es decorativo

Es la única pregunta del onboarding y lo que hace distinta a esta app de mirar
el pronóstico en cualquier lado. Un viento de 20 km/h es una tarde tranquila
para una lancha de siete metros y un problema serio para un kayak: el backend
(`backend/clima.py`) cruza el pronóstico con `usuarios.tipo_embarcacion` y
devuelve un veredicto — *río calmo / picado / muy picado* — calibrado para
quien pregunta. El cartel de arriba del mapa muestra eso primero, y el número
crudo abajo y más chico.

## Lo que flota sobre el mapa va en vidrio

Todo lo que se apoya sobre la imagen satelital —el cartel del río, los filtros
de rubro, el botón de menú, los dos botones sueltos, los avisos— se dibuja con
`src/Vidrio.jsx` (`expo-blur`) y no con un `View` de color liso.

No es decoración. Sobre un fondo que cambia de color cada vez que uno arrastra
el mapa, un panel opaco tapa justo lo que se está mirando, y uno translúcido
sin desenfoque deja el texto ilegible cuando abajo pasa una costa clara. El
desenfoque resuelve las dos cosas a la vez.

El vidrio va **oscuro** (ver `VIDRIO` en `src/tema.js`) porque el satelital es
oscuro y saturado: con vidrio claro y texto oscuro el contraste depende de qué
haya debajo, y con vidrio oscuro y texto blanco no. Y el velo de color va
*encima* del `BlurView`, no debajo: es lo que sostiene la legibilidad los días
que el desenfoque no llega a aplicarse (Android sin
`experimentalBlurMethod`, o el modo de ahorro de energía, que lo desactiva).

### El semáforo es un punto, no una franja

El cartel del río muestra tres lecturas separadas: **navegabilidad** (el
veredicto, lo único en negrita), **viento** (el número, abajo) y **dirección**
(la flecha-veleta, en su propia columna a la derecha).

Antes la barra entera se pintaba de verde, ámbar o rojo. Gritaba lo mismo un
día de 30 km/h que uno de 60, y encima le tapaba al mapa una franja de alto
justo arriba, que es donde uno está mirando. El color quedó en un punto de 9px
al lado del veredicto: se sigue leyendo de reojo, que es todo lo que un
semáforo tiene que hacer.

El acento azul se reserva para los estados activos: cuando el botón de reportar
se tiñe, el próximo toque en el mapa deja un aviso. Esa es la única cosa que
todavía se pinta entera, y es a propósito.

## Autenticación

La web usa la cookie de sesión y le alcanza, porque llama a `/api` relativo y
Vercel lo reescribe al backend: mismo origen. La app pega directo al dominio de
Render, así que usa `Authorization: Bearer <token>`.

El token lo firma `backend/tokens.py` con `itsdangerous` (dura 90 días) y se
guarda en `expo-secure-store` — Keychain en iOS, Keystore en Android — porque
es una credencial y `AsyncStorage` es texto plano.

## Correr en local

```bash
npm install
cp .env.example .env    # completar EXPO_PUBLIC_API_URL con la IP de tu red
npx expo start
```

Escaneá el QR con **Expo Go**. Probalo en un teléfono real: el mapa satelital y
la geolocalización no se prueban bien en emulador.

El backend tiene que escuchar en todas las interfaces para que el celular
llegue:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8011
```

## Antes de publicar

- **`GOOGLE_MAPS_API_KEY_ANDROID`** en `.env`: Android necesita una clave de
  Google Maps (gratuita en este volumen). iOS usa Apple Maps y no pide nada.
- **Render en plan free duerme**: el primer request después de un rato tarda
  ~50 s. `src/api.js` usa un timeout de 60 s por eso, pero para producción real
  conviene un plan que no duerma.
- **"Continuar con Google"**: la web lo tiene, la app todavía no. Requiere
  `expo-auth-session`, que es otro flujo.
