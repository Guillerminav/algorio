import React, { useState } from "react";

import ModeracionPois from "../admin/ModeracionPois.jsx";
import ModeracionReclamos from "../admin/ModeracionReclamos.jsx";
import Alertas from "./Alertas.jsx";
import Dashboard from "./Dashboard.jsx";
import Historico from "./Historico.jsx";
import MapaEstaciones from "./MapaEstaciones.jsx";
import MiFlota from "./MiFlota.jsx";
import ModalAyuda from "./ModalAyuda.jsx";
import MenuMovil from "./MenuMovil.jsx";
import ModalPerfil from "./ModalPerfil.jsx";
import PantallaSuscripcion from "./PantallaSuscripcion.jsx";
import Rutas from "./Rutas.jsx";
import Sidebar, { TITULOS_SECCION, seccionesVisibles } from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// "suscripcion" no esta en la barra de navegacion (no es una seccion mas del
// producto): se llega desde el menu de perfil, o automaticamente cuando el
// acceso vencio.
const TITULOS = {
  ...TITULOS_SECCION,
  suscripcion: "Suscripción",
  moderacion: "Moderación",
  reclamos: "Reclamos",
};

export default function AppShell() {
  const { usuario, suscripcion } = useAuth();
  const [seccionActiva, setSeccionActiva] = useState("dashboard");
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  const abrirAyuda = () => setModalAyudaAbierto(true);

  // El backend ya bloquea los endpoints de datos con 402; esto evita ademas
  // renderizar secciones que solo mostrarian errores. La pantalla de
  // suscripcion sirve para los dos casos (vigente y vencida), asi que es la
  // que se muestra cuando no hay acceso.
  const sinAcceso = suscripcion !== null && suscripcion.tiene_acceso === false;
  const mostrarSuscripcion = sinAcceso || seccionActiva === "suscripcion";

  // El plan puede no habilitar la seccion en la que quedo el estado. Pasa
  // en dos casos: la suscripcion todavia no habia llegado cuando la barra se
  // dibujo (ahi se muestran todas las secciones para no hacerla parpadear) y
  // el usuario alcanzo a hacer click, o cambio de plan con la sesion
  // abierta. Se cae al dashboard, que lo habilitan las tres.
  const habilitada =
    !suscripcion?.secciones ||
    seccionActiva === "suscripcion" ||
    seccionActiva === "moderacion" ||
    seccionActiva === "reclamos" ||
    suscripcion.secciones.includes(seccionActiva);
  const seccionVisible = habilitada ? seccionActiva : "dashboard";

  // Las dos colas de moderacion no dependen del plan ni del rol, sino del
  // permiso de la cuenta: quien aprueba paradores puede tener cualquier tipo
  // de cuenta. Antes solo existian dentro del panel del comerciante, asi que
  // un aprobador con cuenta de naviera no tenia forma de llegar.
  //
  // "Reclamos" se sumo despues por lo mismo: quedaba solo en el panel del
  // comerciante, y ahi encima hacia falta tener una ficha cargada — sin ella
  // el shell devuelve el asistente de alta antes de llegar a las secciones.
  const secciones = [
    ...seccionesVisibles(suscripcion),
    ...(usuario?.es_admin
      ? [
          { id: "moderacion", etiqueta: "Moderación" },
          { id: "reclamos", etiqueta: "Reclamos" },
        ]
      : []),
  ];

  return (
    <div className="app">
      <Sidebar
        secciones={secciones}
        seccionActiva={seccionVisible}
        onCambiarSeccion={setSeccionActiva}
        onAbrirAyuda={abrirAyuda}
      />

      <div className="columna-principal">
        <TopBar
          titulo={TITULOS[seccionVisible] ?? seccionVisible}
          onEditarPerfil={() => setModalPerfilAbierto(true)}
          onAbrirAyuda={abrirAyuda}
          onVerSuscripcion={() => setSeccionActiva("suscripcion")}
          onAbrirMenu={() => setMenuMovilAbierto(true)}
        />

        <main>
          {mostrarSuscripcion ? (
            <PantallaSuscripcion onAbrirAyuda={abrirAyuda} />
          ) : (
            <>
              {seccionVisible === "dashboard" && <Dashboard />}
              {seccionVisible === "historico" && <Historico />}
              {seccionVisible === "alertas" && <Alertas />}
              {seccionVisible === "mapa" && <MapaEstaciones />}
              {seccionVisible === "flota" && <MiFlota />}
              {seccionVisible === "rutas" && <Rutas />}
              {seccionVisible === "moderacion" && <ModeracionPois />}
              {seccionVisible === "reclamos" && <ModeracionReclamos />}
            </>
          )}
        </main>

      </div>

      <MenuMovil
        abierto={menuMovilAbierto}
        onCerrar={() => setMenuMovilAbierto(false)}
        secciones={secciones}
        seccionActiva={seccionVisible}
        onCambiarSeccion={setSeccionActiva}
        onEditarPerfil={() => setModalPerfilAbierto(true)}
        onVerSuscripcion={() => setSeccionActiva("suscripcion")}
        onAbrirAyuda={abrirAyuda}
      />

      {modalPerfilAbierto && <ModalPerfil onCerrar={() => setModalPerfilAbierto(false)} />}
      {modalAyudaAbierto && <ModalAyuda onCerrar={() => setModalAyudaAbierto(false)} />}
    </div>
  );
}
