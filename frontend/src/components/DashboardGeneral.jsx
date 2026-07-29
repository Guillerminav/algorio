import React, { useMemo, useState } from "react";

import { formatearNivel, formatearTendencia } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";

export default function DashboardGeneral() {
  const { usuario } = useAuth();
  const { datos, error, cargando } = useFetchLista("/api/dashboard");
  const [filtroEstacion, setFiltroEstacion] = useState("");
  const [filtroRio, setFiltroRio] = useState("");

  const rios = useMemo(
    () => [...new Set(datos.map((f) => f.rio).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [datos],
  );

  // El backend (backend/datos.py: canonizar_rio) ya unifica el nombre del rio
  // a una sola grafia sin importar la fuente, asi que acá alcanza con comparar
  // el texto tal cual llega.
  const filtradas = useMemo(() => {
    const texto = filtroEstacion.trim().toLowerCase();
    return datos.filter((f) => {
      const coincideEstacion = !texto || (f.estacion ?? "").toLowerCase().includes(texto);
      const coincideRio = !filtroRio || f.rio === filtroRio;
      return coincideEstacion && coincideRio;
    });
  }, [datos, filtroEstacion, filtroRio]);

  return (
    <div>
      <p className="descripcion">
        Combina las estaciones de INA y Prefectura Naval. Cuando una estacion
        aparece en ambas fuentes, se promedia el nivel actual.
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
      </div>
      <div className="estado">
        {error
          ? `Error cargando el dashboard: ${error.message}`
          : cargando
            ? ""
            : `${filtradas.length} de ${datos.length} estaciones`}
      </div>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Estacion</th>
              <th>Rio</th>
              <th className="num">Nivel INA</th>
              <th className="num">Nivel Prefectura</th>
              <th className="num">Nivel promedio</th>
              <th>Tendencia (vs. dia anterior)</th>
              <th>Fuentes</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={7}>Ninguna estacion coincide con el filtro.</td>
              </tr>
            ) : (
              filtradas.map((f) => {
                const tendencia = formatearTendencia(f.tendencia, usuario?.unidad_nivel);
                return (
                  <tr key={f.estacion}>
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
    </div>
  );
}
