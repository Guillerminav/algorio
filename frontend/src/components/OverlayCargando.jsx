import React from "react";

// Tapa la pantalla mientras una operacion que tarda esta en curso (guardar o
// borrar un activo: el backend recalcula el estado de cada uno contra todo el
// dataset y puede tardar varios segundos). Ademas de informar, bloquea la
// interaccion, asi no se dispara dos veces la misma alta.
export default function OverlayCargando({ mensaje = "Cargando…" }) {
  return (
    <div className="overlay-cargando" role="status" aria-live="polite">
      <div className="overlay-cargando-caja">
        <span className="overlay-cargando-spinner" aria-hidden="true" />
        {mensaje}
      </div>
    </div>
  );
}
