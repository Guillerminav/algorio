import React, { useState } from "react";

import DashboardGeneral from "./DashboardGeneral.jsx";
import KpisDashboard from "./KpisDashboard.jsx";
import TablaIna from "./TablaIna.jsx";
import TablaPrefectura from "./TablaPrefectura.jsx";
import TablaYacyreta from "./TablaYacyreta.jsx";

const SUBTABS = [
  { id: "general", etiqueta: "Vista general" },
  { id: "ina", etiqueta: "INA" },
  { id: "prefectura", etiqueta: "Prefectura Naval" },
  { id: "yacyreta", etiqueta: "Yacyreta" },
];

export default function Dashboard() {
  const [subtabActivo, setSubtabActivo] = useState("general");
  // Acciones (recargar/exportar) del subtab montado en este momento: cada
  // tabla las registra via el prop onListo. El toolbar de arriba es unico
  // y compartido entre los 4 subtabs, asi que siempre opera sobre el que
  // este activo.
  const [accionesActivas, setAccionesActivas] = useState(null);

  function cambiarSubtab(id) {
    setAccionesActivas(null);
    setSubtabActivo(id);
  }

  return (
    <div>
      <KpisDashboard />

      <div className="dashboard-toolbar">
        <nav className="subtabs">
          {SUBTABS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`subtab-boton${s.id === subtabActivo ? " activo" : ""}`}
              onClick={() => cambiarSubtab(s.id)}
            >
              {s.etiqueta}
            </button>
          ))}
        </nav>
        <div className="dashboard-toolbar-botones">
          <button
            type="button"
            className="boton-secundario"
            disabled={!accionesActivas}
            onClick={() => accionesActivas?.recargar()}
          >
            ⟳ Actualizar
          </button>
          <button
            type="button"
            className="boton-primario"
            disabled={!accionesActivas}
            onClick={() => accionesActivas?.exportar()}
          >
            ⭳ Exportar CSV
          </button>
        </div>
      </div>

      {subtabActivo === "general" && <DashboardGeneral onListo={setAccionesActivas} />}
      {subtabActivo === "ina" && <TablaIna onListo={setAccionesActivas} />}
      {subtabActivo === "prefectura" && <TablaPrefectura onListo={setAccionesActivas} />}
      {subtabActivo === "yacyreta" && <TablaYacyreta onListo={setAccionesActivas} />}
    </div>
  );
}
