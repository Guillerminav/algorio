import React, { useEffect, useMemo } from "react";

import { exportarCSV, formatearNivel, formatearTendencia } from "../api.js";
import Paginador from "./Paginador.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";
import { useOrdenFecha } from "../hooks/useOrdenFecha.js";
import { usePaginacion } from "../hooks/usePaginacion.js";

const COLUMNAS_CSV = [
  { clave: "fecha_hora", etiqueta: "Fecha y hora" },
  { clave: "estacion", etiqueta: "Estacion" },
  { clave: "rio", etiqueta: "Rio" },
  { clave: "nivel_actual_m", etiqueta: "Nivel actual" },
  { clave: "variacion_m", etiqueta: "Variacion" },
  { clave: "tendencia", etiqueta: "Tendencia" },
  { clave: "nivel_anterior_m", etiqueta: "Nivel anterior" },
];

export default function TablaPrefectura({ onListo }) {
  const { usuario } = useAuth();
  const { datos, error, cargando, recargar } = useFetchLista("/api/prefectura-naval");
  const { itemsOrdenados, orden, alternarOrden } = useOrdenFecha(datos);
  const { itemsDePagina, paginaActual, totalPaginas, irAPagina } = usePaginacion(itemsOrdenados);

  const filasCSV = useMemo(
    () => itemsOrdenados.map((f) => ({
      fecha_hora: `${f.fecha_boletin} ${f.hora_registro ?? ""}`.trim(),
      estacion: f.estacion,
      rio: f.rio ?? "",
      nivel_actual_m: formatearNivel(f.nivel_actual_m, usuario?.unidad_nivel),
      variacion_m: formatearNivel(f.variacion_m, usuario?.unidad_nivel),
      tendencia: formatearTendencia(f.tendencia, usuario?.unidad_nivel).texto,
      nivel_anterior_m: formatearNivel(f.nivel_anterior_m, usuario?.unidad_nivel),
    })),
    [itemsOrdenados, usuario?.unidad_nivel],
  );

  useEffect(() => {
    if (!onListo) return;
    onListo({ recargar, exportar: () => exportarCSV("prefectura_naval", COLUMNAS_CSV, filasCSV) });
  }, [onListo, recargar, filasCSV]);

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
              <th className="th-ordenable" onClick={alternarOrden} title="Ordenar por fecha">
                Fecha y hora {orden === "desc" ? "↓" : "↑"}
              </th>
              <th>Estacion</th>
              <th>Rio</th>
              <th className="num">Nivel actual</th>
              <th className="num">Variación</th>
              <th>Tendencia</th>
              <th className="num">Nivel anterior</th>
            </tr>
          </thead>
          <tbody>
            {itemsDePagina.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={7}>Todavia no se corrio la fuente Prefectura Naval.</td>
              </tr>
            ) : (
              itemsDePagina.map((f, i) => {
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
      <Paginador
        paginaActual={paginaActual}
        totalPaginas={totalPaginas}
        irAPagina={irAPagina}
        totalItems={datos.length}
      />
    </div>
  );
}
