// Con que sale al rio el usuario. Las claves son las que valida el backend
// (backend/auth.py: TIPOS_EMBARCACION_VALIDOS) y las que usa backend/clima.py
// para calibrar a partir de que viento le avisa que el rio esta picado.
//
// El orden va de lo mas expuesto a lo mas pesado: es tambien el orden en que
// importa la advertencia de viento.
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
