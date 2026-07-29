import React from "react";

export default function Paginador({ paginaActual, totalPaginas, irAPagina, totalItems }) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="paginador">
      <button type="button" onClick={() => irAPagina(paginaActual - 1)} disabled={paginaActual === 1}>
        ‹ Anterior
      </button>
      <span>
        Página {paginaActual} de {totalPaginas}
        {typeof totalItems === "number" ? ` · ${totalItems} registros` : ""}
      </span>
      <button type="button" onClick={() => irAPagina(paginaActual + 1)} disabled={paginaActual === totalPaginas}>
        Siguiente ›
      </button>
    </div>
  );
}
