import React from "react";

import { EMBARCACIONES } from "./constantes.js";

/**
 * Grilla de tarjetas para elegir con qué se sale al río.
 *
 * La usan las dos pantallas que lo preguntan: el onboarding (donde es la única
 * pregunta) y el perfil (donde se cambia). Es controlado y no guarda nada:
 * quién lo usa decide si guarda al tocar o al confirmar.
 */
export default function SelectorEmbarcacion({ valor, onCambiar, deshabilitado = false }) {
  return (
    <div className="grilla-embarcaciones" role="radiogroup" aria-label="Tipo de embarcación">
      {EMBARCACIONES.map((embarcacion) => {
        const activa = embarcacion.clave === valor;
        return (
          <button
            key={embarcacion.clave}
            type="button"
            role="radio"
            aria-checked={activa}
            // El nombre accesible va explicito: si se calculara del contenido,
            // el lector de pantalla anunciaria tambien el emoji ("bote de remos
            // Kayak"), que no aporta nada a quien no lo ve.
            aria-label={embarcacion.etiqueta}
            disabled={deshabilitado}
            className={`tarjeta-embarcacion${activa ? " elegida" : ""}`}
            onClick={() => onCambiar(embarcacion.clave)}
          >
            <span className="tarjeta-embarcacion-emoji" aria-hidden="true">{embarcacion.emoji}</span>
            <span className="tarjeta-embarcacion-texto">{embarcacion.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
