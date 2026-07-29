import React, { useState } from "react";

import AppShell from "./components/AppShell.jsx";
import Login from "./components/Login.jsx";
import Registro from "./components/Registro.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";

function Contenido() {
  const { usuario, verificando } = useAuth();
  const [pantalla, setPantalla] = useState("login");

  if (verificando) return null;
  if (usuario) return <AppShell />;
  return pantalla === "registro" ? (
    <Registro onIrALogin={() => setPantalla("login")} />
  ) : (
    <Login onIrARegistro={() => setPantalla("registro")} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Contenido />
    </AuthProvider>
  );
}
