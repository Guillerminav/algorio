import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { pedirJSON } from "../api.js";
import FiltroComercios from "./FiltroComercios.jsx";
import { ETIQUETAS_VISITA } from "./tiposComercio.js";

// Los tres cortes que le importan a un comercio de rio: como viene el fin de
// semana, como viene el mes, y como viene la temporada.
const RANGOS = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
];

// Mismos colores que el resto del panel (ver src/index.css).
const COLORES = {
  ficha: "var(--acento)",
  whatsapp: "var(--subida)",
  telefono: "var(--acento-claro)",
  como_llegar: "var(--alerta)",
};

const CLAVES = Object.keys(ETIQUETAS_VISITA);

// El eje X con 90 etiquetas es ilegible. Se muestra una de cada N segun el
// rango, calculado para que nunca haya mas de ~10 marcas.
const pasoEtiquetas = (cantidad) => Math.max(1, Math.ceil(cantidad / 10));

function formatearDia(iso) {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/**
 * Suma las métricas de varios comercios en una sola serie.
 *
 * Se suma acá y no en el servidor porque son tres respuestas chicas y ya
 * vienen alineadas: `pois.metricas` devuelve un renglón por día del rango,
 * exista o no movimiento, así que las fechas coinciden entre comercios y
 * alcanza con acumular por fecha. Un endpoint agregado sería otra consulta que
 * mantener para ahorrar una vuelta de bucle.
 */
function sumar(respuestas) {
  if (respuestas.length === 1) return respuestas[0];

  const totales = Object.fromEntries(CLAVES.map((c) => [c, 0]));
  const porFecha = new Map();

  for (const r of respuestas) {
    for (const clave of CLAVES) totales[clave] += r.totales?.[clave] ?? 0;
    for (const fila of r.serie ?? []) {
      const acumulada =
        porFecha.get(fila.fecha) ??
        { fecha: fila.fecha, ...Object.fromEntries(CLAVES.map((c) => [c, 0])) };
      for (const clave of CLAVES) acumulada[clave] += fila[clave] ?? 0;
      porFecha.set(fila.fecha, acumulada);
    }
  }

  return {
    totales,
    serie: [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

/**
 * "¿Cuánta gente me miró?", de toda la cuenta o de un comercio.
 *
 * Es una pantalla de la CUENTA y no de un comercio, y por eso no cuelga del
 * desplegable de ninguno: quien tiene un parador y una cabaña quiere ver el
 * total primero y recién después abrir cuál de los dos lo traccionó. Con el
 * filtro adentro, ese total no existía en ningún lado — había que mirar dos
 * pantallas y sumar de cabeza.
 */
export default function MetricasComercio({ comercios }) {
  const [dias, setDias] = useState(30);
  const [filtro, setFiltro] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const mirando = useMemo(
    () => (filtro === null ? comercios : comercios.filter((c) => c.id === filtro)),
    [comercios, filtro],
  );

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError("");
    Promise.all(
      mirando.map((c) => pedirJSON(`/api/mis-comercios/${c.id}/metricas?dias=${dias}`)),
    )
      .then((respuestas) => !cancelado && setDatos(sumar(respuestas)))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [mirando, dias]);

  const totales = datos?.totales ?? {};
  const totalGeneral = Object.values(totales).reduce((suma, n) => suma + n, 0);
  const serie = (datos?.serie ?? []).map((fila) => ({ ...fila, etiqueta: formatearDia(fila.fecha) }));

  // Los que todavía no se ven en el mapa: sus números van a estar en cero y no
  // por falta de interés, así que conviene decirlo antes de que alguien saque
  // conclusiones.
  const sinPublicar = mirando.filter((c) => c.estado !== "aprobado");

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        Cuánta gente te miró en la app. Se cuenta una vez por acción: abrir tu ficha,
        tocar tu teléfono, escribirte por WhatsApp o pedir cómo llegar.
      </p>

      <FiltroComercios comercios={comercios} elegido={filtro} onElegir={setFiltro} />

      {sinPublicar.length > 0 && (
        <div className="aviso-revision">
          {sinPublicar.length === mirando.length
            ? "Todavía no está publicado, así que nadie puede verte en el mapa. Los números van a arrancar cuando lo aprobemos."
            : `Todavía no publicamos ${sinPublicar.map((c) => c.nombre).join(", ")}, así que no suma visitas.`}
        </div>
      )}

      <div className="selector-rango">
        {RANGOS.map((rango) => (
          <button
            key={rango.dias}
            type="button"
            className={`chip-rango${rango.dias === dias ? " activo" : ""}`}
            onClick={() => setDias(rango.dias)}
          >
            {rango.etiqueta}
          </button>
        ))}
      </div>

      {error && <div className="mensaje-error">{error}</div>}
      {cargando && <div className="estado">Cargando…</div>}

      {!cargando && !error && (
        <>
          <div className="tarjetas-metricas">
            {Object.entries(ETIQUETAS_VISITA).map(([clave, etiqueta]) => (
              <div className="tarjeta-metrica" key={clave}>
                <span className="tarjeta-metrica-numero" style={{ color: COLORES[clave] }}>
                  {totales[clave] ?? 0}
                </span>
                <span className="tarjeta-metrica-etiqueta">{etiqueta}</span>
              </div>
            ))}
          </div>

          {totalGeneral === 0 ? (
            <div className="estado">
              Todavía no hay movimiento en este período.
            </div>
          ) : (
            <div className="grafico-metricas">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={serie} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--borde-suave)" />
                  <XAxis
                    dataKey="etiqueta"
                    interval={pasoEtiquetas(serie.length) - 1}
                    tick={{ fontSize: 12, fill: "var(--texto-suave)" }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--texto-suave)" }} />
                  <Tooltip />
                  <Legend />
                  {Object.entries(ETIQUETAS_VISITA).map(([clave, etiqueta]) => (
                    <Bar key={clave} dataKey={clave} name={etiqueta} stackId="a" fill={COLORES[clave]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
