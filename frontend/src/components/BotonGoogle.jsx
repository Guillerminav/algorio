import React, { useEffect, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Sirve tanto para "iniciar sesion" como para "registrarse": el backend
// (/api/login/google) busca la cuenta por email y, si no existe, la crea -
// el mismo boton funciona para las dos pantallas sin que el usuario tenga
// que elegir cual de las dos cosas esta haciendo.
// `plan` y `rol` los pasa la pantalla de Registro con lo elegido; en Login no
// se pasa nada. Solo se usan si el alta crea la cuenta.
const hayScriptDeGoogle = () => Boolean(window.google?.accounts?.id);

export default function BotonGoogle({ plan, rol }) {
  const { loginConGoogle } = useAuth();
  const contenedorRef = useRef(null);
  const [error, setError] = useState("");
  const [scriptListo, setScriptListo] = useState(hayScriptDeGoogle);

  // El script de Google (index.html) se carga con `async defer`, asi que puede
  // terminar despues de que este componente monte. Antes el efecto de abajo
  // miraba window.google una sola vez y, si todavia no estaba, se rendia: el
  // boton no aparecia nunca y no habia nada que lo volviera a intentar, porque
  // sus dependencias no cambian cuando el script termina de bajar. Esto espera
  // a que exista y recien ahi lo dibuja.
  useEffect(() => {
    if (scriptListo || !CLIENT_ID) return undefined;
    const id = setInterval(() => {
      if (hayScriptDeGoogle()) {
        setScriptListo(true);
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [scriptListo]);

  useEffect(() => {
    if (!CLIENT_ID || !scriptListo || !contenedorRef.current) return;

    async function manejarCredencial(response) {
      setError("");
      try {
        await loginConGoogle(response.credential, plan, rol);
      } catch (e) {
        setError(e.message || "No se pudo iniciar sesion con Google.");
      }
    }

    window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: manejarCredencial });
    window.google.accounts.id.renderButton(contenedorRef.current, {
      theme: "outline",
      size: "large",
      width: "100%",
      text: "continue_with",
      locale: "es",
    });
    // `plan` y `rol` van en las dependencias porque el callback que registra
    // Google se queda con el valor del momento: sin esto, cambiar de plan
    // despues de que el boton se dibujo daria de alta la cuenta con el anterior.
  }, [loginConGoogle, plan, rol, scriptListo]);

  if (!CLIENT_ID) return null;

  return (
    <>
      <div className="separador-o"><span>o</span></div>
      <div className="boton-google">
        <div ref={contenedorRef} />
        {error && <div className="mensaje-error">{error}</div>}
      </div>
    </>
  );
}
