import React from "react";

import { formatearFecha } from "../api.js";
import { useFetchLista } from "../hooks/useFetchLista.js";

export function Estrellas({ puntaje, size = 16 }) {
  return (
    <span className="estrellas" style={{ fontSize: size }} aria-label={`${puntaje} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= puntaje ? "estrella llena" : "estrella"} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

export default function ResenasComercio({ comercio }) {
  const { datos: resenas, error, cargando } = useFetchLista("/api/mi-comercio/resenas");

  const promedio = comercio.puntaje_promedio;

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        Lo que dicen los nautas que te visitaron. No se pueden borrar ni editar desde
        acá: si algo te parece injusto, escribinos por Ayuda.
      </p>

      {error && <div className="mensaje-error">Error cargando las reseñas: {error.message}</div>}
      {cargando && <div className="estado">Cargando…</div>}

      {!cargando && !error && (
        <>
          <div className="resumen-resenas">
            {promedio === null || promedio === undefined ? (
              <span className="estado">Todavía nadie te puntuó.</span>
            ) : (
              <>
                <span className="resumen-resenas-numero">{promedio.toFixed(1)}</span>
                <Estrellas puntaje={Math.round(promedio)} size={20} />
                <span className="resumen-resenas-cantidad">
                  {resenas.length} {resenas.length === 1 ? "reseña" : "reseñas"}
                </span>
              </>
            )}
          </div>

          <ul className="lista-resenas">
            {resenas.map((resena) => (
              <li key={resena.id}>
                <div className="resena-encabezado">
                  <strong>{resena.autor}</strong>
                  <Estrellas puntaje={resena.puntaje} />
                  <span className="resena-fecha">{formatearFecha(resena.creado_en)}</span>
                </div>
                {resena.comentario && <p className="resena-comentario">{resena.comentario}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
