import React, { useMemo, useState } from "react";

import { formatearCaudal, formatearNivel, formatearTendencia } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";

// Fila de KPIs arriba del dashboard (ver AlgoRio Dashboard.dc.html). Todo se
// deriva de datos que ya se piden en otras pantallas (/api/dashboard y
// /api/yacyreta), sin endpoints nuevos: se vuelven a pedir aca porque esta
// fila es visible sin importar que subtab este activo.
export default function KpisDashboard() {
  const { usuario } = useAuth();
  const { datos: general } = useFetchLista("/api/dashboard");
  const { datos: yacyreta } = useFetchLista("/api/yacyreta");
  const [estacionElegida, setEstacionElegida] = useState("");

  const estaciones = useMemo(
    () => [...new Set(general.map((f) => f.estacion))].sort((a, b) => a.localeCompare(b)),
    [general],
  );

  // /api/dashboard ya viene ordenado desc por fecha_boletin: la primera fila
  // de cada estacion que aparece es la mas reciente.
  const ultimaPorEstacion = useMemo(() => {
    const mapa = new Map();
    for (const f of general) {
      if (!mapa.has(f.estacion)) mapa.set(f.estacion, f);
    }
    return mapa;
  }, [general]);

  const estacionActual = estacionElegida || estaciones[0] || "";
  const filaEstacion = ultimaPorEstacion.get(estacionActual);
  const tendenciaEstacion = formatearTendencia(filaEstacion?.tendencia, usuario?.unidad_nivel);

  const ultimaActualizacion = useMemo(() => {
    if (general.length === 0) return null;
    return general.reduce((max, f) => (f.fecha_boletin > max ? f.fecha_boletin : max), general[0].fecha_boletin);
  }, [general]);

  const [yacActual, yacAnterior] = yacyreta;
  let diferenciaCaudal = null;
  if (
    typeof yacActual?.caudal_afluente_hoy_m3s === "number"
    && typeof yacAnterior?.caudal_afluente_hoy_m3s === "number"
  ) {
    diferenciaCaudal = yacActual.caudal_afluente_hoy_m3s - yacAnterior.caudal_afluente_hoy_m3s;
  }
  const claseCaudal = diferenciaCaudal == null ? "" : diferenciaCaudal > 0 ? "subida" : diferenciaCaudal < 0 ? "bajada" : "estable";
  const textoCaudal = diferenciaCaudal == null
    ? "Sin datos suficientes"
    : `${diferenciaCaudal > 0 ? "▲ +" : diferenciaCaudal < 0 ? "▼ " : "▬ "}${formatearCaudal(diferenciaCaudal, usuario?.unidad_caudal)} vs. boletin anterior`;

  return (
    <div className="kpis">
      <div className="kpi-tarjeta">
        <div className="kpi-cabecera">
          <span className="kpi-punto" style={{ background: "var(--acento)" }} />
          <span className="kpi-etiqueta">Estaciones activas</span>
        </div>
        <div className="kpi-valor">{estaciones.length}</div>
        <div className="kpi-sub">INA · Prefectura · Yacyretá</div>
      </div>

      <div className="kpi-tarjeta">
        <div className="kpi-cabecera">
          <span className="kpi-punto" style={{ background: "var(--acento-claro)" }} />
          <select
            className="kpi-selector"
            value={estacionActual}
            onChange={(e) => setEstacionElegida(e.target.value)}
            disabled={estaciones.length === 0}
          >
            {estaciones.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="kpi-valor">{formatearNivel(filaEstacion?.nivel_promedio_m, usuario?.unidad_nivel)}</div>
        <div className={`kpi-sub tendencia ${tendenciaEstacion.clase}`}>{tendenciaEstacion.texto}</div>
      </div>

      <div className="kpi-tarjeta">
        <div className="kpi-cabecera">
          <span className="kpi-punto" style={{ background: "var(--avatar)" }} />
          <span className="kpi-etiqueta">Última actualización</span>
        </div>
        <div className="kpi-valor">{ultimaActualizacion ?? "—"}</div>
        <div className="kpi-sub">Ultima fecha con datos</div>
      </div>

      <div className="kpi-tarjeta">
        <div className="kpi-cabecera">
          <span className="kpi-punto" style={{ background: "var(--avatar)" }} />
          <span className="kpi-etiqueta">Caudal Yacyretá</span>
        </div>
        <div className="kpi-valor">{formatearCaudal(yacActual?.caudal_afluente_hoy_m3s, usuario?.unidad_caudal)}</div>
        <div className={`kpi-sub tendencia ${claseCaudal}`}>{textoCaudal}</div>
      </div>
    </div>
  );
}
