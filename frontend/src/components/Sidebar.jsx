import React from "react";

import LogoIcono from "./LogoIcono.jsx";

export const SECCIONES = [
  { id: "dashboard", etiqueta: "Dashboard" },
  { id: "alertas", etiqueta: "Alertas" },
  { id: "mapa", etiqueta: "Mapa" },
  { id: "flota", etiqueta: "Mi flota" },
];

export const TITULOS_SECCION = Object.fromEntries(SECCIONES.map((s) => [s.id, s.etiqueta]));

export default function Sidebar({ seccionActiva, onCambiarSeccion, onAbrirAyuda }) {
  return (
    <aside className="barra-lateral">
      <div className="marca">
        <div className="marca-icono">
          <LogoIcono size={20} />
        </div>
        <div className="marca-texto">AlgoRío</div>
      </div>
      <nav className="nav-secciones">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`nav-boton${s.id === seccionActiva ? " activo" : ""}`}
            onClick={() => onCambiarSeccion(s.id)}
          >
            <span className="nav-boton-punto" />
            {s.etiqueta}
          </button>
        ))}
      </nav>
      {/* Al final de la barra (margin-top:auto en el CSS): no es una seccion
          mas de navegacion, abre el formulario de contacto. En mobile, donde
          no hay barra lateral, el acceso esta en el menu de perfil. */}
      <button type="button" className="nav-boton nav-boton-ayuda" onClick={onAbrirAyuda}>
        <span className="nav-boton-punto" />
        Ayuda
      </button>
    </aside>
  );
}
