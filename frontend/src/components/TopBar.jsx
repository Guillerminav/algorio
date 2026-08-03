import React from "react";

import PerfilMenu from "./PerfilMenu.jsx";

export default function TopBar({ titulo, onEditarPerfil, onAbrirAyuda, onVerSuscripcion, onAbrirMenu }) {
  return (
    <header className="barra-superior">
      {/* Solo visible en mobile (ver index.css): en desktop la navegacion y el
          perfil ya estan en la barra lateral y en el circulo de la derecha. */}
      <button
        type="button"
        className="boton-hamburguesa"
        onClick={onAbrirMenu}
        aria-label="Abrir menú"
      >
        <span />
        <span />
        <span />
      </button>
      <h2>{titulo}</h2>
      <PerfilMenu
        onEditarPerfil={onEditarPerfil}
        onAbrirAyuda={onAbrirAyuda}
        onVerSuscripcion={onVerSuscripcion}
      />
    </header>
  );
}
