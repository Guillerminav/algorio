import React from "react";

import LogoIcono from "./LogoIcono.jsx";
import PerfilMenu from "./PerfilMenu.jsx";

export default function TopBar({ titulo, onEditarPerfil }) {
  return (
    <header className="barra-superior">
      <div className="barra-superior-marca-movil">
        <div className="marca-icono">
          <LogoIcono size={18} />
        </div>
      </div>
      <h2>{titulo}</h2>
      <PerfilMenu onEditarPerfil={onEditarPerfil} />
    </header>
  );
}
