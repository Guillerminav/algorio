// Distancia y rumbo entre dos puntos del río.
//
// Reemplaza al enlace "Cómo llegar" que abría la app de mapas del sistema. En
// el río eso no sirve: no hay calles cargadas, así que el navegador te dibuja
// una ruta por tierra hasta el punto más cercano de la costa, o directamente
// no encuentra ninguna. Lo que sí sirve arriba de una lancha es lo mismo que
// mira quien navega desde siempre — a cuánto está y para qué lado — así que es
// lo que mostramos.
//
// Espeja frontend/src/nauta/rumbo.js: son dos stacks distintos (React Native y
// DOM) y no pueden compartir módulo, pero la matemática tiene que dar igual.

const RADIO_TIERRA_KM = 6371;
const aRadianes = (grados) => (grados * Math.PI) / 180;
const aGrados = (radianes) => (radianes * 180) / Math.PI;

/**
 * Distancia en kilómetros por haversine.
 *
 * El backend ya la calcula y la manda en `distancia_km` cuando le pasás tu
 * posición (ver backend/pois.py), pero acá hace falta igual: la posición del
 * teléfono se mueve mientras navegás y volver a pedirle la lista al servidor
 * en cada paso sería absurdo.
 */
export function distanciaKm(desde, hasta) {
  const dLat = aRadianes(hasta.latitude - desde.latitude);
  const dLon = aRadianes(hasta.longitude - desde.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(desde.latitude)) *
      Math.cos(aRadianes(hasta.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return RADIO_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Rumbo inicial en grados (0 = norte, 90 = este), del punto de partida al
 * destino.
 *
 * Es el rumbo de círculo máximo. A las distancias de un río la diferencia con
 * una recta en el plano es despreciable, pero la fórmula es la misma y no
 * cuesta más.
 */
export function rumboGrados(desde, hasta) {
  const lat1 = aRadianes(desde.latitude);
  const lat2 = aRadianes(hasta.latitude);
  const dLon = aRadianes(hasta.longitude - desde.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (aGrados(Math.atan2(y, x)) + 360) % 360;
}

const ROSA = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
              "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

/** El rumbo en letras. "Al NE" se entiende de un vistazo; "43°" hay que pensarlo. */
export function rumboEnLetras(grados) {
  if (grados === null || grados === undefined) return null;
  return ROSA[Math.round(grados / 22.5) % 16];
}

/**
 * La distancia como se dice en voz alta.
 *
 * Abajo del kilómetro va en metros y redondeada a 10, porque el GPS de un
 * teléfono no distingue menos que eso y "a 237 m" finge una precisión que no
 * existe. Arriba del kilómetro, un decimal.
 */
export function distanciaEnTexto(km) {
  if (typeof km !== "number" || Number.isNaN(km)) return null;
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

/**
 * Todo junto, listo para pintar. Devuelve `null` si falta la posición del
 * usuario: sin eso no hay ni distancia ni rumbo que mostrar.
 */
export function haciaElLugar(posicion, lugar) {
  if (!posicion || typeof lugar?.lat !== "number" || typeof lugar?.lon !== "number") return null;
  const destino = { latitude: lugar.lat, longitude: lugar.lon };
  const km = distanciaKm(posicion, destino);
  const grados = rumboGrados(posicion, destino);
  return { km, texto: distanciaEnTexto(km), grados, letras: rumboEnLetras(grados) };
}
