// Cliente HTTP contra el backend de AlgoRío.
//
// A diferencia de la web, que llama a "/api/..." relativo y deja que Vercel lo
// reescriba al backend (ver frontend/vercel.json), la app pega directo al
// dominio: no hay reverse proxy en el medio. Por eso todo pasa por
// `Authorization: Bearer` en vez de la cookie de sesion.

import Constants from "expo-constants";

// En desarrollo, EXPO_PUBLIC_API_URL apunta a la maquina donde corre uvicorn.
// OJO: tiene que ser la IP de la red local (192.168.x.x), no "localhost":
// para el celular, localhost es el celular.
const URL_POR_DEFECTO = "https://algorio-backend.onrender.com";

export const URL_BASE = (
  process.env.EXPO_PUBLIC_API_URL ??
  Constants.expoConfig?.extra?.apiUrl ??
  URL_POR_DEFECTO
).replace(/\/$/, "");

export class ErrorApi extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.status = status;
  }
}

// El backend gratuito de Render se duerme y tarda ~50 s en despertar. Un
// timeout corto haria que la app diga "no hay internet" cuando en realidad
// solo hay que esperar; uno infinito la dejaria colgada para siempre.
const TIMEOUT_MS = 60000;

export async function pedirJSON(ruta, { token, ...opciones } = {}) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(`${URL_BASE}${ruta}`, {
      ...opciones,
      signal: control.signal,
      headers: {
        ...(opciones.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opciones.headers,
      },
    });

    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => null);
      throw new ErrorApi(
        cuerpo?.detail || `El servidor respondió ${respuesta.status}.`,
        respuesta.status,
      );
    }

    return respuesta.status === 204 ? null : respuesta.json();
  } catch (e) {
    if (e.name === "AbortError") {
      throw new ErrorApi("El servidor no respondió. Probá de nuevo en un momento.", 0);
    }
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi("No pudimos conectarnos. Revisá tu conexión.", 0);
  } finally {
    clearTimeout(temporizador);
  }
}

// --- Formato ---------------------------------------------------------------

export function formatearDistancia(km) {
  if (typeof km !== "number") return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const DIAS_ORDEN = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

/**
 * Si el lugar esta abierto ahora, segun pois.horarios.
 *
 * Devuelve null cuando ese dia no tiene horario cargado: no es lo mismo que
 * estar cerrado, y afirmar "cerrado" sin saberlo haria que el nauta se saltee
 * un parador que estaba abierto.
 */
export function estadoApertura(horarios, ahora = new Date()) {
  if (!horarios) return null;
  const hoy = horarios[DIAS_ORDEN[ahora.getDay()]];
  if (!hoy) return null;
  if (hoy.cerrado) return { abierto: false, texto: "Cerrado hoy" };
  if (!hoy.abre || !hoy.cierra) return null;

  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const aMinutos = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const abre = aMinutos(hoy.abre);
  const cierra = aMinutos(hoy.cierra);

  if (minutosAhora < abre) return { abierto: false, texto: `Abre ${hoy.abre}` };
  if (minutosAhora >= cierra) return { abierto: false, texto: "Cerrado" };
  return { abierto: true, texto: `Abierto hasta ${hoy.cierra}` };
}

export function formatearHora(iso) {
  if (!iso) return "";
  // Open-Meteo devuelve "2026-08-12T15:00" en hora local de la zona pedida.
  const hora = iso.slice(11, 16);
  return hora || "";
}

// El dia de esa marca de tiempo, sin la hora. Sirve para detectar el cambio de
// dia en el pronostico.
export const diaDe = (iso) => (iso ? iso.slice(0, 10) : "");

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

/** Cuanto le queda de vigencia, para que se vea que esto caduca. */
export function vigenciaRestante(iso) {
  if (!iso) return "";
  const minutos = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutos <= 0) return "vencido";
  if (minutos < 60) return `vence en ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `vence en ${horas} h`;
  return `vence en ${Math.round(horas / 24)} días`;
}

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * "Hoy", "Mañana" o "Jueves 14", segun cuan lejos este.
 *
 * Se construye la fecha con los componentes sueltos y no con `new Date(iso)`:
 * un string sin zona horaria lo interpreta cada motor a su manera (algunos
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
