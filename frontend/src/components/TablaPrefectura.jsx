import React from "react";

import { formatearNivel, formatearTendencia } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";

export default function TablaPrefectura() {
  const { usuario } = useAuth();
  const { datos, error, cargando } = useFetchLista("/api/prefectura-naval");

  return (
    <div>
      <h3>Prefectura Naval Argentina — Altura de los rios</h3>
      <div className="estado">
        {error
          ? `Error cargando Prefectura Naval: ${error.message}`
          : cargando
            ? ""
            : `${datos.length} registros`}
      </div>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Estacion</th>
              <th>Rio</th>
              <th className="num">Nivel actual</th>
              <th className="num">Variación</th>
              <th>Tendencia</th>
              <th className="num">Nivel anterior</th>
            </tr>
          </thead>
          <tbody>
            {datos.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={7}>Todavia no se corrio la fuente Prefectura Naval.</td>
              </tr>
            ) : (
              datos.map((f, i) => {
                const tendencia = formatearTendencia(f.tendencia, usuario?.unidad_nivel);
                return (
                  <tr key={`${f.estacion}-${f.fecha_boletin}-${i}`}>
                    <td>{`${f.fecha_boletin} ${f.hora_registro ?? ""}`.trim()}</td>
                    <td>{f.estacion}</td>
                    <td>{f.rio ?? "—"}</td>
                    <td className="num">{formatearNivel(f.nivel_actual_m, usuario?.unidad_nivel)}</td>
                    <td className="num">{formatearNivel(f.variacion_m, usuario?.unidad_nivel)}</td>
                    <td className={`tendencia ${tendencia.clase}`}>{tendencia.texto}</td>
                    <td className="num">{formatearNivel(f.nivel_anterior_m, usuario?.unidad_nivel)}</td>
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
