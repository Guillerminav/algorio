import React, { useEffect, useState } from "react";

import {
  aHora,
  aMinutos,
  estadoCruce,
  estadoDeSalida,
  faltanEnTexto,
  frecuenciaEnTexto,
  minutosAhoraAR,
  precioEnTexto,
  proximaSalida,
  salidasDe,
} from "../tablero.js";

// Cada cuánto se vuelve a mirar el reloj. Medio minuto: el dato que cambia es
// "en 12 min", que se lee con esa precisión. Cada segundo sería un re-render
// por segundo en la única pantalla que alguien deja abierta mientras espera.
const MS_REFRESCO = 30_000;

/** Minuto del día en Argentina, refrescado solo. */
function useMinutoAR() {
  const [minuto, setMinuto] = useState(() => minutosAhoraAR());
  useEffect(() => {
    const id = setInterval(() => setMinuto(minutosAhoraAR()), MS_REFRESCO);
    return () => clearInterval(id);
  }, []);
  return minuto;
}

function Dato({ etiqueta, children }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <div className="tablero-dato">
      <span className="tablero-dato-etiqueta">{etiqueta}</span>
      <span className="tablero-dato-valor">{children}</span>
    </div>
  );
}

/**
 * Todas las salidas del día, cada una con lo suyo.
 *
 * Es la parte que hace que esto sea un tablero de aeropuerto y no un cartel de
 * horarios: ahí la demora es de un vuelo, no de la aerolínea. Una salida que
 * el lanchero marcó aparte lleva su etiqueta; las que heredan el estado del
 * recorrido no repiten nada, porque el chip de arriba ya lo dijo.
 */
function Salidas({ cruce }) {
  const salidas = salidasDe(cruce);
  if (salidas.length === 0) return null;

  return (
    <ul className="tablero-salidas">
      {salidas.map((salida) => {
        const estado = estadoDeSalida(cruce, salida);
        const demora = estado.clave === "demorado" ? (estado.demora_min ?? 0) : 0;
        const corrida = demora > 0 ? aHora(aMinutos(salida.hora) + demora) : null;

        return (
          <li
            key={salida.hora}
            className={`tablero-salida estado-${estado.clave}${estado.propio ? " propia" : ""}`}
            style={{ "--tono-estado": estado.color }}
          >
            <span className={corrida ? "tablero-salida-vieja" : "tablero-salida-hora"}>
              {salida.hora}
            </span>
            {corrida && <span className="tablero-salida-hora">{corrida}</span>}
            {/* Solo si la marca es de esta salida: repetir el estado del
                recorrido en las quince filas lo convertiría en ruido. */}
            {estado.propio && estado.alterado && (
              <span className="tablero-salida-estado">{estado.etiqueta}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FilaCruce({ cruce, ahoraMin }) {
  const estado = estadoCruce(cruce.estado);
  // Devuelve null cuando ninguna salida sale hoy —porque el recorrido está
  // cancelado, o porque lo están todas una por una—, así que no hace falta
  // preguntarlo aparte: un cartel que dice "sale 14:00" al lado de
  // "CANCELADO" se contradice a sí mismo.
  const sale = proximaSalida(cruce, ahoraMin);

  return (
    <li className={`tablero-fila estado-${cruce.estado ?? "a_horario"}`}>
      <div className="tablero-fila-cabecera">
        <div className="tablero-destino">
          <strong>{cruce.destino}</strong>
          {cruce.origen && <span>desde {cruce.origen}</span>}
        </div>
        <span className="tablero-estado" style={{ "--tono-estado": estado.color }}>
          {estado.etiqueta}
          {cruce.estado === "demorado" && cruce.demora_min ? ` ${cruce.demora_min}′` : ""}
        </span>
      </div>

      <div className="tablero-datos">
        <Dato etiqueta="Próxima">
          {sale ? (
            <>
              {/* La hora de cartel tachada y al lado la estimada: es como se
                  lee de un vistazo que la salida se corrió, sin tener que
                  restar nada. */}
              <span className={sale.estimada ? "tablero-hora-vieja" : "tablero-hora"}>
                {sale.hora}
              </span>
              {sale.estimada && <span className="tablero-hora">{sale.estimada}</span>}
              <span className="tablero-falta">
                {sale.manana ? "mañana" : faltanEnTexto(sale.faltan)}
              </span>
            </>
          ) : (
            <span className="tablero-hora tablero-hora-nula">—</span>
          )}
        </Dato>

        <Dato etiqueta="Frecuencia">{frecuenciaEnTexto(cruce.frecuencia_min)}</Dato>
        <Dato etiqueta="Precio">{precioEnTexto(cruce.precio)}</Dato>
        <Dato etiqueta="Últ. regreso">{cruce.ultimo_regreso}</Dato>
        <Dato etiqueta="Duración">
          {cruce.duracion_min ? `${cruce.duracion_min} min` : null}
        </Dato>
      </div>

      {cruce.nota && <p className="tablero-nota">{cruce.nota}</p>}

      <Salidas cruce={cruce} />
    </li>
  );
}

/**
 * El tablero de cruces, como el de salidas de un aeropuerto.
 *
 * Contesta de un vistazo las cuatro preguntas de alguien parado en el muelle:
 * a qué hora sale la próxima, cada cuánto hay, cuánto cuesta y hasta qué hora
 * puede volver. El estado —a horario, demorado, cancelado— lo mueve el
 * lanchero desde su panel y se publica en el acto, sin pasar por moderación.
 *
 * La hora que manda es la de Argentina y no la del dispositivo (ver
 * minutosAhoraAR): el cartel es el del muelle, no el del que lo mira.
 */
export default function TableroCruces({ cruces }) {
  const ahoraMin = useMinutoAR();
  if (!cruces?.length) return null;

  return (
    <section className="tablero-cruces">
      <header className="tablero-cabecera">
        <h3>Cruces</h3>
        <span className="tablero-reloj" title="Hora de Argentina">
          {aHora(ahoraMin)}
        </span>
      </header>

      <ul className="tablero-filas">
        {cruces.map((cruce) => (
          <FilaCruce key={cruce.id} cruce={cruce} ahoraMin={ahoraMin} />
        ))}
      </ul>

    </section>
  );
}
