import React, { useState } from "react";

import { pedirJSON } from "../api.js";
import { Estrellas } from "./piezas.jsx";

/**
 * Escribir o editar la reseña propia de un lugar.
 *
 * Es un solo formulario para las dos cosas porque el backend hace upsert
 * (UNIQUE (poi_id, usuario) en db.py): volver a puntuar edita en vez de
 * acumular, así que desde acá no hay diferencia entre crear y editar.
 */
export default function ModalResena({ poiId, resenaPropia, onCerrar, onGuardada }) {
  const [puntaje, setPuntaje] = useState(resenaPropia?.puntaje ?? 0);
  const [comentario, setComentario] = useState(resenaPropia?.comentario ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento) {
    evento.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await pedirJSON(`/api/pois/${poiId}/resenas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puntaje, comentario: comentario.trim() || null }),
      });
      await onGuardada();
      onCerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    setError("");
    setGuardando(true);
    try {
      await pedirJSON(`/api/pois/${poiId}/resenas`, { method: "DELETE" });
      await onGuardada();
      onCerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <form className="modal modal-resena" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h3>¿Cómo estuvo?</h3>

        <div className="modal-resena-estrellas">
          <Estrellas puntaje={puntaje} tamano={38} onElegir={setPuntaje} />
        </div>

        <label>
          Comentario
          <textarea
            rows={4}
            maxLength={500}
            placeholder="Contá cómo te fue (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </label>

        <div className="mensaje-error">{error}</div>

        <div className="fila-acciones">
          <button type="button" className="boton-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          {resenaPropia && (
            <button type="button" className="boton-secundario" onClick={borrar} disabled={guardando}>
              Borrar
            </button>
          )}
          <button type="submit" disabled={puntaje === 0 || guardando}>
            {guardando ? "Guardando…" : "Publicar"}
          </button>
        </div>
      </form>
    </div>
  );
}
