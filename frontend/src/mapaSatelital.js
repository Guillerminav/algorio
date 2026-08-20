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
