import React, { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import BotonGoogle from "./BotonGoogle.jsx";

export default function Registro({ onIrALogin }) {
  const { registrar } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetirPassword, setRepetirPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError("");

    if (password !== repetirPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setEnviando(true);
    try {
      await registrar({ usuario: usuario.trim(), email: email.trim(), password });
    } catch (e) {
      setError(e.status === 400 ? e.message : "No se pudo crear la cuenta. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pantalla-login">
      <div className="login-hero">
        <div className="login-hero-logo">
          <div className="login-hero-marca">AlgoRío</div>
        </div>
        <div className="login-hero-cuerpo">
          <div className="login-hero-titulo">Monitoreo y alertas hidrológicas en tiempo real</div>
          <p className="login-hero-texto">
            Niveles, caudal y tendencias del Paraná y el Paraguay, unificados
            desde INA, Prefectura Naval y Yacyretá en un solo panel.
          </p>
        </div>
        <div className="login-hero-footer">Estaciones de INA · Prefectura Naval · Yacyretá</div>
      </div>

      <div className="login-form-panel">
        <form className="tarjeta-login" onSubmit={manejarSubmit}>
          <h1>Crear cuenta</h1>
          <p>Registrate para empezar a monitorear.</p>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Nombre de usuario
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Repetir contraseña
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={repetirPassword}
              onChange={(e) => setRepetirPassword(e.target.value)}
            />
          </label>
          <div className="mensaje-error">{error}</div>
          <button type="submit" disabled={enviando}>
            {enviando ? "Creando cuenta…" : "Registrarse"}
          </button>

          <BotonGoogle />

          <p className="enlace-alternativo">
            ¿Ya tenés una cuenta?{" "}
            <button type="button" className="enlace-boton" onClick={onIrALogin}>
              Iniciar sesión
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
