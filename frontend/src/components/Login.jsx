import React, { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import BotonGoogle from "./BotonGoogle.jsx";

// Decoracion abstracta del panel de login (no hay foto real del rio todavia:
// se usa un patron de ondas en vez de un placeholder de imagen vacio).
function OndasDecorativas() {
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">
      <path d="M-20,90 C60,60 120,120 200,90 C280,60 340,120 420,90" fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="10" />
      <path d="M-20,140 C60,110 120,170 200,140 C280,110 340,170 420,140" fill="none" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="10" />
      <path d="M-20,190 C60,160 120,220 200,190 C280,160 340,220 420,190" fill="none" stroke="#4fb3d9" strokeOpacity="0.28" strokeWidth="10" />
    </svg>
  );
}

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
          <div className="login-hero-imagen">
            <OndasDecorativas />
          </div>
        </div>

        <div className="login-hero-footer">Estaciones de INA · Prefectura Naval · Yacyretá</div>
      </div>

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
