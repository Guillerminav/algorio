import React, { useState } from "react";

import { pedirJSON } from "../api.js";
import { DURACIONES, SEVERIDADES, TIPOS_REPORTE, tipoReporte } from "./constantes.js";

/**
 * Formulario para reportar algo en un punto del río.
 *
 * El punto ya viene elegido: se toca el mapa antes de abrir esto (ver
 * MapaNauta), porque pedir coordenadas dentro de un modal obligaría a meter un
 * segundo mapa adentro del primero.
 *
 * La duración es obligatoria y sin opción "para siempre" a propósito. Un
 * tronco se va con la correntada y un banco se mueve con la creciente: un
 * aviso permanente termina llenando el mapa de peligros que ya no están, y eso
 * es peor que no tener nada porque el nauta deja de creerle.
 */
export default function ModalReporte({ punto, onCerrar, onCreado }) {
  const [tipo, setTipo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [severidad, setSeveridad] = useState("comentario");
  const [comentario, setComentario] = useState("");
  const [duracionHoras, setDuracionHoras] = useState(24);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const definicion = tipo ? tipoReporte(tipo) : null;

  async function enviar(evento) {
    evento.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await pedirJSON("/api/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          detalle: detalle.trim() || null,
          severidad,
          comentario: comentario.trim() || null,
          duracion_horas: duracionHoras,
          lat: punto.lat,
          lon: punto.lon,
        }),
      });
      await onCreado();
      onCerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <form className="modal modal-reporte" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <h3>¿Qué viste?</h3>
        <p className="descripcion modal-reporte-punto">
          En {punto.lat.toFixed(4)}, {punto.lon.toFixed(4)}
        </p>

        <div className="grilla-tipos-reporte">
          {Object.entries(TIPOS_REPORTE).map(([clave, def]) => (
            <button
              key={clave}
              type="button"
              className={`tarjeta-tipo-reporte${clave === tipo ? " elegida" : ""}`}
              aria-pressed={clave === tipo}
              onClick={() => setTipo(clave)}
            >
              <span className="tarjeta-tipo-reporte-emoji" aria-hidden="true">{def.emoji}</span>
              <span>{def.etiqueta}</span>
            </button>
          ))}
        </div>

        {definicion?.pideDetalle && (
          <label>
            {tipo === "animal" ? "¿Qué animal?" : "¿Qué es?"}
            <input
              type="text"
              maxLength={60}
              placeholder={definicion.ejemploDetalle}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />
          </label>
        )}

        <fieldset className="grupo-reporte">
          <legend>¿Cuánto importa?</legend>
          <div className="opciones-severidad">
            {SEVERIDADES.map((opcion) => (
              <button
                key={opcion.clave}
                type="button"
                className={`opcion-severidad${opcion.clave === severidad ? " elegida" : ""}`}
                style={opcion.clave === severidad ? { borderColor: opcion.color } : undefined}
                aria-pressed={opcion.clave === severidad}
                onClick={() => setSeveridad(opcion.clave)}
              >
                <span className="punto-severidad" style={{ background: opcion.color }} />
                <strong>{opcion.etiqueta}</strong>
                <span>{opcion.ayuda}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grupo-reporte">
          <legend>¿Hasta cuándo lo mostramos?</legend>
          <div className="opciones-duracion">
            {DURACIONES.map((opcion) => (
              <button
                key={opcion.horas}
                type="button"
                className={`chip-duracion${opcion.horas === duracionHoras ? " activo" : ""}`}
                aria-pressed={opcion.horas === duracionHoras}
                onClick={() => setDuracionHoras(opcion.horas)}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
          <p className="descripcion nota-duracion">
            Después se borra solo. Si sigue estando, lo renovás desde tu perfil.
          </p>
        </fieldset>

        <label>
          Comentario
          <textarea
            rows={3}
            maxLength={500}
            placeholder="Contá lo que viste (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </label>

        <div className="mensaje-error">{error}</div>

        <div className="fila-acciones">
          <button type="button" className="boton-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" disabled={!tipo || enviando}>
            {enviando ? "Publicando…" : "Publicar aviso"}
          </button>
        </div>
      </form>
    </div>
  );
}
