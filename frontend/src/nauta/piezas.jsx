import React from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { useRio } from "./ContextoRio.jsx";
import { CLASE_POR_ESTADO_RIO, embarcacionPorClave, rumbo } from "./constantes.js";

/** Cinco estrellas siempre dibujadas, las llenas en color: se lee de un
 *  vistazo y ocupa lo mismo con cualquier puntaje. */
export function Estrellas({ puntaje, tamano = 15, onElegir }) {
  const redondeado = Math.round(puntaje ?? 0);

  if (!onElegir) {
    return (
      <span className="estrellas" style={{ fontSize: tamano }} aria-label={`${puntaje ?? 0} de 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= redondeado ? "estrella llena" : "estrella"} aria-hidden="true">
            ★
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="estrellas estrellas-elegibles" style={{ fontSize: tamano }} role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === redondeado}
          aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
          className={n <= redondeado ? "estrella llena" : "estrella"}
          onClick={() => onElegir(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

/**
 * El cartel del río: las tres cosas que se miran antes de salir.
 *
 * Va sobre el mapa, en vidrio, y son tres lecturas separadas y no una frase:
 *
 * - **Navegabilidad** — el veredicto cruzado con TU embarcación
 *   (backend/clima.py). Lo único en negrita: es la respuesta a la pregunta.
 * - **Viento** — el número crudo, abajo y más chico. Solo no dice nada: 20
 *   km/h es una tarde tranquila en una lancha y un problema en un kayak.
 * - **Dirección** — de dónde sopla, como veleta. Decide por qué orilla
 *   conviene ir, así que vale una columna propia y no un renglón más.
 *
 * El semáforo quedó en un punto de color. Antes la barra entera se pintaba de
 * verde, ámbar o rojo y gritaba lo mismo un día de 30 km/h que uno de 60.
 */
export function BarraViento({ clima, cargando, error, onVerDetalle }) {
  const { usuario } = useAuth();
  const { reintentarClima } = useRio();
  const embarcacion = embarcacionPorClave(usuario?.tipo_embarcacion);

  // El emoji de la embarcación al lado del veredicto: recuerda de un vistazo
  // que ese "picado" no es genérico sino el umbral de *tu* kayak o *tu*
  // lancha. Sin él, dos personas paradas en la misma orilla ven carteles
  // distintos y no hay nada en pantalla que explique por qué.
  const Embarcacion = () =>
    embarcacion ? (
      <span className="barra-viento-embarcacion" title={embarcacion.etiqueta} aria-hidden="true">
        {embarcacion.emoji}
      </span>
    ) : null;

  // Mientras carga no hay nada que tocar; cuando falló, sí: el cartel entero es
  // el botón de reintentar. Es lo primero que uno toca cuando algo no cargó, y
  // en el agua la señal va y viene todo el tiempo — el reintento automático
  // (ver ContextoRio) se rinde a los 45 s y a partir de ahí queda este.
  if (cargando || error || !clima) {
    const contenido = (
      <>
        <Embarcacion />
        <span className="barra-viento-punto sin-datos" aria-hidden="true" />
        <div className="barra-viento-texto">
          <strong>{cargando ? "Viendo cómo está el río…" : "Sin datos de viento"}</strong>
          {!cargando && <span>Tocá para reintentar.</span>}
        </div>
      </>
    );

    if (cargando) return <div className="barra-viento">{contenido}</div>;
    return (
      <button type="button" className="barra-viento" onClick={reintentarClima}>
        {contenido}
      </button>
    );
  }

  const { estado, titulo } = clima.estado_rio;
  const { viento_kmh: viento, rafagas_kmh: rafagas, direccion_grados: grados } = clima.actual ?? {};
  const letras = rumbo(grados);

  // El número va sin la palabra "Viento" adelante (a diferencia del `detalle`
  // que arma el backend): en este cartel ya está claro por dónde se lee.
  const lecturaViento =
    viento === null || viento === undefined
      ? "Sin datos de viento"
      : `${Math.round(viento)} km/h${
          rafagas !== null && rafagas !== undefined && rafagas > viento
            ? ` · ráfagas ${Math.round(rafagas)}`
            : ""
        }`;

  return (
    <button type="button" className="barra-viento" onClick={onVerDetalle}>
      <Embarcacion />

      <div className="barra-viento-texto">
        <strong>
          <span
            className={`barra-viento-punto ${CLASE_POR_ESTADO_RIO[estado] ?? "sin-datos"}`}
            aria-hidden="true"
          />
          {titulo}
        </strong>
        <span>{lecturaViento}</span>
      </div>

      {/* De dónde sopla, como veleta: la flecha apunta al origen. */}
      {grados !== null && grados !== undefined && (
        <span className="barra-viento-rumbo" title={`Viento del ${letras}`}>
          <svg viewBox="0 0 24 24" width="17" height="17" style={{ transform: `rotate(${grados}deg)` }} aria-hidden="true">
            <path
              d="M12 3 L12 21 M12 3 L7 9 M12 3 L17 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{letras}</span>
        </span>
      )}

      <span className="barra-viento-flecha" aria-hidden="true">›</span>
    </button>
  );
}
