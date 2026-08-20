# Algorio

## Tres perfiles, un solo backend

AlgoRío atiende a tres publicos distintos sobre la **misma base y el mismo
backend**. Lo que se bifurca es la experiencia, segun `usuarios.rol`:

| Rol | Quien es | Donde vive | Cobro |
| --- | --- | --- | --- |
| `recreativo` | El nauta: kayak, lancha, velero, tabla | App (`app_movil/app/(tabs)/`) **y** web (`frontend/src/nauta/`) | Gratis |
| `comercio` | Parador, cabaña o lancha-taxi | App (`app_movil/app/(comercio)/`) **y** web (`frontend/src/comercio/`) | Suscripcion |
| `naviera` | Naviera, terminal, servicio fluvial | Solo web (`frontend/src/components/`) | Suscripcion |

Los dos perfiles de rio existen en los dos lados, con la misma cuenta y los
mismos datos: el comerciante que carga su ficha desde el celular la ve igual en
la web, y la reseña que el nauta deja en el navegador le llega a su panel. Son
dos interfaces sobre los mismos datos, no un producto y su folleto.

La naviera es la excepcion y es deliberado: su producto son tablas densas de
niveles, calado por estacion y rutas con punto critico, que se leen en pantalla
ancha y se exportan. En la app ve una pantalla que la manda a la web.

El rol se elige al registrarse y decide que shell monta el frontend
(`frontend/src/App.jsx`). Las cuentas anteriores a esta division quedaron en
`naviera`, que es lo que eran: hasta entonces la unica forma de tener cuenta
era usar el dashboard de datos hidrologicos.

El punto de encuentro entre los perfiles son los **POIs** (tabla `pois`): el
comerciante carga su ficha, un admin la aprueba, y recien ahi aparece en el
mapa del nauta. El nauta la puntua y toca "WhatsApp"; el comerciante ve esos
numeros en su panel.

Sobre el mismo mapa va una segunda capa, los **reportes** (tabla `reportes`):
avisos que deja un nauta sobre un punto —un yacare, un banco de arena que se
corrio, un tronco a la deriva, basura— con severidad (comentario / advertencia
/ alerta) y **fecha de vencimiento** (24 h, 48 h o una semana).

Que venzan es la diferencia de fondo con los POIs, no un detalle: un parador
esta donde esta, pero un tronco se va con la correntada. Un aviso sin caducidad
convierte el mapa, en dos meses, en una lista de peligros que ya no existen — y
eso es peor que no tener nada, porque el nauta deja de creerle. No hay cron: se
filtra por `vence_en > now()`, igual que el acceso por suscripcion. Tampoco
pasan por moderacion, porque un banco avisado hoy y aprobado el martes ya no le
sirve a nadie; el control es que el autor lo borra o lo renueva.

```
algorio/
├── backend/      FastAPI — compartido por los tres perfiles (Render)
├── frontend/     React/Vite — perfiles COMERCIO y NAVIERA (Vercel)
├── app_movil/    Expo/React Native — perfil RECREATIVO (ver su README)
└── data_pipeline/  scraping + extraccion de boletines hidrologicos
```

**Autenticacion.** La web usa la cookie de sesion firmada y le alcanza porque
llama a `/api` relativo y Vercel lo reescribe al backend: mismo origen. La app
movil pega directo al dominio de Render, cross-origin, asi que manda
`Authorization: Bearer <token>` (ver `backend/tokens.py`). `usuario_actual()`
en `backend/main.py` acepta las dos y devuelve lo mismo, asi que ningun
endpoint necesita saber por cual entro el usuario.

**Moderacion.** Los POIs nacen en `estado = 'pendiente'` y no se ven en el
mapa hasta que una cuenta con `usuarios.es_admin` los aprueba. El permiso se
otorga a mano:

```sql
UPDATE usuarios SET es_admin = TRUE WHERE usuario = 'tu_usuario';
```

## La UI del nauta: vidrio sobre el mapa

Vale para las dos interfaces del perfil recreativo, la web
(`frontend/src/nauta/`) y la app (`app_movil/`), y por eso se documenta aca y
no en una sola de las dos.

Todo lo que se apoya sobre la imagen satelital —el cartel del rio, los filtros
de rubro, los botones sueltos, los avisos— se dibuja en vidrio translucido con
desenfoque, no en color liso: en la web con `backdrop-filter` y las variables
`--vidrio-*` de `frontend/src/index.css`; en la app con `src/Vidrio.jsx`
(`expo-blur`) y `VIDRIO` de `src/tema.js`.

El vidrio va **oscuro** en los dos lados. El satelital es oscuro y saturado, y
un vidrio claro encima levanta el fondo hasta que el texto oscuro pierde
contraste justo donde el rio es mas claro; con vidrio oscuro y texto blanco el
contraste no depende de que hay abajo. La opacidad (0.55 / 0.72) es la que
sostiene la legibilidad cuando el desenfoque no esta disponible.

**El semaforo es un punto, no una franja.** El cartel del rio muestra tres
lecturas separadas: navegabilidad (el veredicto de `backend/clima.py`, lo unico
en negrita), viento (el numero, abajo y mas chico) y direccion (la flecha
apuntando al origen, en su propia columna). Antes la barra entera se pintaba de
verde, ambar o rojo: gritaba lo mismo un dia de 30 km/h que uno de 60, y encima
tapaba el mapa, que es lo que la persona vino a mirar.

**En la web la capa flota sobre el mapa**, no arriba de el. Antes la barra, los
filtros y los avisos estaban apilados en la columna y empujaban el mapa hacia
abajo — en un celular se llevaban la mitad del alto. Ahora van en `.capa-mapa`,
que no recibe el mouse y se lo devuelve a cada control uno por uno, asi que en
los huecos entre controles el mapa se sigue arrastrando.

El acento azul quedo reservado para los estados activos (el modo "el proximo
click deja un aviso"). Es lo unico que se sigue pintando entero.

## Como llegar en el rio: distancia y rumbo, no un mapa de calles

El boton "Como llegar" abria Google Maps (web) o la app de mapas del sistema
(movil). En el rio eso no sirve: no hay calles cargadas, asi que el navegador
traza una ruta por tierra hasta el punto mas cercano de la costa, o no
encuentra ninguna. Lo reemplaza lo que mira quien navega desde siempre: **a
cuanto esta y para que lado**.

La cuenta vive en `frontend/src/nauta/rumbo.js` y `app_movil/src/rumbo.js`
(haversine para la distancia, rumbo de circulo maximo para la direccion). Estan
duplicados por el mismo motivo que las constantes del nauta: son dos stacks que
no pueden compartir modulo. **Ojo con las claves**: en la web los puntos son
`{lat, lon}` y en la app `{latitude, longitude}`.

La distancia se recalcula en el cliente y no se usa `distancia_km` del backend
a secas: esa se calculo cuando se pidio la lista, y mientras navegas deja de
ser cierta. El valor del backend queda de respaldo para cuando todavia no hay
GPS.

**La aguja apunta relativo a como estas parado**, no al norte: al rumbo se le
resta la orientacion del aparato, asi que si giras la aguja se queda apuntando
al parador. Es lo que la hace usable arriba de una lancha — una flecha que
apunta "al noreste" obliga a saber donde queda el noreste. En la app la
orientacion sale de `Location.watchHeadingAsync` (ya viene con `expo-location`,
no hizo falta dependencia nueva); en la web, de `DeviceOrientationEvent`, que
en iPhone pide permiso con un gesto y por eso aparece un boton "Activar
brujula" solo cuando el navegador lo exige. Sin sensor cae a **norte arriba**,
que no es un error sino el modo degradado.

Las coordenadas van a la vista en la ficha completa: son lo que se carga a mano
en un GPS o un plotter, que es como se navega de verdad.

**La metrica cambio de disparador.** `poi_visitas` con tipo `como_llegar` la
disparaba aquel boton. Ahora se cuenta cuando la ficha llega a mostrar el
rumbo, una sola vez por apertura. Es el mismo hecho que le importa al
comerciante —alguien miro como llegar hasta el— pero el numero no es
estrictamente comparable con el de antes.

## La ficha rapida: primero lo basico, despues todo

Tocar un pin ya no abre la ficha completa. Primero aparece una ventana abajo
(`FichaRapida.jsx` en la web, `TarjetaLugar` en el mapa de la app) con nombre,
rubro, puntaje, si esta abierto, y la distancia con el rumbo. Las reseñas, la
carta y los horarios completos quedan detras de **"Ver mas"**.

En la web esto ademas arregla un problema de pantalla chica: el panel lateral
esta bien con mouse y pantalla ancha, pero en un celular tapaba el mapa entero
para contestar algo que casi siempre se resuelve con dos datos. Medido a 375px,
la ventana ocupa el 31% del alto.

La ventana se dibuja con el POI que el mapa ya tiene en su lista, asi que
aparece sin esperar ninguna consulta; el fetch de la ficha completa recien
ocurre al tocar "Ver mas".

## El tablero de cruces de las lanchas-taxi

Una lancha-taxi no es un lugar al que se va: es de donde **sale** el
transporte. Con la ficha de comercio comun —descripcion, servicios, horarios de
atencion— quedaba sin contestar la unica pregunta que importa: *¿a que hora
cruza, cuanto sale y hoy esta saliendo?*

El tablero es eso, con la forma del cartel de salidas de un aeropuerto. Una
fila por cruce con **proxima salida, frecuencia, precio, duracion, ultimo
regreso y estado**:

```
CRUCES                                             14:23

Isla del Cerrito                            [A HORARIO]
desde Puerto Corrientes
PRÓXIMA       FRECUENCIA    PRECIO   ÚLT. REGRESO
15:00  en 37 min  cada 2 h 30   $3.500   19:30
 07:00   09:30   12:00   15:00   17:30

Paso de la Patria                           [A HORARIO]
PRÓXIMA                  FRECUENCIA   PRECIO
1̶4̶:̶0̶0̶ 14:20  ahora       cada 6 h     $5.200
 08:00  [1̶4̶:̶0̶0̶ 14:20 DEMORADO]  [1̶8̶:̶0̶0̶ CANCELADO]
```

La hora de cartel se tacha y al lado va la estimada: asi se lee que la salida
se corrio sin tener que restar nada.

### El estado vive en dos niveles

Un tablero de aeropuerto no dice que la aerolinea esta demorada: dice que **ese
vuelo** lo esta. Aca igual.

- El estado del **cruce** es el default del dia: "hoy no cruzo a Apipe", "todo
  el recorrido va demorado". Un toque y vale para todas sus salidas.
- El de cada **salida** lo pisa cuando hace falta: la de las 14:00 se corrio
  media hora, la de las 18:00 se cayo, y las demas siguen saliendo bien.

Una salida sin estado propio (`estado` en `null`) **hereda** el del cruce, y eso
no es lo mismo que estar "a horario": si el recorrido entero va demorado, sus
salidas van demoradas sin que el lanchero tenga que tocarlas de a una. Por eso
el editor tiene, ademas de los cinco estados, un boton de **"Que siga al
recorrido"**: marcarla "a horario" para sacarle un "demorado" no deshace nada
—la dejaria pisando al cruce para siempre, y manana, con el recorrido demorado,
esa salida seguiria afirmando que sale bien.

`sin_servicio` es el unico estado que no existe a nivel de salida: describe que
el lanchero no opera ese recorrido por ahora, y no hay tal cosa como "no opero
la salida de las 12".

Los dos niveles caducan por separado y con la misma cuenta, porque son dos
decisiones tomadas en momentos distintos: que el cruce entero vuelva a la
normalidad manana no tiene por que borrar la demora que se marco hoy a la
tarde en una salida puntual, ni al reves.

Dentro de un cruce, **la hora es el identificador de la salida** (no puede
haber dos a las 09:30). Con un indice de la lista, agregar un horario mas
temprano le moveria el estado a otra salida — y agregar el madrugon de las 5
convertiria el "cancelado" de las 18 en un "cancelado" de las 15.

### Las ediciones no pasan por moderacion

Todo lo demas de una ficha lo aprueba un admin antes de aparecer en el mapa,
porque publica algo nuevo. El tablero no publica nada nuevo: actualiza un dato
operativo que envejece en minutos. Un "demorado" esperando aprobacion no sirve
para nada — cuando lo aprueben, la lancha ya salio.

Por eso el tablero tiene su propia puerta de entrada y **no** esta en
`pois.CAMPOS_EDITABLES`, que es la lista blanca del PUT que si puede devolver
la ficha a `pendiente`:

| Endpoint | Que hace | Moderacion |
| --- | --- | --- |
| `PUT /api/mi-comercio` | La ficha (nombre, ubicacion, rubro…) | Vuelve a revision si cambia nombre, tipo o coordenadas |
| `PUT /api/mi-comercio/tablero` | El tablero completo: alta de cruces, horarios, precios | Ninguna |
| `POST /api/mi-comercio/tablero/{id}/estado` | El interruptor de un recorrido | Ninguna, se publica en el acto |
| `POST /api/mi-comercio/tablero/{id}/salidas/{hora}/estado` | El interruptor de UNA salida (`estado: null` la devuelve a heredar) | Ninguna, se publica en el acto |

Que sean dos endpoints y no un campo mas del PUT es lo que evita que un cambio
futuro en `pois.actualizar` le aplique la moderacion al tablero sin que nadie
se de cuenta.

El endpoint del interruptor suelto existe aparte del guardado completo porque
es la operacion del dia a dia y la unica que se hace apurado: el lanchero abre
la app, toca "Demorado" y guarda el telefono. Mandar el tablero entero para eso
tambien funcionaria, pero pisaria con una copia vieja cualquier cambio hecho
desde otro dispositivo.

### Los estados caducan solos

Los seis estados son `a_horario`, `por_salir`, `demorado`, `completo`,
`cancelado` y `sin_servicio` (`backend/tablero.py`: `ESTADOS`); una salida
suelta admite los cinco primeros (`ESTADOS_SALIDA`).

Un "cancelado" cargado un sabado a la mañana que sigue ahi el martes es **peor**
que no tener tablero: el nauta deja de creerle. Es el mismo problema que
resuelve `vence_en` en los reportes, y se resuelve igual — sin cron y sin
columna nueva, calculando la vigencia **al leer**:

- Los estados alterados vuelven a `a_horario` cuando cambia el dia en
  Argentina. El lanchero piensa por jornada ("hoy no cruzo por el viento"), no
  por reloj, y arranca la mañana con el tablero limpio.
- `por_salir` es la excepcion: no describe el dia sino los proximos minutos, y
  se apaga solo a los 45.

La marca de tiempo (`estado_desde`) la pone **el servidor**, aunque el estado se
acepte desde afuera: es lo unico que decide cuando caduca, y un celular con la
hora mal puesta la dejaria colgada para siempre. Corregir un precio tampoco
reinicia ese reloj — si lo hiciera, un "cancelado" no caducaria nunca.

La hora que manda en el tablero es la de Argentina (UTC-3 fijo, que no mueve la
hora desde 2009) y no la del dispositivo: un celular con la zona horaria de
otro pais mostraria "sale en 4 h" para una lancha que zarpa en veinte minutos.
El cartel es el del muelle, no el del que lo mira.

### El pin: un cartel de terminal, no un punto

Los tres rubros se distinguian solo por el color del pin, y eso alcanza
mientras los tres sean "un lugar al que se llega". La lancha-taxi no lo es, asi
que va como **cartel cuadrado parado sobre el muelle**, con el barquito adentro
y borde blanco. Es la misma distincion que hacen los mapas de ciudad entre un
comercio (punto) y una estacion (cartel con forma propia): se lee por forma,
sin zoom y sin leer nada, y no por un tercer tono de azul.

Cuando el tablero tiene una alteracion —una demora, un cruce cancelado— el
cartel lleva un punto de ese color arriba a la derecha. Solo entonces: si
estuviera siempre, un mapa donde todos los pines avisan algo es un mapa donde
ninguno avisa nada. El chip del filtro tambien lleva el punto cuadrado, para no
tener que aprenderse de memoria cual es cual.

### Donde se ve cada cosa

| Pantalla | Que muestra |
| --- | --- |
| Pin del mapa | Cartel de terminal + punto de alteracion |
| Ficha rapida / tarjeta de abajo | El cruce que sale antes, con su hora y estado |
| Listado de lugares | Lo mismo, en un renglon de la fila |
| Ficha completa | El tablero entero, con todas las salidas y su estado |
| Panel del comerciante | Interruptores (instantaneos) + campos (con boton de guardar) |

La pantalla del lanchero hace dos cosas con reglas distintas y eso esta a la
vista: los **interruptores** van arriba y con mas peso visual que los campos,
al reves de lo que pediria la jerarquia de un formulario. No es un formulario:
es un tablero con un formulario adjunto.

Debajo de cada fila del editor va la vista previa en una linea —"Así lo ven:
próxima 14:20 · ahora · cada 6 h · $5.200 · vuelve hasta 18:45"—. Sin eso, el
lanchero carga cinco numeros sueltos y no ve que frase arman hasta abrir la
ficha del nauta en otra pantalla.

Los horarios se cargan todos juntos en un renglon ("07:00, 09:30, 12:00") y
debajo aparece un chip por salida para marcarlas de a una. El renglon **guarda
su propio texto mientras se escribe** y solo lo interpreta al salir del campo:
si el valor del campo se recalculara desde la lista en cada tecla, la coma que
uno acaba de escribir desapareceria al instante —se parsea, queda un elemento
vacio, se descarta y se vuelve a unir sin ella— y el campo seria intipeable.
Al confirmar, los horarios se ordenan, se deduplican, "8" se vuelve "08:00" y
**cada salida conserva el estado que ya tenia**: tocar una coma no puede borrar
el "demorado" que se acaba de marcar.

## Trafico de embarcaciones en tiempo real (AIS)

Los barcos de porte emiten su posicion por AIS y aisstream.io la reparte por
WebSocket. Para el nauta contesta una pregunta muy concreta: **si viene un
buque, cuanto falta y por donde va a pasar** — que es lo que decide si cruzas
ahora o esperas dos minutos.

El recuadro suscripto es el tramo del Parana frente a **Rosario y Granadero
Baigorria** (`CAJA_ROSARIO` en `backend/ais.py`), que es donde se cruza de
costa a isla.

**La clave vive en el backend, nunca en el navegador.** aisstream la manda
DENTRO del mensaje de suscripcion del WebSocket: si el mapa se conectara
directo, la clave viajaria en el bundle y en la pestaña de red de cualquiera
que abra la web. Ademas seria una conexion por visitante contra un servicio
que limita por clave. Por eso `backend/ais.py` mantiene **una sola** conexion
para todos, guarda las ultimas posiciones en memoria, y el frontend las pide
por HTTP (`GET /api/embarcaciones`) cada 15 segundos mientras la capa este
prendida.

En memoria y no en Postgres: una posicion AIS vale minutos, y guardarla seria
escribir cientos de filas por minuto para leer siempre la ultima y tirar el
resto — pagando ademas el viaje a Neon en cada lectura. Las posiciones vencen
solas a los 15 minutos, porque un barco que sale del recuadro deja de reportar
y su ultimo punto no puede quedar clavado como si siguiera ahi.

Sin `AISSTREAM_API_KEY` no arranca nada y el chip del mapa no aparece: la capa
es opcional y el resto del mapa funciona igual.

### El estado del stream hoy

La clave **autentica** (con una clave falsa el servidor cierra la conexion al
instante; con la real la deja abierta y acepta la suscripcion) pero **no
entrega mensajes**, ni siquiera con un recuadro global, que segun la doc
deberia dar ~300 por segundo. O sea que el problema no es el recuadro ni el
codigo. Hay que revisar del lado de aisstream que la cuenta este activada para
streaming.

## Las dos capas del mapa: lugares y embarcaciones

Los chips de rubro dejaron de llevar cada uno el color de su rubro. Lo que el
punto distingue ahora no es parador de cabaña —eso lo sigue diciendo el pin—
sino las **dos capas del mapa**: lo que esta quieto en la costa (celeste) y lo
que se esta moviendo por el agua (naranja). Prendido = punto lleno; apagado =
solo el borde.

El pin de un barco es una **flecha, no un circulo** (los circulos son los
lugares) y apunta hacia donde navega, que es la mitad del dato: un buque a 800
metros no significa lo mismo si viene hacia vos que si se esta yendo. Cuando no
informa rumbo se dibuja un rombo, que no apunta a ningun lado — mejor eso que
una flecha al norte por defecto, que seria mentir.

## Isla, muesca y barra de inicio

`viewport-fit=cover` en el `<meta viewport>` de `frontend/index.html` hace dos
cosas y las dos hacen falta: deja que la pagina pinte de borde a borde (el mapa
a pantalla completa lo necesita) y —lo importante— es lo **unico** que hace que
`env(safe-area-inset-*)` devuelva valores reales. Sin eso esas variables valen
0 y cualquier padding que dependa de ellas no hace nada.

Ese era el bug: habia un `calc(0.6rem + env(safe-area-inset-top))` en la capa
del mapa que no servia para nada, porque faltaba el `viewport-fit`. Los
controles quedaban debajo de la isla del iPhone.

Los insets se leen una vez en `:root` (`--seguro-arriba`, `--seguro-abajo`,
`--seguro-izq`, `--seguro-der`) y de ahi los toma todo lo que toca un borde: la
capa de controles del mapa, los botones flotantes, la ficha del parador, el
zoom de Leaflet, la barra superior, el cajon del menu y las pantallas de
acceso.

**Los insets laterales no son decorativos**: en horizontal la isla se va a un
costado, y sin ellos los botones quedan tapados al rotar el telefono.

El `, 0px` de respaldo de cada `env()` importa: en un navegador sin soporte,
`env()` sin valor por defecto invalida la declaracion entera y el padding se
pierde del todo.

En la app nativa el equivalente son los `<SafeAreaView>` que ya estaban, mas
`useSafeAreaInsets()` para los dos botones flotantes del mapa — son
`position: absolute` sobre la pantalla, o sea que quedan fuera de cualquier
SafeAreaView y el de ubicacion caia justo sobre la barra de inicio.

## En el celular, el mapa es la pantalla

Abajo de 880px —el mismo corte donde desaparece la barra lateral— la seccion
del mapa se va a sangre: se esconde la barra superior, el `<main>` pierde el
padding y el mapa toma `100dvh` (dvh y no vh, porque en el navegador del
celular 100vh incluye la barra de direcciones que despues se retrae y el mapa
quedaba cortado por abajo). Es la maqueta de la landing y es lo que ya hacia la
app nativa: una franja fija arriba se come el alto justo donde uno esta
mirando.

El acceso al menu no se pierde, se muda: pasa a flotar en vidrio dentro del
mapa, en la misma fila que el cartel del rio. El cajon (`.menu-movil`) tambien
paso a vidrio — era azul marino liso, y sobre el mapa a pantalla completa lo
tapaba entero y rompia con el resto de los controles.

El boton de **pantalla completa queda solo en escritorio**: en el celular el
mapa ya ocupa todo, asi que ahi no expandia nada y solo gastaba lugar en la
unica fila que compite con el cartel del rio.

## Listado de lugares: la alternativa al mapa

El mapa contesta bien "que tengo cerca", pero es malo para dos cosas muy
reales: buscar por nombre —el parador que te recomendaron y no sabes donde
queda— y recorrer todo lo que hay cuando los pines se amontonan o quedan fuera
del encuadre. La seccion **Lugares** (`frontend/src/nauta/ListaLugares.jsx`)
cubre eso, con busqueda por nombre y filtros por rubro.

Ordena por la distancia que **muestra**, no por la que trajo el backend. Son
dos numeros distintos: `distancia_km` se calculo cuando se pidio la lista y el
de la pantalla se recalcula con la posicion actual. Confiar en el orden del
backend dejaba filas de 2,2 · 7,3 · 3,5 km, que parece un error aunque cada
numero este bien. Sin ubicacion va alfabetico, que es el unico orden honesto
que queda, y se avisa por que.

## El pronostico tiene que salir aunque Open-Meteo no conteste

Open-Meteo es gratis y sin API key, lo que en la practica significa **cuota por
IP**. El backend corre en el plan free de Render, cuya IP de salida es
compartida con otros inquilinos, asi que la cuota se agota por motivos que no
tienen nada que ver con el trafico de AlgoRio. Cuando eso pasaba, `/api/clima`
devolvia 503 y el nauta veia "No pudimos consultar el pronostico ahora" — el
dato por el que abrio la app.

El agravante estaba en la propia cache. La celda era de **0,01 grados (~1 km)**,
y eso tiene tres consecuencias que se suman:

- El modelo global de Open-Meteo tiene resolucion de ~11 km. Pedir por celdas
  de 1 km no daba un pronostico mas fino: daba el mismo dato interpolado,
  multiplicado por cien llamadas.
- Dos personas a diez cuadras generaban dos consultas distintas, y una lancha
  en movimiento generaba una nueva cada kilometro.
- El respaldo a datos vencidos existia, pero solo servia para la celda exacta,
  que casi nunca era la misma dos veces.

Y encima la cache vivia solo en memoria: Render apaga el proceso a los 15
minutos sin trafico, asi que arrancaba vacia varias veces por dia y obligaba a
salir a la ruta justo cuando mas probable era fallar.

### Como queda

La celda pasa a **0,1 grados**, que es la resolucion real del modelo: mismo
dato, cien veces menos llamadas. La cache se guarda ademas en Postgres (tabla
`clima_cache`), asi que un proceso recien despertado ya sabe como venia el
viento. Y la respuesta baja por una cascada, en este orden:

| Paso | De donde sale | Cuando |
| --- | --- | --- |
| 1 | Memoria del proceso | Hay dato de menos de 15 min |
| 2 | `clima_cache` en Postgres | Idem, pero el proceso se reinicio |
| 3 | Open-Meteo | No hay nada fresco (con 3 reintentos) |
| 4 | El dato vencido de esa celda | Open-Meteo no contesto |
| 5 | La celda cacheada mas cercana (hasta ~65 km) | Esa celda nunca se consulto |
| 6 | 503 | No hay nada, o lo que hay ya no sirve |

Los pasos 4 y 5 son los que sacan al nauta de la pantalla de error. Un
pronostico de hace dos horas sigue sirviendo para decidir si salir; una
pantalla de error no sirve para nada.

### Los limites del respaldo

Servir un dato viejo solo es defendible con limites, porque alguien se mete al
rio con esto. Son tres:

**Techo de seis horas** (`MAX_SEGUNDOS_RESPALDO`). Pasado eso se devuelve el
503. Un numero al que no hay que creerle es peor que no tener numero, por mas
que se aclare de cuando es.

**Techo de ~65 km** (`GRADOS_MAX_VECINA`). El viento de Rosario no dice nada
del de Corrientes, y estan a 700 km.

**El "ahora" no es la medicion vieja.** Esta es la parte que importa. La
respuesta de Open-Meteo tiene dos mitades que envejecen distinto:

| | Que es | A las tres horas |
| --- | --- | --- |
| `current` | Una **medicion**, con `interval` de 900 s | Es simplemente falsa |
| `hourly` | Un **pronostico** que cubre las horas siguientes | Sigue teniendo una prediccion para esta hora |

Asi que cuando lo que se sirve es un respaldo, el bloque "ahora" se arma con la
fila de la serie que corresponde a la hora actual, y no repitiendo la medicion
vencida. Mostrar "viento 3 km/h" porque eso se midio a las 9 de la mañana,
cuando la serie para las 15 decia 13 km/h, seria exactamente la informacion
falsa que hay que evitar. La respuesta lo marca con `actual_estimado` y la app
lo dice: "la prevision para esta hora, calculada hace 3 h" y no "el viento es".

### Pero se dice que es viejo

La respuesta trae `edad_min` y `desactualizado`, y la app los muestra: un aviso
en la pantalla de Clima y, en el cartel sobre el mapa —donde no hay lugar para
un aviso— la antiguedad pegada al numero del viento, que es donde la ve alguien
que mira de reojo.

Esto no es un detalle de cortesia. Servir un dato viejo disfrazado de fresco es
peor que fallar: alguien decide meterse al rio con eso. Es el mismo criterio
que los reportes que vencen y que los tres mensajes distintos del AIS.

El aviso tambien aparece cuando el que no pudo actualizar fue el navegador, no
el backend: el dato en pantalla puede ser bueno y viejo igual.

### El caso duro: que Render no pueda salir nunca

Toda la cascada de arriba asume que el backend consigue una respuesta buena de
vez en cuando: la cache se llena sola con el uso normal. Si la IP de Render
queda del lado equivocado de la cuota de forma sostenida, no consigue ninguna
—y una cache que no se llena nunca no es respaldo de nada.

Para eso esta `scripts/refrescar_clima.py`, que escribe `clima_cache` desde
afuera del backend:

```bash
python -m scripts.refrescar_clima
```

Corre desde cualquier lado con salida a internet (una maquina, una Action, un
cron en otro proveedor) y deja el pronostico en la base; el backend lo lee sin
salir a la ruta. Las celdas no se inventan: salen de los POIs publicados y del
centro por defecto, que es donde de verdad hay gente mirando el mapa.

Con eso, que Render pueda o no llegar a Open-Meteo deja de ser un requisito
para que la app muestre el viento.

## Pipeline de datos hidrologicos

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

## Rendimiento: el esquema y el pool

Dos cosas hacian que abrir o guardar cualquier cosa tardara segundos, y las dos
estaban en la capa de base:

**El esquema se declaraba en cada operacion.** `inicializar_db()` corre 34
sentencias (CREATE TABLE IF NOT EXISTS, indices, ALTERs de migracion) y estaba
llamado desde 42 lugares del backend. Medido contra la base real: **2.737 ms por
llamada**. Ahora se cachea por proceso (`_esquema_listo` en `db.py`, con candado
porque uvicorn atiende los endpoints sincronicos en un threadpool) y se corre
una sola vez en el arranque, desde el `lifespan` de FastAPI. Los 42 call sites
no cambiaron: siguen llamando igual, solo que desde la segunda vez es gratis.

**Cada `conexion()` abria una conexion nueva a Neon y la cerraba.** TCP + TLS +
autenticacion, **~330 ms por uso**, y un solo request abre varias. Ahora hay un
pool (`psycopg_pool`), con `check=ConnectionPool.check_connection` porque Neon
cierra las conexiones ociosas por su cuenta y sin eso el pool entregaria una
conexion muerta.

El efecto, sobre la base real:

| | Antes | Ahora |
|---|---|---|
| `obtener_usuario()` | 2.753 ms | **95 ms** |
| `estado_de_suscripcion()` | 4.269 ms | **81 ms** |

Lo que queda son ~40 ms de red por viaje a Neon. Por eso
`_cuenta_y_suscripcion()` junta en una sola consulta lo que antes eran dos
(`_rol_de` y `_fila_suscripcion`): las paga cada endpoint protegido, porque
`tiene_acceso()` es una dependency de FastAPI.

**Lo que no arregla el codigo:** el backend corre en el plan free de Render, que
duerme el servicio tras ~15 min sin trafico y tarda ~50 s en despertar (ver
`app_movil/src/api.js`). Si a veces la espera es de segundos y otras de casi un
minuto, eso es lo segundo.

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

## Dominios: dos webs, un backend, una base

| URL | Que atiende |
| --- | --- |
| `algorio.com.ar` | La landing recreativa (repo `algorio_landing`) |
| `algorio.com.ar/pro/` | La landing de Pro, misma build |
| `app.algorio.com.ar` | **AlgoRío** — perfiles `recreativo` y `comercio` |
| `pro.algorio.com.ar` | **AlgoRío Pro** — perfil `naviera` |
| `<sub>.algorio.com.ar/api/*` | Proxeado al backend en Render (`frontend/vercel.json`) |

Los dos subdominios salen del **mismo `frontend/`**. Lo que se separo es la
interfaz, no la identidad: sigue habiendo una sola tabla `usuarios`, una sola
de `suscripciones` y un solo pipeline de datos hidrologicos, que los dos
consultan (`/api/nivel-rio` lo usa tanto el kayakista como el dashboard de la
naviera). Separar las bases habria obligado a replicar el historico en las dos.

**Que dominio es cual lo decide `frontend/src/producto.js`, por hostname.** Es
por hostname y no por variable de build a proposito: funciona igual si los dos
dominios apuntan al mismo proyecto de Vercel o si son dos proyectos. Si algun
dia son dos y se quiere podar mas el bundle, `VITE_PRODUCTO` le gana al
hostname. En local, `?producto=pro` sirve para mirar el otro producto contra el
mismo `npm run dev` (solo en dev; en produccion se ignora).

Los shells se cargan con `React.lazy`, asi que cada dominio se descarga solo el
suyo aunque el build sea el mismo: `app.` no baja `AppShell` ni recharts ni
jspdf, que son ~900 KB de Pro.

**El rol y el dominio tienen que coincidir.** Antes habia un solo dominio y el
default de `ShellSegunRol` era `AppShell`, "porque es lo que era toda cuenta
antes de que existieran los roles". Ese default ya no sirve: en `app.` montaria
el producto equivocado. Ahora el rol que no pertenece a este dominio no cae en
ningun shell — `CuentaDeOtroProducto` explica y ofrece el link al otro.

**Las sesiones son independientes.** `SessionMiddleware` va sin `domain=`, asi
que la cookie es host-only y cada subdominio guarda la suya: entrar en uno no
entra en el otro. Es deliberado (son dos publicos que no se solapan). Si algun
dia se quiere una sola sesion, el cambio es agregarle
`domain=".algorio.com.ar"` a ese middleware en `backend/main.py`.

Para el navegador el backend nunca se expone directo: `/api/*` sale del mismo
origen que la app porque Vercel lo reescribe hacia Render.

**Al agregar un subdominio nuevo hay que acordarse de Google**: el Client ID de
OAuth valida el origen, asi que `pro.algorio.com.ar` tiene que estar en los
*Authorized JavaScript origins* de Google Cloud Console y `VITE_GOOGLE_CLIENT_ID`
definida en su proyecto de Vercel. Si falta, el boton de Google no aparece y no
es obvio por que.

La app movil es la excepcion: no tiene ese reverse proxy delante y le pega
directo a `algorio-backend.onrender.com` con token Bearer. Por eso el backend
ahora sí monta `CORSMiddleware`, con la lista explicita de origenes de la env
var `ORIGENES_CORS` (React Native no aplica CORS, pero `expo start --web` sí).

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
│   ├── main.py               # API (FastAPI): auth, datos, activos, POIs + sirve el frontend
│   ├── auth.py                # usuarios, hash de contraseñas, rol y preferencias
│   ├── tokens.py               # token Bearer para la app movil (itsdangerous)
│   ├── activos.py               # CRUD de "Mi flota" (embarcaciones/dragas/muelles/tramos)
│   ├── pois.py                   # paradores/cabañas/lanchas-taxi: alta, moderacion, metricas
│   ├── tablero.py                 # cruces de las lanchas-taxi: estados, vigencia (sin moderacion)
│   ├── reportes.py                # avisos efimeros del rio (vencen solos, sin cron)
│   ├── resenas.py                  # puntajes y comentarios de los nautas
│   ├── clima.py                    # Open-Meteo + veredicto por embarcacion + cache con respaldos
│   ├── suscripciones.py             # planes por rol y control de acceso
│   ├── crear_usuario.py              # CLI para dar de alta un usuario (getpass, no via web)
│   └── datos.py                       # lectura de los CSV, normalizacion, umbrales y alertas
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
│       ├── comercio/                           # PERFIL COMERCIO — shell propio
│       │   ├── ShellComercio.jsx                 # layout + estado de la ficha
│       │   ├── AltaComercio.jsx                   # asistente de alta en 3 pasos
│       │   ├── MapaUbicacion.jsx                   # Leaflet satelital, pin arrastrable
│       │   ├── MiComercio.jsx, EditorCarta.jsx,
│       │   │   EditorHorarios.jsx                    # edicion de la ficha
│       │   ├── EditorTablero.jsx                      # cruces: interruptores en vivo + campos
│       │   ├── MetricasComercio.jsx                   # clicks recibidos (recharts)
│       │   └── ResenasComercio.jsx                     # lo que dicen los nautas
│       ├── nauta/                              # PERFIL RECREATIVO — version web
│       │   ├── ShellNauta.jsx                    # layout + onboarding de embarcacion
│       │   ├── MapaNauta.jsx                      # satelital, pines por rubro, capa de vidrio encima
│       │   ├── PanelLugar.jsx                      # ficha: menu, horarios, contacto, reseñas
│       │   ├── TableroCruces.jsx                    # el cartel de salidas de una lancha-taxi
│       │   ├── ClimaNauta.jsx                       # 48 h de viento y rafagas
│       │   ├── PerfilNauta.jsx                       # embarcacion + mis reseñas
│       │   └── constantes.js                          # embarcaciones, rubros, horarios
│       ├── admin/
│       │   └── ModeracionPois.jsx                        # cola de aprobacion (solo es_admin)
│       ├── tablero.js                                     # estados y cuentas del tablero, compartido
│       ├── mapaSatelital.js                               # capa Esri + pines (punto y terminal)
│       └── components/                                     # PERFIL NAVIERA + comunes
│           ├── Login.jsx, Registro.jsx, SelectorRol.jsx,
│           │   AppShell.jsx, Sidebar.jsx, TopBar.jsx        # shell + autenticacion
│           ├── Dashboard.jsx, DashboardGeneral.jsx,
│           │   TablaIna.jsx, TablaPrefectura.jsx, TablaYacyreta.jsx
│           ├── Alertas.jsx
│           ├── MapaEstaciones.jsx                        # Leaflet + clustering + panel lateral
│           └── MiFlota.jsx, FormActivo.jsx                # CRUD de "Mi flota"
├── app_movil/                # PERFILES RECREATIVO y COMERCIO — Expo (ver app_movil/README.md)
│   ├── app/
│   │   ├── index.jsx           # rutea por rol al abrir la app
│   │   ├── (tabs)/              # nauta: mapa, clima, perfil
│   │   ├── (comercio)/           # comerciante: ficha, metricas, reseñas, cuenta
│   │   └── comercio/              # alta, horarios, carta, tablero y ubicacion (pantallas sueltas)
│   └── src/                     # sesion con token, cliente HTTP, tema, ubicacion
└── data/
    ├── per_source/            # dataset_<fuente>.csv
    └── historical/             # dataset_historico_largo.csv
```
