import { useCallback, useEffect, useState } from "react";

import { CENTRO_POR_DEFECTO } from "../mapaSatelital.js";

// Precisión baja a propósito: para saber qué parador tenés cerca alcanzan
// ~100 m, y pedir alta enciende el GPS del celular sin necesidad.
const OPCIONES = { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 };

/**
 * Ubicación del usuario por geolocalización del navegador.
 *
 * Nunca falla hacia afuera: la web tiene que funcionar igual sin permiso (se
 * ven los lugares, no la distancia a ellos), así que negarlo no es un error
 * sino un modo de uso. `permitido` arranca en null = todavía no se sabe.
 *
 * Devuelve además `pedirUbicacion` para volver a intentarlo a pedido. Hace
 * falta porque el primer intento puede fallar por mil razones —el usuario
 * todavía no había decidido, estaba bajo techo, se le fue la señal— y sin una
 * forma de reintentar la única salida era recargar la página.
 *
 * Ojo: los navegadores solo dan geolocalización sobre HTTPS o en localhost.
 * En producción no es problema (Vercel es HTTPS), pero probarlo desde otra
 * máquina por IP en HTTP va a caer siempre en el centro por defecto.
 */
export function useUbicacion() {
  const [posicion, setPosicion] = useState(null);
  const [permitido, setPermitido] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const pedirUbicacion = useCallback(() => {
    if (!navigator.geolocation) {
      setPermitido(false);
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (lectura) => {
        setPosicion({ lat: lectura.coords.latitude, lon: lectura.coords.longitude });
        setPermitido(true);
        setBuscando(false);
      },
      () => {
        setPermitido(false);
        setBuscando(false);
      },
      OPCIONES,
    );
  }, []);

  useEffect(() => {
    pedirUbicacion();
  }, [pedirUbicacion]);

  const centro = posicion ? [posicion.lat, posicion.lon] : CENTRO_POR_DEFECTO;
  return { posicion, permitido, buscando, centro, pedirUbicacion };
}
