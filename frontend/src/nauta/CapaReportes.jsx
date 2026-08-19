import L from "leaflet";
import React from "react";
import { Marker, Popup } from "react-leaflet";

import { pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  haceCuanto,
  severidadPorClave,
  tipoReporte,
  vigenciaRestante,
} from "./constantes.js";

/**
 * El pin de un reporte, distinto del de un comercio a propósito.
 *
 * Los lugares son círculos de color liso; los avisos son gotas con el emoji
 * del tipo adentro y el borde del color de la severidad. Tienen que
 * distinguirse de un vistazo: un parador es un destino, un tronco es algo que
 * hay que esquivar.
 */
function iconoReporte(reporte) {
  const definicion = tipoReporte(reporte.tipo);
  const color = severidadPorClave(reporte.severidad).color;
  return L.divIcon({
    className: "marcador-reporte",
    html: `<span style="border-color:${color}"><i>${definicion.emoji}</i></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

export default function CapaReportes({ reportes, onCambio }) {
  const { usuario } = useAuth();

  async function borrar(reporte) {
    await pedirJSON(`/api/reportes/${reporte.id}`, { method: "DELETE" }).catch(() => {});
    await onCambio();
  }

  return (
    <>
      {reportes.map((reporte) => {
        const definicion = tipoReporte(reporte.tipo);
        const severidad = severidadPorClave(reporte.severidad);
        const esMio = reporte.usuario === usuario?.usuario;

        return (
          <Marker key={reporte.id} position={[reporte.lat, reporte.lon]} icon={iconoReporte(reporte)}>
            <Popup>
              <div className="popup-reporte">
                <span className="popup-reporte-severidad" style={{ background: severidad.color }}>
                  {severidad.etiqueta}
                </span>
                <strong>
                  {definicion.emoji} {reporte.detalle || definicion.etiqueta}
                </strong>
                {reporte.comentario && <p>{reporte.comentario}</p>}
                <div className="popup-reporte-meta">
                  <span>{haceCuanto(reporte.creado_en)}</span>
                  {reporte.autor && <span>· {reporte.autor}</span>}
                </div>
                {/* Se muestra cuánto le queda para que quede claro que esto
                    caduca: es lo que sostiene la confianza en la capa. */}
                <div className="popup-reporte-vigencia">{vigenciaRestante(reporte.vence_en)}</div>
                {esMio && (
                  <button type="button" className="popup-reporte-borrar" onClick={() => borrar(reporte)}>
                    Ya no está — borrar
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
