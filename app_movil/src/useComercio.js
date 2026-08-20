import { useCallback, useEffect, useState } from "react";

import { useSesion } from "./sesion.jsx";

/**
 * La ficha de comercio de la cuenta, con su guardado.
 *
 * Cada pantalla del comerciante lo llama por su cuenta en vez de compartir un
 * contexto: son cuatro tabs que se visitan de a una y el dato es chico. A
 * cambio, cada una se refresca sola al entrar, que es lo que se quiere cuando
 * acabas de editar la ficha en otra pantalla.
 *
 * `comercio` en null significa "esta cuenta todavia no cargo su comercio", que
 * es un estado normal (el que dispara el asistente de alta) y no un error: el
 * backend devuelve null y no 404 justamente por eso.
 */
export function useComercio() {
  const { api } = useSesion();
  const [comercio, setComercio] = useState(null);
  // El pedido de propiedad sobre un POI que ya esta en el mapa. Viaja junto a
  // la ficha porque las pantallas necesitan las dos cosas para decidir que
  // mostrar: sin ficha PERO con reclamo pendiente no hay que ofrecer el alta
  // (ver src/SinComercio.jsx).
  const [reclamo, setReclamo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(async () => {
    setError("");
    try {
      // En paralelo: son dos consultas chicas e independientes, y encadenarlas
      // duplicaria la espera de la unica pantalla que se ve al entrar.
      const [ficha, pedido] = await Promise.all([
        api("/api/mi-comercio"),
        // El reclamo no es critico: si falla, se sigue con la ficha. Sin este
        // catch, un error acá dejaría la pantalla en blanco aunque el comercio
        // hubiera cargado bien.
        api("/api/mi-comercio/reclamo").catch(() => null),
      ]);
      setComercio(ficha);
      setReclamo(pedido);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [api]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // PUT parcial: solo lo que cambio. Se guarda a pedido y no en cada tecla
  // porque cambiar el nombre o la ubicacion devuelve la ficha a moderacion
  // (ver backend/pois.actualizar), y hacerlo mientras se escribe la sacaria
  // del mapa a mitad de una palabra.
  const guardar = useCallback(
    async (cambios) => {
      setGuardando(true);
      try {
        const actualizado = await api("/api/mi-comercio", {
          method: "PUT",
          body: JSON.stringify(cambios),
        });
        setComercio(actualizado);
        return actualizado;
      } finally {
        setGuardando(false);
      }
    },
    [api],
  );

  // El tablero de cruces tiene su propio endpoint y no viaja por el PUT de
  // arriba: es la unica edicion del panel que NO pasa por moderacion y que
  // nunca devuelve la ficha a 'pendiente' (ver backend/tablero.py).
  const guardarTablero = useCallback(
    async (cruces) => {
      setGuardando(true);
      try {
        const actualizado = await api("/api/mi-comercio/tablero", {
          method: "PUT",
          body: JSON.stringify({ cruces }),
        });
        setComercio(actualizado);
        return actualizado;
      } finally {
        setGuardando(false);
      }
    },
    [api],
  );

  // Un solo interruptor, publicado en el acto. No toca `guardando`: el boton
  // de guardar del editor no tiene por que apagarse porque alguien marco una
  // demora, que es otra operacion y se resuelve sola.
  const cambiarEstadoCruce = useCallback(
    async (cruceId, cuerpo) => {
      const actualizado = await api(
        `/api/mi-comercio/tablero/${encodeURIComponent(cruceId)}/estado`,
        { method: "POST", body: JSON.stringify(cuerpo) },
      );
      setComercio(actualizado);
      return actualizado;
    },
    [api],
  );

  const crear = useCallback(
    async (datos) => {
      const creado = await api("/api/mi-comercio", {
        method: "POST",
        body: JSON.stringify(datos),
      });
      setComercio(creado);
      return creado;
    },
    [api],
  );

  return {
    comercio, reclamo, cargando, error, guardando, recargar, guardar, crear,
    guardarTablero, cambiarEstadoCruce,
  };
}
