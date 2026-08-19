import L from "leaflet";
import React, { useEffect, useState } from "react";
import { Marker, Popup } from "react-leaflet";

import { pedirJSON } from "../api.js";

// Cada cuanto se refrescan las posiciones. Un barco de rio va a 10-12 nudos,
// o sea unos 100 metros cada 15 segundos: mas seguido no agrega informacion
// util y solo suma pedidos. El endpoint lee de memoria (ver backend/ais.py),
// asi que es barato de todas formas.
const SEGUNDOS_REFRESCO = 15;

/**
 * El pin de un barco: una punta de flecha que apunta hacia donde navega.
 *
 * Es una flecha y no un circulo a proposito — los circulos ya son los lugares.
 * Y la direccion es la mitad del dato: saber que hay un buque a 800 metros no
 * sirve si no sabes si viene hacia vos o se esta yendo.
 *
 * Sin rumbo informado se dibuja un rombo, que no apunta a ningun lado: mejor
 * eso que una flecha apuntando al norte por defecto, que seria mentir.
 */
function icono(rumbo) {
  const hayRumbo = rumbo !== null && rumbo !== undefined;
  const forma = hayRumbo
    ? `<svg viewBox="0 0 24 24" style="transform: rotate(${rumbo}deg)">
         <path d="M12 2 L20 21 L12 16.5 L4 21 Z" />
       </svg>`
    : `<svg viewBox="0 0 24 24"><path d="M12 5 L18 12 L12 19 L6 12 Z" /></svg>`;

  return L.divIcon({
    className: "marcador-nave",
    html: forma,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const nudosEnTexto = (nudos) =>
  typeof nudos === "number" ? `${nudos.toFixed(1).replace(".", ",")} nudos` : "sin velocidad";

/**
 * Los barcos que estan ahora en el tramo, para saber cuando cruzar.
 *
 * Solo pide datos mientras la capa esta encendida: apagarla corta el intervalo.
 * No tiene sentido refrescar posiciones que nadie esta mirando.
 */
export default function CapaEmbarcaciones({ activa, onEstado }) {
  const [naves, setNaves] = useState([]);

  useEffect(() => {
    if (!activa) return undefined;

    let cancelado = false;
    const traer = () =>
      pedirJSON("/api/embarcaciones")
        .then((d) => {
          if (cancelado) return;
          setNaves(d.embarcaciones ?? []);
          onEstado?.({
            disponible: d.activo !== false,
            conectado: d.conectado,
            recibioDatos: d.recibio_datos,
            cantidad: (d.embarcaciones ?? []).length,
          });
        })
        .catch(() => {
          if (cancelado) return;
          onEstado?.({ disponible: true, conectado: false, recibioDatos: false, cantidad: 0 });
        });

    traer();
    const id = setInterval(traer, SEGUNDOS_REFRESCO * 1000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [activa, onEstado]);

  if (!activa) return null;

  return (
    <>
      {naves.map((nave) => (
        <Marker
          key={nave.mmsi}
          position={[nave.lat, nave.lon]}
          icon={icono(nave.rumbo ?? nave.proa)}
        >
          <Popup>
            <strong>{nave.nombre || `MMSI ${nave.mmsi}`}</strong>
            <br />
            {nudosEnTexto(nave.velocidad_nudos)}
            {nave.rumbo !== null && nave.rumbo !== undefined && ` · rumbo ${Math.round(nave.rumbo)}°`}
          </Popup>
        </Marker>
      ))}
    </>
  );
}
