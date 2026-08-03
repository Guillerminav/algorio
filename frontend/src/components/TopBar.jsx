import React from "react";

import PerfilMenu from "./PerfilMenu.jsx";

export default function TopBar({ titulo, onEditarPerfil, onAbrirAyuda, onVerSuscripcion }) {
  return (
    <header className="barra-superior">
      <div className="barra-superior-marca-movil">AlgoRío</div>
      <h2>{titulo}</h2>
      <PerfilMenu
        onEditarPerfil={onEditarPerfil}
        onAbrirAyuda={onAbrirAyuda}
        onVerSuscripcion={onVerSuscripcion}
      />
    </header>
  );
}
