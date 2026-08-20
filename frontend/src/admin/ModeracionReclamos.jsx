import React, { useEffect, useState } from "react";

import { formatearFecha, pedirJSON } from "../api.js";
import { tipoDe } from "../comercio/tiposComercio.js";

const FILTROS = [
  { estado: "pendiente", etiqueta: "Esperando" },
  { estado: "aprobado", etiqueta: "Aprobados" },
  { estado: "rechazado", etiqueta: "Rechazados" },
];

const enlaceMapa = (lat, lon) => `https://www.google.com/maps?q=${lat},${lon}`;

/**
 * Cola de reclamos de propiedad: "ese lugar del mapa es mío".
 *
 * Separada de la de fichas a propósito, aunque las dos las mire la misma
 * persona: son dos preguntas distintas. En moderación se decide *¿esto puede
 * publicarse?*; acá, *¿esta persona es quien dice ser?* — y aprobar de más no
 * ensucia el mapa, le entrega el comercio de alguien a un tercero.
 *
 * Por eso cada fila trae, sin abrir nada, lo único con lo que se puede
 * decidir: quién pide, con qué mail, qué lugar, qué teléfono figura en la
 * ficha y qué escribió para justificarlo.
 */
export default function ModeracionReclamos() {
  const [estado, setEstado] = useState("pendiente");
  const [reclamos, setReclamos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [enCurso, setEnCurso] = useState(null);

  async function cargar(estadoPedido) {
    setCargando(true);
    setError("");
    try {
      setReclamos(await pedirJSON(`/api/admin/reclamos?estado=${estadoPedido}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar(estado);
  }, [estado]);

  async function resolver(reclamo, aprobado) {
    if (aprobado) {
      // Confirmación explícita: esto le entrega a una cuenta la edición de un
      // pin que ve todo el mundo, y no hay "deshacer" en la pantalla.
      const ok = window.confirm(
        `¿Asignar "${reclamo.nombre_poi}" a ${reclamo.nombre_usuario || reclamo.usuario}?\n\n` +
          "Va a poder editar el nombre, la ubicación y el contacto de esa ficha.",
      );
      if (!ok) return;
    }

    const motivo = aprobado
      ? null
      : window.prompt("¿Por qué se rechaza? El comerciante va a ver este texto.");
    if (!aprobado && motivo === null) return;

    setEnCurso(reclamo.id);
    setError("");
    try {
      await pedirJSON(`/api/admin/reclamos/${reclamo.id}/${aprobado ? "aprobar" : "rechazar"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aprobado ? {} : { motivo }),
      });
      // Aprobar uno puede cerrar otros del mismo lugar (ver
      // reclamos.resolver), así que se recarga la lista en vez de sacar solo
      // la fila: si no, quedarían en pantalla pedidos que ya no existen.
      await cargar(estado);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        Pedidos de comerciantes que dicen ser dueños de un lugar ya publicado. Aprobar le
        entrega la edición de esa ficha a esa cuenta.
      </p>

      {/* Mismas clases que la cola de fichas: es la misma pieza en la pantalla
          de al lado y no hay razon para que se vea distinta. */}
      <div className="selector-rango">
        {FILTROS.map((f) => (
          <button
            key={f.estado}
            type="button"
            className={`chip-rango${f.estado === estado ? " activo" : ""}`}
            onClick={() => setEstado(f.estado)}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {error && <div className="mensaje-error">{error}</div>}

      {cargando ? (
        <p className="estado">Cargando…</p>
      ) : reclamos.length === 0 ? (
        <p className="estado">No hay reclamos {estado === "pendiente" ? "esperando" : "acá"}.</p>
      ) : (
        <ul className="lista-reclamos">
          {reclamos.map((r) => (
            <li key={r.id} className="reclamo">
              <div className="reclamo-cabecera">
                <div>
                  <strong>{r.nombre_poi}</strong>
                  <span className="reclamo-rubro">{tipoDe(r.tipo_poi).etiqueta}</span>
                </div>
                <a href={enlaceMapa(r.lat, r.lon)} target="_blank" rel="noreferrer">
                  Ver en el mapa
                </a>
              </div>

              <dl className="reclamo-datos">
                <div>
                  <dt>Lo pide</dt>
                  <dd>
                    {r.nombre_usuario || r.usuario}
                    <span className="reclamo-usuario">@{r.usuario}</span>
                  </dd>
                </div>
                <div>
                  <dt>Mail de la cuenta</dt>
                  <dd>{r.email_usuario || "—"}</dd>
                </div>
                <div>
                  {/* El teléfono de la ficha es la verificación más barata que
                      hay: se llama y se pregunta. */}
                  <dt>Teléfono en la ficha</dt>
                  <dd>{r.whatsapp_poi || r.telefono_poi || "—"}</dd>
                </div>
                <div>
                  <dt>Pedido el</dt>
                  <dd>{formatearFecha(r.creado_en)}</dd>
                </div>
              </dl>

              {r.mensaje && <p className="reclamo-mensaje">“{r.mensaje}”</p>}

              {r.estado === "rechazado" && r.motivo_rechazo && (
                <p className="reclamo-motivo">Rechazado: {r.motivo_rechazo}</p>
              )}

              {r.estado === "pendiente" && (
                <div className="fila-acciones">
                  <button
                    type="button"
                    className="boton-secundario"
                    disabled={enCurso === r.id}
                    onClick={() => resolver(r, false)}
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={enCurso === r.id}
                    onClick={() => resolver(r, true)}
                  >
                    {enCurso === r.id ? "Asignando…" : "Asignar el comercio"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
