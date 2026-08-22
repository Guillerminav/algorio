import React, { useEffect, useMemo, useState } from "react";

import { formatearFecha, pedirJSON } from "../api.js";
import FiltroComercios from "./FiltroComercios.jsx";

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

/**
 * Lo que dicen los nautas, de toda la cuenta o de un comercio.
 *
 * Es una pantalla de la CUENTA y no de un comercio, y por eso no cuelga del
 * desplegable de ninguno: "¿qué dicen de mí?" se pregunta una vez, no una por
 * pin. Con el filtro adentro de cada comercio, enterarse de una reseña nueva
 * obligaba a entrar a los tres a ver cuál la tenía.
 *
 * Ordenadas por fecha y no agrupadas por comercio: lo que se viene a mirar es
 * lo último que dijeron, y agrupar esconde la reseña de ayer debajo de las
 * viejas del primer local.
 */
export default function ResenasComercio({ comercios }) {
  const [filtro, setFiltro] = useState(null);
  const [resenas, setResenas] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError("");
    Promise.all(
      comercios.map((c) =>
        pedirJSON(`/api/mis-comercios/${c.id}/resenas`).then((lista) =>
          // Cada reseña se queda con de qué comercio es: viniendo de tres
          // pedidos distintos, sin esto no hay forma de saberlo al mezclarlas.
          lista.map((r) => ({ ...r, comercio_id: c.id, comercio_nombre: c.nombre })),
        ),
      ),
    )
      .then((listas) => {
        if (cancelado) return;
        setResenas(
          listas.flat().sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))),
        );
      })
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [comercios]);

  const visibles = useMemo(
    () => (filtro === null ? resenas : resenas.filter((r) => r.comercio_id === filtro)),
    [resenas, filtro],
  );

  // El promedio sale de los comercios y no de las reseñas cargadas: lo calcula
  // el backend sobre la tabla entera (`_con_promedio`), y rehacerlo acá con la
  // lista en pantalla daría otro número el día que se pagine.
  const promedio = useMemo(() => {
    const cuenta = (filtro === null ? comercios : comercios.filter((c) => c.id === filtro)).filter(
      (c) => c.cantidad_resenas > 0,
    );
    const total = cuenta.reduce((n, c) => n + c.cantidad_resenas, 0);
    if (total === 0) return null;
    // Ponderado por cantidad: un lugar con veinte reseñas no vale lo mismo que
    // uno con una sola, y promediar los promedios diría que sí.
    return cuenta.reduce((suma, c) => suma + c.puntaje_promedio * c.cantidad_resenas, 0) / total;
  }, [comercios, filtro]);

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        Lo que dicen los nautas que te visitaron. No se pueden borrar ni editar desde
        acá: si algo te parece injusto, escribinos por Ayuda.
      </p>

      <FiltroComercios comercios={comercios} elegido={filtro} onElegir={setFiltro} />

      {error && <div className="mensaje-error">Error cargando las reseñas: {error}</div>}
      {cargando && <div className="estado">Cargando…</div>}

      {!cargando && !error && (
        <>
          <div className="resumen-resenas">
            {promedio === null ? (
              <span className="estado">Todavía nadie te puntuó.</span>
            ) : (
              <>
                <span className="resumen-resenas-numero">{promedio.toFixed(1)}</span>
                <Estrellas puntaje={Math.round(promedio)} size={20} />
                <span className="resumen-resenas-cantidad">
                  {visibles.length} {visibles.length === 1 ? "reseña" : "reseñas"}
                </span>
              </>
            )}
          </div>

          <ul className="lista-resenas">
            {visibles.map((resena) => (
              <li key={`${resena.comercio_id}-${resena.id}`}>
                <div className="resena-encabezado">
                  <strong>{resena.autor}</strong>
                  <Estrellas puntaje={resena.puntaje} />
                  <span className="resena-fecha">{formatearFecha(resena.creado_en)}</span>
                </div>
                {/* De qué comercio es, solo cuando se están viendo todos: con
                    el filtro puesto en uno, repetirlo en cada renglón es una
                    columna de la misma palabra. */}
                {filtro === null && comercios.length > 1 && (
                  <p className="resena-comercio">Sobre {resena.comercio_nombre}</p>
                )}
                {resena.comentario && <p className="resena-comentario">{resena.comentario}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
