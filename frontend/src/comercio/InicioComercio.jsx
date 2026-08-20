import React, { useCallback, useEffect, useState } from "react";

import { formatearFecha, pedirJSON } from "../api.js";
import AltaComercio from "./AltaComercio.jsx";
import ReclamarComercio from "./ReclamarComercio.jsx";

/**
 * Lo que ve una cuenta de comercio que todavía no tiene ficha.
 *
 * Hay dos maneras de tener una y no una sola: cargarla de cero, o reclamar un
 * lugar que ya está en el mapa sin dueño. La segunda existe porque muchos
 * pines los cargó el equipo o una cuenta que se dio de baja, y hacer que el
 * dueño real empiece de cero deja al nauta con dos pines del mismo parador.
 *
 * Este componente es el que decide cuál de las cuatro pantallas corresponde:
 * elegir camino, cargar, reclamar, o esperar la respuesta de un reclamo. Vive
 * aparte de ShellComercio para que el shell siga siendo solo layout.
 */
export default function InicioComercio({ onCreado }) {
  const [reclamo, setReclamo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [camino, setCamino] = useState(null);
  const [error, setError] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setReclamo(await pedirJSON("/api/mi-comercio/reclamo"));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cancelar() {
    setCancelando(true);
    setError("");
    try {
      await pedirJSON("/api/mi-comercio/reclamo", { method: "DELETE" });
      setReclamo(null);
      setCamino(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelando(false);
    }
  }

  if (cargando) return null;

  // --- Esperando respuesta ---------------------------------------------------
  // Gana sobre todo lo demás: mientras haya un pedido en curso, ofrecer "cargá
  // tu comercio" sería invitar a duplicar justo lo que se pidió unificar.
  if (reclamo?.estado === "pendiente") {
    return (
      <div className="alta-comercio">
        <div className="alta-comercio-tarjeta">
          <h1>Estamos revisando tu pedido</h1>
          <p className="descripcion">
            Pediste ser el dueño de <strong>{reclamo.nombre_poi}</strong> el{" "}
            {formatearFecha(reclamo.creado_en)}. Cuando lo confirmemos vas a poder editar
            la ficha, los horarios y las fotos desde acá.
          </p>
          <p className="descripcion">
            Mientras tanto el lugar sigue publicado en el mapa tal como está: nadie pierde
            nada esperando.
          </p>

          {error && <div className="mensaje-error">{error}</div>}

          {/* Poder arrepentirse importa: sin esto, quien se equivocó de lugar
              queda bloqueado hasta que un admin conteste. */}
          <div className="fila-acciones">
            <button
              type="button"
              className="boton-secundario"
              onClick={cancelar}
              disabled={cancelando}
            >
              {cancelando ? "Cancelando…" : "Cancelar el pedido"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Elegir camino ---------------------------------------------------------
  if (camino === null) {
    return (
      <div className="alta-comercio">
        <div className="alta-comercio-tarjeta">
          <h1>Empecemos por tu comercio</h1>
          <p className="descripcion">
            Podés cargarlo de cero o, si tu lugar ya aparece en el mapa, pedir que te lo
            asignemos para editarlo vos.
          </p>

          {/* El rechazo se muestra acá y no en una pantalla aparte: es
              exactamente el momento en que la persona vuelve a decidir qué
              hacer, y necesita el motivo a la vista para decidirlo. */}
          {reclamo?.estado === "rechazado" && (
            <div className="aviso-revision">
              <strong>Tu pedido anterior no prosperó.</strong>{" "}
              {reclamo.motivo_rechazo ||
                "No pudimos confirmar que ese lugar sea tuyo."}{" "}
              Podés volver a intentarlo con otro lugar o cargar el tuyo de cero.
            </div>
          )}

          <div className="opciones-rubro">
            <button type="button" className="opcion-camino" onClick={() => setCamino("alta")}>
              <strong>Cargar mi comercio</strong>
              <span>
                Todavía no está en el mapa. Lo creás vos y lo publicamos después de
                revisarlo.
              </span>
            </button>
            <button
              type="button"
              className="opcion-camino"
              onClick={() => setCamino("reclamar")}
            >
              <strong>Ya está en el mapa y es mío</strong>
              <span>
                Lo buscás en la lista y pedís que te lo asignemos. Conservás las reseñas y
                las visitas que ya tiene.
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (camino === "reclamar") {
    return (
      <ReclamarComercio
        onReclamado={() => {
          setCamino(null);
          cargar();
        }}
        onVolver={() => setCamino("alta")}
      />
    );
  }

  return <AltaComercio onCreado={onCreado} onVolver={() => setCamino(null)} />;
}
