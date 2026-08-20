// Vocabulario del perfil comerciante en la app. Espeja
// frontend/src/comercio/tiposComercio.js: son dos stacks distintos (React
// Native y DOM) y no pueden compartir componentes, pero las claves que viajan
// al backend tienen que ser las mismas (ver backend/pois.py: TIPOS_VALIDOS).

export const TIPOS_COMERCIO = [
  {
    tipo: "parador",
    etiqueta: "Parador",
    resumen: "Bar, restaurante o balneario sobre el río.",
    emoji: "🍽️",
    // Solo el parador tiene carta: es el unico rubro con una lista de precios
    // que cambia seguido y que el nauta quiere ver antes de parar.
    tieneCarta: true,
    servicios: ["Amarre", "Baños", "Wifi", "Sombrillas", "Estacionamiento", "Combustible", "Música en vivo", "Acepta tarjeta"],
  },
  {
    tipo: "alojamiento",
    etiqueta: "Cabaña o alojamiento",
    resumen: "Cabañas, hospedaje o camping.",
    emoji: "🛏️",
    tieneCarta: false,
    servicios: ["Amarre", "Wifi", "Aire acondicionado", "Pileta", "Desayuno", "Estacionamiento", "Apto mascotas", "Parrilla"],
  },
  {
    tipo: "lancha_taxi",
    etiqueta: "Lancha-taxi",
    resumen: "Traslados y paseos por el río.",
    emoji: "🚤",
    tieneCarta: false,
    // El unico rubro con tablero de cruces (ver src/tablero.js): a que hora
    // cruza, cada cuanto, cuanto sale y si hoy va demorada. Se publica sin
    // moderacion porque es un dato que envejece en minutos.
    tieneTablero: true,
    servicios: ["Chalecos incluidos", "Apto grupos", "Traslado nocturno", "Acepta tarjeta", "Guía a bordo", "Apto mascotas"],
  },
];

const POR_CLAVE = Object.fromEntries(TIPOS_COMERCIO.map((t) => [t.tipo, t]));

// Fallback para un tipo que la app todavia no conozca, para no romper la
// pantalla con un POI cargado desde otra version.
export const tipoComercio = (clave) =>
  POR_CLAVE[clave] ?? {
    etiqueta: "Comercio",
    emoji: "📍",
    tieneCarta: false,
    tieneTablero: false,
    servicios: [],
  };

export const ETIQUETAS_ESTADO = {
  pendiente: "En revisión",
  aprobado: "Publicado",
  rechazado: "Rechazado",
};

// Lunes primero, como se lee un cartel de horarios en Argentina. Las claves
// son las que se guardan en pois.horarios.
export const DIAS = [
  { clave: "lun", etiqueta: "Lunes" },
  { clave: "mar", etiqueta: "Martes" },
  { clave: "mie", etiqueta: "Miércoles" },
  { clave: "jue", etiqueta: "Jueves" },
  { clave: "vie", etiqueta: "Viernes" },
  { clave: "sab", etiqueta: "Sábado" },
  { clave: "dom", etiqueta: "Domingo" },
];

// Como se llama cada metrica para el comerciante: "Vieron tu ficha" y no
// "eventos de tipo ficha".
export const ETIQUETAS_VISITA = {
  ficha: "Vieron tu ficha",
  whatsapp: "Te escribieron",
  telefono: "Tocaron tu teléfono",
  como_llegar: "Pidieron cómo llegar",
};
