import React from "react";

import IconoTuerca from "./IconoTuerca.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export const SECCIONES = [
  { id: "dashboard", etiqueta: "Dashboard" },
  { id: "historico", etiqueta: "Histórico" },
  { id: "alertas", etiqueta: "Alertas" },
  { id: "mapa", etiqueta: "Mapa" },
  { id: "flota", etiqueta: "Mi flota" },
  { id: "rutas", etiqueta: "Rutas" },
];

export const TITULOS_SECCION = Object.fromEntries(SECCIONES.map((s) => [s.id, s.etiqueta]));

// Las secciones que habilita el plan de la cuenta. `suscripcion` es lo
// que devuelve /api/suscripcion; mientras no llegó (null) se muestran todas
// para no hacer parpadear la barra al entrar. Esconder no es proteger: el
// backend rechaza igual los endpoints de una seccion no habilitada.
export function seccionesVisibles(suscripcion) {
  const permitidas = suscripcion?.secciones;
  if (!permitidas) return SECCIONES;
  return SECCIONES.filter((s) => permitidas.includes(s.id));
}

// `secciones` permite que otro shell (el del comerciante) reuse esta barra con
// su propia navegacion. Sin el prop se comporta como siempre: las secciones del
// producto de navieras que habilite el plan de la cuenta.
export default function Sidebar({
  seccionActiva,
  onCambiarSeccion,
  onAbrirAyuda,
  secciones: seccionesProp,
}) {
  const { suscripcion } = useAuth();
  const secciones = seccionesProp ?? seccionesVisibles(suscripcion);

  return (
    <aside className="barra-lateral">
      <div className="marca">
        <div className="marca-texto">AlgoRio</div>
      </div>
      <nav className="nav-secciones">
        {secciones.map((s) =>
          // Una seccion puede traer su propio nodo en vez de ser un boton: es
          // como el panel del comerciante mete el arbol de sus comercios en el
          // lugar exacto de la lista donde va, y no pegado arriba de todo.
          s.nodo ? (
            <React.Fragment key={s.id}>{s.nodo}</React.Fragment>
          ) : (
          <button
            key={s.id}
            type="button"
            className={`nav-boton${s.id === seccionActiva ? " activo" : ""}`}
            onClick={() => onCambiarSeccion(s.id)}
          >
            <span className="nav-boton-punto" />
            {s.etiqueta}
            {/* El pendiente de moderacion se cuenta en la barra y no adentro
                de la seccion: si hay que entrar para enterarse de que hay algo
                esperando, la cola se mira cuando alguien se acuerda. */}
            {s.pendientes > 0 && (
              <span className="nav-boton-cuenta" aria-label={`${s.pendientes} esperando`}>
                {s.pendientes}
              </span>
            )}
          </button>
          ),
        )}
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
