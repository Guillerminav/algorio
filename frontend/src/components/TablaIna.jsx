import React, { useEffect, useMemo } from "react";

import { exportarCSV, formatearNivel, formatearTendencia } from "../api.js";
import Paginador from "./Paginador.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";
import { useOrdenFecha } from "../hooks/useOrdenFecha.js";
import { usePaginacion } from "../hooks/usePaginacion.js";

const COLUMNAS_CSV = [
  { clave: "fecha_boletin", etiqueta: "Fecha" },
  { clave: "estacion", etiqueta: "Estacion" },
  { clave: "rio", etiqueta: "Rio" },
  { clave: "nivel_actual_m", etiqueta: "Nivel actual" },
  { clave: "tendencia", etiqueta: "Tendencia" },
];

export default function TablaIna({ onListo }) {
  const { usuario } = useAuth();
  const { datos, error, cargando, recargar } = useFetchLista("/api/ina");
  const { itemsOrdenados, orden, alternarOrden } = useOrdenFecha(datos);
  const { itemsDePagina, paginaActual, totalPaginas, irAPagina } = usePaginacion(itemsOrdenados);

  const filasCSV = useMemo(
    () => itemsOrdenados.map((f) => ({
      fecha_boletin: f.fecha_boletin,
      estacion: f.estacion,
      rio: f.rio ?? "",
      nivel_actual_m: formatearNivel(f.nivel_actual_m, usuario?.unidad_nivel),
      tendencia: formatearTendencia(f.tendencia, usuario?.unidad_nivel).texto,
    })),
    [itemsOrdenados, usuario?.unidad_nivel],
  );

  useEffect(() => {
    if (!onListo) return;
    onListo({ recargar, exportar: () => exportarCSV("ina", COLUMNAS_CSV, filasCSV) });
  }, [onListo, recargar, filasCSV]);

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
              <th className="th-ordenable" onClick={alternarOrden} title="Ordenar por fecha">
                Fecha {orden === "desc" ? "↓" : "↑"}
              </th>
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
