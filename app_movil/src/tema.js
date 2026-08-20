// La identidad visual de AlgoRío en la app: los mismos colores y la misma
// tipografia que la web (ver frontend/src/index.css). Se repiten aca y no se
// importan porque son dos proyectos distintos: la alternativa seria un paquete
// compartido para un puñado de constantes.

// La unica tipografia que la app carga: la del wordmark "AlgoRio".
//
// El texto comun va en la fuente del sistema (San Francisco en iPhone, Roboto
// en Android) y por eso no figura acá: en React Native, no declarar
// `fontFamily` ya da esa fuente. Ver src/Texto.jsx para el porqué.
//
// OJO: este archivo trae 187 glifos y ninguna vocal acentuada, por eso el logo
// se escribe sin tilde. Cualquier otro texto usaria la del sistema, que si
// tiene los acentos.
export const FUENTES = {
  glockgrotesque: require("../assets/fuentes/glockgrotesque-medium.otf"),
};

export const FUENTE_MARCA = "glockgrotesque";
export const COLORES = {
  fondo: "#f6f4ef",
  superficie: "#ffffff",
  texto: "#17242e",
  textoSuave: "#5c6b76",
  borde: "#e4e1d8",
  bordeSuave: "#eeece5",
  acento: "#1d6fa5",
  acentoClaro: "#4fb3d9",
  chipFondo: "#eaf6fb",
  marca: "#0b3252",
  marcaSuave: "#0f4066",
  marcaTextoSuave: "#bcd8e8",
  ok: "#2e8f56",
  alerta: "#b8790b",
  peligro: "#c0392b",
};

/**
 * El mismo color, con alfa. Devuelve "rgba(...)".
 *
 * React Native no tiene `color-mix()` ni acepta "#4fb3d9AA" en todas las
 * plataformas de forma pareja, y los pines del mapa necesitan justamente eso:
 * el color del rubro o de la severidad, translucido, sobre la imagen
 * satelital (ver CuerpoVidrio en app/(tabs)/index.jsx).
 *
 * Acepta hex de 3 o 6 digitos. Si le llega algo que no entiende lo devuelve
 * tal cual: un pin con el color pleno es feo, pero es mejor que un pin
 * invisible por un color que no se pudo parsear.
 */
export function conAlfa(color, alfa) {
  const hex = String(color).trim();
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const largo = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!corto && !largo) return color;
  const [r, g, b] = corto
    ? corto.slice(1).map((c) => parseInt(c + c, 16))
    : largo.slice(1).map((c) => parseInt(c, 16));
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

// El vidrio de las capas que van ARRIBA del mapa. No es un color mas de la
// paleta: es la unica superficie de la app que se apoya sobre imagen
// satelital, y por eso se define aparte.
//
// Va oscuro y no claro por una razon concreta: el mapa hibrido es oscuro y
// saturado (agua, monte, sombras), y un vidrio claro encima levanta el fondo
// hasta que el texto negro deja de tener contraste justo donde el rio es mas
// claro. Con vidrio oscuro y texto blanco el contraste no depende de que haya
// abajo.
//
// La opacidad es la que hace el trabajo cuando el desenfoque no esta
// disponible (Android viejo, o `expo-blur` cayendo a su modo simple): con
// 0.55 el texto se lee igual aunque el blur no llegue a aplicarse nunca.
export const VIDRIO = {
  fondo: "rgba(9, 26, 40, 0.55)",
  fondoDenso: "rgba(9, 26, 40, 0.72)",
  borde: "rgba(255, 255, 255, 0.16)",
  texto: "#ffffff",
  textoSuave: "rgba(255, 255, 255, 0.68)",
  separador: "rgba(255, 255, 255, 0.14)",
  intensidadDesenfoque: 28,
};

// Como se pinta cada veredicto de "¿esta picado?" (ver backend/clima.py).
//
// El color ya no pinta la barra entera: la barra es vidrio neutro y esto queda
// en un punto al lado del veredicto. Una franja roja a lo ancho de la pantalla
// gritaba lo mismo un dia de 30 km/h que uno de 60, y de paso tapaba el mapa,
// que es lo que la persona vino a mirar. El punto se sigue viendo de reojo
// —que es todo lo que un semaforo tiene que hacer— sin quedarse con la
// pantalla.
export const COLOR_POR_ESTADO_RIO = {
  calmo: COLORES.ok,
  picado: COLORES.alerta,
  muy_picado: COLORES.peligro,
  sin_datos: COLORES.textoSuave,
};

// Sobre vidrio oscuro, el ambar y el verde de la paleta (pensados para texto
// sobre crema) quedan apagados. Estos son los mismos tonos subidos de
// luminosidad para que el punto se distinga a contraluz.
export const COLOR_ESTADO_SOBRE_VIDRIO = {
  calmo: "#4fd08a",
  picado: "#f0b429",
  muy_picado: "#ff6b52",
  sin_datos: "rgba(255, 255, 255, 0.5)",
};

// Los tres colores salen de la paleta de marca de arriba, como una rampa de
// claridad (claro, medio, oscuro) y no como tres azules del mismo valor:
// sobre imagen satelital la diferencia de luminosidad se distingue de lejos y
// la de matiz no. Tienen que coincidir con
// frontend/src/nauta/constantes.js, que pinta los mismos pines en la web.
export const TIPOS_POI = {
  parador: { etiqueta: "Parador", color: COLORES.acentoClaro, emoji: "🍽️" },
  alojamiento: { etiqueta: "Alojamiento", color: COLORES.acento, emoji: "🛏️" },
  lancha_taxi: { etiqueta: "Lancha-taxi", color: COLORES.marca, emoji: "🚤" },
};

export const tipoPoi = (clave) =>
  TIPOS_POI[clave] ?? { etiqueta: "Lugar", color: COLORES.textoSuave, emoji: "📍" };

// Lo que un nauta puede reportar. Las claves las valida el backend
// (backend/reportes.py: TIPOS_VALIDOS) y tienen que coincidir con
// frontend/src/nauta/constantes.js, que dibuja lo mismo en la web.
//
// `pideDetalle` en "animal" no es un capricho: "hay un animal" no le dice nada
// a nadie. Una cosa es un carpincho y otra un yacare en el lugar donde ibas a
// bajar a los chicos.
export const TIPOS_REPORTE = {
  animal: { etiqueta: "Animal", emoji: "🐾", pideDetalle: true, ejemploDetalle: "Yacaré, carpincho…" },
  banco_arena: { etiqueta: "Banco de arena", emoji: "🏝️", pideDetalle: false },
  arbol: { etiqueta: "Árbol o tronco", emoji: "🪵", pideDetalle: false },
  basura: { etiqueta: "Basura", emoji: "🗑️", pideDetalle: false },
  otro: { etiqueta: "Otro", emoji: "📌", pideDetalle: true, ejemploDetalle: "¿Qué viste?" },
};

export const tipoReporte = (clave) =>
  TIPOS_REPORTE[clave] ?? { etiqueta: "Reporte", emoji: "📌", pideDetalle: false };

// Cuanto pesa el aviso. No es lo mismo "vi carpinchos, lindo lugar" que "hay
// un tronco cruzado en el paso": el mapa los pinta distinto y el nauta decide
// de un vistazo a que prestarle atencion.
// El color de la severidad EN EL MAPA es otro que el de la interfaz, por la
// misma razon que existe --vidrio-picado al lado de --alerta: los de la paleta
// estan pensados para chips y texto sobre crema, y sobre el rio no funcionan.
// `--alerta` es #b8790b, un ocre a CINCO grados de tono del agua del Parana:
// el pin de advertencia era invisible sobre el rio.
//
// El pin de aviso es vidrio CLARO, al reves que el de un lugar. No es solo
// estetica: sobre el satelital —que es oscuro— un cuerpo palido da 6,0 de
// contraste donde el navy da 2,4. Lo que lo sostiene sobre los fondos claros
// (arena, bancos) es un filo fino de navy de marca, que ahi da 3,7 y 5,3. Dos
// mecanismos complementarios otra vez, pero invertidos respecto del pin de
// lugar. Ver .marcador-reporte en index.css / app/(tabs)/index.jsx, que tiene la medicion.
//
// La severidad escala por dos canales, los dos discretos:
//
//   clave        cuerpo     tamaño
//   comentario   #f4fbfe    28 px
//   advertencia  #cfe9f7    32 px
//   alerta       #a9d8ee    36 px
//
// El segundo canal es el TAMAÑO y no el grosor del filo. Se probo con el
// grosor (1 / 1,5 / 2 px) y no funciona: el navegador redondea los bordes a
// pixeles del dispositivo y el escalon del medio colapsa contra el primero
// (medido: 1 px y 1,5 px terminaban los dos en 0,8 px reales). El tamaño no se
// redondea, se lee de lejos, y —a diferencia de un anillo— no agrega nada
// brillante ni grueso: el filo queda en 1 px parejo para los tres.
//
// Y aca hay una concesion que conviene tener escrita, porque no es un descuido:
// con la gama de la marca (azules y celestes), cuerpo claro y sin anillos
// gruesos, los tres tintes no pueden ser muy distintos entre si — quedan a 1,2
// de contraste. Se probaron rampas mas largas, llegando a #5aa8d0 para alerta,
// y ese escalon caia a 2,30 sobre el agua turbia, abajo del umbral. El color
// hace lo que puede; el tamaño hace el resto.
export const SEVERIDADES = [
  { clave: "comentario", etiqueta: "Comentario", ayuda: "Está bueno saberlo.",
    color: COLORES.acento, colorMapa: "#f4fbfe", tamanoMapa: 28 },
  { clave: "advertencia", etiqueta: "Advertencia", ayuda: "Ojo con esto.",
    color: COLORES.alerta, colorMapa: "#cfe9f7", tamanoMapa: 32 },
  { clave: "alerta", etiqueta: "Alerta", ayuda: "Peligro real.",
    color: COLORES.peligro, colorMapa: "#a9d8ee", tamanoMapa: 36 },
];

export const severidadPorClave = (clave) =>
  SEVERIDADES.find((s) => s.clave === clave) ?? SEVERIDADES[0];

// Las tres duraciones cubren los casos reales: un dia para algo que vi hoy, dos
// para un fin de semana largo, una semana para algo que va a seguir ahi.
export const DURACIONES = [
  { horas: 24, etiqueta: "24 h" },
  { horas: 48, etiqueta: "2 días" },
  { horas: 168, etiqueta: "1 semana" },
];
