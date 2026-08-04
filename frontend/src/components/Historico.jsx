import React, { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatearNivel } from "../api.js";
import { descargarGraficoComoPNG } from "../exportarGrafico.js";
import SelectorEstaciones from "./SelectorEstaciones.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";

// Paleta categorica de series. Validada con el script del skill de dataviz
// (6/6 checks en PASS sobre superficie blanca: banda de luminosidad, piso de
// croma, separacion para daltonismo, piso de vision normal y contraste). No
// reusa los colores de estado (--subida/--bajada/--alerta), que estan
// reservados para severidad en otras pantallas.
const COLORES_SERIE = ["#1d6fa5", "#c2410c", "#0d9488", "#9333ea", "#a16207", "#db2777"];

// Tope de series: mas alla de esto los colores dejan de distinguirse entre si
// (ver "series-count ladder" del skill). El selector no deja pasar de aca.
const MAX_ESTACIONES = 6;

const GRANULARIDADES = [
  { valor: "diario", etiqueta: "Diario" },
  { valor: "semanal", etiqueta: "Semanal" },
  { valor: "mensual", etiqueta: "Mensual" },
  { valor: "anual", etiqueta: "Anual" },
];

// Etiqueta del bucket temporal al que cae una fecha "YYYY-MM-DD".
function periodoDe(fechaISO, granularidad) {
  if (granularidad === "anual") return fechaISO.slice(0, 4);
  if (granularidad === "mensual") return fechaISO.slice(0, 7);
  if (granularidad === "semanal") {
    // Lunes de esa semana: agrupa por semana sin depender de la numeracion
    // ISO, y ademas la etiqueta queda legible como fecha.
    const fecha = new Date(`${fechaISO}T00:00:00`);
    const diaSemana = (fecha.getDay() + 6) % 7;
    fecha.setDate(fecha.getDate() - diaSemana);
    return fecha.toISOString().slice(0, 10);
  }
  return fechaISO;
}

export default function Historico() {
  const { usuario } = useAuth();
  const { datos, error, cargando } = useFetchLista("/api/dashboard");
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [granularidad, setGranularidad] = useState("diario");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [errorDescarga, setErrorDescarga] = useState("");
  const contenedorGrafico = useRef(null);

  async function descargarPNG() {
    setErrorDescarga("");
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await descargarGraficoComoPNG(contenedorGrafico.current, `algorio_niveles_${granularidad}_${hoy}`);
    } catch (e) {
      setErrorDescarga(e.message);
    }
  }

  const estaciones = useMemo(
    () => [...new Set(datos.map((f) => f.estacion))].sort((a, b) => a.localeCompare(b)),
    [datos],
  );

  // La pantalla arranca sin ninguna estacion elegida: no hay una eleccion por
  // defecto que sea la correcta para todos, y preseleccionar sugiere que esas
  // son "las importantes".
  const activas = seleccionadas;

  const { series, puntos } = useMemo(() => {
    const enRango = datos.filter((f) => {
      if (!f.fecha_boletin || typeof f.nivel_promedio_m !== "number") return false;
      if (desde && f.fecha_boletin < desde) return false;
      if (hasta && f.fecha_boletin > hasta) return false;
      return activas.includes(f.estacion);
    });

    // periodo -> estacion -> [niveles]. Se promedia cuando un bucket agrupa
    // varios dias (semanal/mensual/anual); en diario hay un solo valor.
    const acumulado = new Map();
    for (const fila of enRango) {
      const periodo = periodoDe(fila.fecha_boletin, granularidad);
      if (!acumulado.has(periodo)) acumulado.set(periodo, new Map());
      const porEstacion = acumulado.get(periodo);
      if (!porEstacion.has(fila.estacion)) porEstacion.set(fila.estacion, []);
      porEstacion.get(fila.estacion).push(fila.nivel_promedio_m);
    }

    const filas = [...acumulado.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodo, porEstacion]) => {
        const punto = { periodo };
        for (const [estacion, valores] of porEstacion) {
          punto[estacion] = Number(
            (valores.reduce((t, v) => t + v, 0) / valores.length).toFixed(2),
          );
        }
        return punto;
      });

    return { series: activas.filter((e) => filas.some((f) => f[e] != null)), puntos: filas };
  }, [datos, activas, granularidad, desde, hasta]);

  function alternarEstacion(estacion) {
    setSeleccionadas((previas) => {
      if (previas.includes(estacion)) return previas.filter((e) => e !== estacion);
      if (previas.length >= MAX_ESTACIONES) return previas;
      return [...previas, estacion];
    });
  }

  const unidad = usuario?.unidad_nivel === "ft" ? "ft" : "m";

  return (
    <div>
      <p className="descripcion">
        Evolución del nivel de cada estación en el tiempo. El nivel es el
        promedio de las fuentes que reportaron esa estación ese día; en las
        vistas semanal, mensual y anual se promedian además los días del período.
      </p>

      <div className="filtros">
        <label>
          Estaciones
          <SelectorEstaciones
            estaciones={estaciones}
            seleccionadas={activas}
            onAlternar={alternarEstacion}
            colorDe={(estacion) => COLORES_SERIE[activas.indexOf(estacion) % COLORES_SERIE.length]}
            maximo={MAX_ESTACIONES}
          />
        </label>
        <label>
          Período
          <select value={granularidad} onChange={(e) => setGranularidad(e.target.value)}>
            {GRANULARIDADES.map((g) => (
              <option key={g.valor} value={g.valor}>{g.etiqueta}</option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      <div className="grafico-barra">
        <div className="estado">
          {error
            ? `Error cargando los datos: ${error.message}`
            : cargando
              ? "Cargando…"
              : activas.length === 0
                ? `Elegí hasta ${MAX_ESTACIONES} estaciones para comparar.`
                : `${puntos.length} ${puntos.length === 1 ? "período" : "períodos"} · ${series.length} ${series.length === 1 ? "estación" : "estaciones"}`}
        </div>
        <button
          type="button"
          className="boton-secundario"
          onClick={descargarPNG}
          disabled={puntos.length === 0}
        >
          ⭳ Descargar PNG
        </button>
      </div>
      {errorDescarga && <div className="mensaje-error">{errorDescarga}</div>}

      {cargando ? (
        <div className="grafico-vacio">Cargando…</div>
      ) : activas.length === 0 ? (
        <div className="grafico-vacio">Seleccioná una estación</div>
      ) : puntos.length === 0 ? (
        <div className="grafico-vacio">
          No hay datos para las estaciones y el rango de fechas elegidos.
        </div>
      ) : (
        <div className="grafico-contenedor" ref={contenedorGrafico}>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={puntos} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
              {/* Grilla recesiva: hairline solida, un paso por encima de la
                  superficie, y solo horizontal (las verticales compiten con
                  las lineas de datos). */}
              <CartesianGrid stroke="var(--borde-suave)" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="periodo"
                tick={{ fill: "var(--texto-suave)", fontSize: 12 }}
                stroke="var(--borde)"
                tickMargin={8}
              />
              <YAxis
                tick={{ fill: "var(--texto-suave)", fontSize: 12 }}
                stroke="var(--borde)"
                width={64}
                tickFormatter={(v) => `${v} ${unidad}`}
              />
              <Tooltip
                formatter={(valor, nombre) => [formatearNivel(valor, usuario?.unidad_nivel), nombre]}
                contentStyle={{
                  background: "var(--superficie)",
                  border: "1px solid var(--borde)",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                labelStyle={{ color: "var(--texto-suave)", marginBottom: 4 }}
                cursor={{ stroke: "var(--borde)", strokeWidth: 1 }}
              />
              {/* Con dos o mas series la leyenda es obligatoria: la identidad
                  nunca puede depender solo del color. */}
              {series.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 13, color: "var(--texto-suave)", paddingTop: 8 }} />
              )}
              {series.map((estacion, i) => (
                <Line
                  key={estacion}
                  type="monotone"
                  dataKey={estacion}
                  name={estacion}
                  stroke={COLORES_SERIE[i % COLORES_SERIE.length]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  // El anillo en color de superficie mantiene legible el punto
                  // donde dos series se cruzan, y agranda el area de hover.
                  dot={{ r: 4, strokeWidth: 2, stroke: "var(--superficie)" }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--superficie)" }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
