import React, { useEffect, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";

export default function PerfilMenu({ onEditarPerfil }) {
  const { usuario, logout } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    function alHacerClickFuera(evento) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener("click", alHacerClickFuera);
    return () => document.removeEventListener("click", alHacerClickFuera);
  }, []);

  if (!usuario) return null;

  const iniciales = (usuario.nombre_completo || usuario.usuario)
    .split(/\s+/)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="perfil" ref={contenedorRef}>
      <button
        type="button"
        className="circulo-perfil"
        title="Perfil"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((a) => !a);
        }}
      >
        {iniciales}
      </button>
      {abierto && (
        <div className="menu-perfil">
          <div className="menu-perfil-nombre">{usuario.nombre_completo || usuario.usuario}</div>
          <div className="menu-perfil-usuario">@{usuario.usuario}</div>
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              onEditarPerfil();
            }}
          >
            Editar perfil
          </button>
          <button type="button" className="boton-cerrar-sesion" onClick={logout}>
            Cerrar sesion
          </button>
        </div>
      )}
    </div>
  );
}
