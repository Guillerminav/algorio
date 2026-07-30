import React from "react";

import { useAuth } from "../context/AuthContext.jsx";

const ETIQUETA_ESTADO = {
  activa: { texto: "Suscripción activa", clase: "activa" },
  prueba: { texto: "Prueba gratis", clase: "prueba" },
};

const INCLUYE = [
  {
    titulo: "Tres fuentes oficiales, un solo panel",
    detalle: "INA, Prefectura Naval y Yacyretá unificados: mismos nombres de estación y río, mismas unidades, sin abrir tres sitios distintos.",
  },
  {
    titulo: "Histórico completo, no solo hoy",
    detalle: "Todos los boletines acumulados, con filtros por estación, río, tendencia y rango de fechas. Exportable a CSV cuando lo necesites.",
  },
  {
    titulo: "Mapa interactivo de estaciones",
    detalle: "Cada estación sobre el mapa, con su color según el estado de alerta y el detalle a un click.",
  },
  {
    titulo: "Alertas por umbral oficial",
    detalle: "Las estaciones que llegaron al umbral de alerta o evacuación definido por Prefectura, en una sola pantalla.",
  },
  {
    titulo: "Mi flota, con tus propios umbrales",
    detalle: "Cargá tus embarcaciones, dragas, muelles o tramos con su estación de referencia y tus umbrales mínimo y máximo: te avisamos por bajante y por crecida.",
  },
  {
    titulo: "Actualización diaria automática",
    detalle: "El sistema busca los boletines nuevos todos los días. Vos entrás y ya está.",
  },
  {
    titulo: "Soporte directo",
    detalle: "Escribinos desde la app cuando algo no cierra y te respondemos.",
  },
];

function formatearFecha(iso) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${fecha.getFullYear()}`;
}

export default function PantallaSuscripcion({ onAbrirAyuda }) {
  const { suscripcion } = useAuth();

  const vencida = suscripcion?.tiene_acceso === false;
  const etiqueta = vencida
    ? { texto: "Suscripción vencida", clase: "vencida" }
    : ETIQUETA_ESTADO[suscripcion?.estado] ?? { texto: "Sin datos", clase: "" };
  const vencimiento = formatearFecha(suscripcion?.vigente_hasta);
  const dias = suscripcion?.dias_restantes;

  return (
    <div className="suscripcion">
      <section className="suscripcion-estado">
        <span className={`suscripcion-chip ${etiqueta.clase}`}>{etiqueta.texto}</span>
        {vencimiento && (
          <div className="suscripcion-vencimiento">
            <span className="suscripcion-vencimiento-label">
              {vencida ? "Venció el" : "Válida hasta el"}
            </span>
            <strong>{vencimiento}</strong>
          </div>
        )}
        {!vencida && typeof dias === "number" && (
          <p className="suscripcion-restante">
            {dias === 0
              ? "Último día."
              : `Te ${dias === 1 ? "queda" : "quedan"} ${dias} ${dias === 1 ? "día" : "días"}.`}
          </p>
        )}
      </section>

      <section className="suscripcion-incluye">
        <h3>Qué incluye</h3>
        <ul>
          {INCLUYE.map((item) => (
            <li key={item.titulo}>
              <span className="suscripcion-check" aria-hidden="true">✓</span>
              <div>
                <strong>{item.titulo}</strong>
                <p>{item.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="suscripcion-cta">
        <p>
          Estamos terminando de habilitar los medios de pago. Mientras tanto,
          escribinos y coordinamos para que no pierdas el acceso.
        </p>
        <button type="button" className="boton-primario" onClick={onAbrirAyuda}>
          Escribinos
        </button>
      </section>
    </div>
  );
}
