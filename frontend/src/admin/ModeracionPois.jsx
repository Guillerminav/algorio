import React, { useEffect, useState } from "react";

import { formatearFecha, pedirJSON } from "../api.js";
import { ETIQUETAS_ESTADO, tipoDe } from "../comercio/tiposComercio.js";
import { useAuth } from "../context/AuthContext.jsx";

const FILTROS = [
  { estado: "pendiente", etiqueta: "En revisión" },
  { estado: "aprobado", etiqueta: "Publicados" },
  { estado: "rechazado", etiqueta: "Rechazados" },
];

// Link a un mapa externo en vez de embeber otro Leaflet por fila: moderar es
// mirar rapido una lista, y montar un mapa por cada ficha pendiente seria
// pesado y no ayudaria a decidir mas rapido.
const enlaceMapa = (lat, lon) => `https://www.google.com/maps?q=${lat},${lon}`;

/**
 * Cola de moderacion de POIs. Solo la ve una cuenta con es_admin (el backend
 * lo exige igual en /api/admin/*; esconderla no es protegerla).
 *
 * Vive dentro del panel del comerciante y no en una app aparte porque son un
 * par de cuentas las que moderan: no justifica un tercer shell.
 */
export default function ModeracionPois() {
  const { usuario } = useAuth();
  const [estado, setEstado] = useState("pendiente");
  const [lugares, setLugares] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Id del POI que se esta moderando, para deshabilitar solo esa fila.
  const [enCurso, setEnCurso] = useState(null);

  async function cargar(estadoPedido) {
    setCargando(true);
    setError("");
    try {
      setLugares(await pedirJSON(`/api/admin/pois?estado=${estadoPedido}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar(estado);
  }, [estado]);

  /**
   * Cambia de mano un lugar: lo libera o se lo asigna a una cuenta.
   *
   * Es lo que faltaba para pasarle un comercio a su dueño real. La cola de
   * reclamos solo sabe entregar lugares SIN dueño, así que uno cargado desde
   * la cuenta con la que se llena el mapa antes de salir a vender no había
   * forma de traspasarlo: no aparecía entre los reclamables y nadie podía
   * pedirlo.
   *
   * Liberar es el camino que deja rastro —el titular lo reclama y alguien
   * aprueba— y asignar es el atajo para cuando lo tenés sentado al lado.
   */
  async function cambiarTitular(poi, liberar) {
    let cuenta = null;
    if (liberar) {
      const ok = window.confirm(
        `¿Dejar "${poi.nombre}" sin dueño?\n\n` +
          `${poi.email_dueno || poi.usuario} pierde el acceso a esa ficha, y el lugar ` +
          "pasa a la lista de los que se pueden reclamar. La ficha, las reseñas y las " +
          "métricas quedan como están.",
      );
      if (!ok) return;
    } else {
      cuenta = window.prompt(
        `¿A qué cuenta le asignamos "${poi.nombre}"?\n\n` +
          "Escribí el usuario. Tiene que ser una cuenta de comercio y no tener otro " +
          "comercio asignado.",
      );
      if (cuenta === null) return;
      cuenta = cuenta.trim();
      if (!cuenta) return;
    }

    setEnCurso(poi.id);
    setError("");
    try {
      await pedirJSON(`/api/admin/pois/${poi.id}/titular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: cuenta }),
      });
      // Se recarga en vez de parchear la fila: asignar puede cerrar reclamos
      // de ese lugar, y el dueño que se muestra sale de un JOIN que esta
      // pantalla no rehace sola.
      await cargar(estado);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnCurso(null);
    }
  }

  async function moderar(poi, aprobado) {
    const motivo = aprobado
      ? null
      : window.prompt("¿Por qué se rechaza? El comerciante va a ver este texto.");
    // Cancelar el prompt (null) aborta; un motivo vacio se acepta, porque a
    // veces no hay nada que explicar.
    if (!aprobado && motivo === null) return;

    setEnCurso(poi.id);
    setError("");
    try {
      await pedirJSON(`/api/admin/pois/${poi.id}/${aprobado ? "aprobar" : "rechazar"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aprobado ? {} : { motivo }),
      });
      // Se saca de la lista en vez de recargar: la fila ya no pertenece a este
      // filtro y recargar haria parpadear toda la tabla.
      setLugares((previos) => previos.filter((l) => l.id !== poi.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <div className="panel-comercio">
      {/* Queda dicho en pantalla quién está aprobando: el permiso se otorga a
          mano por consola (scripts/aprobador.py) y sin esto no hay forma de
          confirmar desde la app que la cuenta con la que entraste es la que lo
          tiene. */}
      <div className="aviso-aprobador">
        <span className="chip-aprobador">Aprobador</span>
        <span>
          Entraste como <strong>{usuario?.nombre_completo || usuario?.usuario}</strong>. Lo que
          apruebes acá se publica en el mapa de todos los nautas.
        </span>
      </div>

      <p className="descripcion">
        Fichas cargadas por comerciantes. Hasta que no se aprueben no aparecen en el
        mapa de la app.
      </p>

      <div className="selector-rango">
        {FILTROS.map((filtro) => (
          <button
            key={filtro.estado}
            type="button"
            className={`chip-rango${filtro.estado === estado ? " activo" : ""}`}
            onClick={() => setEstado(filtro.estado)}
          >
            {filtro.etiqueta}
          </button>
        ))}
      </div>

      {error && <div className="mensaje-error">{error}</div>}
      {cargando && <div className="estado">Cargando…</div>}

      {!cargando && !error && lugares.length === 0 && (
        <div className="estado">No hay nada acá.</div>
      )}

      <ul className="lista-moderacion">
        {lugares.map((lugar) => (
          <li key={lugar.id}>
            <div className="moderacion-datos">
              <div className="moderacion-encabezado">
                <strong>{lugar.nombre}</strong>
                <span className="chip-estado-tipo">{tipoDe(lugar.tipo).etiqueta}</span>
                <span className={`chip-publicacion estado-${lugar.estado}`}>
                  {ETIQUETAS_ESTADO[lugar.estado] ?? lugar.estado}
                </span>
              </div>
              {lugar.descripcion && <p className="moderacion-descripcion">{lugar.descripcion}</p>}
              <div className="moderacion-meta">
                <span className={lugar.usuario ? undefined : "moderacion-sin-dueno"}>
                  {lugar.email_dueno ?? lugar.usuario ?? "Sin dueño · se puede reclamar"}
                </span>
                <a href={enlaceMapa(lugar.lat, lugar.lon)} target="_blank" rel="noreferrer">
                  Ver ubicación
                </a>
                <span>Cargado el {formatearFecha(lugar.creado_en)}</span>
              </div>
              {lugar.motivo_rechazo && (
                <p className="moderacion-descripcion">Motivo del rechazo: {lugar.motivo_rechazo}</p>
              )}
            </div>

            <div className="moderacion-acciones">
              {lugar.estado !== "aprobado" && (
                <button type="button" disabled={enCurso === lugar.id} onClick={() => moderar(lugar, true)}>
                  Aprobar
                </button>
              )}
              {lugar.estado !== "rechazado" && (
                <button
                  type="button"
                  className="boton-secundario"
                  disabled={enCurso === lugar.id}
                  onClick={() => moderar(lugar, false)}
                >
                  Rechazar
                </button>
              )}

              {/* Titularidad. Solo sobre lo publicado: soltar o entregar una
                  ficha que todavía nadie aprobó es decidir dos cosas a la vez,
                  y la que importa primero es si eso puede salir al mapa. */}
              {lugar.estado === "aprobado" &&
                (lugar.usuario ? (
                  <button
                    type="button"
                    className="boton-secundario"
                    title="Deja el lugar sin dueño para que su titular lo reclame"
                    disabled={enCurso === lugar.id}
                    onClick={() => cambiarTitular(lugar, true)}
                  >
                    Liberar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="boton-secundario"
                    title="Se lo entrega directo a una cuenta de comercio"
                    disabled={enCurso === lugar.id}
                    onClick={() => cambiarTitular(lugar, false)}
                  >
                    Asignar a una cuenta
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
