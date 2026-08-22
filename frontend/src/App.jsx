import React, { Suspense, lazy, useEffect, useState } from "react";

import CuentaDeOtroProducto from "./components/CuentaDeOtroProducto.jsx";
import Login from "./components/Login.jsx";
import RecuperarPassword from "./components/RecuperarPassword.jsx";
import Registro from "./components/Registro.jsx";
import RestablecerPassword from "./components/RestablecerPassword.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ES_PRO, rolEsDeEsteProducto } from "./producto.js";

/**
 * El token del link del mail, que llega como `?restablecer=<token>`.
 *
 * Se lee una sola vez al arrancar y no en cada render: la URL se limpia apenas
 * se usa, y releerla despues devolveria vacio en el medio del formulario.
 */
function tokenDeLaUrl() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("restablecer") || null;
}

/**
 * Saca el token de la barra de direcciones sin recargar.
 *
 * Una URL con el token adentro se comparte por WhatsApp "mira, no me anda",
 * queda en el historial de una compu prestada y se guarda en favoritos. El
 * token sigue siendo de un solo uso, pero mientras no se use es la llave de la
 * cuenta y no tiene por que quedar a la vista.
 */
function limpiarUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", window.location.pathname);
}

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
  const [token, setToken] = useState(tokenDeLaUrl);
  const [pantalla, setPantalla] = useState("login");

  // El token pasa a estado y sale de la barra de direcciones en el primer
  // pintado, no al terminar: mientras esta ahi se comparte por WhatsApp ("mira,
  // no me anda"), queda en el historial de una compu prestada y se guarda en
  // favoritos. En React ya lo tenemos; en la URL solo estorba.
  useEffect(() => {
    if (token) limpiarUrl();
  }, [token]);

  // El link del mail gana sobre todo lo demas, incluso sobre una sesion
  // abierta: si alguien llego hasta aca es porque quiere cambiar la
  // contraseña, y mandarlo al mapa porque quedaba una cookie de antes lo deja
  // sin ninguna forma de hacerlo.
  if (token) {
    return (
      <RestablecerPassword
        token={token}
        onListo={() => {
          setToken(null);
          setPantalla("login");
        }}
      />
    );
  }

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

  if (pantalla === "recuperar") {
    return <RecuperarPassword onVolver={() => setPantalla("login")} />;
  }

  return pantalla === "registro" ? (
    <Registro onIrALogin={() => setPantalla("login")} />
  ) : (
    <Login
      onIrARegistro={() => setPantalla("registro")}
      onIrARecuperar={() => setPantalla("recuperar")}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Contenido />
    </AuthProvider>
  );
}
