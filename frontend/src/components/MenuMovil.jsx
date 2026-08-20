import React, { useEffect } from "react";

import BotonSOS from "./BotonSOS.jsx";
import IconoTuerca from "./IconoTuerca.jsx";
import { seccionesVisibles } from "./Sidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// Reemplaza a la barra lateral en pantallas chicas. Un cajon desplegable en
// vez de la barra inferior de antes: entran todas las secciones (que ya son
// seis) y ademas el perfil, sin apretar seis botones en el ancho de un
// celular.
export default function MenuMovil({
  abierto,
  onCerrar,
  seccionActiva,
  onCambiarSeccion,
  onEditarPerfil,
  onVerSuscripcion,
  onAbrirAyuda,
  secciones: seccionesProp,
}) {
  const { usuario, logout, suscripcion } = useAuth();
  // Igual que en Sidebar: el shell del comerciante pasa sus propias secciones.
  const secciones = seccionesProp ?? seccionesVisibles(suscripcion);

  // Con el cajon abierto el fondo no debe scrollear: si no, el dedo mueve la
  // pagina de atras en vez del menu.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  useEffect(() => {
    function alPresionarEscape(evento) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPresionarEscape);
    return () => document.removeEventListener("keydown", alPresionarEscape);
  }, [onCerrar]);

  if (!abierto) return null;

  const iniciales = (usuario?.nombre_completo || usuario?.usuario || "?")
    .split(/\s+/)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Cada accion del menu cierra el cajon: en mobile queda tapando la pantalla.
  const conCierre = (accion) => () => {
    onCerrar();
    accion();
  };

  return (
    <div className="menu-movil-fondo" onClick={onCerrar}>
      <aside className="menu-movil" onClick={(e) => e.stopPropagation()}>
        <div className="menu-movil-encabezado">
          <span className="menu-movil-marca">AlgoRio</span>
          <button type="button" className="menu-movil-cerrar" onClick={onCerrar} aria-label="Cerrar menú">
            ✕
          </button>
        </div>

        <div className="menu-movil-perfil">
          <div className="menu-movil-perfil-datos">
            <span className="circulo-perfil menu-movil-avatar">{iniciales}</span>
            <div>
              <div className="menu-movil-nombre">{usuario?.nombre_completo || usuario?.usuario}</div>
              <div className="menu-movil-usuario">@{usuario?.usuario}</div>
            </div>
          </div>
          <div className="menu-movil-perfil-acciones">
            <button type="button" onClick={conCierre(onEditarPerfil)}>Editar perfil</button>
            <button type="button" onClick={conCierre(onVerSuscripcion)}>Suscripción</button>
            <button type="button" onClick={conCierre(onAbrirAyuda)}>
              <IconoTuerca size={13} /> Ayuda
            </button>
            <button type="button" className="menu-movil-salir" onClick={conCierre(logout)}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <nav className="menu-movil-secciones">
          {secciones.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`nav-boton${s.id === seccionActiva ? " activo" : ""}`}
              onClick={conCierre(() => onCambiarSeccion(s.id))}
            >
              <span className="nav-boton-punto" />
              {s.etiqueta}
            </button>
          ))}
        </nav>

        {/* Pegado al borde inferior del cajon (lo hace `margin-top: auto` en
            el CSS) y en tono bajo. Es una herramienta que hay que saber que
            esta, no un boton que compite con la navegacion: el borde de abajo
            es un lugar fijo que no se mueve cuando el perfil suma o resta
            secciones, y eso se aprende una vez.

            No cierra el cajon al tocarlo (a diferencia del resto de las
            acciones): abre su propio panel encima, y si se cerrara el menu
            detras, al salir del panel habria que volver a abrirlo todo. */}
        <BotonSOS />
      </aside>
    </div>
  );
}
