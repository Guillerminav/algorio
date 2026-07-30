import React from "react";

import { useAuth } from "../context/AuthContext.jsx";

// Pantalla que reemplaza al contenido cuando la prueba gratis vencio y no
// hay suscripcion activa. El backend ya bloquea los endpoints de datos
// (402), esto es para que el usuario entienda que paso en vez de ver una
// pantalla de error.
export default function SuscripcionVencida({ onAbrirAyuda }) {
  const { usuario } = useAuth();

  return (
    <div className="suscripcion-vencida">
      <h2>Tu prueba gratis terminó</h2>
      <p>
        Gracias por probar AlgoRío, {usuario?.nombre_completo || usuario?.usuario}.
        Para seguir viendo niveles, alertas y tu flota necesitás una suscripción.
      </p>
      <p className="suscripcion-vencida-nota">
        Todavía estamos terminando de habilitar los pagos. Escribinos y
        coordinamos para que no pierdas el acceso.
      </p>
      <button type="button" className="boton-primario" onClick={onAbrirAyuda}>
        Escribinos
      </button>
    </div>
  );
}
