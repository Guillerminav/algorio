import React from "react";

import { PRODUCTO } from "../producto.js";

// Mismo motivo de ondas que la landing y que el mapa de la app: las tres
// pantallas de marca del proyecto se leen como la misma cosa.
function Ondas() {
  return (
    <svg
      className="pantalla-marca-ondas"
      viewBox="0 0 1440 420"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M-40,150 C220,90 420,230 720,160 C1020,90 1240,220 1480,150" fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="26" />
      <path d="M-40,250 C220,190 420,330 720,260 C1020,190 1240,320 1480,250" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="26" />
      <path d="M-40,350 C220,290 420,430 720,360 C1020,290 1240,420 1480,350" fill="none" stroke="#4fb3d9" strokeOpacity="0.22" strokeWidth="26" />
    </svg>
  );
}

/**
 * El fondo de todas las pantallas de acceso.
 *
 * Reemplaza al layout de dos columnas que había antes (panel de marca a la
 * izquierda, formulario a la derecha). Ese layout se rompía en el celular y no
 * por un ajuste que faltara: en mobile pasaba a `flex-direction: column`, y el
 * panel "retraído" colapsaba `width: 0` — que en una columna NO colapsa el
 * alto. Quedaban 853px de panel invisible empujando el formulario fuera de la
 * pantalla.
 *
 * Acá el fondo es fondo (una capa, no una columna) y el contenido va encima en
 * tarjetas de vidrio. No hay nada que colapsar, así que no hay nada que se
 * pueda romper al angostar.
 */
export default function PantallaMarca({ children, ancho = "angosto" }) {
  return (
    <div className={`pantalla-marca pantalla-marca-${ancho}`}>
      <Ondas />

      <header className="pantalla-marca-encabezado">
        <span className="pantalla-marca-wordmark">
          AlgoRio
          {PRODUCTO.sufijo && <span className="pantalla-marca-sufijo">{PRODUCTO.sufijo}</span>}
        </span>
      </header>

      <main className="pantalla-marca-cuerpo">{children}</main>

      <footer className="pantalla-marca-pie">{PRODUCTO.para}</footer>
    </div>
  );
}
