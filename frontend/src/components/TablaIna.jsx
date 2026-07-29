import React from "react";

import { formatearNivel, formatearTendencia } from "../api.js";
import Paginador from "./Paginador.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";
import { usePaginacion } from "../hooks/usePaginacion.js";

export default function TablaIna() {
  const { usuario } = useAuth();
  const { datos, error, cargando } = useFetchLista("/api/ina");
  const { itemsDePagina, paginaActual, totalPaginas, irAPagina } = usePaginacion(datos);

  return (
    <div>
      <h3>INA — Cuadro de alerta</h3>
      <div className="estado">
        {error ? `Error cargando INA: ${error.message}` : cargando ? "" : `${datos.length} registros`}
      </div>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Estacion</th>
              <th>Rio</th>
              <th className="num">Nivel actual</th>
              <th>Tendencia</th>
            </tr>
          </thead>
          <tbody>
            {itemsDePagina.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={5}>Todavia no se corrio la fuente INA.</td>
              </tr>
            ) : (
              itemsDePagina.map((f, i) => {
                const tendencia = formatearTendencia(f.tendencia, usuario?.unidad_nivel);
                return (
                  <tr key={`${f.estacion}-${f.fecha_boletin}-${i}`}>
                    <td>{f.fecha_boletin}</td>
                    <td>{f.estacion}</td>
                    <td>{f.rio ?? "—"}</td>
                    <td className="num">{formatearNivel(f.nivel_actual_m, usuario?.unidad_nivel)}</td>
                    <td className={`tendencia ${tendencia.clase}`}>{tendencia.texto}</td>
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
        totalItems={datos.length}
      />
    </div>
  );
}
