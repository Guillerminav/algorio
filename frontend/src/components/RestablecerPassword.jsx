import React, { useState } from "react";

import { pedirJSON } from "../api.js";
import PantallaMarca from "./PantallaMarca.jsx";

const LARGO_MINIMO = 8;

/**
 * Elegir la contraseña nueva, con el token que vino en el mail.
 *
 * Se llega acá por el link del mail, que trae `?restablecer=<token>` (lo lee
 * App.jsx). No hay router en esta app: el token sale de la query string y se
 * borra de la barra de direcciones apenas se usa —ver `limpiarUrl`—, porque
 * una URL con el token adentro se comparte, se guarda en favoritos y queda en
 * el historial del navegador de una compu prestada.
 *
 * Al terminar NO queda la sesión iniciada: el paso siguiente es entrar con la
 * contraseña nueva, que además es la única forma de que quede probada.
 */
export default function RestablecerPassword({ token, onListo }) {
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  const corta = password.length > 0 && password.length < LARGO_MINIMO;
  const noCoinciden = repetida.length > 0 && password !== repetida;

  async function manejarSubmit(evento) {
    evento.preventDefault();
    if (password !== repetida) {
      setError("Las dos contraseñas tienen que ser iguales.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      await pedirJSON("/api/auth/restablecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setListo(true);
    } catch (e) {
      setError(e.message || "No pudimos cambiar la contraseña.");
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <PantallaMarca>
        <div className="tarjeta-vidrio">
          <h1>Listo</h1>
          <p className="tarjeta-vidrio-bajada">
            Ya podés entrar con tu contraseña nueva.
          </p>
          <button type="button" className="boton-vidrio-primario" onClick={onListo}>
            Ingresar
          </button>
        </div>
      </PantallaMarca>
    );
  }

  return (
    <PantallaMarca>
      <form className="tarjeta-vidrio" onSubmit={manejarSubmit}>
        <h1>Elegí una contraseña nueva</h1>
        <p className="tarjeta-vidrio-bajada">
          Al menos {LARGO_MINIMO} caracteres. Después vas a entrar con esta.
        </p>

        <label>
          Contraseña nueva
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={LARGO_MINIMO}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Repetila
          <input
            type="password"
            autoComplete="new-password"
            required
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
          />
        </label>

        {/* Los dos avisos salen mientras se escribe y no recién al mandar:
            enterarse de que la contraseña era corta después de tipearla dos
            veces es tipearla dos veces de nuevo. */}
        <div className="mensaje-error">
          {error ||
            (corta ? `Le faltan ${LARGO_MINIMO - password.length} caracteres.` : "") ||
            (noCoinciden ? "Las dos contraseñas tienen que ser iguales." : "")}
        </div>

        <button
          type="submit"
          className="boton-vidrio-primario"
          disabled={enviando || corta || noCoinciden || !password}
        >
          {enviando ? "Guardando…" : "Cambiar la contraseña"}
        </button>

        <p className="enlace-alternativo">
          <button type="button" className="enlace-boton" onClick={onListo}>
            Volver a ingresar
          </button>
        </p>
      </form>
    </PantallaMarca>
  );
}
