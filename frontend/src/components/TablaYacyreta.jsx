import React, { useEffect, useMemo } from "react";

import { exportarCSV, formatearCaudal, formatearNivel } from "../api.js";
import Paginador from "./Paginador.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";
import { usePaginacion } from "../hooks/usePaginacion.js";

const COLUMNAS_CSV = [
  { clave: "fecha_boletin", etiqueta: "Fecha" },
  { clave: "nivel_rio", etiqueta: "Nivel rio Ituzaingo" },
  { clave: "caudal", etiqueta: "Caudal afluente hoy" },
  { clave: "nivel_embalse", etiqueta: "Nivel embalse hoy" },
];

export default function TablaYacyreta({ onListo }) {
  const { usuario } = useAuth();
  const { datos, error, cargando, recargar } = useFetchLista("/api/yacyreta");
  const { itemsDePagina, paginaActual, totalPaginas, irAPagina } = usePaginacion(datos);

  const filasCSV = useMemo(
    () => datos.map((f) => ({
      fecha_boletin: f.fecha_boletin,
      nivel_rio: formatearNivel(f.altura_ituzaingo_m, usuario?.unidad_nivel),
      caudal: formatearCaudal(f.caudal_afluente_hoy_m3s, usuario?.unidad_caudal),
      nivel_embalse: formatearNivel(f.nivel_embalse_hoy_msnm, usuario?.unidad_nivel),
    })),
    [datos, usuario?.unidad_nivel, usuario?.unidad_caudal],
  );

  useEffect(() => {
    if (!onListo) return;
    onListo({ recargar, exportar: () => exportarCSV("yacyreta", COLUMNAS_CSV, filasCSV) });
  }, [onListo, recargar, filasCSV]);

  return (
    <div>
      <h3>Yacyreta — Resumen ejecutivo (EBY)</h3>
      <div className="estado">
        {error ? `Error cargando Yacyreta: ${error.message}` : cargando ? "" : `${datos.length} boletines`}
      </div>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th className="num">Nivel río Ituzaingó</th>
              <th className="num">Caudal afluente hoy</th>
              <th className="num">Nivel embalse hoy</th>
            </tr>
          </thead>
          <tbody>
            {itemsDePagina.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={4}>Todavia no se corrio la fuente Yacyreta.</td>
              </tr>
            ) : (
              itemsDePagina.map((f, i) => (
                <tr key={`${f.fecha_boletin}-${i}`}>
                  <td>{f.fecha_boletin}</td>
                  <td className="num">{formatearNivel(f.altura_ituzaingo_m, usuario?.unidad_nivel)}</td>
                  <td className="num">{formatearCaudal(f.caudal_afluente_hoy_m3s, usuario?.unidad_caudal)}</td>
                  <td className="num">{formatearNivel(f.nivel_embalse_hoy_msnm, usuario?.unidad_nivel)}</td>
                </tr>
              ))
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
