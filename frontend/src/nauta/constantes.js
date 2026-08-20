// Vocabulario del perfil recreativo en web. Espeja app_movil/src/tema.js y
// app_movil/src/embarcaciones.js: son dos stacks distintos (DOM y React
// Native) y no pueden compartir componentes, pero las claves que viajan al
// backend tienen que ser las mismas.

// Con qué sale al río el usuario. Las claves las valida el backend
// (backend/auth.py: TIPOS_EMBARCACION_VALIDOS) y las usa backend/clima.py para
// calibrar desde qué viento avisa que el río está picado.
export const EMBARCACIONES = [
  { clave: "kayak", etiqueta: "Kayak", emoji: "🛶" },
  { clave: "canoa", etiqueta: "Canoa", emoji: "🛶" },
  { clave: "sup", etiqueta: "SUP / Tabla", emoji: "🏄" },
  { clave: "lancha", etiqueta: "Lancha", emoji: "🚤" },
  { clave: "semirrigido", etiqueta: "Semirrígido", emoji: "🛥️" },
  { clave: "velero", etiqueta: "Velero", emoji: "⛵" },
  { clave: "moto_agua", etiqueta: "Moto de agua", emoji: "🌊" },
  { clave: "otro", etiqueta: "Otro", emoji: "❓" },
];

export const embarcacionPorClave = (clave) =>
  EMBARCACIONES.find((e) => e.clave === clave) ?? null;

// Los rubros del mapa, con el color del pin. Mismas claves que
// backend/pois.py: TIPOS_VALIDOS.
//
// Los tres colores son de la paleta de marca (ver :root en index.css:
// --acento, --marca, --acento-claro) y no tres tonos cualquiera. Se eligieron
// como una rampa de claridad —claro, medio, oscuro— y no como tres azules del
// mismo valor: sobre imagen satelital, que ya es oscura y saturada, la
// diferencia de luminosidad se distingue de lejos y la de matiz no. El borde
// blanco de 3px del pin (ver .marcador-poi) es lo que los despega del fondo.
export const TIPOS_POI = {
  parador: { etiqueta: "Paradores", singular: "Parador", color: "#4fb3d9", emoji: "🍽️" },
  alojamiento: { etiqueta: "Alojamientos", singular: "Alojamiento", color: "#1d6fa5", emoji: "🛏️" },
  lancha_taxi: { etiqueta: "Lanchas-taxi", singular: "Lancha-taxi", color: "#0b3252", emoji: "🚤" },
};

export const tipoPoi = (clave) =>
  TIPOS_POI[clave] ?? { etiqueta: "Lugares", singular: "Lugar", color: "#5c6b76", emoji: "📍" };

// Lo que un nauta puede reportar. Las claves las valida el backend
// (backend/reportes.py: TIPOS_VALIDOS).
//
// `pideDetalle` en "animal" no es un capricho: "hay un animal" no le dice nada
// a nadie. Una cosa es un carpincho y otra un yacaré en el lugar donde ibas a
// bajar a los chicos.
export const TIPOS_REPORTE = {
  animal: { etiqueta: "Animal", emoji: "🐾", pideDetalle: true, ejemploDetalle: "Yacaré, carpincho, víbora…" },
  banco_arena: { etiqueta: "Banco de arena", emoji: "🏝️", pideDetalle: false },
  arbol: { etiqueta: "Árbol o tronco", emoji: "🪵", pideDetalle: false },
  basura: { etiqueta: "Basura", emoji: "🗑️", pideDetalle: false },
  otro: { etiqueta: "Otro", emoji: "📌", pideDetalle: true, ejemploDetalle: "¿Qué viste?" },
};

export const tipoReporte = (clave) =>
  TIPOS_REPORTE[clave] ?? { etiqueta: "Reporte", emoji: "📌", pideDetalle: false };

// Cuánto pesa el aviso. No es lo mismo "vi carpinchos, lindo lugar" que "hay
// un tronco cruzado en el paso": el mapa los pinta distinto y el nauta decide
// de un vistazo a qué prestarle atención.
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
// lugar. Ver .marcador-reporte en index.css, que tiene la medicion.
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
  { clave: "comentario", etiqueta: "Comentario", ayuda: "Algo que está bueno saber.",
    color: "var(--acento)", colorMapa: "#f4fbfe", tamanoMapa: 28 },
  { clave: "advertencia", etiqueta: "Advertencia", ayuda: "Ojo con esto.",
    color: "var(--alerta)", colorMapa: "#cfe9f7", tamanoMapa: 32 },
  { clave: "alerta", etiqueta: "Alerta", ayuda: "Peligro real, no pases.",
    color: "var(--evacuacion)", colorMapa: "#a9d8ee", tamanoMapa: 36 },
];

export const severidadPorClave = (clave) =>
  SEVERIDADES.find((s) => s.clave === clave) ?? SEVERIDADES[0];

// Las tres duraciones cubren los casos reales: un día para algo que vi hoy (un
// animal, un tronco suelto), dos para un fin de semana largo, una semana para
// algo que va a seguir ahí (un banco que se formó, basura acumulada).
export const DURACIONES = [
  { horas: 24, etiqueta: "24 horas" },
  { horas: 48, etiqueta: "2 días" },
  { horas: 168, etiqueta: "1 semana" },
];

/** "hace 20 min", "hace 3 h", "ayer". Un reporte vale por lo reciente. */
export function haceCuanto(iso) {
  if (!iso) return "";
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

/** Cuánto le queda de vigencia, para que se vea que esto caduca. */
export function vigenciaRestante(iso) {
  if (!iso) return "";
  const minutos = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutos <= 0) return "vencido";
  if (minutos < 60) return `vence en ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `vence en ${horas} h`;
  return `vence en ${Math.round(horas / 24)} días`;
}

/**
 * "hace 2 h", "hace 40 min". Para el aviso de pronóstico desactualizado.
 *
 * El backend sirve el último dato conocido cuando Open-Meteo no contesta, en
 * vez de romper la pantalla (ver backend/clima.py). Eso solo es honesto si se
 * dice de cuándo es: un viento de hace dos horas sirve para decidir si salir,
 * pero hay que saber que es de hace dos horas.
 */
export function antiguedadEnTexto(minutos) {
  if (!minutos || minutos < 1) return null;
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  return horas === 1 ? "hace 1 h" : `hace ${horas} h`;
}

// Como se pinta cada veredicto de "¿está picado?" (ver backend/clima.py).
// Semáforo, sin sutilezas: se mira de reojo antes de salir.
export const CLASE_POR_ESTADO_RIO = {
  calmo: "calmo",
  picado: "picado",
  muy_picado: "muy-picado",
  sin_datos: "sin-datos",
};

const DIAS_ORDEN = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

export const DIAS = [
  ["lun", "Lunes"], ["mar", "Martes"], ["mie", "Miércoles"], ["jue", "Jueves"],
  ["vie", "Viernes"], ["sab", "Sábado"], ["dom", "Domingo"],
];

/**
 * Si el lugar está abierto ahora, según pois.horarios.
 *
 * Devuelve null cuando ese día no tiene horario cargado: no es lo mismo que
 * estar cerrado, y afirmar "cerrado" sin saberlo haría que el nauta se saltee
 * un parador que estaba abierto.
 */
export function estadoApertura(horarios, ahora = new Date()) {
  if (!horarios) return null;
  const hoy = horarios[DIAS_ORDEN[ahora.getDay()]];
  if (!hoy) return null;
  if (hoy.cerrado) return { abierto: false, texto: "Cerrado hoy" };
  if (!hoy.abre || !hoy.cierra) return null;

  const aMinutos = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const abre = aMinutos(hoy.abre);
  const cierra = aMinutos(hoy.cierra);

  if (ahoraMin < abre) return { abierto: false, texto: `Abre ${hoy.abre}` };
  if (ahoraMin >= cierra) return { abierto: false, texto: "Cerrado" };
  return { abierto: true, texto: `Abierto hasta ${hoy.cierra}` };
}

export function formatearDistancia(km) {
  if (typeof km !== "number") return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Open-Meteo devuelve "2026-08-12T15:00" en hora local de la zona pedida.
export const formatearHora = (iso) => (iso ? iso.slice(11, 16) : "");

// El dia de esa marca de tiempo, sin la hora. Sirve para detectar el cambio de
// dia en el pronostico.
export const diaDe = (iso) => (iso ? iso.slice(0, 10) : "");

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * "Hoy", "Mañana" o "Jueves 14", segun cuan lejos este.
 *
 * Se construye la fecha con los componentes sueltos y no con `new Date(iso)`:
 * un string sin zona horaria lo interpreta cada navegador a su manera (algunos
 * como UTC), y eso corre el dia una jornada entera para quien esta en -03.
 */
export function nombreDeDia(iso, hoy = new Date()) {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const referencia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const diferenciaDias = Math.round((fecha - referencia) / 86400000);
  if (diferenciaDias === 0) return "Hoy";
  if (diferenciaDias === 1) return "Mañana";
  return `${NOMBRES_DIA[fecha.getDay()]} ${dia}`;
}

/**
 * De donde viene el viento, en grados, a las letras de la rosa.
 *
 * Open-Meteo usa la convencion meteorologica: `wind_direction_10m` es la
 * direccion de la que SOPLA el viento, no hacia donde va. 90 grados es "viento
 * del este".
 */
export function rumbo(grados) {
  if (grados === null || grados === undefined) return null;
  const ROSA = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return ROSA[Math.round(grados / 22.5) % 16];
}

// Enlace a la app de mapas. En web no hay esquema nativo que valga para todos
// los sistemas, así que va Google Maps, que abre la app en el celular y el
// sitio en la computadora.
export const enlaceComoLlegar = (lat, lon) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

export const enlaceWhatsApp = (numero) =>
  `https://wa.me/${String(numero).replace(/\D/g, "")}`;
