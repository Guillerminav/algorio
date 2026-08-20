import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  enDecimal,
  enGradosMinutos,
  enlaceMapa,
  enlaceWhatsAppTexto,
  horaCorta,
  mensajeDeEmergencia,
} from "../coordenadas.js";

// Precisión alta y sin caché, al revés que el resto de la app.
//
// Para saber qué parador tenés cerca alcanzan 100 m y una posición de hace
// cinco minutos (ver OPCIONES_GPS en nauta/ContextoRio.jsx). Acá no: el que
// sale a buscarte barre el radio que le digas, y una posición vieja es una
// posición de donde estabas antes de quedarte a la deriva. `maximumAge: 0`
// fuerza una lectura nueva aunque el navegador tenga una guardada.
const OPCIONES_GPS = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

/**
 * "Compartir mi ubicación": el botón para cuando se rompió el motor.
 *
 * El problema real que resuelve: por radio o por teléfono es imposible
 * explicar dónde estás en el río. No hay calles, no hay esquinas, y "frente a
 * la isla grande" no es una posición. Esto convierte eso en dos datos exactos
 * y un link.
 *
 * Las coordenadas se muestran en pantalla ADEMÁS de mandarse por WhatsApp, y
 * en dos notaciones. No es redundancia: puede que no haya datos para WhatsApp
 * pero sí señal de voz, o que del otro lado esté Prefectura por VHF — y ahí lo
 * que hace falta es leer grados y minutos en voz alta, no un link.
 *
 * No usa `useRio()` a propósito: ese contexto solo existe en los shells del
 * nauta y del comerciante, y este botón tiene que funcionar en los tres.
 */
export default function BotonSOS({ onAbrir }) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const vigilancia = useRef(null);

  const detener = useCallback(() => {
    if (vigilancia.current !== null) {
      navigator.geolocation.clearWatch(vigilancia.current);
      vigilancia.current = null;
    }
  }, []);

  /**
   * Se usa `watchPosition` y no `getCurrentPosition`: el primer fix del GPS
   * suele venir con ±1000 m de la red de celdas y afinar a ±10 m recién a los
   * segundos. Con una sola lectura se manda la mala; mirando el flujo, la
   * pantalla va mejorando el número sola mientras la persona lee.
   */
  const ubicar = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Este dispositivo no puede darnos la ubicación.");
      return;
    }
    detener();
    setError("");
    setBuscando(true);
    setPosicion(null);
    vigilancia.current = navigator.geolocation.watchPosition(
      (lectura) => {
        setPosicion({
          lat: lectura.coords.latitude,
          lon: lectura.coords.longitude,
          precision: lectura.coords.accuracy,
          hora: horaCorta(),
        });
        setBuscando(false);
        // Por debajo de 25 m ya no vale seguir escuchando: es mejor de lo que
        // necesita quien viene a buscarte y el GPS prendido come batería, que
        // a la deriva es un recurso.
        if (lectura.coords.accuracy && lectura.coords.accuracy <= 25) detener();
      },
      (fallo) => {
        setBuscando(false);
        setError(
          fallo.code === fallo.PERMISSION_DENIED
            ? "No nos diste permiso de ubicación. Activalo en el navegador para poder compartirla."
            : "No pudimos tomar tu ubicación. Probá salir a cielo abierto y reintentar.",
        );
      },
      OPCIONES_GPS,
    );
  }, [detener]);

  useEffect(() => {
    if (abierto) ubicar();
    return detener;
  }, [abierto, ubicar, detener]);

  useEffect(() => {
    if (!abierto) return undefined;
    const alPresionarEscape = (e) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alPresionarEscape);
    return () => document.removeEventListener("keydown", alPresionarEscape);
  }, [abierto]);

  const texto = posicion ? mensajeDeEmergencia(posicion) : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("No pudimos copiar. Podés seleccionar el texto a mano.");
    }
  }

  return (
    <>
      <button
        type="button"
        className="boton-sos"
        onClick={() => {
          onAbrir?.();
          setAbierto(true);
        }}
      >
        <span className="boton-sos-icono" aria-hidden="true">🆘</span>
        <span className="boton-sos-texto">
          <strong>Compartir mi ubicación</strong>
          <span>Para pedir auxilio o remolque</span>
        </span>
      </button>

      {abierto && (
        <div className="sos-fondo" onClick={() => setAbierto(false)}>
          <div
            className="sos-panel"
            role="dialog"
            aria-label="Compartir mi ubicación"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sos-encabezado">
              <h2>Tu posición ahora</h2>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar">✕</button>
            </div>

            {buscando && !posicion && (
              <p className="estado">Tomando la posición del GPS… puede tardar unos segundos.</p>
            )}

            {error && <div className="mensaje-error">{error}</div>}

            {posicion && (
              <>
                {/* Grados y minutos primero y en grande: es lo que se lee por
                    radio, y por radio no se puede tocar un link. */}
                <div className="sos-coordenadas">
                  <span>{enGradosMinutos(posicion.lat, true)}</span>
                  <span>{enGradosMinutos(posicion.lon, false)}</span>
                </div>
                <p className="sos-decimal">{enDecimal(posicion.lat, posicion.lon)}</p>

                <p className="sos-precision">
                  {/* Se dice la precisión siempre, no solo cuando es mala: el
                      que sale a buscarte barre ese radio. */}
                  Precisión del GPS: ±{Math.round(posicion.precision)} m · tomada a las{" "}
                  {posicion.hora}
                  {buscando && " · afinando…"}
                </p>

                <div className="sos-acciones">
                  <a
                    className="sos-whatsapp"
                    href={enlaceWhatsAppTexto(texto)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Enviar por WhatsApp
                  </a>
                  <button type="button" className="boton-secundario" onClick={copiar}>
                    {copiado ? "¡Copiado!" : "Copiar todo"}
                  </button>
                  <a
                    className="boton-secundario"
                    href={enlaceMapa(posicion.lat, posicion.lon)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver en el mapa
                  </a>
                </div>

                <button type="button" className="sos-reintentar" onClick={ubicar}>
                  Volver a tomar la posición
                </button>
              </>
            )}

            {!posicion && !buscando && (
              <button type="button" onClick={ubicar}>Reintentar</button>
            )}

            {/* Los canales que no dependen de nosotros. Van al final y como
                dato, no como botón: llamar al 106 desde acá abriría el
                marcador y en el río, sin señal de datos pero con señal de voz,
                el número escrito es más útil que un enlace que puede fallar. */}
            <p className="sos-prefectura">
              Emergencias náuticas: <strong>106</strong> (Prefectura Naval) · canal VHF{" "}
              <strong>16</strong>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
