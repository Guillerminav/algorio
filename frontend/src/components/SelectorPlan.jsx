import React, { useEffect, useState } from "react";

import { pedirJSON } from "../api.js";

// Las secciones que solo traen algunos planes, con el nombre que ven los
// usuarios. Las de base (dashboard, historico, alertas, mapa) no se listan:
// las tienen los tres, y enumerarlas en cada tarjeta seria ruido.
const ETIQUETA_SECCION = { flota: "Mi flota", rutas: "Rutas" };

// Que ofrece el plan de un comercio. No se deduce de `secciones` como los de
// naviera: el panel del comerciante es una sola seccion ("mi_comercio") y
// listarla asi no le diria nada a nadie.
const VENTAJAS_COMERCIO = [
  "Tu lugar publicado en el mapa de la app",
  "Menú, horarios, fotos y contacto",
  "Métricas de cuánta gente te miró",
  "Reseñas y puntaje de los nautas",
];

function limiteEnTexto(maximo, singular, plural) {
  return `Hasta ${maximo} ${maximo === 1 ? singular : plural}`;
}

// Que ofrece cada plan. El backend manda las secciones habilitadas y los
// topes; aca solo se traduce a texto. Se decide por los datos y no por el
// nombre del plan, asi agregar uno nuevo no obliga a tocar esto.
function ventajas(plan) {
  if (plan.rol === "comercio") return VENTAJAS_COMERCIO;

  const extras = plan.secciones
    .filter((s) => ETIQUETA_SECCION[s])
    .map((s) => ETIQUETA_SECCION[s]);

  if (extras.length === 0) {
    return ["Dashboard, Histórico, Alertas y Mapa", "Exportación a CSV y gráficos en PNG"];
  }

  const sinTopes = plan.max_activos === null && plan.max_rutas === null;
  return [
    `Todas las pantallas, incluidas ${extras.join(" y ")}`,
    ...(sinTopes
      ? ["Sin límite de embarcaciones ni de rutas"]
      : [
          limiteEnTexto(plan.max_activos, "embarcación", "embarcaciones"),
          limiteEnTexto(plan.max_rutas, "ruta", "rutas"),
        ]),
  ];
}

function Precio({ plan }) {
  // Sin tarifa publicada (Capitán) se cotiza caso por caso.
  if (plan.precio_usd === null) {
    return (
      <span className="plan-precio">
        <strong>Consultar</strong>
      </span>
    );
  }
  return (
    <span className="plan-precio">
      {plan.precio_lista_usd !== null && (
        <s className="plan-precio-lista">USD {plan.precio_lista_usd}</s>
      )}
      <strong>USD {plan.precio_usd}</strong>
      <span className="plan-precio-periodo">por mes</span>
    </span>
  );
}

// `rol` acota el catalogo al perfil que se esta dando de alta: los planes de
// naviera no le sirven a un parador. El filtro lo hace el backend, que es
// donde vive la relacion plan-rol (ver backend/suscripciones.py).
export default function SelectorPlan({ valor, onCambiar, rol }) {
  const [planes, setPlanes] = useState([]);
  const [diasPrueba, setDiasPrueba] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    // /api/planes no pide sesion: se consulta justamente antes de tener una.
    pedirJSON(rol ? `/api/planes?rol=${encodeURIComponent(rol)}` : "/api/planes")
      .then((datos) => {
        if (!vigente) return;
        setPlanes(datos.planes);
        setDiasPrueba(datos.dias_prueba);
        // Se preselecciona el primero para que el formulario nunca se mande
        // sin plan; si no, el backend lo bajaria al mas acotado sin que el
        // usuario haya elegido nada.
        if (datos.planes.length) {
          onCambiar(datos.planes[0]);
        }
      })
      .catch(() => vigente && setError("No se pudieron cargar los planes."));
    return () => {
      vigente = false;
    };
    // Se vuelve a pedir cuando cambia el rol (el usuario volvio atras y eligio
    // otro perfil). `valor` no va en las dependencias: elegir un plan no debe
    // disparar otra consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  if (error) return <div className="mensaje-error">{error}</div>;
  if (!planes.length) return null;

  // Sin <legend> visible: el titulo de la pantalla ya dice "Elegí tu plan" y
  // repetirlo gastaba una linea de alto, que es justo lo que escasea acá. El
  // aria-label mantiene el grupo etiquetado para el lector de pantalla.
  return (
    <fieldset className="selector-plan" aria-label="Planes disponibles">
      <p className="selector-plan-nota">
        No se paga nada ahora: {diasPrueba === null ? "la prueba" : `tenés ${diasPrueba} días`} de
        prueba gratis y sin tarjeta. Recién al terminar elegís si seguís.
      </p>

      {/* Las tarjetas van en su propio contenedor y no sueltas en el
          <fieldset>: si el fieldset fuera la fila, el <legend> y la nota
          entrarian como columnas mas al lado de los planes. */}
      <div className="plan-tarjetas">
        {planes.map((plan) => (
          <label
            key={plan.plan}
            className={`plan-opcion${plan.plan === valor ? " elegida" : ""}`}
          >
            <span className="plan-encabezado">
              <input
                type="radio"
                name="plan"
                value={plan.plan}
                checked={plan.plan === valor}
                onChange={() => onCambiar(plan)}
              />
              <strong>{plan.etiqueta}</strong>
              <Precio plan={plan} />
            </span>
            {plan.nota_precio && <span className="plan-nota-precio">{plan.nota_precio}</span>}
            <span className="plan-resumen">{plan.resumen}</span>
            <span className="plan-ventajas">
              {ventajas(plan).map((v) => (
                <span key={v}>{v}</span>
              ))}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
