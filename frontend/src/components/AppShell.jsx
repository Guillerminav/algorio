import React, { useState } from "react";

import Alertas from "./Alertas.jsx";
import Dashboard from "./Dashboard.jsx";
import MapaEstaciones from "./MapaEstaciones.jsx";
import MiFlota from "./MiFlota.jsx";
import ModalPerfil from "./ModalPerfil.jsx";
import NavInferior from "./NavInferior.jsx";
import Sidebar, { TITULOS_SECCION } from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";

export default function AppShell() {
  const [seccionActiva, setSeccionActiva] = useState("dashboard");
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);

  return (
    <div className="app">
      <Sidebar seccionActiva={seccionActiva} onCambiarSeccion={setSeccionActiva} />

      <div className="columna-principal">
        <TopBar
          titulo={TITULOS_SECCION[seccionActiva] ?? seccionActiva}
          onEditarPerfil={() => setModalPerfilAbierto(true)}
        />

        <main>
          {seccionActiva === "dashboard" && <Dashboard />}
          {seccionActiva === "alertas" && <Alertas />}
          {seccionActiva === "mapa" && <MapaEstaciones />}
          {seccionActiva === "flota" && <MiFlota />}
        </main>

        <NavInferior seccionActiva={seccionActiva} onCambiarSeccion={setSeccionActiva} />
      </div>

      {modalPerfilAbierto && <ModalPerfil onCerrar={() => setModalPerfilAbierto(false)} />}
    </div>
  );
}
