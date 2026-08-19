// Los tres rubros que existen hoy en el mapa. Las claves son las que valida
// el backend (backend/pois.py: TIPOS_VALIDOS); el resto es como se le habla al
// comerciante.
//
// `etiquetaCarta` y `unidadItem` existen porque la misma pantalla (el editor
// de secciones e items) sirve para los tres rubros con nombres distintos: un
// parador carga platos, una cabaña habitaciones y una lancha-taxi recorridos.
// Cambiar el vocabulario y no la pantalla evita mantener tres editores casi
// iguales.
//
// Los plurales van escritos y no se arman agregando "es": "sección" pluraliza
// a "secciones" (sin tilde) y "tipo de servicio" a "tipos de servicio", que
// ninguna regla de sufijo saca bien.
export const TIPOS_COMERCIO = [
  {
    tipo: "parador",
    etiqueta: "Parador",
    resumen: "Bar, restaurante o balneario sobre el río.",
    tieneCarta: true,
    etiquetaCarta: "Menú",
    unidadSeccion: "sección",
    pluralSeccion: "secciones",
    unidadItem: "plato o bebida",
    pluralItem: "platos y bebidas",
    ejemploSeccion: "Bebidas",
    ejemploItem: "Cerveza artesanal",
    servicios: ["Amarre", "Baños", "Wifi", "Sombrillas", "Estacionamiento", "Combustible", "Música en vivo", "Acepta tarjeta"],
  },
  {
    tipo: "alojamiento",
    etiqueta: "Cabaña o alojamiento",
    resumen: "Cabañas, hospedaje o camping.",
    tieneCarta: false,
    etiquetaCarta: "Habitaciones",
    unidadSeccion: "tipo de alojamiento",
    pluralSeccion: "tipos de alojamiento",
    unidadItem: "unidad",
    pluralItem: "unidades",
    ejemploSeccion: "Cabañas",
    ejemploItem: "Cabaña para 4 personas",
    servicios: ["Amarre", "Wifi", "Aire acondicionado", "Pileta", "Desayuno", "Estacionamiento", "Apto mascotas", "Parrilla"],
  },
  {
    tipo: "lancha_taxi",
    etiqueta: "Lancha-taxi",
    resumen: "Traslados y paseos por el río.",
    tieneCarta: false,
    etiquetaCarta: "Recorridos",
    unidadSeccion: "tipo de servicio",
    pluralSeccion: "tipos de servicio",
    unidadItem: "recorrido",
    pluralItem: "recorridos",
    ejemploSeccion: "Traslados",
    ejemploItem: "Ida y vuelta a la isla",
    servicios: ["Chalecos incluidos", "Apto grupos", "Traslado nocturno", "Acepta tarjeta", "Guía a bordo", "Apto mascotas"],
  },
];

export const TIPO_POR_CLAVE = Object.fromEntries(TIPOS_COMERCIO.map((t) => [t.tipo, t]));

// Fallback para un POI cargado con un tipo que el frontend todavia no conoce
// (o que quedo de una version anterior): mejor mostrar vocabulario generico
// que romper la pantalla.
export const TIPO_GENERICO = {
  etiqueta: "Comercio",
  tieneCarta: false,
  etiquetaCarta: "Servicios",
  unidadSeccion: "sección",
  pluralSeccion: "secciones",
  unidadItem: "ítem",
  pluralItem: "ítems",
  ejemploSeccion: "General",
  ejemploItem: "Servicio",
  servicios: [],
};

export const tipoDe = (clave) => TIPO_POR_CLAVE[clave] ?? TIPO_GENERICO;

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

export const ETIQUETAS_ESTADO = {
  pendiente: "En revisión",
  aprobado: "Publicado",
  rechazado: "Rechazado",
};

// Como se llama cada metrica para el comerciante. "Visitas a la ficha" y no
// "eventos de tipo ficha".
export const ETIQUETAS_VISITA = {
  ficha: "Vieron tu ficha",
  telefono: "Tocaron tu teléfono",
  whatsapp: "Te escribieron por WhatsApp",
  como_llegar: "Pidieron cómo llegar",
};
