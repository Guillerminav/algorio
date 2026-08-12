import React, { useEffect, useState } from "react";

import { formatearFecha, pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import ModalCambioPlan from "./ModalCambioPlan.jsx";

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
    seccion: "historico",
    titulo: "Histórico completo, no solo hoy",
    detalle: "Todos los boletines acumulados, con filtros por estación, río, tendencia y rango de fechas. Exportable a CSV cuando lo necesites.",
  },
  {
    seccion: "mapa",
    titulo: "Mapa interactivo de estaciones",
    detalle: "Cada estación sobre el mapa, con su color según el estado de alerta y el detalle a un click.",
  },
  {
    seccion: "alertas",
    titulo: "Alertas por umbral oficial",
    detalle: "Las estaciones que llegaron al umbral de alerta o evacuación definido por Prefectura, en una sola pantalla.",
  },
  {
    seccion: "flota",
    titulo: "Mi flota, con tus propios umbrales",
    detalle: "Cargá tus embarcaciones, dragas, muelles o tramos con su estación de referencia y tus umbrales mínimo y máximo: te avisamos por bajante y por crecida.",
  },
  {
    seccion: "rutas",
    titulo: "Rutas y calado admisible",
    detalle: "Armá el trayecto y el sistema cruza el nivel en todas las estaciones del camino: calado admisible, punto crítico, carga estimada e informe en PDF.",
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

// Las secciones que solo traen algunos planes, con el nombre que ve el usuario.
const ETIQUETA_SECCION = { flota: "Mi flota", rutas: "Rutas" };

function topeEnTexto(maximo, plural) {
  return maximo === null ? `${plural} sin límite` : `hasta ${maximo} ${plural}`;
}

// Lo que ofrece cada plan, deducido de los datos que manda el backend y no de
// su nombre: agregar un plan nuevo no obliga a tocar esto.
function ventajas(plan) {
  const extras = plan.secciones.filter((s) => ETIQUETA_SECCION[s]).map((s) => ETIQUETA_SECCION[s]);
  if (extras.length === 0) {
    return ["Dashboard, Histórico, Alertas y Mapa", "Exportación a CSV y gráficos en PNG"];
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

function Precio({ plan }) {
  if (plan.precio_usd === null) {
    return <span className="tarjeta-plan-precio"><strong>Consultar</strong></span>;
  }
  return (
    <span className="tarjeta-plan-precio">
      {plan.precio_lista_usd !== null && (
        <s className="tarjeta-plan-lista">USD {plan.precio_lista_usd}</s>
      )}
      <strong>USD {plan.precio_usd}</strong>
      <span className="tarjeta-plan-periodo">por mes</span>
    </span>
  );
}

export default function PantallaSuscripcion({ onAbrirAyuda }) {
  const { suscripcion, cambiarPlan } = useAuth();
  const [planes, setPlanes] = useState([]);
  // Plan que espera confirmación en el modal. Ningún cambio se aplica sin
  // pasar por ahí: cambiar lo que se te cobra no debería poder salir de un
  // solo click.
  const [pendiente, setPendiente] = useState(null);
  const [guardando, setGuardando] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    pedirJSON("/api/planes")
      .then((datos) => vigente && setPlanes(datos.planes))
      .catch(() => vigente && setError("No se pudieron cargar los planes."));
    return () => {
      vigente = false;
    };
  }, []);

  const planActual = suscripcion?.plan;

  // Bajar de plan no borra nada (ver suscripciones.cambiar_plan), pero deja
  // topes por debajo de lo ya cargado. Conviene decirlo antes de aplicar el
  // cambio y no después, cuando el usuario descubra que no puede agregar más.
  function avisosDeBaja(plan) {
    const pares = [
      ["max_activos", suscripcion?.activos_usados, "activos"],
      ["max_rutas", suscripcion?.rutas_usadas, "rutas"],
    ];
    return pares.flatMap(([clave, cantidad, plural]) => {
      const tope = plan[clave];
      if (tope === null || typeof cantidad !== "number" || cantidad <= tope) return [];
      return [
        `Tenés ${cantidad} ${plural} y ${plan.etiqueta} permite ${tope}. No se borra ` +
          `ninguno, pero no vas a poder agregar más hasta bajar a ${tope}.`,
      ];
    });
  }

  async function aplicar(plan) {
    setError("");
    setGuardando(plan.plan);
    try {
      // Sin cartel de confirmacion: al volver, la tarjeta del plan nuevo ya
      // dice "Plan actual" y el recuadro azul se actualizo solo.
      await cambiarPlan(plan.plan);
      setPendiente(null);
    } catch (e) {
      setError(e.message || "No se pudo cambiar el plan.");
    } finally {
      setGuardando("");
    }
  }

  function elegir(plan) {
    setError("");
    setPendiente(plan);
  }

  const vencida = suscripcion?.tiene_acceso === false;
  const etiqueta = vencida
    ? { texto: "Suscripción vencida", clase: "vencida" }
    : ETIQUETA_ESTADO[suscripcion?.estado] ?? { texto: "Sin datos", clase: "" };
  const vencimiento = formatearFecha(suscripcion?.vigente_hasta);
  const dias = suscripcion?.dias_restantes;

  return (
    <div className="suscripcion">
      <section className="suscripcion-estado">
        <div className="suscripcion-estado-vigencia">
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
        </div>

        {/* El plan vive acá adentro y no en un recuadro aparte: es el otro
            dato de estado de la cuenta, y separarlo obligaba a leer dos cajas
            para saber qué tenés contratado y hasta cuándo. */}
        {suscripcion && (
          <div className="suscripcion-estado-plan">
            <span className="suscripcion-estado-plan-label">Tu plan</span>
            <strong className="suscripcion-estado-plan-nombre">{suscripcion.etiqueta}</strong>
            {suscripcion.precio_usd != null && (
              <span className="suscripcion-estado-plan-precio">
                USD {suscripcion.precio_usd} por mes
              </span>
            )}
            <span className="suscripcion-estado-plan-topes">
              {suscripcion.secciones?.includes("flota")
                ? `Con Mi flota y Rutas · ${topeEnTexto(
                    suscripcion.max_activos,
                    "activos"
                  )}, ${topeEnTexto(suscripcion.max_rutas, "rutas")}`
                : "Sin Mi flota ni Rutas"}
            </span>
          </div>
        )}
      </section>

      <section className="suscripcion-cambio">
        <h3>Cambiar de plan</h3>
        <p className="suscripcion-cambio-nota">
          Todavía no hay cobro automático: el cambio se aplica al instante y no
          reinicia ni acorta lo que te queda de prueba.
        </p>

        {error && <div className="mensaje-error">{error}</div>}

        <div className="tarjetas-plan">
          {planes.map((plan) => {
            const esActual = plan.plan === planActual;
            return (
              <article
                key={plan.plan}
                className={`tarjeta-plan${esActual ? " actual" : ""}`}
              >
                <header className="tarjeta-plan-encabezado">
                  <strong className="tarjeta-plan-nombre">{plan.etiqueta}</strong>
                  {esActual && <span className="tarjeta-plan-insignia">Tu plan</span>}
                </header>

                <Precio plan={plan} />
                {plan.nota_precio && (
                  <span className="tarjeta-plan-nota">{plan.nota_precio}</span>
                )}

                <p className="tarjeta-plan-resumen">{plan.resumen}</p>

                <ul className="tarjeta-plan-ventajas">
                  {ventajas(plan).map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={esActual ? "boton-secundario" : "boton-primario"}
                  onClick={() => elegir(plan)}
                  disabled={esActual || Boolean(guardando)}
                >
                  {guardando === plan.plan
                    ? "Cambiando…"
                    : esActual
                      ? "Plan actual"
                      : `Cambiar a ${plan.etiqueta}`}
                </button>
              </article>
            );
          })}
        </div>

      </section>

      {pendiente && (
        <ModalCambioPlan
          plan={pendiente}
          suscripcion={suscripcion}
          avisos={avisosDeBaja(pendiente)}
          guardando={Boolean(guardando)}
          onConfirmar={() => aplicar(pendiente)}
          onCancelar={() => setPendiente(null)}
        />
      )}

      <section className="suscripcion-incluye">
        <h3>Qué incluye tu plan</h3>
        <ul>
          {/* Los items sin `seccion` los tienen los tres planes; los demas se
              muestran solo si el plan de la cuenta habilita esa pantalla, para
              no prometer lo que este plan no da. */}
          {INCLUYE.filter(
            (item) => !item.seccion || suscripcion?.secciones?.includes(item.seccion)
          ).map((item) => (
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
