import React, { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { ES_PRO, PRODUCTO } from "../producto.js";
import BotonGoogle from "./BotonGoogle.jsx";
import CruceProducto from "./CruceProducto.jsx";
import PantallaMarca from "./PantallaMarca.jsx";
import SelectorPlan from "./SelectorPlan.jsx";
import SelectorRol, { ROL_POR_CLAVE } from "./SelectorRol.jsx";

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

const PASO_ROL = "rol";
const PASO_PLAN = "plan";
const PASO_DATOS = "datos";

// Los pasos que ve cada dominio. Separar los productos simplificó el alta: los
// dos quedaron en dos pasos, y por motivos opuestos.
//
// - En Pro el rol es siempre `naviera`, así que no hay nada que elegir: el
//   primer paso desaparece y arranca por el plan, que es el único perfil del
//   producto que elige entre varios.
// - En el de río hay dos perfiles pero ninguno elige plan (el nauta tiene uno
//   solo y gratis, el comercio uno solo): se elige perfil y se pasa a los
//   datos.
//
// Antes, con los tres roles en una sola web, esto tenía que calcularse en
// tiempo real y el encabezado decía "Paso 1 de 3" o "de 2" según lo que
// hubieras tocado dos pantallas antes.
const PASOS = ES_PRO ? [PASO_PLAN, PASO_DATOS] : [PASO_ROL, PASO_DATOS];

export default function Registro({ onIrALogin }) {
  const { registrar } = useAuth();
  const [indicePaso, setIndicePaso] = useState(0);
  // En Pro el rol no se pregunta: es el único que sirve en este dominio. El
  // backend lo valida igual (auth.py: rol_valido), así que esto es la interfaz
  // ahorrando una pantalla vacía, no un permiso que se da de más.
  const [rol, setRol] = useState(ES_PRO ? "naviera" : "");
  const [plan, setPlan] = useState("");
  const [planEtiqueta, setPlanEtiqueta] = useState("");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetirPassword, setRepetirPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const paso = PASOS[indicePaso];
  const esUltimo = indicePaso === PASOS.length - 1;

  function avanzar(evento) {
    evento.preventDefault();
    setError("");
    setIndicePaso((i) => i + 1);
  }

  // Desde el primer paso, "atrás" es salir del registro y volver al login.
  function retroceder() {
    setError("");
    if (indicePaso === 0) onIrALogin();
    else setIndicePaso((i) => i - 1);
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
      await registrar({ usuario: usuario.trim(), email: email.trim(), password, plan, rol });
    } catch (e) {
      setError(e.status === 400 ? e.message : "No se pudo crear la cuenta. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const titulo = {
    [PASO_ROL]: `¿Cómo vas a usar ${PRODUCTO.nombre}?`,
    [PASO_PLAN]: "Elegí tu plan",
    [PASO_DATOS]: "Creá tu cuenta",
  }[paso];

  const bajada = {
    [PASO_ROL]: "De esto depende lo que vas a ver.",
    [PASO_PLAN]: "Elegí con qué querés arrancar. No se paga nada ahora.",
    [PASO_DATOS]: ES_PRO
      ? `Plan ${planEtiqueta || "—"}.`
      : `${ROL_POR_CLAVE[rol]?.etiqueta ?? ""}.`,
  }[paso];

  return (
    // Los pasos de tarjetas necesitan más ancho que el formulario de datos.
    <PantallaMarca ancho={paso === PASO_DATOS ? "angosto" : "ancho"}>
      <form className="tarjeta-vidrio" onSubmit={esUltimo ? crearCuenta : avanzar}>
        <div className="encabezado-paso">
          <button
            type="button"
            className="boton-volver"
            onClick={retroceder}
            aria-label={indicePaso === 0 ? "Volver al inicio de sesión" : "Volver al paso anterior"}
            title={indicePaso === 0 ? "Volver al inicio de sesión" : "Volver"}
          >
            <FlechaAtras />
          </button>
          <div className="encabezado-paso-texto">
            <h1>{titulo}</h1>
            <p>
              Paso {indicePaso + 1} de {PASOS.length} — {bajada}
            </p>
          </div>
        </div>

        {paso === PASO_ROL && (
          <SelectorRol
            valor={rol}
            onCambiar={(elegido) => {
              setRol(elegido.rol);
              // El plan elegido antes puede no existir para el rol nuevo.
              setPlan("");
              setPlanEtiqueta("");
            }}
          />
        )}

        {paso === PASO_PLAN && (
          <SelectorPlan
            rol={rol}
            valor={plan}
            onCambiar={(elegido) => {
              setPlan(elegido.plan);
              setPlanEtiqueta(elegido.etiqueta);
            }}
          />
        )}

        {paso === PASO_DATOS && (
          <div className="campos-registro">
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
          </div>
        )}

        <div className="mensaje-error">{error}</div>

        <button
          type="submit"
          className="boton-vidrio-primario"
          disabled={
            enviando ||
            (paso === PASO_ROL && !rol) ||
            (paso === PASO_PLAN && !plan)
          }
        >
          {esUltimo ? (enviando ? "Creando cuenta…" : "Crear cuenta") : "Continuar"}
        </button>

        {/* Google también antes del último paso: si solo apareciera después de
            llenar el formulario, nadie que quiera entrar con Google lo
            encontraría. El rol y el plan ya vienen elegidos de los pasos
            anteriores, así que el alta queda igual de completa. */}
        {paso !== PASO_ROL && <BotonGoogle plan={plan} rol={rol} />}

        <p className="enlace-alternativo">
          ¿Ya tenés una cuenta?{" "}
          <button type="button" className="enlace-boton" onClick={onIrALogin}>
            Iniciar sesión
          </button>
        </p>
      </form>

      <CruceProducto />
    </PantallaMarca>
  );
}
