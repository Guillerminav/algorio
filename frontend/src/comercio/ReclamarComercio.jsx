import React, { useEffect, useMemo, useState } from "react";

import { pedirJSON } from "../api.js";
import { tipoDe } from "./tiposComercio.js";

/**
 * "Ese lugar del mapa es mío": buscar un comercio sin dueño y pedirlo.
 *
 * Existe porque muchos pines del mapa no los cargó su dueño —sembrados,
 * importados, o de una cuenta que se dio de baja— y obligarlo a cargar todo de
 * cero deja al nauta con dos pines del mismo parador y al comerciante sin las
 * reseñas que su lugar ya tenía.
 *
 * Lo aprueba un admin (ver backend/reclamos.py). Eso se dice acá arriba y no
 * en un cartel al final: quien entra por este camino tiene que saber, antes de
 * escribir nada, que no va a poder editar hoy.
 */
export default function ReclamarComercio({ onReclamado, onVolver }) {
  const [busqueda, setBusqueda] = useState("");
  const [lugares, setLugares] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [elegido, setElegido] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Se pide una vez y se filtra en memoria: son los comercios sin dueño de un
  // tramo de río, no un catálogo. Pedir al servidor en cada tecla sería un
  // request por letra para filtrar treinta filas.
  useEffect(() => {
    let cancelado = false;
    pedirJSON("/api/comercios-sin-dueno")
      .then((d) => !cancelado && setLugares(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return lugares;
    return lugares.filter(
      (l) =>
        l.nombre.toLowerCase().includes(texto) ||
        (l.descripcion ?? "").toLowerCase().includes(texto),
    );
  }, [lugares, busqueda]);

  async function enviar(evento) {
    evento.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await pedirJSON("/api/mi-comercio/reclamo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poi_id: elegido.id, mensaje: mensaje.trim() || null }),
      });
      onReclamado();
    } catch (e) {
      setError(e.message || "No pudimos enviar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="alta-comercio">
      <div className="alta-comercio-tarjeta">
        <h1>Reclamar un comercio del mapa</h1>
        <p className="descripcion">
          Buscá tu lugar entre los que ya están publicados y todavía no tienen dueño.
          Cuando confirmemos que es tuyo vas a poder editarlo, y te quedan las reseñas y
          las métricas que ya tenía.
        </p>

        {cargando ? (
          <p className="estado">Buscando comercios sin dueño…</p>
        ) : lugares.length === 0 ? (
          <>
            <p className="estado">
              Ahora mismo no hay comercios sin dueño en el mapa. Si el tuyo ya está
              publicado y no aparece acá, es porque otra cuenta lo tiene asignado —
              escribinos por Ayuda.
            </p>
            <div className="fila-acciones">
              <button type="button" onClick={onVolver}>Cargar mi comercio de cero</button>
            </div>
          </>
        ) : (
          <form onSubmit={enviar}>
            <label>
              Buscar
              <input
                type="search"
                placeholder="Nombre de tu parador, cabaña o lancha"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </label>

            {visibles.length === 0 ? (
              <p className="estado">Ninguno coincide con eso.</p>
            ) : (
              <ul className="lista-reclamables">
                {visibles.map((lugar) => {
                  const definicion = tipoDe(lugar.tipo);
                  const esteElegido = elegido?.id === lugar.id;
                  return (
                    <li key={lugar.id}>
                      <label className={`reclamable${esteElegido ? " elegido" : ""}`}>
                        <input
                          type="radio"
                          name="poi"
                          checked={esteElegido}
                          onChange={() => setElegido(lugar)}
                        />
                        <span className="reclamable-cuerpo">
                          <strong>{lugar.nombre}</strong>
                          <span className="reclamable-rubro">{definicion.etiqueta}</span>
                          {lugar.descripcion && (
                            <span className="reclamable-descripcion">{lugar.descripcion}</span>
                          )}
                          {/* Las coordenadas y el telefono a la vista: es como
                              alguien reconoce que ese pin es el suyo y no el
                              del vecino que se llama parecido. */}
                          <span className="reclamable-meta">
                            {lugar.lat.toFixed(4)}, {lugar.lon.toFixed(4)}
                            {lugar.whatsapp || lugar.telefono
                              ? ` · tel. ${lugar.whatsapp || lugar.telefono}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {elegido && (
              <label>
                ¿Cómo sabemos que es tuyo?
                <textarea
                  rows={3}
                  maxLength={600}
                  placeholder="El teléfono que figura es el mío, o contanos algo que solo el dueño sepa. Nos ayuda a aprobarlo más rápido."
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                />
              </label>
            )}

            {error && <div className="mensaje-error">{error}</div>}

            <div className="fila-acciones">
              <button type="button" className="boton-secundario" onClick={onVolver}>
                Mejor lo cargo de cero
              </button>
              <button type="submit" disabled={!elegido || enviando}>
                {enviando ? "Enviando…" : "Pedir este comercio"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
