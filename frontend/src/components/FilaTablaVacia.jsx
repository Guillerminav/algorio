import React from "react";

// Fila que ocupa la tabla cuando no hay nada que listar. Distingue "todavia
// no llegaron los datos" de "llegaron y no hay nada": antes las tablas
// mostraban directamente el mensaje de vacio mientras cargaban, y por un
// instante afirmaban algo falso ("no se corrio la fuente" cuando en realidad
// se estaba pidiendo).
export default function FilaTablaVacia({ colSpan, cargando, mensaje }) {
  return (
    <tr>
      <td className="vacio" colSpan={colSpan}>
        {cargando ? "Cargando…" : mensaje}
      </td>
    </tr>
  );
}
