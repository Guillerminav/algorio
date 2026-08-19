import React, { useEffect, useState } from "react";

/**
 * Hacia dónde queda el lugar.
 *
 * La aguja apunta al destino RELATIVO A CÓMO ESTÁS PARADO cuando el navegador
 * da la orientación del aparato: si girás, la aguja se queda apuntando al
 * parador. Es lo que la hace usable arriba de una lancha — una flecha que
 * apunta "al noreste" obliga a saber dónde queda el noreste.
 *
 * Sin sensor (una computadora de escritorio, o el permiso sin dar en iPhone)
 * cae al modo norte arriba: la aguja marca el rumbo absoluto y abajo queda la
 * letra de la rosa. No es un error, es el modo degradado — y en la web, que se
 * usa para planificar antes de salir, suele alcanzar.
 */
export default function Brujula({ grados, letras, tamano = 72 }) {
  const [orientacion, setOrientacion] = useState(null);
  // iOS 13+ exige pedir permiso desde un gesto del usuario. Solo se ofrece el
  // botón cuando el navegador realmente lo pide; en Android y escritorio el
  // evento llega sin preguntar nada.
  const [pidePermiso, setPidePermiso] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.DeviceOrientationEvent) return undefined;

    if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
      setPidePermiso(true);
      return undefined;
    }
    return escuchar(setOrientacion);
  }, []);

  async function activar() {
    try {
      const respuesta = await window.DeviceOrientationEvent.requestPermission();
      if (respuesta === "granted") {
        setPidePermiso(false);
        escuchar(setOrientacion);
      }
    } catch {
      // Si lo rechaza, queda el modo norte arriba.
    }
  }

  if (grados === null || grados === undefined) return null;

  const norteArriba = orientacion === null;
  const anguloAguja = norteArriba ? grados : (grados - orientacion + 360) % 360;

  return (
    <div className="brujula-envoltorio">
      <div
        className="brujula"
        style={{ width: tamano, height: tamano }}
        role="img"
        aria-label={letras ? `El lugar queda al ${letras}` : "Rumbo al lugar"}
      >
        {/* La rosa gira con el aparato… */}
        <span
          className="brujula-rosa"
          style={{ transform: `rotate(${norteArriba ? 0 : -orientacion}deg)` }}
          aria-hidden="true"
        >
          N
        </span>

        {/* …y la aguja, con el destino. */}
        <svg
          className="brujula-aguja"
          viewBox="0 0 100 100"
          style={{ transform: `rotate(${anguloAguja}deg)` }}
          aria-hidden="true"
        >
          <path d="M50 16 L58 34 L50 30 L42 34 Z" fill="currentColor" />
          <line x1="50" y1="30" x2="50" y2="50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="50" r="4" fill="currentColor" />
        </svg>

        {letras && <span className="brujula-letras">{letras}</span>}
      </div>

      {pidePermiso && (
        <button type="button" className="brujula-permiso" onClick={activar}>
          Activar brújula
        </button>
      )}
    </div>
  );
}

/**
 * Escucha la orientación y devuelve el limpiador.
 *
 * `webkitCompassHeading` (Safari) ya viene como rumbo respecto del norte. En
 * el resto, `alpha` del evento `absolute` mide al revés —crece en sentido
 * antihorario— asi que se invierte. Sin `absolute`, `alpha` es relativo a
 * donde estaba el aparato al arrancar y no sirve como brújula: en ese caso no
 * se reporta nada y queda el modo norte arriba, que es preferible a una aguja
 * que apunta a cualquier lado con total confianza.
 */
function escuchar(alLeer) {
  const manejar = (evento) => {
    if (typeof evento.webkitCompassHeading === "number") {
      alLeer(evento.webkitCompassHeading);
      return;
    }
    if (evento.absolute && typeof evento.alpha === "number") {
      alLeer((360 - evento.alpha) % 360);
    }
  };

  const tipo = "ondeviceorientationabsolute" in window
    ? "deviceorientationabsolute"
    : "deviceorientation";
  window.addEventListener(tipo, manejar, true);
  return () => window.removeEventListener(tipo, manejar, true);
}
