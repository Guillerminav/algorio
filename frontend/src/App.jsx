import React from "react";

import AppShell from "./components/AppShell.jsx";
import Login from "./components/Login.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";

function Contenido() {
  const { usuario, verificando } = useAuth();

  if (verificando) return null;
  return usuario ? <AppShell /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Contenido />
    </AuthProvider>
  );
}
