import { useEffect, useState } from "react";

// Pagina una lista ya cargada/filtrada en el cliente. Alcanza para el volumen
// actual de datos (un puñado de fuentes, una corrida diaria); si el historico
// crece mucho, el proximo paso seria paginar del lado del backend.
export function usePaginacion(items, porPagina = 50) {
  const [paginaActual, setPaginaActual] = useState(1);

  const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));

  // Si cambia el filtro o llegan datos nuevos, volver a la primera pagina
  // (evita quedar en una pagina que ya no existe).
  useEffect(() => {
    setPaginaActual(1);
  }, [items]);

  const inicio = (paginaActual - 1) * porPagina;
  const itemsDePagina = items.slice(inicio, inicio + porPagina);

  function irAPagina(numero) {
    setPaginaActual(Math.min(Math.max(1, numero), totalPaginas));
  }

  return { itemsDePagina, paginaActual, totalPaginas, irAPagina };
}
