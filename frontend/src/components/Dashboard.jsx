import React, { useState } from "react";

import DashboardGeneral from "./DashboardGeneral.jsx";
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

  return (
    <div>
      <nav className="subtabs">
        {SUBTABS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`subtab-boton${s.id === subtabActivo ? " activo" : ""}`}
            onClick={() => setSubtabActivo(s.id)}
          >
            {s.etiqueta}
          </button>
        ))}
      </nav>

      {subtabActivo === "general" && <DashboardGeneral />}
      {subtabActivo === "ina" && <TablaIna />}
      {subtabActivo === "prefectura" && <TablaPrefectura />}
      {subtabActivo === "yacyreta" && <TablaYacyreta />}
    </div>
  );
}
