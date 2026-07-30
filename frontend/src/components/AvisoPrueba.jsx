import React from "react";

import { useAuth } from "../context/AuthContext.jsx";

// Banda de aviso mientras corre la prueba gratis. Solo aparece cuando queda
// poco, para no ser ruido permanente durante toda la prueba.
const DIAS_PARA_AVISAR = 5;

export default function AvisoPrueba({ onAbrirAyuda }) {
  const { suscripcion } = useAuth();

  if (!suscripcion || suscripcion.estado !== "prueba" || suscripcion.tiene_acceso !== true) return null;
  if (suscripcion.dias_restantes === null || suscripcion.dias_restantes > DIAS_PARA_AVISAR) return null;

  const dias = suscripcion.dias_restantes;
  const texto = dias === 0
    ? "Tu prueba gratis termina hoy."
    : `Tu prueba gratis termina en ${dias} ${dias === 1 ? "día" : "días"}.`;

  return (
    <div className="aviso-prueba">
      <span>{texto}</span>
      <button type="button" className="enlace-boton" onClick={onAbrirAyuda}>
        Escribinos para seguir
      </button>
    </div>
  );
}
