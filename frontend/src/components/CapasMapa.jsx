import React, { useEffect, useRef, useState } from "react";
import { TileLayer } from "react-leaflet";

import {
  CAPAS,
  TILES_ETIQUETAS,
  capaGuardada,
  capaPorClave,
  guardarCapa,
} from "../mapaSatelital.js";

/**
 * El fondo del mapa y el control para cambiarlo.
 *
 * Va todo junto —las capas y su selector— porque son la misma decisión: qué se
 * ve abajo de los pines. Se usa adentro de un `<MapContainer>`, que es donde
 * react-leaflet dibuja a sus hijos.
 *
 * El satelital sigue siendo el default y no es una preferencia estética: con
 * la capa de calles el río es una mancha azul lisa, y en el satelital se ven
 * los bancos de arena y la costa real, que para quien está navegando es el
 * dato. Las otras capas están para lo demás — reconocer un muelle por el
 * nombre del pueblo, leer un acceso, mirar el relieve de la barranca.
 *
 * La elección se recuerda entre pantallas y entre visitas: quien prefiere el
 * mapa claro lo prefiere siempre, no una vez.
 */
export default function CapasMapa({ onCambiar }) {
  const [clave, setClave] = useState(capaGuardada);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);

  const capa = capaPorClave(clave);

  // Un clic en cualquier lado cierra el panel. Sin esto queda abierto tapando
  // el mapa mientras se arrastra, que es justo lo que se quería mirar.
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (evento) => {
      if (!contenedor.current?.contains(evento.target)) setAbierto(false);
    };
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, [abierto]);

  function elegir(nueva) {
    setClave(nueva);
    guardarCapa(nueva);
    setAbierto(false);
    onCambiar?.(nueva);
  }

  return (
    <>
      {/* `key` fuerza a Leaflet a reemplazar la capa en vez de reusar la
          anterior con otra URL: sin eso quedan mosaicos viejos mezclados con
          los nuevos hasta que se mueve el mapa. */}
      <TileLayer
        key={capa.clave}
        url={capa.url}
        attribution={capa.atribucion}
        maxZoom={capa.maxZoom}
      />
      {capa.conEtiquetas && <TileLayer url={TILES_ETIQUETAS} maxZoom={capa.maxZoom} />}

      {/* El panel va ANTES del botón en el DOM y la caja es una columna
          alineada abajo: así se abre hacia arriba sin posicionarlo a mano, y
          su alto queda limitado por el de la columna. El botón vive abajo a la
          izquierda, encima del zoom — arriba chocaba con la fila de Reportar y
          los filtros, que ocupan todo ese borde. */}
      <div className="capas-mapa" ref={contenedor}>
        {abierto && (
          <div className="capas-mapa-panel" role="group" aria-label="Fondo del mapa">
            {CAPAS.map((c) => (
              <button
                key={c.clave}
                type="button"
                className={`capas-mapa-opcion${c.clave === clave ? " activa" : ""}`}
                aria-pressed={c.clave === clave}
                onClick={() => elegir(c.clave)}
              >
                <span className="capas-mapa-nombre">{c.etiqueta}</span>
                <span className="capas-mapa-detalle">{c.detalle}</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className={`capas-mapa-boton${abierto ? " abierto" : ""}`}
          title="Cambiar el fondo del mapa"
          aria-label="Cambiar el fondo del mapa"
          aria-expanded={abierto}
          onClick={() => setAbierto((previo) => !previo)}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" strokeLinejoin="round" />
            <path d="m3 12.5 9 4.5 9-4.5M3 17l9 4.5 9-4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </>
  );
}
