// Tabla de referencia de categorias de embarcacion para "Mi flota": al elegir
// una categoria se auto-completan estas caracteristicas por defecto (todas
// quedan editables despues, ver FormActivo.jsx). Los valores numericos "limpios"
// (eslora/manga/puntal) y los que vienen como rango o texto (DWT, borde
// libre, radar) se guardan todos como texto: la tabla original mezcla ambos
// formatos (ej. "65.000-80.000" o "Segun linea de carga (SOLAS)").
export const CATEGORIAS_EMBARCACION = {
  panamax: {
    etiqueta: "Panamax (buque oceánico)",
    oceanico: true,
    tipo_general: "Buque oceánico",
    eslora_m: "225",
    manga_m: "32.2",
    puntal_m: "18.5",
    calado_max_pies: "39.5",
    borde_libre_min_m: "Según línea de carga (SOLAS)",
    dwt_capacidad_t: "65.000-80.000",
    ton_por_pie: "2.000",
    radar_apto_rio: "N/A (navega solo hasta Timbúes, km 460)",
  },
  handymax: {
    etiqueta: "Handymax (buque oceánico)",
    oceanico: true,
    tipo_general: "Buque oceánico",
    eslora_m: "190",
    manga_m: "32.2",
    puntal_m: "17.0",
    calado_max_pies: "34.0",
    borde_libre_min_m: "Según línea de carga (SOLAS)",
    dwt_capacidad_t: "45.000-50.000",
    ton_por_pie: "1.600",
    radar_apto_rio: "N/A (ídem)",
  },
  handy: {
    etiqueta: "Handy (buque oceánico)",
    oceanico: true,
    tipo_general: "Buque oceánico",
    eslora_m: "150",
    manga_m: "23.0",
    puntal_m: "13.0",
    calado_max_pies: "30.0",
    borde_libre_min_m: "Según línea de carga (SOLAS)",
    dwt_capacidad_t: "28.000-35.000",
    ton_por_pie: "1.300",
    radar_apto_rio: "N/A (ídem)",
  },
  fluviomaritimo: {
    etiqueta: "Buque fluviomarítimo (cabotaje)",
    oceanico: false,
    tipo_general: "Buque de menor porte",
    eslora_m: "100",
    manga_m: "16.0",
    puntal_m: "7.0",
    calado_max_pies: "22.0",
    borde_libre_min_m: "0.5",
    dwt_capacidad_t: "3.000-8.000",
    ton_por_pie: "400",
    radar_apto_rio: "Sí, recomendado",
  },
  convoy_estandar: {
    etiqueta: "Convoy estándar (1 barcaza tipo)",
    oceanico: false,
    tipo_general: "Barcaza individual",
    eslora_m: "60",
    manga_m: "12.0",
    puntal_m: "3.5",
    calado_max_pies: "10.5 (≈3.2 m)",
    borde_libre_min_m: "0.3 (1 pie, mínimo regulatorio)",
    dwt_capacidad_t: "1.500-1.750",
    ton_por_pie: "165",
    radar_apto_rio: "Categoría A/B según remolcador",
  },
  convoy_grande: {
    etiqueta: "Convoy grande (16 barcazas)",
    oceanico: false,
    tipo_general: "Convoy de empuje completo",
    eslora_m: "320",
    manga_m: "60.0",
    puntal_m: "3.5",
    calado_max_pies: "10.5 (≈3.2 m)",
    borde_libre_min_m: "0.3",
    dwt_capacidad_t: "~24.000 (total)",
    ton_por_pie: "N/A (se calcula por barcaza)",
    radar_apto_rio: "Categoría A (radar apto río)",
  },
  barcaza_chica: {
    etiqueta: "Barcaza chica regional",
    oceanico: false,
    tipo_general: "Barcaza individual",
    eslora_m: "65",
    manga_m: "12.0",
    puntal_m: "3.0",
    calado_max_pies: "10.0 (≈3.0 m)",
    borde_libre_min_m: "0.3",
    dwt_capacidad_t: "1.500",
    ton_por_pie: "150",
    radar_apto_rio: "Categoría B (sin radar)",
  },
  arenera_draga: {
    etiqueta: "Arenera / draga fluvial",
    oceanico: false,
    tipo_general: "Equipo de extracción, no de carga",
    eslora_m: "35",
    manga_m: "9.0",
    puntal_m: "2.5",
    calado_max_pies: "Variable operativo (2.0-2.5 m)",
    borde_libre_min_m: "0.3",
    dwt_capacidad_t: "N/A (no aplica DWT)",
    ton_por_pie: "N/A",
    radar_apto_rio: "No aplica (no navega tramos regulados de altura mar)",
  },
  remolcador: {
    etiqueta: "Remolcador de empuje (solo)",
    oceanico: false,
    tipo_general: "Unidad de propulsión del convoy",
    eslora_m: "35",
    manga_m: "10.0",
    puntal_m: "4.0",
    calado_max_pies: "3.0",
    borde_libre_min_m: "0.3",
    dwt_capacidad_t: "N/A (no carga propia)",
    ton_por_pie: "N/A",
    radar_apto_rio: "Determina la categoría de todo el convoy",
  },
};

// Estaciones del Paraná/Río de la Plata aguas abajo del complejo portuario
// Timbúes-San Lorenzo-Rosario (km ~460 de la Hidrovía), hasta donde llegan
// los buques oceánicos (Panamax/Handymax/Handy). Es una aproximacion en base
// a la geografia conocida del tramo, no una carta nautica oficial: convendria
// que alguien con expertise real en la hidrovia la revise. Cualquier estacion
// que no este en esta lista (otro rio, o mas arriba en el Parana) no ofrece
// las categorias oceanicas, porque esos buques no llegan fisicamente.
const ESTACIONES_APTAS_OCEANICOS = new Set([
  "BUENOS AIRES", "LA PLATA", "TIGRE", "SAN FERNANDO", "SAN ISIDRO", "OLIVOS",
  "MARTIN GARCIA", "ATALAYA", "ESCOBAR", "CAMPANA", "ZARATE", "BARADERO",
  "SAN PEDRO", "RAMALLO", "SAN NICOLAS", "VILLA CONSTITUCION", "ROSARIO", "SAN LORENZO",
]);

function normalizarNombre(valor) {
  return (valor ?? "").trim().toUpperCase();
}

// Lista [clave, datos] de categorias ofrecibles para una estacion de referencia dada.
export function categoriasDisponibles(nombreEstacion) {
  const permiteOceanicos = ESTACIONES_APTAS_OCEANICOS.has(normalizarNombre(nombreEstacion));
  return Object.entries(CATEGORIAS_EMBARCACION).filter(
    ([, datos]) => !datos.oceanico || permiteOceanicos,
  );
}
