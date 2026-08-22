import L from "leaflet";

// Capa satelital de Esri. Se usa en las dos pantallas de mapa del producto
// nuevo (la del comerciante para marcar su pin, la del nauta para navegar):
// con la capa de calles de OSM el río es una mancha azul lisa, y acá se ven
// los bancos de arena y la costa real, que es justo el dato.
export const TILES_SATELITAL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ATRIBUCION_SATELITAL = "Imágenes &copy; Esri, Maxar, Earthstar Geographics";

// Capa de nombres (pueblos, rutas) para poner encima del satelital: sin ella
// se ve el terreno pero no hay forma de ubicarse.
export const TILES_ETIQUETAS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

// Las capas entre las que se puede elegir en el mapa.
//
// Leaflet no provee mapas: dibuja los mosaicos de quien se le indique. Esto es
// esa lista de "quien", y cada entrada trae su atribucion porque las licencias
// la exigen — no es un adorno, es la condicion de uso.
//
// `conEtiquetas` marca las que necesitan la capa de nombres encima. Las dos
// satelitales la necesitan (sin ella se ve el terreno pero no hay forma de
// ubicarse); las demas ya traen los nombres dibujados.
//
// Sobre que tan RECIENTES son: todas estas son mosaicos de imagen aerea o
// dibujos vectoriales, y se actualizan por zona cada uno o varios años. La
// unica forma de tener imagen de esta semana es satelite optico (Sentinel-2,
// ~10 m por pixel), que necesita una clave de API y por eso no esta aca.
export const CAPAS = [
  {
    clave: "satelital",
    etiqueta: "Satelital",
    detalle: "Se ven los bancos de arena y la costa real",
    url: TILES_SATELITAL,
    atribucion: ATRIBUCION_SATELITAL,
    maxZoom: 19,
    conEtiquetas: true,
  },
  {
    clave: "clarity",
    etiqueta: "Satelital nítido",
    detalle: "Otra cosecha de imágenes: a veces más nueva y con menos nubes",
    url: "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    atribucion: "Imágenes &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    conEtiquetas: true,
  },
  {
    clave: "claro",
    etiqueta: "Claro",
    detalle: "Fondo blanco, para leer nombres sin que moleste la imagen",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    atribucion: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 20,
  },
  {
    clave: "topo",
    etiqueta: "Topográfico",
    detalle: "Relieve y curvas de nivel de la costa",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    atribucion: "&copy; Esri, HERE, Garmin, USGS, NGA",
    maxZoom: 19,
  },
];

export const CAPA_POR_DEFECTO = "satelital";

export const capaPorClave = (clave) =>
  CAPAS.find((c) => c.clave === clave) ?? CAPAS[0];

// Donde se recuerda la elegida. Se guarda para que no haya que volver a
// elegirla en cada pantalla ni en cada visita: quien prefiere el mapa claro lo
// prefiere siempre, no una vez.
export const CLAVE_CAPA_GUARDADA = "algorio_capa_mapa";

export function capaGuardada() {
  try {
    return capaPorClave(window.localStorage.getItem(CLAVE_CAPA_GUARDADA)).clave;
  } catch {
    // localStorage puede tirar en modo privado de algunos navegadores. No es
    // motivo para no dibujar el mapa.
    return CAPA_POR_DEFECTO;
  }
}

export function guardarCapa(clave) {
  try {
    window.localStorage.setItem(CLAVE_CAPA_GUARDADA, clave);
  } catch {
    /* si no se puede guardar, se usa igual en esta sesion */
  }
}

// Centro por defecto: Corrientes/Resistencia, sobre el Paraná. Es donde se
// abre el mapa mientras no hay permiso de ubicación o todavía no llegó la
// posición, para que la primera pantalla no sea un océano gris.
export const CENTRO_POR_DEFECTO = [-27.47, -58.83];

/**
 * Marcador circular del color del rubro.
 *
 * Se usa un divIcon y no el marcador por defecto de Leaflet porque ese carga
 * sus PNG por una ruta relativa que el build de Vite rompe. De paso permite
 * pintarlo con el color del rubro.
 *
 * El color viaja como `--tono-pin` y no como `background`: el pin ya no es un
 * disco de color liso sino vidrio teñido (ver .pin-vidrio en index.css), y el
 * tono lo usan tres capas distintas —el cuerpo translucido, el nucleo solido y
 * el halo—. Con `background` inline solo se podia pintar una.
 */
export function iconoCircular(color, { tamano = 26, clase = "marcador-poi" } = {}) {
  return L.divIcon({
    className: `${clase} pin-vidrio`,
    html: `<span style="--tono-pin:${color}"><i></i></span>`,
    iconSize: [tamano, tamano],
    iconAnchor: [tamano / 2, tamano / 2],
    popupAnchor: [0, -tamano / 2],
  });
}

// El barquito del cartel de la terminal. Va como SVG inline y no como emoji
// porque el emoji lo dibuja cada sistema a su manera —y en Windows sale a
// color, que sobre el satelital compite con los pines de reportes.
const GLIFO_LANCHA = `
<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
  <path fill="currentColor" d="M3.4 14.6h17.2l-2 4.2a1.4 1.4 0 0 1-1.3.8H6.7a1.4 1.4 0 0 1-1.3-.8Z"/>
  <path fill="currentColor" d="M6.2 8.4h11.6v5H6.2Z"/>
  <path fill="currentColor" d="M11.3 4.2h1.4v3.4h-1.4Z"/>
</svg>`;

/**
 * El pin de una lancha-taxi: un cartel de terminal, no un punto.
 *
 * Los tres rubros del mapa se distinguian solo por el color del pin, y eso
 * alcanza mientras los tres sean "un lugar al que se llega". Una lancha-taxi
 * no lo es: es de donde SALE el transporte. Es la misma distincion que hacen
 * los mapas de ciudad entre un comercio (punto) y una estacion (cartel con
 * forma propia), y se resuelve igual — por forma, que se lee sin zoom y sin
 * leer nada, y no por un tercer tono de azul.
 *
 * `estado` es el resumen del tablero (ver src/tablero.js: estadoResumen).
 * Cuando hay una alteracion —una demora, un cruce cancelado— el cartel lleva
 * un punto de ese color arriba a la derecha: es lo que hace que el nauta abra
 * ESE pin y no otro. Si esta todo normal no lleva nada, porque un mapa donde
 * todos los pines avisan algo es un mapa donde ninguno avisa nada.
 *
 * El ancla va al pie y no al centro: el cartel esta parado sobre el muelle, y
 * centrarlo lo dejaria tapando justo el punto que marca.
 */
export function iconoTerminal({ color = "#0b3252", estado = null } = {}) {
  const punto = estado
    ? `<i class="marcador-terminal-estado" style="background:${estado}"></i>`
    : "";
  return L.divIcon({
    className: "marcador-terminal pin-vidrio",
    html: `<span style="--tono-pin:${color}">${GLIFO_LANCHA}${punto}</span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 37],
    popupAnchor: [0, -32],
  });
}
