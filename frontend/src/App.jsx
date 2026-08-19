import React, { Suspense, lazy, useState } from "react";

import CuentaDeOtroProducto from "./components/CuentaDeOtroProducto.jsx";
import Login from "./components/Login.jsx";
import Registro from "./components/Registro.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ES_PRO, rolEsDeEsteProducto } from "./producto.js";

// Los shells van en diferido y no importados arriba: son lo pesado del bundle
// (Leaflet en los dos de río, recharts y jspdf/html2canvas en el de naviera).
// Con `lazy` cada dominio se descarga solo el suyo aunque el build sea el
// mismo — que es justo lo que permite servir app. y pro. desde un unico
// proyecto de Vercel sin que cada uno cargue el producto del otro.
const ShellNauta = lazy(() => import("./nauta/ShellNauta.jsx"));
const ShellComercio = lazy(() => import("./comercio/ShellComercio.jsx"));
const AppShell = lazy(() => import("./components/AppShell.jsx"));

// El producto se bifurca por DOMINIO (ver src/producto.js) y la cuenta por
// `usuarios.rol`. Los dos tienen que coincidir: el rol decide qué shell se
// monta, pero solo entre los que este dominio sirve.
//
// Antes había un solo dominio y el default era AppShell, "porque es lo que era
// toda cuenta antes de que existieran los roles". Ese default ya no sirve: en
// app.algorio.com.ar montaría el dashboard de navieras, que es el otro
// producto. Ahora el rol que no pertenece a este dominio no cae en ningún
// shell — se explica y se ofrece el link (ver CuentaDeOtroProducto).
function ShellSegunRol({ rol }) {
  if (!rolEsDeEsteProducto(rol)) return <CuentaDeOtroProducto rol={rol} />;
  if (ES_PRO) return <AppShell />;
  return rol === "comercio" ? <ShellComercio /> : <ShellNauta />;
}

function Contenido() {
  const { usuario, verificando } = useAuth();
  const [pantalla, setPantalla] = useState("login");

  if (verificando) return null;

  if (usuario) {
    return (
      // Sin cartel de carga: el chunk del shell se resuelve en milisegundos y
      // un spinner que parpadea se lee peor que un blanco corto.
      <Suspense fallback={null}>
        <ShellSegunRol rol={usuario.rol} />
      </Suspense>
    );
  }

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
