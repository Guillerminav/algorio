import React, { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import BotonGoogle from "./BotonGoogle.jsx";
import HeroAutenticacion from "./HeroAutenticacion.jsx";

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
    <div className="pantalla-login">
      <HeroAutenticacion />

      <div className="login-form-panel">
        <form className="tarjeta-login" onSubmit={manejarSubmit}>
          <h1>Iniciar sesión</h1>
          <p>Ingresá con tu usuario y contraseña.</p>
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
          <button type="submit" disabled={enviando}>
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
      </div>
    </div>
  );
}
