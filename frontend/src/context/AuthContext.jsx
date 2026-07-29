import React, { createContext, useContext, useEffect, useState } from "react";

import { pedirJSON } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    pedirJSON("/api/perfil")
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => setVerificando(false));
  }, []);

  async function login(usuarioTexto, password) {
    const perfil = await pedirJSON("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuarioTexto, password }),
    });
    setUsuario(perfil);
  }

  async function logout() {
    await pedirJSON("/api/logout", { method: "POST" }).catch(() => {});
    setUsuario(null);
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
    <AuthContext.Provider value={{ usuario, verificando, login, logout, actualizarPerfil }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth() debe usarse dentro de <AuthProvider>.");
  return contexto;
}
