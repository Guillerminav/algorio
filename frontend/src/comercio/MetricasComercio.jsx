import React, { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { pedirJSON } from "../api.js";
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

// El eje X con 90 etiquetas es ilegible. Se muestra una de cada N segun el
// rango, calculado para que nunca haya mas de ~10 marcas.
const pasoEtiquetas = (cantidad) => Math.max(1, Math.ceil(cantidad / 10));

function formatearDia(iso) {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export default function MetricasComercio({ comercio }) {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError("");
    pedirJSON(`/api/mi-comercio/metricas?dias=${dias}`)
      .then((d) => !cancelado && setDatos(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [dias]);

  const totales = datos?.totales ?? {};
  const totalGeneral = Object.values(totales).reduce((suma, n) => suma + n, 0);
  const serie = (datos?.serie ?? []).map((fila) => ({ ...fila, etiqueta: formatearDia(fila.fecha) }));

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        Cuánta gente te miró en la app. Se cuenta una vez por acción: abrir tu ficha,
        tocar tu teléfono, escribirte por WhatsApp o pedir cómo llegar.
      </p>

      {comercio.estado !== "aprobado" && (
        <div className="aviso-revision">
          Tu ficha todavía no está publicada, así que nadie puede verte en el mapa.
          Los números van a arrancar cuando la aprobemos.
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
