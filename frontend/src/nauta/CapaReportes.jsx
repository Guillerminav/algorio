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
 * Los lugares son círculos de vidrio oscuro; los avisos son gotas de vidrio
 * CLARO. Tienen que distinguirse de un vistazo: un parador es un destino, un
 * tronco es algo que hay que esquivar. La forma hace la mayor parte de ese
 * trabajo y el material la acompaña — los destinos quedan atrás, los avisos
 * se adelantan.
 *
 * La severidad escala por el tinte del cuerpo (`--tono-pin`) y por el tamaño
 * del pin, que es el canal fuerte. Ver SEVERIDADES en constantes.js.
 */
function iconoReporte(reporte) {
  const definicion = tipoReporte(reporte.tipo);
  // `colorMapa` y no `color`: el de la paleta es para el chip del popup, sobre
  // fondo crema. Sobre el rio hace falta otro (ver SEVERIDADES en constantes.js).
  const { colorMapa, tamanoMapa } = severidadPorClave(reporte.severidad);
  return L.divIcon({
    className: "marcador-reporte pin-vidrio",
    html: `<span style="--tono-pin:${colorMapa};--tamano-pin:${tamanoMapa}px"><i>${definicion.emoji}</i></span>`,
    iconSize: [tamanoMapa, tamanoMapa],
    iconAnchor: [tamanoMapa / 2, tamanoMapa / 2],
    popupAnchor: [0, -tamanoMapa / 2 - 2],
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
