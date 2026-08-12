import React, { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import BotonGoogle from "./BotonGoogle.jsx";
import HeroAutenticacion from "./HeroAutenticacion.jsx";
import SelectorPlan from "./SelectorPlan.jsx";

function FlechaAtras() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 19l-7-7 7-7" />
    </svg>
  );
}

// El alta va en dos pasos y el plan va primero, no despues de los datos. No es
// solo cuestion de largo de pantalla: el alta con Google crea la cuenta de un
// click, asi que si el plan se eligiera al final, quien entra por Google
// nunca pasaria por esa decision y arrancaria con el plan por defecto sin
// haberlo pedido. Eligiendo primero, las dos vias de alta llevan el plan.
const PASO_PLAN = "plan";
const PASO_DATOS = "datos";

export default function Registro({ onIrALogin }) {
  const { registrar } = useAuth();
  const [paso, setPaso] = useState(PASO_PLAN);
  const [plan, setPlan] = useState("");
  const [planEtiqueta, setPlanEtiqueta] = useState("");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetirPassword, setRepetirPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [heroRetraido, setHeroRetraido] = useState(false);

  // El panel azul arranca visible y recien despues del primer pintado se
  // retrae. Si se renderizara ya retraido, el navegador no tendria un estado
  // anterior contra el cual interpolar y no habria animacion, solo un salto.
  // El mismo efecto lo trae de vuelta al pasar al formulario de datos.
  useEffect(() => {
    const id = setTimeout(() => setHeroRetraido(paso === PASO_PLAN), 40);
    return () => clearTimeout(id);
  }, [paso]);

  function continuar(evento) {
    evento.preventDefault();
    setError("");
    setPaso(PASO_DATOS);
  }

  async function crearCuenta(evento) {
    evento.preventDefault();

    // Las dos validaciones que el navegador no hace solo; `required` y
    // `minLength` ya los cubre el form.
    if (password !== repetirPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setError("");
    setEnviando(true);
    try {
      await registrar({ usuario: usuario.trim(), email: email.trim(), password, plan });
    } catch (e) {
      setError(e.status === 400 ? e.message : "No se pudo crear la cuenta. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={`pantalla-login${paso === PASO_PLAN ? " pantalla-planes" : ""}`}>
      {/* En el paso del plan el panel de marca se corre: se come casi la mitad
          del ancho, y las tres tarjetas necesitan la pantalla entera para
          entrar en fila. Vuelve en el paso de los datos, que es un formulario
          angosto. Siempre montado, para que la transicion tenga que animar. */}
      <HeroAutenticacion retraido={heroRetraido} />

      <div className="login-form-panel">
        <form
          className={`tarjeta-login${paso === PASO_PLAN ? " tarjeta-planes" : ""}`}
          onSubmit={paso === PASO_PLAN ? continuar : crearCuenta}
        >
          {paso === PASO_PLAN ? (
            <>
              {/* La flecha va pegada al titulo y no arriba de todo: desde este
                  paso "atras" es salir del registro, asi que vuelve al login. */}
              <div className="encabezado-paso">
                <button
                  type="button"
                  className="boton-volver"
                  onClick={onIrALogin}
                  aria-label="Volver al inicio de sesión"
                  title="Volver al inicio de sesión"
                >
                  <FlechaAtras />
                </button>
                <div className="encabezado-paso-texto">
                  <h1>Elegí tu plan</h1>
                  <p>Paso 1 de 2 — elegí con qué querés arrancar.</p>
                </div>
              </div>

              <SelectorPlan
                valor={plan}
                onCambiar={(elegido) => {
                  setPlan(elegido.plan);
                  setPlanEtiqueta(elegido.etiqueta);
                }}
              />

              <div className="mensaje-error">{error}</div>
              <button type="submit" disabled={!plan}>Continuar</button>

              {/* Tambien aca, no solo en el paso 2: esta es la primera pantalla
                  del registro, y si el boton de Google solo apareciera despues
                  de llenar el formulario, nadie que quiera entrar con Google lo
                  encontraria. El plan ya viene preseleccionado, asi que el alta
                  igual queda con un plan elegido. */}
              <BotonGoogle plan={plan} />
            </>
          ) : (
            <>
              <h1>Crear cuenta</h1>
              <p>Paso 2 de 2 — plan {planEtiqueta}.</p>

              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Nombre de usuario
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Repetir contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={repetirPassword}
                  onChange={(e) => setRepetirPassword(e.target.value)}
                />
              </label>

              <div className="mensaje-error">{error}</div>

              <div className="fila-acciones">
                <button
                  type="button"
                  className="boton-volver"
                  onClick={() => {
                    setError("");
                    setPaso(PASO_PLAN);
                  }}
                  aria-label="Volver a los planes"
                  title="Volver a los planes"
                >
                  <FlechaAtras />
                </button>
                <button type="submit" disabled={enviando}>
                  {enviando ? "Creando cuenta…" : "Crear cuenta"}
                </button>
              </div>

              {/* Da de alta con el mismo plan que se eligio en el paso 1. */}
              <BotonGoogle plan={plan} />
            </>
          )}

          <p className="enlace-alternativo">
            ¿Ya tenés una cuenta?{" "}
            <button type="button" className="enlace-boton" onClick={onIrALogin}>
              Iniciar sesión
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
