// Fetch y utilidades de formato compartidas por todos los componentes.
// A diferencia de la version anterior (JS plano), formatearNivel/formatearCaudal
// reciben la preferencia de unidad como parametro explicito en vez de leerla
// de un global compartido: en React el valor sale de useAuth() en cada componente.

const FACTOR_PIES = 3.28084;
const FACTOR_PIES_CUBICOS = 35.3147;

export function formatearNivel(valorMetros, unidadNivel = "m", decimales = 2) {
  if (typeof valorMetros !== "number") return "—";
  if (unidadNivel === "ft") {
    return `${(valorMetros * FACTOR_PIES).toFixed(decimales)} ft`;
  }
  return `${valorMetros.toFixed(decimales)} m`;
}

export function formatearCaudal(valorM3s, unidadCaudal = "m3s", decimales = 0) {
  if (typeof valorM3s !== "number") return "—";
  if (unidadCaudal === "ft3s") {
    return `${(valorM3s * FACTOR_PIES_CUBICOS).toFixed(decimales)} ft³/s`;
  }
  return `${valorM3s.toFixed(decimales)} m³/s`;
}

// Unifica la tendencia entre fuentes: Prefectura Naval la manda como texto
// ("bajando"/"subiendo"/"estable"), INA la manda como el numero de variacion
// con coma decimal (ej. "-0,40"). Devuelve {texto, clase} listo para pintar.
export function formatearTendencia(valor, unidadNivel = "m") {
  if (valor === null || valor === undefined || valor === "") {
    return { texto: "—", clase: "" };
  }

  if (typeof valor === "string") {
    const comoNumero = parseFloat(valor.replace(",", "."));
    if (!Number.isNaN(comoNumero) && /^-?[\d,.]+$/.test(valor.trim())) {
      return tendenciaDesdeNumero(comoNumero, unidadNivel);
    }
    const texto = valor.toLowerCase();
    if (texto.includes("baj")) return { texto: `▼ ${valor}`, clase: "bajada" };
    if (texto.includes("sub") || texto.includes("crece")) return { texto: `▲ ${valor}`, clase: "subida" };
    return { texto: valor, clase: "estable" };
  }

  if (typeof valor === "number") {
    return tendenciaDesdeNumero(valor, unidadNivel);
  }

  return { texto: String(valor), clase: "" };
}

function tendenciaDesdeNumero(numero, unidadNivel) {
  const texto = `${numero > 0 ? "+" : ""}${formatearNivel(numero, unidadNivel)}`;
  if (numero > 0) return { texto: `▲ ${texto}`, clase: "subida" };
  if (numero < 0) return { texto: `▼ ${texto}`, clase: "bajada" };
  return { texto: `▬ ${texto}`, clase: "estable" };
}

// Arma un CSV a partir de `columnas` ({clave, etiqueta}) y `filas` (objetos
// con esas claves, ya con los mismos valores formateados que se ven en la
// tabla) y dispara la descarga en el navegador. Todo client-side, no pega
// contra el backend.
export function exportarCSV(nombreArchivo, columnas, filas) {
  const escapar = (valor) => {
    const texto = valor === null || valor === undefined ? "" : String(valor);
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const encabezado = columnas.map((c) => escapar(c.etiqueta)).join(",");
  const lineas = filas.map((fila) => columnas.map((c) => escapar(fila[c.clave])).join(","));
  const csv = [encabezado, ...lineas].join("\r\n");

  // BOM UTF-8 para que Excel no rompa las tildes al abrir el archivo.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

// Fecha corta en el orden que se usa en Argentina (dd-mm-aaaa). Devuelve null
// si el valor no es una fecha, para que quien la muestre decida el texto.
export function formatearFecha(iso) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${fecha.getFullYear()}`;
}

export async function pedirJSON(url, opciones) {
  const resp = await fetch(url, opciones);
  if (!resp.ok) {
    const cuerpo = await resp.json().catch(() => null);
    const error = new Error(cuerpo?.detail || `${url} respondio ${resp.status}`);
    error.status = resp.status;
    throw error;
  }
  return resp.status === 204 ? null : resp.json();
}
