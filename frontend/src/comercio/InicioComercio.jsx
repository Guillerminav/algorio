import React, { useCallback, useEffect, useState } from "react";

import { formatearFecha, pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import AltaComercio from "./AltaComercio.jsx";
import ReclamarComercio from "./ReclamarComercio.jsx";

/**
 * La salida de estas pantallas.
 *
 * Sin esto no hay ninguna: ShellComercio devuelve InicioComercio ANTES de
 * dibujar la barra superior, asi que acá no existen el menú de perfil ni el
 * botón de cerrar sesión que tiene el resto del panel. Y la pantalla que
 * espera la respuesta de un reclamo no ofrece nada más, así que una cuenta que
 * pidió un lugar quedaba encerrada ahí hasta que alguien del equipo le
 * contestara — sin poder salir, ni entrar con otra cuenta.
 *
 * En la app móvil no pasa: SinComercio vive adentro del cajón, que siempre
 * tiene "Cuenta".
 */
function SalirDeAca() {
  const { usuario, logout } = useAuth();
  return (
    <p className="enlace-alternativo inicio-comercio-salir">
      Entraste como <strong>{usuario?.nombre_completo || usuario?.usuario}</strong>.{" "}
      <button type="button" className="enlace-boton" onClick={logout}>
        Cerrar sesión
      </button>
    </p>
  );
}

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
export default function InicioComercio({ onCreado, yaTiene = 0 }) {
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

  const esperando = reclamo?.estado === "pendiente";

  // --- Elegir camino ---------------------------------------------------------
  if (camino === null) {
    return (
      <div className="alta-comercio">
        <div className="alta-comercio-tarjeta">
          <h1>{yaTiene > 0 ? "Cargar otro comercio" : "Empecemos por tu comercio"}</h1>
          <p className="descripcion">
            Podés cargarlo de cero o, si tu lugar ya aparece en el mapa, pedir que te lo
            asignemos para editarlo vos.
          </p>

          {/* El pedido en curso se avisa acá arriba y ya no ocupa la pantalla
              entera. Antes la tapaba: mientras hubiera un reclamo esperando no
              se podía cargar nada, porque con un comercio por cuenta ofrecer
              el alta era invitar a duplicar justo lo que se pidió unificar.
              Con varios por cuenta eso dejó de ser cierto — se puede tener el
              parador cargado y estar esperando que aprueben la cabaña. */}
          {esperando && (
            <div className="aviso-revision">
              <strong>Tenés un pedido en revisión.</strong> Pediste ser el dueño de{" "}
              <strong>{reclamo.nombre_poi}</strong> el {formatearFecha(reclamo.creado_en)}.
              Mientras tanto el lugar sigue publicado tal como está: nadie pierde nada
              esperando.{" "}
              <button
                type="button"
                className="enlace-boton"
                onClick={cancelar}
                disabled={cancelando}
              >
                {cancelando ? "Cancelando…" : "Cancelar el pedido"}
              </button>
            </div>
          )}

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
            {/* Un reclamo por vez: el backend rechaza el segundo mientras
                haya uno esperando, asi que se apaga en vez de dejar tocarlo
                para que conteste que no. */}
            <button
              type="button"
              className="opcion-camino"
              disabled={esperando}
              title={esperando ? "Ya tenés un pedido esperando respuesta" : undefined}
              onClick={() => setCamino("reclamar")}
            >
              <strong>Ya está en el mapa y es mío</strong>
              <span>
                {esperando
                  ? "Ya tenés un pedido esperando respuesta. Cuando se resuelva vas a poder pedir otro."
                  : "Lo buscás en la lista y pedís que te lo asignemos. Conservás las reseñas y las visitas que ya tiene."}
              </span>
            </button>
          </div>

          <SalirDeAca />
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
