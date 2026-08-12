import React from "react";

import { formatearFecha } from "../api.js";

const ETIQUETA_SECCION = { flota: "Mi flota", rutas: "Rutas" };

function detalleDelPlan(plan) {
  const extras = plan.secciones.filter((s) => ETIQUETA_SECCION[s]).map((s) => ETIQUETA_SECCION[s]);
  if (extras.length === 0) {
    return ["Dashboard, Histórico, Alertas y Mapa", "Sin Mi flota ni Rutas"];
  }
  const sinTopes = plan.max_activos === null && plan.max_rutas === null;
  return [
    `Todas las pantallas, incluidas ${extras.join(" y ")}`,
    ...(sinTopes
      ? ["Sin límite de embarcaciones ni de rutas"]
      : [
          `Hasta ${plan.max_activos} embarcaciones`,
          `Hasta ${plan.max_rutas} ${plan.max_rutas === 1 ? "ruta" : "rutas"}`,
        ]),
  ];
}

// Desde cuándo corre el monto nuevo. El período actual (la prueba gratis o el
// mes ya cubierto) no se toca: lo que sigue vigente hasta su fecha de
// vencimiento es lo que el usuario ya tiene, y el precio del plan nuevo
// empieza a contar recién ahí. Con la suscripción vencida no hay fecha futura
// de la cual hablar, así que se dice cuándo va a empezar en su lugar.
function textoDeCobro(plan, suscripcion) {
  if (plan.precio_usd === null) {
    return `El precio de ${plan.etiqueta} se acuerda con vos: te escribimos para cerrarlo antes de cobrarte nada.`;
  }

  const monto = `USD ${plan.precio_usd} por mes`;
  const desde = suscripcion?.tiene_acceso ? formatearFecha(suscripcion?.vigente_hasta) : null;

  if (!desde) {
    return `Se te va a cobrar ${monto} cuando actives la suscripción. Hasta entonces no se cobra nada.`;
  }
  return `A partir del ${desde} se te va a cobrar ${monto}. Hasta esa fecha seguís con lo que ya tenías, sin cargo.`;
}

export default function ModalCambioPlan({ plan, suscripcion, avisos, guardando, onConfirmar, onCancelar }) {
  return (
    <div className="modal-fondo">
      {/* Es un <form> y no un <div> para seguir el patron de los otros modales
          (ver ModalAyuda): asi el boton de confirmar hereda el estilo primario
          de ".modal-botones button[type=submit]" y Enter confirma. */}
      <form
        className="modal-tarjeta modal-plan"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar cambio de plan"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirmar();
        }}
      >
        <h2>Confirmar cambio de plan</h2>

        <div className="modal-plan-resumen">
          <div className="modal-plan-encabezado">
            <strong className="modal-plan-nombre">{plan.etiqueta}</strong>
            <span className="modal-plan-precio">
              {plan.precio_usd === null ? (
                <strong>Consultar</strong>
              ) : (
                <>
                  {plan.precio_lista_usd !== null && (
                    <s className="modal-plan-lista">USD {plan.precio_lista_usd}</s>
                  )}
                  <strong>USD {plan.precio_usd}</strong>
                  <span className="modal-plan-periodo">por mes</span>
                </>
              )}
            </span>
          </div>

          <p className="modal-plan-descripcion">{plan.resumen}</p>

          <ul className="modal-plan-detalle">
            {detalleDelPlan(plan).map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </div>

        <p className="modal-plan-cobro">{textoDeCobro(plan, suscripcion)}</p>

        {avisos.map((a) => (
          <p key={a} className="suscripcion-aviso-baja">{a}</p>
        ))}

        {/* Mientras no exista la pasarela, prometer una fecha de debito sin
            esta aclaracion seria mentir: no hay forma de cobrar todavia. */}
        <p className="modal-plan-nota">
          Todavía no tenemos los medios de pago habilitados, así que no se te va a
          debitar nada de forma automática: cuando llegue la fecha te escribimos
          para coordinar.
        </p>

        <div className="modal-botones">
          <button type="button" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando}>
            {guardando ? "Cambiando…" : `Confirmar ${plan.etiqueta}`}
          </button>
        </div>
      </form>
    </div>
  );
}
