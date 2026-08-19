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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(async () => {
    setError("");
    try {
      setComercio(await api("/api/mi-comercio"));
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

  return { comercio, cargando, error, guardando, recargar, guardar, crear };
}
