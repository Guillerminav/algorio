import React from "react";

import { formatearCaudal, formatearNivel } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";

export default function TablaYacyreta() {
  const { usuario } = useAuth();
  const { datos, error, cargando } = useFetchLista("/api/yacyreta");

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
            {datos.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={4}>Todavia no se corrio la fuente Yacyreta.</td>
              </tr>
            ) : (
              datos.map((f, i) => (
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
    </div>
  );
}
