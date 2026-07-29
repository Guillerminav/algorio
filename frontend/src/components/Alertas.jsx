import React from "react";

import { formatearNivel } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";

export default function Alertas() {
  const { usuario } = useAuth();
  const { datos, error, cargando } = useFetchLista("/api/alertas");

  return (
    <div>
      <p className="descripcion">
        Estaciones de Prefectura Naval cuyo nivel actual llego al umbral de
        alerta o de evacuacion definido para esa estacion.
      </p>
      <div className="estado">
        {error
          ? `Error cargando alertas: ${error.message}`
          : cargando
            ? ""
            : `${datos.length} estaciones en alerta`}
      </div>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Severidad</th>
              <th>Estacion</th>
              <th>Rio</th>
              <th>Fecha</th>
              <th className="num">Nivel actual</th>
              <th className="num">Umbral alerta</th>
              <th className="num">Umbral evacuación</th>
            </tr>
          </thead>
          <tbody>
            {datos.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={7}>No hay estaciones en alerta en este momento.</td>
              </tr>
            ) : (
              datos.map((f, i) => (
                <tr key={`${f.estacion}-${i}`}>
                  <td className={`severidad ${f.severidad}`}>
                    {f.severidad === "evacuacion" ? "▲ Evacuacion" : "▲ Alerta"}
                  </td>
                  <td>{f.estacion}</td>
                  <td>{f.rio ?? "—"}</td>
                  <td>{f.fecha_boletin}</td>
                  <td className="num">{formatearNivel(f.nivel_actual_m, usuario?.unidad_nivel)}</td>
                  <td className="num">{formatearNivel(f.umbral_alerta_m, usuario?.unidad_nivel)}</td>
                  <td className="num">{formatearNivel(f.umbral_evacuacion_m, usuario?.unidad_nivel)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
