import React, { useEffect, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Sirve tanto para "iniciar sesion" como para "registrarse": el backend
// (/api/login/google) busca la cuenta por email y, si no existe, la crea -
// el mismo boton funciona para las dos pantallas sin que el usuario tenga
// que elegir cual de las dos cosas esta haciendo.
export default function BotonGoogle() {
  const { loginConGoogle } = useAuth();
  const contenedorRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CLIENT_ID || !window.google || !contenedorRef.current) return;

    async function manejarCredencial(response) {
      setError("");
      try {
        await loginConGoogle(response.credential);
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
  }, [loginConGoogle]);

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
