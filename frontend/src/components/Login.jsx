import React, { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { PRODUCTO } from "../producto.js";
import BotonGoogle from "./BotonGoogle.jsx";
import CruceProducto from "./CruceProducto.jsx";
import PantallaMarca from "./PantallaMarca.jsx";

export default function Login({ onIrARegistro }) {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await login(usuario.trim(), password);
      setPassword("");
    } catch (e) {
      setError(e.status === 401 ? "Usuario o contraseña incorrectos." : e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaMarca>
      <form className="tarjeta-vidrio" onSubmit={manejarSubmit}>
        {/* El título dice de qué producto es este dominio, y no un "Iniciar
            sesión" genérico: es lo único que le avisa a alguien que entró por
            el link equivocado antes de que pruebe su contraseña tres veces. */}
        <h1>Entrar a {PRODUCTO.nombre}</h1>
        <p className="tarjeta-vidrio-bajada">{PRODUCTO.bajada}</p>

        <label>
          Usuario
          <input
            type="text"
            autoComplete="username"
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <div className="mensaje-error">{error}</div>

        <button type="submit" className="boton-vidrio-primario" disabled={enviando}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>

        <BotonGoogle />

        <p className="enlace-alternativo">
          ¿Aún no tenés una cuenta?{" "}
          <button type="button" className="enlace-boton" onClick={onIrARegistro}>
            Registrarse
          </button>
        </p>
      </form>

      <CruceProducto />
    </PantallaMarca>
  );
}
