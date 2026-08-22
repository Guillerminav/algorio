import React, { useState } from "react";

import { pedirJSON } from "../api.js";
import PantallaMarca from "./PantallaMarca.jsx";

/**
 * "Olvidé mi contraseña": pedir el mail con el link.
 *
 * Pide el mail y no el usuario porque quien se olvidó la contraseña muchas
 * veces también se olvidó con qué nombre se registró — y el mail es lo único
 * a lo que se puede mandar algo.
 *
 * El cartel de "listo" es el MISMO exista o no esa cuenta, y eso no es
 * descuido: el backend contesta igual en los dos casos a propósito (ver
 * backend/recuperacion.py). Un formulario que dice "no encontramos esa
 * dirección" es un verificador de casillas gratis para cualquiera que tenga
 * una lista filtrada de otro lado.
 */
export default function RecuperarPassword({ onVolver }) {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const r = await pedirJSON("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setEnviado(r.mensaje);
    } catch (e) {
      setError(e.message || "No pudimos mandar el mail. Probá de nuevo en un rato.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <PantallaMarca>
        <div className="tarjeta-vidrio">
          <h1>Revisá tu correo</h1>
          <p className="tarjeta-vidrio-bajada">{enviado}</p>
          <p className="tarjeta-vidrio-bajada">
            El link vale por una hora y se puede usar una sola vez.
          </p>
          {/* Se le dice a todo el mundo por igual: eso es lo que permite dar
              la pista sin delatar qué direcciones tienen cuenta y cuáles no. */}
          <p className="tarjeta-vidrio-bajada">
            Si entrás con «Continuar con Google», el mail te deja ponerle además una
            contraseña propia. El botón de Google te va a seguir funcionando igual.
          </p>
          <button type="button" className="boton-vidrio-primario" onClick={onVolver}>
            Volver a ingresar
          </button>
        </div>
      </PantallaMarca>
    );
  }

  return (
    <PantallaMarca>
      <form className="tarjeta-vidrio" onSubmit={manejarSubmit}>
        <h1>Recuperar tu contraseña</h1>
        <p className="tarjeta-vidrio-bajada">
          Escribí el mail con el que te registraste y te mandamos un link para elegir una
          nueva.
        </p>

        <label>
          Correo electrónico
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <div className="mensaje-error">{error}</div>

        <button type="submit" className="boton-vidrio-primario" disabled={enviando}>
          {enviando ? "Mandando…" : "Mandarme el link"}
        </button>

        <p className="enlace-alternativo">
          <button type="button" className="enlace-boton" onClick={onVolver}>
            Volver a ingresar
          </button>
        </p>
      </form>
    </PantallaMarca>
  );
}
