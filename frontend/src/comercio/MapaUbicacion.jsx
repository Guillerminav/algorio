import React, { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

import {
  ATRIBUCION_SATELITAL,
  CENTRO_POR_DEFECTO,
  TILES_SATELITAL,
  iconoCircular,
} from "../mapaSatelital.js";

const ZOOM_INICIAL = 12;
const ZOOM_AL_UBICAR = 16;

const ICONO_PIN = iconoCircular("var(--acento)", { clase: "marcador-comercio" });

function CapturarClicks({ onElegir }) {
  useMapEvents({ click: (evento) => onElegir(evento.latlng.lat, evento.latlng.lng) });
  return null;
}

// Leaflet mide el contenedor al montar. Si en ese momento el layout todavia se
// esta acomodando (pasa cuando el mapa vive dentro de un paso de un asistente
// que acaba de aparecer), queda con el tamaño viejo y se ve gris.
function RecalcularTamano() {
  const mapa = useMap();
  useEffect(() => {
    const id = setTimeout(() => mapa.invalidateSize(), 200);
    return () => clearTimeout(id);
  }, [mapa]);
  return null;
}

function CentrarEn({ posicion }) {
  const mapa = useMap();
  useEffect(() => {
    if (posicion) mapa.setView(posicion, Math.max(mapa.getZoom(), ZOOM_AL_UBICAR));
  }, [mapa, posicion]);
  return null;
}

/**
 * Mapa satelital para marcar donde queda el comercio. Se puede tocar el mapa,
 * arrastrar el pin, o dejar que el navegador use el GPS — tres formas porque
 * el comerciante que carga esto desde el celular en su propio muelle quiere el
 * GPS, y el que lo carga desde una compu en la ciudad necesita buscarlo a mano.
 */
export default function MapaUbicacion({ lat, lon, onCambiar }) {
  const [ubicando, setUbicando] = useState(false);
  const [error, setError] = useState("");
  // Solo para mover la camara cuando el GPS devuelve una posicion; no es el
  // valor del pin (ese lo manda el formulario de arriba).
  const [centrarEn, setCentrarEn] = useState(null);

  const hayPin = typeof lat === "number" && typeof lon === "number";
  const posicion = hayPin ? [lat, lon] : null;

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setError("Tu navegador no permite usar la ubicación.");
      return;
    }
    setError("");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCambiar(pos.coords.latitude, pos.coords.longitude);
        setCentrarEn([pos.coords.latitude, pos.coords.longitude]);
        setUbicando(false);
      },
      () => {
        setError("No pudimos obtener tu ubicación. Marcá el punto en el mapa.");
        setUbicando(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="mapa-ubicacion">
      <div className="mapa-ubicacion-acciones">
        <button type="button" className="boton-secundario" onClick={usarMiUbicacion} disabled={ubicando}>
          {ubicando ? "Buscando…" : "Usar mi ubicación"}
        </button>
        <span className="mapa-ubicacion-coords">
          {hayPin ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "Tocá el mapa para marcar el punto"}
        </span>
      </div>

      <MapContainer
        center={posicion ?? CENTRO_POR_DEFECTO}
        zoom={hayPin ? ZOOM_AL_UBICAR : ZOOM_INICIAL}
        className="mapa-contenedor mapa-contenedor-ubicacion"
        scrollWheelZoom
      >
        <TileLayer attribution={ATRIBUCION_SATELITAL} url={TILES_SATELITAL} maxZoom={19} />
        <CapturarClicks onElegir={onCambiar} />
        <RecalcularTamano />
        <CentrarEn posicion={centrarEn} />
        {posicion && (
          <Marker
            position={posicion}
            icon={ICONO_PIN}
            draggable
            eventHandlers={{
              dragend: (evento) => {
                const { lat: nuevaLat, lng } = evento.target.getLatLng();
                onCambiar(nuevaLat, lng);
              },
            }}
          />
        )}
      </MapContainer>

      {error && <div className="mensaje-error">{error}</div>}
    </div>
  );
}
