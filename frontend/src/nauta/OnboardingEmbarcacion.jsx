import React, { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import SelectorEmbarcacion from "./SelectorEmbarcacion.jsx";

/**
 * La única pregunta del alta de un nauta: ¿con qué salís?
 *
 * Ocupa la pantalla entera y no se puede saltear porque sin ese dato la app no
 * puede decirle si el río está picado *para él*, que es lo único que la hace
 * distinta de mirar el pronóstico en cualquier otro lado (ver
 * backend/clima.py). Es la misma pantalla que muestra la app móvil.
 */
export default function OnboardingEmbarcacion() {
  const { actualizarPerfil } = useAuth();
  const [elegida, setElegida] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function continuar(evento) {
    evento.preventDefault();
    setError("");
    setGuardando(true);
    try {
      // Al guardar el perfil, AuthContext actualiza `usuario` y el shell de
      // arriba deja de mostrar esta pantalla solo: no hace falta navegar.
      await actualizarPerfil({ tipo_embarcacion: elegida });
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  return (
    <div className="onboarding-nauta">
      <form className="onboarding-nauta-tarjeta" onSubmit={continuar}>
        <h1>¿Con qué salís?</h1>
        <p className="descripcion">
          Con esto calibramos los avisos de viento. Lo podés cambiar cuando quieras.
        </p>

        <SelectorEmbarcacion valor={elegida} onCambiar={setElegida} deshabilitado={guardando} />

        <div className="mensaje-error">{error}</div>

        <div className="fila-acciones">
          <button type="submit" disabled={!elegida || guardando}>
            {guardando ? "Guardando…" : "Entrar al mapa"}
          </button>
        </div>
      </form>
    </div>
  );
}
