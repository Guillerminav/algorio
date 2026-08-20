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
  // Subirlo vuelve a disparar el efecto: es el reintento a mano.
  const [reintento, setReintento] = useState(0);
  const [cargandoClima, setCargandoClima] = useState(true);
  const [errorClima, setErrorClima] = useState(false);
  // El backend corre en el plan free de Render, que apaga el proceso a los 15
  // minutos sin trafico y tarda hasta un minuto en volver. Mientras arranca, el
  // gateway corta y devuelve 502/504 — no es que el pronostico no exista, es
  // que el servidor todavia no esta. Decir "no pudimos consultar el
  // pronostico" ahi es mentir sobre que pasa y hace que el usuario crea que
  // esta roto (que es exactamente lo que paso).
  const [despertando, setDespertando] = useState(false);

  const reintentarClima = useCallback(() => setReintento((n) => n + 1), []);

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

  // El pronóstico se pide una vez por posición y lo consumen las dos pantallas.
  // Sin ubicación se usa el centro por defecto, para que el cartel diga algo en
  // vez de quedar vacío.
  //
  // REINTENTA, y no es un lujo: antes, si el pedido fallaba una sola vez, el
  // efecto no se volvía a disparar hasta que cambiara la posición. Un corte de
  // señal de tres segundos —o el backend reiniciándose— dejaba "Sin datos de
  // viento" clavado hasta recargar la página. Justo el escenario de alguien en
  // el agua, que es para quien está hecho esto.
  //
  // Los cuatro intentos van de 4 a 45 segundos, o sea que el ultimo cae cerca
  // del minuto y medio. No es exageracion: un arranque en frio de Render tarda
  // ~50 s, y con la tanda anterior —que se rendia a los 46 s— el ultimo
  // intento caia justo antes de que el servidor estuviera listo. Se daba por
  // vencido en el peor momento posible.
  useEffect(() => {
    let cancelado = false;
    let temporizador;
    const esperas = [4000, 12000, 30000, 45000];

    function pedir(intento = 0) {
      const [lat, lon] = posicion ? [posicion.lat, posicion.lon] : CENTRO_POR_DEFECTO;
      setCargandoClima(true);
      setErrorClima(false);
      pedirJSON(`/api/clima?lat=${lat}&lon=${lon}`)
        .then((d) => {
          if (cancelado) return;
          setClima(d);
          setCargandoClima(false);
          setDespertando(false);
        })
        .catch((e) => {
          if (cancelado) return;
          const quedanIntentos = intento < esperas.length;
          // 502 y 504 los devuelve el gateway cuando Render todavia no
          // levanto; el 503 lo devuelve NUESTRO backend cuando no consiguio
          // pronostico (ver backend/clima.py) y ese si es un error del dato.
          setDespertando([502, 504].includes(e?.status) && quedanIntentos);
          setCargandoClima(false);
          setErrorClima(true);
          if (quedanIntentos) {
            temporizador = setTimeout(() => !cancelado && pedir(intento + 1), esperas[intento]);
          }
        });
    }

    pedir();
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [posicion, reintento]);

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
      despertando,
      reintentarClima,
    }),
    [posicion, permitido, buscando, pedirUbicacion, clima, cargandoClima, errorClima,
     despertando, reintentarClima],
  );

  return <ContextoRio.Provider value={valor}>{children}</ContextoRio.Provider>;
}

export function useRio() {
  const contexto = useContext(ContextoRio);
  if (!contexto) throw new Error("useRio() debe usarse dentro de <ProveedorRio>.");
  return contexto;
}
