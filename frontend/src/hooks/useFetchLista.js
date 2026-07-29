import { useCallback, useEffect, useState } from "react";

import { pedirJSON } from "../api.js";

// Hook chico para el patron repetido "pedir una lista a la API y mostrar
// estado de carga/error" que usan Dashboard, Alertas y las tablas por fuente.
// `recargar` permite volver a pedir los mismos datos a demanda (ej. boton
// "Actualizar"), sin duplicar la logica de carga.
export function useFetchLista(url) {
  const [datos, setDatos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    pedirJSON(url)
      .then((d) => {
        if (!cancelado) setDatos(d ?? []);
      })
      .catch((e) => {
        if (!cancelado) setError(e);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [url]);

  useEffect(() => recargar(), [recargar]);

  return { datos, error, cargando, recargar };
}
