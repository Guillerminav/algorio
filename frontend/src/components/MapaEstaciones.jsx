import L from "leaflet";
import "leaflet.markercluster";
import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import { formatearNivel, formatearTendencia } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";

// Mismos colores que el resto del panel (ver src/index.css: --subida/--alerta/--evacuacion).
const COLOR_POR_ESTADO = { verde: "var(--subida)", amarillo: "var(--alerta)", rojo: "var(--evacuacion)" };
const ETIQUETA_POR_ESTADO = { verde: "Normal", amarillo: "Precaución", rojo: "Alerta / restringido" };

function valorOTexto(valor, textoVacio = "Sin datos") {
  return valor === null || valor === undefined || valor === "" ? textoVacio : valor;
}

function iconoPorEstado(estado) {
  const color = COLOR_POR_ESTADO[estado] ?? "var(--texto-suave)";
  return L.divIcon({
    className: "marcador-estacion",
    html: `<span style="background:${color}"></span>`,
    iconSize: [18, 18],
    popupAnchor: [0, -9],
  });
}

// Leaflet mide el tamaño del contenedor una sola vez al montar el mapa; si en
// ese momento el layout todavia no termino de acomodarse (comun en mobile,
// con el nav inferior fijo y el layout en columna) o si despues cambia
// (achicar/expandir, rotar el celular), el mapa queda con el tamaño viejo y
// se ve en blanco o cortado. invalidateSize() le pide que vuelva a medir.
function SincronizarTamanoMapa({ expandido }) {
  const mapa = useMap();

  useEffect(() => {
    const recalcular = () => mapa.invalidateSize();
    // Timeout chico: espera a que termine la transicion de CSS (achicar/
    // expandir) o el primer layout antes de medir de nuevo.
    const timeoutId = setTimeout(recalcular, 250);
    window.addEventListener("resize", recalcular);
    window.addEventListener("orientationchange", recalcular);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", recalcular);
      window.removeEventListener("orientationchange", recalcular);
    };
  }, [mapa, expandido]);

  return null;
}

// Capa de marcadores agrupados (clustering). Leaflet.markercluster no tiene
// bindings propios de react-leaflet, asi que se maneja imperativamente con
// useMap() dentro de un useEffect, igual que cualquier plugin de Leaflet.
function CapaClusterMarcadores({ estaciones, unidadNivel, onSeleccionar }) {
  const mapa = useMap();
  const alSeleccionarRef = useRef(onSeleccionar);
  alSeleccionarRef.current = onSeleccionar;

  useEffect(() => {
    const grupo = L.markerClusterGroup();

    estaciones.forEach((estacion) => {
      if (typeof estacion.lat !== "number" || typeof estacion.lon !== "number") return;

      const marcador = L.marker([estacion.lat, estacion.lon], { icon: iconoPorEstado(estacion.estado) });
      const color = COLOR_POR_ESTADO[estacion.estado] ?? "var(--texto-suave)";
      marcador.bindPopup(
        `<div class="popup-estacion">
          <strong>${estacion.nombre}</strong>
          <div class="popup-estacion-rio">${valorOTexto(estacion.rio)}</div>
          <div>Nivel: ${formatearNivel(estacion.nivel_actual_m, unidadNivel)}</div>
          <span class="chip-estado" style="background:${color}">
            ${ETIQUETA_POR_ESTADO[estacion.estado] ?? "Sin estado"}
          </span>
        </div>`,
      );
      marcador.on("click", () => alSeleccionarRef.current(estacion));
      grupo.addLayer(marcador);
    });

    mapa.addLayer(grupo);

    if (grupo.getLayers().length > 0) {
      mapa.fitBounds(grupo.getBounds(), { padding: [30, 30] });
    } else {
      // Fallback: centro aproximado del tramo Rosario-Confluencia del Parana.
      mapa.setView([-29.5, -58], 6);
    }

    return () => {
      mapa.removeLayer(grupo);
    };
  }, [mapa, estaciones, unidadNivel]);

  return null;
}

function PanelEstacion({ estacion, unidadNivel, onCerrar }) {
  const tendencia = formatearTendencia(estacion.tendencia, unidadNivel);
  return (
    <aside className="panel-estacion">
      <button type="button" className="boton-cerrar-panel" title="Cerrar" onClick={onCerrar}>✕</button>
      <h3>{estacion.nombre}</h3>
      <p className="panel-estacion-rio">{valorOTexto(estacion.rio)}</p>
      <span
        className="chip-estado"
        style={{ background: COLOR_POR_ESTADO[estacion.estado] ?? "var(--texto-suave)" }}
      >
        {ETIQUETA_POR_ESTADO[estacion.estado] ?? "Sin estado"}
      </span>
      <div className="panel-estacion-dato">
        <span className="panel-estacion-label">Nivel actual</span>
        <span>{formatearNivel(estacion.nivel_actual_m, unidadNivel)}</span>
      </div>
      <div className="panel-estacion-dato">
        <span className="panel-estacion-label">Tendencia</span>
        <span className={`tendencia ${tendencia.clase}`}>{tendencia.texto}</span>
      </div>
      <div className="panel-estacion-dato">
        <span className="panel-estacion-label">Pronóstico (3-7 días)</span>
        <p>{valorOTexto(estacion.pronostico_resumen, "Sin pronóstico disponible.")}</p>
      </div>
      <div className="panel-estacion-dato">
        <span className="panel-estacion-label">Última actualización</span>
        <span>{valorOTexto(estacion.ultima_actualizacion)}</span>
      </div>
    </aside>
  );
}

export default function MapaEstaciones() {
  const { usuario } = useAuth();
  const [estacionSeleccionada, setEstacionSeleccionada] = useState(null);
  const [expandido, setExpandido] = useState(false);
  const { datos: estaciones, error, cargando } = useFetchLista("/api/mapa-estaciones");

  return (
    <div>
      <p className="descripcion">
        Estaciones de monitoreo sobre el tramo Rosario–Confluencia del Paraná.
        El color del marcador indica el estado de alerta de esa estación.
      </p>
      <div className="estado">
        {error
          ? `Error cargando el mapa: ${error.message}`
          : cargando
            ? ""
            : `${estaciones.length} estaciones con coordenada conocida`}
      </div>
      <div className={`mapa-layout${expandido ? " mapa-layout-expandido" : ""}`}>
        <div className="mapa-contenedor-wrap">
          <button
            type="button"
            className="boton-expandir-mapa"
            title={expandido ? "Achicar mapa" : "Expandir mapa"}
            onClick={() => setExpandido((e) => !e)}
          >
            {expandido ? "⤡ Achicar" : "⤢ Expandir"}
          </button>
          <MapContainer center={[-29.5, -58]} zoom={6} className="mapa-contenedor" scrollWheelZoom>
            <TileLayer
              attribution="&copy; colaboradores de OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={18}
            />
            <CapaClusterMarcadores
              estaciones={estaciones}
              unidadNivel={usuario?.unidad_nivel}
              onSeleccionar={setEstacionSeleccionada}
            />
            <SincronizarTamanoMapa expandido={expandido} />
          </MapContainer>
        </div>

        {estacionSeleccionada && (
          <PanelEstacion
            estacion={estacionSeleccionada}
            unidadNivel={usuario?.unidad_nivel}
            onCerrar={() => setEstacionSeleccionada(null)}
          />
        )}
      </div>
    </div>
  );
}
