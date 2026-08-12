import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { pedirJSON } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [suscripcion, setSuscripcion] = useState(null);
  const [verificando, setVerificando] = useState(true);

  // El estado de la suscripcion lo decide el backend (ver
  // backend/suscripciones.py); aca solo se muestra. Se pide aparte del perfil
  // porque cambia por su cuenta (se vence con el tiempo, o se activa cuando
  // entra un pago) sin que el usuario toque nada.
  const refrescarSuscripcion = useCallback(async () => {
    const estado = await pedirJSON("/api/suscripcion").catch(() => null);
    setSuscripcion(estado);
    return estado;
  }, []);

  useEffect(() => {
    pedirJSON("/api/perfil")
      .then(async (perfil) => {
        setUsuario(perfil);
        await refrescarSuscripcion();
      })
      .catch(() => setUsuario(null))
      .finally(() => setVerificando(false));
  }, [refrescarSuscripcion]);

  async function login(usuarioTexto, password) {
    const perfil = await pedirJSON("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuarioTexto, password }),
    });
    setUsuario(perfil);
    await refrescarSuscripcion();
  }

  async function registrar({ usuario: usuarioTexto, email, password, plan }) {
    const perfil = await pedirJSON("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuarioTexto, email, password, plan }),
    });
    setUsuario(perfil);
    await refrescarSuscripcion();
  }

  // `plan` solo cuenta cuando el token de Google da de alta una cuenta nueva:
  // desde Registro llega el plan elegido, desde Login llega undefined. Si
  // la cuenta ya existia, el backend lo ignora.
  async function loginConGoogle(credential, plan) {
    const perfil = await pedirJSON("/api/login/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential, plan }),
    });
    setUsuario(perfil);
    await refrescarSuscripcion();
  }

  async function logout() {
    await pedirJSON("/api/logout", { method: "POST" }).catch(() => {});
    setUsuario(null);
    setSuscripcion(null);
  }

  // Cambiar de plan devuelve el estado nuevo ya calculado por el backend, asi
  // que se guarda directo en vez de volver a pedir /api/suscripcion.
  async function cambiarPlan(plan) {
    const estado = await pedirJSON("/api/suscripcion/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    setSuscripcion(estado);
    return estado;
  }

  async function actualizarPerfil(cambios) {
    const perfil = await pedirJSON("/api/perfil", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    setUsuario(perfil);
    return perfil;
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        suscripcion,
        verificando,
        login,
        registrar,
        loginConGoogle,
        logout,
        actualizarPerfil,
        refrescarSuscripcion,
        cambiarPlan,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth() debe usarse dentro de <AuthProvider>.");
  return contexto;
}
