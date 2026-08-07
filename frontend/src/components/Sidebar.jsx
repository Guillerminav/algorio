import React from "react";

import IconoTuerca from "./IconoTuerca.jsx";

export const SECCIONES = [
  { id: "dashboard", etiqueta: "Dashboard" },
  { id: "historico", etiqueta: "Histórico" },
  { id: "alertas", etiqueta: "Alertas" },
  { id: "mapa", etiqueta: "Mapa" },
  { id: "flota", etiqueta: "Mi flota" },
  { id: "rutas", etiqueta: "Rutas" },
];

export const TITULOS_SECCION = Object.fromEntries(SECCIONES.map((s) => [s.id, s.etiqueta]));

export default function Sidebar({ seccionActiva, onCambiarSeccion, onAbrirAyuda }) {
  return (
    <aside className="barra-lateral">
      <div className="marca">
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
      <div className="barra-lateral-pie">
        <button type="button" className="nav-boton" onClick={onAbrirAyuda}>
          <span className="nav-boton-icono"><IconoTuerca /></span>
          Ayuda
        </button>
        {/* __APP_VERSION__ lo inyecta Vite desde el archivo VERSION de la
            raiz (ver vite.config.js): una sola fuente de verdad. */}
        <span className="barra-lateral-version">v{__APP_VERSION__}</span>
      </div>
    </aside>
  );
}
