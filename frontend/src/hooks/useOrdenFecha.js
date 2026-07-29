import { useMemo, useState } from "react";

// Orden por fecha (ascendente/descendente) para las tablas del dashboard.
// Todas las fuentes ya guardan fecha_boletin como "YYYY-MM-DD" (ver
// normalizacion.py), asi que comparar como string alcanza.
export function useOrdenFecha(items, campo = "fecha_boletin", ordenInicial = "desc") {
  const [orden, setOrden] = useState(ordenInicial);

  const itemsOrdenados = useMemo(() => {
    const copia = [...items];
    copia.sort((a, b) => {
      const valorA = a[campo] ?? "";
      const valorB = b[campo] ?? "";
      const comparacion = valorA < valorB ? -1 : valorA > valorB ? 1 : 0;
      return orden === "asc" ? comparacion : -comparacion;
    });
    return copia;
  }, [items, campo, orden]);

  function alternarOrden() {
    setOrden((o) => (o === "asc" ? "desc" : "asc"));
  }

  return { itemsOrdenados, orden, alternarOrden };
}
