import React, { useEffect, useMemo, useState } from "react";

import { exportarCSV, formatearNivel, formatearTendencia } from "../api.js";
import Paginador from "./Paginador.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";
import { usePaginacion } from "../hooks/usePaginacion.js";

const TENDENCIAS = [
  { value: "subiendo", label: "Subiendo" },
  { value: "bajando", label: "Bajando" },
  { value: "estable", label: "Estable" },
];

// Solo visual (ver plan): no hay severidad por fila en el historico general
// todavia, a diferencia de Alertas/Mi Flota que si la calculan contra el
// umbral oficial de una estacion puntual.
const ESTADOS_FILTRO = [
  { label: "Normal", color: "var(--subida)" },
  { label: "Precaución", color: "var(--alerta)" },
  { label: "Alerta", color: "var(--evacuacion)" },
];

const COLUMNAS_CSV = [
  { clave: "fecha_boletin", etiqueta: "Fecha" },
  { clave: "estacion", etiqueta: "Estacion" },
  { clave: "rio", etiqueta: "Rio" },
  { clave: "nivel_ina_m", etiqueta: "Nivel INA" },
  { clave: "nivel_prefectura_m", etiqueta: "Nivel Prefectura" },
  { clave: "nivel_promedio_m", etiqueta: "Nivel promedio" },
  { clave: "tendencia", etiqueta: "Tendencia" },
  { clave: "fuentes", etiqueta: "Fuentes" },
];

export default function DashboardGeneral({ onListo }) {
  const { usuario } = useAuth();
  const { datos, error, cargando, recargar } = useFetchLista("/api/dashboard");
  const [filtroEstacion, setFiltroEstacion] = useState("");
  const [filtroRio, setFiltroRio] = useState("");
  const [filtroTendencia, setFiltroTendencia] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const rios = useMemo(
    () => [...new Set(datos.map((f) => f.rio).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [datos],
  );

  // El backend (backend/datos.py: canonizar_rio) ya unifica el nombre del rio
  // a una sola grafia sin importar la fuente, asi que acá alcanza con comparar
  // el texto tal cual llega. fecha_boletin ya viene como "YYYY-MM-DD" en las
  // 3 fuentes, asi que comparar como string alcanza para el rango de fechas.
  const filtradas = useMemo(() => {
    const texto = filtroEstacion.trim().toLowerCase();
    return datos.filter((f) => {
      const coincideEstacion = !texto || (f.estacion ?? "").toLowerCase().includes(texto);
      const coincideRio = !filtroRio || f.rio === filtroRio;
      const coincideTendencia = !filtroTendencia || f.tendencia === filtroTendencia;
      const coincideDesde = !fechaDesde || f.fecha_boletin >= fechaDesde;
      const coincideHasta = !fechaHasta || f.fecha_boletin <= fechaHasta;
      return coincideEstacion && coincideRio && coincideTendencia && coincideDesde && coincideHasta;
    });
  }, [datos, filtroEstacion, filtroRio, filtroTendencia, fechaDesde, fechaHasta]);

  const { itemsDePagina, paginaActual, totalPaginas, irAPagina } = usePaginacion(filtradas);

  const filasCSV = useMemo(
    () => filtradas.map((f) => ({
      fecha_boletin: f.fecha_boletin,
      estacion: f.estacion,
      rio: f.rio ?? "",
      nivel_ina_m: formatearNivel(f.nivel_ina_m, usuario?.unidad_nivel),
      nivel_prefectura_m: formatearNivel(f.nivel_prefectura_m, usuario?.unidad_nivel),
      nivel_promedio_m: formatearNivel(f.nivel_promedio_m, usuario?.unidad_nivel),
      tendencia: formatearTendencia(f.tendencia, usuario?.unidad_nivel).texto,
      fuentes: f.fuentes.join(" "),
    })),
    [filtradas, usuario?.unidad_nivel],
  );

  useEffect(() => {
    if (!onListo) return;
    onListo({
      recargar,
      exportar: () => exportarCSV("dashboard_general", COLUMNAS_CSV, filasCSV),
    });
  }, [onListo, recargar, filasCSV]);

  return (
    <div>
      <p className="descripcion">
        Historico combinado de INA y Prefectura Naval. Cuando una estacion
        aparece en ambas fuentes el mismo dia, se promedia el nivel.
      </p>
      <div className="filtros">
        <label>
          Estacion
          <input
            type="text"
            placeholder="Buscar estacion..."
            value={filtroEstacion}
            onChange={(e) => setFiltroEstacion(e.target.value)}
          />
        </label>
        <label>
          Rio
          <select value={filtroRio} onChange={(e) => setFiltroRio(e.target.value)}>
            <option value="">Todos</option>
            {rios.map((rio) => (
              <option key={rio} value={rio}>{rio}</option>
            ))}
          </select>
        </label>
        <label>
          Tendencia
          <select value={filtroTendencia} onChange={(e) => setFiltroTendencia(e.target.value)}>
            <option value="">Todas</option>
            {TENDENCIAS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </label>
        <div className="filtros-pills">
          {ESTADOS_FILTRO.map((ef) => (
            <button key={ef.label} type="button" className="pill-estado">
              <span className="pill-estado-punto" style={{ background: ef.color }} />
              {ef.label}
            </button>
          ))}
        </div>
      </div>
      <div className="estado">
        {error
          ? `Error cargando el dashboard: ${error.message}`
          : cargando
            ? ""
            : `${filtradas.length} de ${datos.length} registros`}
      </div>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Estacion</th>
              <th>Rio</th>
              <th className="num">Nivel INA</th>
              <th className="num">Nivel Prefectura</th>
              <th className="num">Nivel promedio</th>
              <th>Tendencia</th>
              <th>Fuentes</th>
            </tr>
          </thead>
          <tbody>
            {itemsDePagina.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={8}>Ninguna fila coincide con el filtro.</td>
              </tr>
            ) : (
              itemsDePagina.map((f) => {
                const tendencia = formatearTendencia(f.tendencia, usuario?.unidad_nivel);
                return (
                  <tr key={`${f.estacion}-${f.fecha_boletin}`}>
                    <td>{f.fecha_boletin}</td>
                    <td>{f.estacion}</td>
                    <td>{f.rio ?? "—"}</td>
                    <td className="num">{formatearNivel(f.nivel_ina_m, usuario?.unidad_nivel)}</td>
                    <td className="num">{formatearNivel(f.nivel_prefectura_m, usuario?.unidad_nivel)}</td>
                    <td className="num">{formatearNivel(f.nivel_promedio_m, usuario?.unidad_nivel)}</td>
                    <td className={`tendencia ${tendencia.clase}`}>{tendencia.texto}</td>
                    <td>
                      {f.fuentes.map((fuente) => (
                        <span key={fuente} className="fuente-chip">{fuente}</span>
                      ))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Paginador
        paginaActual={paginaActual}
        totalPaginas={totalPaginas}
        irAPagina={irAPagina}
        totalItems={filtradas.length}
      />
    </div>
  );
}
