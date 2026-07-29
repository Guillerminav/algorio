import React from "react";

import { SECCIONES } from "./Sidebar.jsx";

// Reemplaza a la barra lateral en pantallas chicas (ver index.css: oculta por
// defecto, se muestra con "display:flex" debajo de 880px). Mismas 4 secciones.
export default function NavInferior({ seccionActiva, onCambiarSeccion }) {
  return (
    <nav className="nav-inferior">
      {SECCIONES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={s.id === seccionActiva ? "activo" : ""}
          onClick={() => onCambiarSeccion(s.id)}
        >
          <span className="nav-inferior-punto" />
          {s.etiqueta}
        </button>
      ))}
    </nav>
  );
}
