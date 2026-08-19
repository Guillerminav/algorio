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
 * Marcador circular de color.
 *
 * Se usa un divIcon y no el marcador por defecto de Leaflet porque ese carga
 * sus PNG por una ruta relativa que el build de Vite rompe. De paso permite
 * pintarlo con el color del rubro.
 */
export function iconoCircular(color, { tamano = 22, clase = "marcador-poi" } = {}) {
  return L.divIcon({
    className: clase,
    html: `<span style="background:${color}"></span>`,
    iconSize: [tamano, tamano],
    iconAnchor: [tamano / 2, tamano / 2],
    popupAnchor: [0, -tamano / 2],
  });
}
