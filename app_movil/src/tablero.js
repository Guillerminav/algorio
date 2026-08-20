// El tablero de cruces de una lancha-taxi: vocabulario y cuentas.
//
// Espeja frontend/src/tablero.js. Son dos stacks distintos (React Native y
// DOM) y no pueden compartir componentes, pero las claves que viajan al
// backend tienen que ser las mismas (ver backend/tablero.py: ESTADOS). Lo que
// cambia acá son los colores: allá salen de variables CSS, acá de tema.js.

import { COLORES } from "./tema.js";

export const ESTADOS_CRUCE = [
  { clave: "a_horario", etiqueta: "A horario", ayuda: "Todo normal.", alterado: false, color: COLORES.ok },
  { clave: "por_salir", etiqueta: "Por salir", ayuda: "Está embarcando ahora.", alterado: true, color: COLORES.acentoClaro },
  {
    clave: "demorado",
    etiqueta: "Demorado",
    ayuda: "Sale más tarde de lo previsto.",
    alterado: true,
    pideDemora: true,
    color: COLORES.alerta,
  },
  { clave: "completo", etiqueta: "Completo", ayuda: "Sin lugar en la próxima salida.", alterado: true, color: "#8a6a45" },
  { clave: "cancelado", etiqueta: "Cancelado", ayuda: "Hoy ese cruce no sale.", alterado: true, color: COLORES.peligro },
  { clave: "sin_servicio", etiqueta: "Sin servicio", ayuda: "No estás operando ese cruce.", alterado: true, color: COLORES.textoSuave },
];

// Los que puede tener una salida suelta. "Sin servicio" no está: describe que
// el lanchero no opera ese recorrido por ahora, y eso es del cruce entero — no
// existe "no opero la salida de las 12". Ver backend/tablero.py.
export const ESTADOS_SALIDA = ESTADOS_CRUCE.filter((e) => e.clave !== "sin_servicio");

const POR_CLAVE = Object.fromEntries(ESTADOS_CRUCE.map((e) => [e.clave, e]));

export const estadoCruce = (clave) => POR_CLAVE[clave] ?? ESTADOS_CRUCE[0];

// Los dos estados en los que anunciar una salida sería invitar a alguien a un
// muelle donde no va a pasar nada.
const NO_SALEN = ["cancelado", "sin_servicio"];

// Argentina no mueve la hora desde 2009, así que alcanza con el offset fijo.
//
// La hora del tablero NO puede salir del reloj del dispositivo tal cual: un
// celular con la zona horaria de otro país mostraría "próxima salida en 4 h"
// para una lancha que zarpa en veinte minutos. El horario del cartel es el del
// muelle, no el del que lo mira.
const MINUTOS_OFFSET_AR = -180;

export function minutosAhoraAR(ahora = new Date()) {
  const utc = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  return (((utc + MINUTOS_OFFSET_AR) % 1440) + 1440) % 1440;
}

// Tolera "7" además de "07:00": el backend acepta lo mismo al guardar (ver
// tablero._hora) y la vista previa del editor se dibuja mientras se tipea.
export const aMinutos = (hhmm) => {
  if (!hhmm) return null;
  const [h, m = 0] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null;
};

export const aHora = (minutos) => {
  const normalizado = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalizado / 60)).padStart(2, "0")}:${String(normalizado % 60).padStart(2, "0")}`;
};

/**
 * Las salidas de un cruce, siempre como objetos y ordenadas.
 *
 * El backend ya las devuelve así, pero acá se sigue aceptando el string suelto
 * ("07:00") porque es lo que produce el editor mientras se escribe la lista de
 * horarios, antes de que el servidor la haya visto.
 */
export function salidasDe(cruce) {
  return (cruce?.salidas ?? [])
    .map((salida) => (typeof salida === "string" ? { hora: salida } : salida))
    .filter((salida) => aMinutos(salida?.hora) !== null)
    .sort((a, b) => aMinutos(a.hora) - aMinutos(b.hora));
}

/**
 * En qué estado está UNA salida.
 *
 * Una salida sin estado propio hereda el del cruce, y eso no es lo mismo que
 * estar "a horario": si el recorrido entero va demorado, sus salidas van
 * demoradas sin que el lanchero tenga que tocarlas de a una. `propio` dice si
 * la marca es de la salida, que es lo que el editor necesita para saber si
 * puede deshacerla.
 */
export function estadoDeSalida(cruce, salida) {
  const propio = salida?.estado ?? null;
  const definicion = estadoCruce(propio ?? cruce?.estado ?? "a_horario");
  return {
    ...definicion,
    propio: propio !== null,
    demora_min: (propio !== null ? salida?.demora_min : cruce?.demora_min) ?? null,
    sale: !NO_SALEN.includes(definicion.clave),
  };
}

/**
 * La próxima salida de un cruce, como la mostraría un tablero de aeropuerto.
 *
 * `hora` es la de cartel y `estimada` la corrida por la demora: van separadas
 * porque el tablero tacha la primera y muestra la segunda, que es como se lee
 * de un vistazo que algo se movió.
 *
 * Las salidas canceladas se saltean: la próxima es la próxima que de verdad
 * sale. Anunciar una que no va a zarpar mandaría a alguien al muelle al pedo.
 */
export function proximaSalida(cruce, ahoraMin = minutosAhoraAR()) {
  const candidatas = salidasDe(cruce)
    .map((salida) => ({ salida, minutos: aMinutos(salida.hora), estado: estadoDeSalida(cruce, salida) }))
    .filter((c) => c.estado.sale);
  if (candidatas.length === 0) return null;

  const siguiente = candidatas.find((c) => c.minutos >= ahoraMin);
  const manana = siguiente === undefined;
  const elegida = manana ? candidatas[0] : siguiente;
  const demora = elegida.estado.clave === "demorado" ? (elegida.estado.demora_min ?? 0) : 0;

  return {
    hora: elegida.salida.hora,
    estado: elegida.estado,
    estimada: demora > 0 ? aHora(elegida.minutos + demora) : null,
    faltan: manana ? null : elegida.minutos + demora - ahoraMin,
    manana,
  };
}

export function faltanEnTexto(minutos) {
  if (minutos === null || minutos === undefined) return null;
  if (minutos <= 0) return "ahora";
  if (minutos < 60) return `en ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `en ${horas} h` : `en ${horas} h ${resto}`;
}

export function frecuenciaEnTexto(minutos) {
  if (!minutos) return null;
  if (minutos < 60) return `cada ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `cada ${horas} h` : `cada ${horas} h ${resto}`;
}

export function precioEnTexto(precio) {
  if (precio === null || precio === undefined || precio === "") return null;
  const numero = Number(precio);
  if (!Number.isFinite(numero)) return null;
  if (numero === 0) return "Gratis";
  return `$${numero.toLocaleString("es-AR")}`;
}

// De peor a mejor: lo primero que tiene que saber alguien que está por cruzar
// es que hoy no se cruza, no que otra salida va a horario.
const PRIORIDAD = ["cancelado", "sin_servicio", "demorado", "completo", "por_salir", "a_horario"];

/**
 * El estado que representa a todo el tablero, o null si no hay alteración.
 *
 * Mira los dos niveles: una sola salida demorada dentro de un recorrido que
 * por lo demás va bien igual tiene que encender el pin, porque es exactamente
 * la que alguien podría estar por tomar.
 *
 * Devuelve null cuando está todo en orden a propósito: si el pin del mapa
 * avisara siempre algo, el que sí tiene una demora dejaría de destacar.
 */
export function estadoResumen(cruces) {
  if (!cruces?.length) return null;
  const presentes = new Set();
  for (const cruce of cruces) {
    presentes.add(cruce.estado ?? "a_horario");
    for (const salida of salidasDe(cruce)) {
      if (salida.estado) presentes.add(salida.estado);
    }
  }
  const definicion = estadoCruce(PRIORIDAD.find((clave) => presentes.has(clave)));
  return definicion.alterado ? definicion : null;
}

/** El cruce que sale antes, para la tarjeta de abajo del mapa. */
export function proximoCruce(cruces, ahoraMin = minutosAhoraAR()) {
  const candidatos = (cruces ?? [])
    .map((cruce) => ({ cruce, salida: proximaSalida(cruce, ahoraMin) }))
    .filter((c) => c.salida && !c.salida.manana);

  if (candidatos.length === 0) return null;
  return candidatos.reduce((mejor, actual) =>
    actual.salida.faltan < mejor.salida.faltan ? actual : mejor,
  );
}
