import React, { useState } from "react";

import { pedirJSON } from "../api.js";

export default function ModalAyuda({ onCerrar }) {
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const respuesta = await pedirJSON("/api/ayuda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje }),
      });
      setOk(respuesta ?? { enviado_por_mail: true });
      setMensaje("");
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo">
      <form className="modal-tarjeta" onSubmit={manejarSubmit}>
        <h2>Ayuda</h2>
        {ok ? (
          <>
            <div className="mensaje-ok">
              {ok.enviado_por_mail
                ? "Tu mensaje se envió. Gracias por escribirnos."
                : "Tu mensaje quedó registrado. Gracias por escribirnos."}
            </div>
            <div className="modal-botones">
              <button type="button" onClick={onCerrar}>Cerrar</button>
            </div>
          </>
        ) : (
          <>
            <p className="descripcion" style={{ margin: "-0.4rem 0 0" }}>
              Contanos que problema tenés o que te gustaría que agreguemos.
            </p>
            <label>
              Mensaje
              <textarea
                rows={5}
                required
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Escribí tu mensaje..."
              />
            </label>
            <div className="mensaje-error">{error}</div>
            <div className="modal-botones">
              <button type="button" onClick={onCerrar}>Cancelar</button>
              <button type="submit" disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
