import React, { useState } from "react";

import Alertas from "./Alertas.jsx";
import AvisoPrueba from "./AvisoPrueba.jsx";
import Dashboard from "./Dashboard.jsx";
import Graficos from "./Graficos.jsx";
import MapaEstaciones from "./MapaEstaciones.jsx";
import MiFlota from "./MiFlota.jsx";
import ModalAyuda from "./ModalAyuda.jsx";
import ModalPerfil from "./ModalPerfil.jsx";
import NavInferior from "./NavInferior.jsx";
import PantallaSuscripcion from "./PantallaSuscripcion.jsx";
import Sidebar, { TITULOS_SECCION } from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// "suscripcion" no esta en la barra de navegacion (no es una seccion mas del
// producto): se llega desde el menu de perfil, o automaticamente cuando el
// acceso vencio.
const TITULOS = { ...TITULOS_SECCION, suscripcion: "Suscripción" };

export default function AppShell() {
  const { suscripcion } = useAuth();
  const [seccionActiva, setSeccionActiva] = useState("dashboard");
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);

  const abrirAyuda = () => setModalAyudaAbierto(true);

  // El backend ya bloquea los endpoints de datos con 402; esto evita ademas
  // renderizar secciones que solo mostrarian errores. La pantalla de
  // suscripcion sirve para los dos casos (vigente y vencida), asi que es la
  // que se muestra cuando no hay acceso.
  const sinAcceso = suscripcion !== null && suscripcion.tiene_acceso === false;
  const mostrarSuscripcion = sinAcceso || seccionActiva === "suscripcion";

  return (
    <div className="app">
      <Sidebar
        seccionActiva={seccionActiva}
        onCambiarSeccion={setSeccionActiva}
        onAbrirAyuda={abrirAyuda}
      />

      <div className="columna-principal">
        <TopBar
          titulo={TITULOS[seccionActiva] ?? seccionActiva}
          onEditarPerfil={() => setModalPerfilAbierto(true)}
          onAbrirAyuda={abrirAyuda}
          onVerSuscripcion={() => setSeccionActiva("suscripcion")}
        />

        <main>
          <AvisoPrueba onAbrirAyuda={abrirAyuda} />
          {mostrarSuscripcion ? (
            <PantallaSuscripcion onAbrirAyuda={abrirAyuda} />
          ) : (
            <>
              {seccionActiva === "dashboard" && <Dashboard />}
              {seccionActiva === "graficos" && <Graficos />}
              {seccionActiva === "alertas" && <Alertas />}
              {seccionActiva === "mapa" && <MapaEstaciones />}
              {seccionActiva === "flota" && <MiFlota />}
            </>
          )}
        </main>

        <NavInferior seccionActiva={seccionActiva} onCambiarSeccion={setSeccionActiva} />
      </div>

      {modalPerfilAbierto && <ModalPerfil onCerrar={() => setModalPerfilAbierto(false)} />}
      {modalAyudaAbierto && <ModalAyuda onCerrar={() => setModalAyudaAbierto(false)} />}
    </div>
  );
}
