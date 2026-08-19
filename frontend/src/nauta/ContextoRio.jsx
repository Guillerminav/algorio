import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { pedirJSON } from "../api.js";
import { CENTRO_POR_DEFECTO } from "../mapaSatelital.js";

const ContextoRio = createContext(null);

// Precisión baja a propósito: para saber qué parador tenés cerca alcanzan
// ~100 m, y pedir alta enciende el GPS del celular sin necesidad.
const OPCIONES_GPS = { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 };

/**
 * Ubicación y clima, compartidos por todas las pantallas del nauta.
 *
 * POR QUÉ ESTO ES UN CONTEXTO Y NO UN HOOK POR PANTALLA:
 *
 * Antes cada pantalla llamaba a `useUbicacion()` por su cuenta. Cada llamada
 * es una instancia distinta del hook, con su propio estado y su propio pedido
 * de geolocalización: el mapa podía resolver la posición y la pantalla de
 * clima todavía no (o al revés), y entonces cada una pedía el pronóstico de
 * una coordenada diferente. El resultado era el que se ve: el cartel del mapa
 * decía una cosa y la sección Clima otra, sobre el mismo río y al mismo
 * tiempo.
 *
 * Con un solo proveedor arriba, hay una sola posición y un solo pronóstico. No
 * es que ahora se sincronicen: es que no pueden diferir, porque son el mismo
 * objeto.
 */
export function ProveedorRio({ children }) {
  const [posicion, setPosicion] = useState(null);
  const [permitido, setPermitido] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const [clima, setClima] = useState(null);
  const [cargandoClima, setCargandoClima] = useState(true);
  const [errorClima, setErrorClima] = useState(false);

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
      OPCIONES_GPS,
    );
  }, []);

  useEffect(() => {
    pedirUbicacion();
  }, [pedirUbicacion]);

  // El pronóstico se pide una sola vez por posición y lo consumen las dos
  // pantallas. Sin ubicación se usa el centro por defecto, para que el cartel
  // diga algo en vez de quedar vacío.
  useEffect(() => {
    let cancelado = false;
    const [lat, lon] = posicion ? [posicion.lat, posicion.lon] : CENTRO_POR_DEFECTO;
    setCargandoClima(true);
    setErrorClima(false);
    pedirJSON(`/api/clima?lat=${lat}&lon=${lon}`)
      .then((d) => !cancelado && setClima(d))
      .catch(() => !cancelado && setErrorClima(true))
      .finally(() => !cancelado && setCargandoClima(false));
    return () => {
      cancelado = true;
    };
  }, [posicion]);

  const valor = useMemo(
    () => ({
      posicion,
      permitido,
      buscando,
      pedirUbicacion,
      centro: posicion ? [posicion.lat, posicion.lon] : CENTRO_POR_DEFECTO,
      clima,
      cargandoClima,
      errorClima,
    }),
    [posicion, permitido, buscando, pedirUbicacion, clima, cargandoClima, errorClima],
  );

  return <ContextoRio.Provider value={valor}>{children}</ContextoRio.Provider>;
}

export function useRio() {
  const contexto = useContext(ContextoRio);
  if (!contexto) throw new Error("useRio() debe usarse dentro de <ProveedorRio>.");
  return contexto;
}
