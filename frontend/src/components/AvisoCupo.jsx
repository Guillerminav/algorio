import React from "react";

import { useAuth } from "../context/AuthContext.jsx";

// Cuanto le queda al usuario dentro de su plan. No bloquea nada: el que
// corta es el backend (409 al crear). Esto solo evita que se entere recien
// despues de llenar el formulario entero.
//
// `recurso` es "activos" o "rutas" (las claves de los topes que manda
// /api/suscripcion); `usados` es cuantos tiene cargados ahora.
export default function AvisoCupo({ recurso, usados, singular, plural }) {
  const { suscripcion } = useAuth();
  if (!suscripcion) return null;

  const tope = suscripcion[`max_${recurso}`];
  // null = sin tope. Con el plan Capitán no hay nada que avisar, y una
  // banda diciendo "ilimitado" en cada carga seria ruido permanente.
  if (tope === null || tope === undefined) return null;

  const restantes = Math.max(tope - usados, 0);

  if (restantes === 0) {
    return (
      <div className="aviso-cupo completo">
        <span>
          <strong>Plan {suscripcion.etiqueta}</strong> — llegaste a {plural === "rutas" ? "las" : "los"}{" "}
          {tope} {plural} que incluye. Para cargar otr{singular === "ruta" ? "a" : "o"} {singular},
          cambiá de plan o borrá {singular === "ruta" ? "alguna" : "alguno"} de los que ya tenés.
        </span>
      </div>
    );
  }

  return (
    <div className="aviso-cupo">
      <span>
        <strong>Plan {suscripcion.etiqueta}</strong> — {usados} de {tope} {plural}, te{" "}
        {restantes === 1 ? "queda" : "quedan"} {restantes}.
      </span>
    </div>
  );
}
