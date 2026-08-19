import React, { useEffect, useState } from "react";

import { formatearNivel, formatearTendencia, pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { formatearDistancia } from "./constantes.js";
import { useRio } from "./ContextoRio.jsx";

// Mismos colores y criterio que el resto del producto (ver backend/datos.py:
// mapa_estaciones, y src/index.css: --subida/--alerta/--evacuacion).
const ETIQUETA_ESTADO = {
  verde: { texto: "Normal", clase: "normal" },
  amarillo: { texto: "Precaución", clase: "precaucion" },
  rojo: { texto: "Alerta", clase: "alerta" },
};

/**
 * Nivel del río en las estaciones cercanas.
 *
 * Es el mismo dato que ven las navieras en su mapa de estaciones, pero
 * presentado como lista ordenada por cercanía y sin nada de calado ni rutas:
 * al kayakista y al parador les importa una sola cosa, si el río está alto o
 * bajo y para dónde va.
 */
export default function NivelRio() {
  const { usuario } = useAuth();
  const { posicion } = useRio();
  const [estaciones, setEstaciones] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const parametros = posicion ? `?lat=${posicion.lat}&lon=${posicion.lon}` : "";
    setCargando(true);
    pedirJSON(`/api/nivel-rio${parametros}`)
      .then((d) => !cancelado && setEstaciones(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [posicion]);

  if (cargando) return <div className="estado">Buscando el nivel del río…</div>;
  if (error) return <div className="mensaje-error">{error}</div>;

  return (
    <div className="nivel-rio">
      <p className="descripcion">
        Nivel medido en las estaciones oficiales de INA, Prefectura Naval y Yacyretá.
        {posicion ? " Ordenadas de la más cercana a vos." : ""}
      </p>

      {estaciones.length === 0 && (
        <div className="estado">No hay estaciones con dato en este momento.</div>
      )}

      <ul className="lista-estaciones">
        {estaciones.map((estacion) => {
          const tendencia = formatearTendencia(estacion.tendencia, usuario?.unidad_nivel);
          const etiqueta = ETIQUETA_ESTADO[estacion.estado] ?? { texto: "Sin dato", clase: "" };
          const distancia = formatearDistancia(estacion.distancia_km);

          return (
            <li key={estacion.id} className="tarjeta-estacion">
              <div className="tarjeta-estacion-datos">
                <div className="tarjeta-estacion-encabezado">
                  <strong>{estacion.nombre}</strong>
                  <span className={`chip-nivel ${etiqueta.clase}`}>{etiqueta.texto}</span>
                </div>
                <div className="tarjeta-estacion-meta">
                  {estacion.rio && <span>{estacion.rio}</span>}
                  {distancia && <span>· a {distancia}</span>}
                  {estacion.ultima_actualizacion && <span>· {estacion.ultima_actualizacion}</span>}
                </div>
              </div>

              <div className="tarjeta-estacion-nivel">
                <span className="tarjeta-estacion-valor">
                  {formatearNivel(estacion.nivel_actual_m, usuario?.unidad_nivel)}
                </span>
                <span className={`tendencia ${tendencia.clase}`}>{tendencia.texto}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
