import React from "react";

import { useAuth } from "../context/AuthContext.jsx";
import {
  antiguedadEnTexto,
  CLASE_POR_ESTADO_RIO,
  diaDe,
  embarcacionPorClave,
  formatearHora,
  nombreDeDia,
  rumbo,
} from "./constantes.js";
import { useRio } from "./ContextoRio.jsx";

const redondear = (n) => (typeof n === "number" ? Math.round(n) : null);

/**
 * De dónde sopla el viento, como flecha.
 *
 * La flecha apunta hacia el origen, como una veleta: con viento del sudeste
 * apunta al sudeste. Es lo que se pregunta antes de salir —"¿de dónde me va a
 * venir?"— y se lee de un vistazo, cosa que "ESE" no.
 *
 * Open-Meteo ya entrega la dirección en convención meteorológica (de dónde
 * sopla), así que el ángulo se usa tal cual: la flecha base apunta al norte y
 * se la rota esos grados en sentido horario.
 */
function FlechaViento({ grados }) {
  const letras = rumbo(grados);
  if (grados === null || grados === undefined) return <span className="clima-fila-direccion">—</span>;

  return (
    <span className="clima-fila-direccion" title={`Viento del ${letras}`} aria-label={`Viento del ${letras}`}>
      <svg viewBox="0 0 24 24" width="17" height="17" style={{ transform: `rotate(${grados}deg)` }} aria-hidden="true">
        <path
          d="M12 3 L12 21 M12 3 L7 9 M12 3 L17 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Dato({ etiqueta, valor, unidad }) {
  return (
    <div className="clima-dato">
      <span className="clima-dato-valor">
        {valor ?? "—"}
        {valor !== null && valor !== undefined && unidad && (
          <span className="clima-dato-unidad"> {unidad}</span>
        )}
      </span>
      <span className="clima-dato-etiqueta">{etiqueta}</span>
    </div>
  );
}

/**
 * Una fila por hora, con la barra pintada según el veredicto.
 *
 * La barra es la lectura rápida: se recorre el día con la vista buscando dónde
 * deja de estar en verde, que es la pregunta real ("¿hasta qué hora puedo
 * estar afuera?"). El número exacto está al lado para quien lo quiera.
 */
function FilaHora({ hora, maximo }) {
  const ancho = maximo > 0 ? Math.max((hora.viento_kmh ?? 0) / maximo, 0.04) : 0;
  const hayRafaga = hora.rafagas_kmh > hora.viento_kmh;

  return (
    <div className="clima-fila">
      <span className="clima-fila-hora">{formatearHora(hora.hora)}</span>
      <span className="clima-fila-barra-fondo">
        <span
          className={`clima-fila-barra ${CLASE_POR_ESTADO_RIO[hora.estado] ?? "sin-datos"}`}
          style={{ width: `${ancho * 100}%` }}
        />
      </span>
      <span className="clima-fila-viento">
        {redondear(hora.viento_kmh) ?? "—"}
        {hayRafaga && <span className="clima-fila-rafaga"> / {redondear(hora.rafagas_kmh)}</span>}
      </span>
      <FlechaViento grados={hora.direccion_grados} />
    </div>
  );
}

export default function ClimaNauta() {
  const { usuario } = useAuth();
  // El mismo pronostico que muestra el cartel del mapa, literalmente el mismo
  // objeto: por eso no pueden decir cosas distintas (ver ContextoRio.jsx).
  const { clima, cargandoClima, errorClima, despertando } = useRio();

  // `clima` puede existir aunque `errorClima` este en true: el reintento
  // automatico marca el error apenas falla un intento, y no tiene sentido
  // tirar a la basura el pronostico que ya se habia cargado. Se prefiere
  // siempre mostrar el dato que haya.
  if (cargandoClima && !clima) return <div className="estado">Consultando el pronóstico…</div>;
  // Mientras el servidor arranca no hay error que reportar todavia: hay que
  // esperar. Decir "no pudimos" ahi manda a recargar a alguien que solo tenia
  // que aguantar treinta segundos.
  if (despertando) {
    return (
      <div className="estado">
        Estamos despertando el servidor. Puede tardar hasta un minuto…
      </div>
    );
  }
  if (!clima) {
    return <div className="mensaje-error">No pudimos consultar el pronóstico ahora.</div>;
  }

  const { actual, estado_rio: estado, pronostico, umbrales_kmh: umbrales } = clima;
  // Dos motivos distintos para el mismo aviso: que el backend haya servido un
  // dato viejo (Open-Meteo no contesta) o que el ultimo refresco desde el
  // navegador haya fallado. En los dos casos lo que se ve puede no ser de
  // ahora, y quien decide salir al rio tiene que saberlo.
  const antiguedad = antiguedadEnTexto(clima.edad_min);
  const sinActualizar = clima.desactualizado || errorClima;
  const embarcacion = embarcacionPorClave(usuario?.tipo_embarcacion);
  const maximoViento = Math.max(...pronostico.map((h) => h.viento_kmh ?? 0), 1);

  return (
    <div className="clima-nauta">
      {/* Cuando Open-Meteo no contesta, el backend arma el "ahora" con la
          fila de la serie horaria que corresponde a esta hora — o sea, la
          prevision para el presente, no una medicion vencida (ver
          backend/clima.py: _formatear). Sigue habiendo que decirlo: no es lo
          mismo "el viento es" que "el viento previsto para esta hora es", y
          alguien decide salir al rio con esto. */}
      {sinActualizar && (
        <div className="aviso-clima-viejo">
          No pudimos conectarnos al servicio de pronóstico.{" "}
          {clima.actual_estimado
            ? `Lo que ves es la previsión para esta hora, calculada ${antiguedad}.`
            : antiguedad
              ? `Este es el último dato que tenemos, de ${antiguedad}.`
              : "Este es el último dato que pudimos traer."}
        </div>
      )}

      <div className={`clima-veredicto ${CLASE_POR_ESTADO_RIO[estado.estado] ?? "sin-datos"}`}>
        <strong>{estado.titulo}</strong>
        {estado.detalle && <span className="clima-veredicto-detalle">{estado.detalle}</span>}
        {embarcacion && (
          <span className="clima-veredicto-nota">
            Calibrado para {embarcacion.etiqueta.toLowerCase()}: se pone picado desde{" "}
            {umbrales.picado} km/h y conviene no salir desde {umbrales.muy_picado}.
          </span>
        )}
      </div>

      <div className="clima-tarjeta">
        <h3>Ahora</h3>
        <div className="clima-datos">
          <Dato etiqueta="Viento" valor={redondear(actual.viento_kmh)} unidad="km/h" />
          <Dato etiqueta="Ráfagas" valor={redondear(actual.rafagas_kmh)} unidad="km/h" />
          <Dato etiqueta="Dirección" valor={actual.direccion} />
          <Dato etiqueta="Temperatura" valor={redondear(actual.temperatura_c)} unidad="°" />
        </div>
      </div>

      <div className="clima-tarjeta">
        <h3>Próximas 48 horas</h3>

        {/* El encabezado no reusa .clima-fila-barra-fondo: esa clase mide 8px
            de alto con overflow oculto (es la pista de la barra), así que el
            texto "Viento" quedaba recortado a una franja. */}
        <div className="clima-encabezado">
          <span className="clima-fila-hora">Hora</span>
          <span className="clima-encabezado-viento">Viento</span>
          <span className="clima-fila-viento">km/h</span>
          <span className="clima-fila-direccion">Dir.</span>
        </div>

        {pronostico.map((hora, indice) => {
          // Separador cuando cambia el día: 48 horas seguidas sin cortes no
          // dejan ver dónde termina hoy y empieza mañana, que es justo lo que
          // se mira para decidir cuándo salir.
          const cambiaDia =
            indice === 0 || diaDe(hora.hora) !== diaDe(pronostico[indice - 1].hora);
          return (
            <React.Fragment key={hora.hora}>
              {cambiaDia && <div className="clima-separador-dia">{nombreDeDia(hora.hora)}</div>}
              <FilaHora hora={hora} maximo={maximoViento} />
            </React.Fragment>
          );
        })}
      </div>

      <p className="descripcion">
        Pronóstico de Open-Meteo para tu posición. Cuando hay dos números, el segundo
        son las ráfagas. La flecha apunta de dónde viene el viento.
      </p>
    </div>
  );
}
