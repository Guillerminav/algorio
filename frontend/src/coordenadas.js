// Cómo se dice una posición cuando hay que dársela a otro.
//
// Vive en la raíz de src/ porque lo usa el botón de emergencia, que aparece en
// los tres perfiles — no es del nauta ni del comerciante.

/**
 * Grados y minutos decimales: `S 32° 56.949'`.
 *
 * Es el formato que se usa por radio y el que espera Prefectura, no el decimal
 * de Google Maps. Un plotter, una carta náutica y un handie VHF hablan todos
 * en grados y minutos; leer "menos treinta y dos coma nueve cuatro nueve" por
 * radio es pedir que lo anoten mal.
 *
 * Tres decimales de minuto son ~1,8 m: más precisión que la que da un GPS de
 * celular, y menos dígitos para deletrear que el decimal completo.
 */
export function enGradosMinutos(valor, esLatitud) {
  if (typeof valor !== "number" || Number.isNaN(valor)) return null;
  // El hemisferio va como letra y el número siempre positivo: un signo menos
  // dicho por radio se pierde, una "S" no.
  const hemisferio = esLatitud ? (valor < 0 ? "S" : "N") : valor < 0 ? "O" : "E";
  const absoluto = Math.abs(valor);
  const grados = Math.floor(absoluto);
  const minutos = (absoluto - grados) * 60;
  return `${hemisferio} ${grados}° ${minutos.toFixed(3).padStart(6, "0")}'`;
}

/** Decimal con seis cifras (~11 cm): lo que se pega en Google Maps o un GPS. */
export const enDecimal = (lat, lon) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

export const enlaceMapa = (lat, lon) =>
  `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;

/**
 * El mensaje que se manda pidiendo ayuda.
 *
 * Lleva las dos notaciones y el link a propósito: quien lo recibe puede ser un
 * remolque con el celular en la mano (toca el link y listo) o Prefectura, que
 * va a querer los grados y minutos para pasarlos por radio. Poner solo una de
 * las dos obliga a alguien a convertir en el peor momento.
 *
 * La precisión también va, y no es un detalle técnico: no es lo mismo "estoy
 * acá ±8 m" que "±2 km", y el que sale a buscar necesita saber cuánto radio
 * tiene que barrer.
 */
export function mensajeDeEmergencia({ lat, lon, precision, hora }) {
  const partes = [
    "🆘 Necesito ayuda en el río.",
    "",
    `📍 ${enGradosMinutos(lat, true)}   ${enGradosMinutos(lon, false)}`,
    `Decimal: ${enDecimal(lat, lon)}`,
    enlaceMapa(lat, lon),
  ];
  if (typeof precision === "number") {
    partes.push("", `Precisión del GPS: ±${Math.round(precision)} m`);
  }
  if (hora) partes.push(`Tomada a las ${hora}`);
  partes.push("", "Enviado desde AlgoRío");
  return partes.join("\n");
}

// wa.me sin número abre WhatsApp para elegir a quién mandárselo. Es lo
// correcto acá: no sabemos a quién le escribe —el remolque, un amigo, el
// grupo del club— y pedirle que cargue un contacto antes sería una pantalla
// más en el peor momento.
export const enlaceWhatsAppTexto = (texto) =>
  `https://wa.me/?text=${encodeURIComponent(texto)}`;

export const horaCorta = (fecha = new Date()) =>
  `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
