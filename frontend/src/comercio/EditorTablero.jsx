import React, { useEffect, useMemo, useState } from "react";

import {
  DIAS,
  ESTADOS_CRUCE,
  ESTADOS_SALIDA,
  aHora,
  aMinutos,
  diaAR,
  estadoCruce,
  estadoDeSalida,
  faltanEnTexto,
  frecuenciaEnTexto,
  precioEnTexto,
  proximaSalida,
  salidasDe,
} from "../tablero.js";

// Las demoras que se cargan de verdad. Un campo libre obligaría a tipear un
// número con una mano desde el muelle; con una lista es un toque, y "23
// minutos" no es un dato más honesto que "media hora".
const DEMORAS = [10, 15, 20, 30, 45, 60, 90, 120];

// Fila nueva del editor. `_nueva` marca las que todavía no existen en el
// servidor: son las únicas cuyo interruptor no publica nada hasta guardar,
// porque no hay a qué cruce aplicárselo.
const nuevoCruce = () => ({
  _clave: `nuevo-${Math.random().toString(36).slice(2, 8)}`,
  _nueva: true,
  destino: "",
  origen: "",
  salidas: Object.fromEntries(DIAS.map((d) => [d.clave, []])),
  estados_salida: {},
  frecuencia_min: null,
  precio: null,
  duracion_min: null,
  ultimo_regreso: "",
  estado: "a_horario",
  demora_min: null,
  nota: "",
});

const aNumero = (texto) => {
  const limpio = String(texto).replace(/[^\d.]/g, "");
  return limpio === "" ? null : Number(limpio);
};

// "7" y "7:5" se acomodan solos, igual que en el backend (tablero._hora). Lo
// que no se entiende se deja como está: lo normaliza el servidor al guardar.
const normalizarHora = (valor) => {
  const minutos = aMinutos(valor);
  return minutos === null ? String(valor).trim() : aHora(minutos);
};

/**
 * La lista de horas de un día: ordenada, sin repetidas y sin lo que no es hora.
 *
 * Devuelve strings y no objetos: la planilla es solo el plan (qué hora sale) y
 * el estado de cada salida vive aparte, en `estados_salida`. Mezclarlos
 * obligaba a decidir si «el de las 09:30 está demorado» se refería al 09:30 de
 * todos los martes o al de hoy — y siempre es al de hoy.
 */
const ordenarHoras = (horas) =>
  [...new Set((horas ?? []).map(normalizarHora))]
    .filter((hora) => aMinutos(hora) !== null)
    .sort((a, b) => aMinutos(a) - aMinutos(b));

/**
 * La aclaración del lanchero («río picado, sale del muelle chico»).
 *
 * Va contra un estado local y se manda al salir del campo, no en cada tecla:
 * cada cambio de nota es un request que además se publica en el acto. El
 * estado local existe —en vez de un campo no controlado— para que el campo
 * siga a la nota cuando cambia del otro lado: al guardarse, o al caducar el
 * estado y volver a null.
 */
function CampoNota({ nota, publicando, onCambiar }) {
  const [texto, setTexto] = useState(nota ?? "");

  useEffect(() => {
    setTexto(nota ?? "");
  }, [nota]);

  return (
    <input
      type="text"
      className="tablero-nota-campo"
      maxLength={140}
      placeholder="Aclaración para el pasajero (opcional): «río picado, sale del muelle chico»"
      value={texto}
      disabled={publicando}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto !== (nota ?? "")) onCambiar({ nota: texto });
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/** La botonera de estados, con su demora. La comparten los dos niveles. */
function Botonera({ opciones, actual, demora, publicando, etiqueta, onCambiar }) {
  const definicion = estadoCruce(actual);

  return (
    <>
      <div className="tablero-botonera" role="group" aria-label={etiqueta}>
        {opciones.map((estado) => {
          const activo = actual === estado.clave;
          return (
            <button
              key={estado.clave}
              type="button"
              className={`tablero-boton-estado${activo ? " activo" : ""}`}
              style={{ "--tono-estado": estado.color }}
              aria-pressed={activo}
              title={estado.ayuda}
              disabled={publicando}
              onClick={() => onCambiar({ estado: estado.clave })}
            >
              {estado.etiqueta}
            </button>
          );
        })}
      </div>

      {definicion.pideDemora && (
        <label className="tablero-demora">
          <span>¿Cuánto?</span>
          <select
            value={demora ?? ""}
            disabled={publicando}
            onChange={(e) => onCambiar({ demora_min: aNumero(e.target.value) })}
          >
            <option value="">Sin precisar</option>
            {DEMORAS.map((minutos) => (
              <option key={minutos} value={minutos}>
                {minutos} min
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

/**
 * Las salidas del cruce: la planilla de la semana y el estado de las de hoy.
 *
 * Son dos cosas distintas y por eso se cargan distinto:
 *
 * - La PLANILLA: los horarios de cada día. Casi ningún lanchero cruza igual un
 *   martes que un domingo, así que se carga por día, con un botón para repetir
 *   el mismo en toda la semana (que es el caso más común y, sin él, son siete
 *   cargas iguales). Los días que ya tienen horarios quedan marcados con su
 *   cuenta de salidas: de un vistazo se ve qué días sale la lancha a la isla y
 *   cuáles todavía están vacíos.
 * - El ESTADO de las salidas de HOY. Marcar el 09:30 del sábado un martes no
 *   significaría nada, así que los interruptores solo salen en el día de hoy.
 *
 * La hora se carga con el selector del sistema —el mismo que abre el celular
 * para poner una alarma— y un botón «+», en vez de un renglón de texto con
 * comas: desde el muelle, con una mano, tipear «07:00, 09:30, 12:00» sin
 * equivocarse es más trabajo que elegir la hora y tocar más. Cada hora cargada
 * queda como un chip con su ✕, que es también la única forma de sacarla.
 */
function EditorSalidas({ cruce, horasGuardadas, publicando, onCambiarCampo, onCambiarEstadoSalida }) {
  const hoy = diaAR();
  const [dia, setDia] = useState(hoy);
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState("");

  const planilla = cruce.salidas ?? {};
  const horas = ordenarHoras(planilla[dia]);
  const esHoy = dia === hoy;
  const nombreDia = DIAS.find((d) => d.clave === dia).etiqueta.toLowerCase();

  const guardarDia = (clave, lista) =>
    onCambiarCampo({ salidas: { ...planilla, [clave]: lista } });

  function agregar() {
    const hora = normalizarHora(nueva);
    if (aMinutos(hora) === null) return;
    if (!horas.includes(hora)) guardarDia(dia, ordenarHoras([...horas, hora]));
    setNueva("");
  }

  function quitar(hora) {
    guardarDia(
      dia,
      horas.filter((h) => h !== hora),
    );
    if (abierta === hora) setAbierta(null);
  }

  function repetirEnLaSemana() {
    onCambiarCampo({ salidas: Object.fromEntries(DIAS.map((d) => [d.clave, [...horas]])) });
  }

  // El panel de estado es de HOY: el chip de un sábado, mirado un martes, es
  // solo el plan.
  const seleccionada = esHoy
    ? (salidasDe(cruce, dia).find((s) => s.hora === abierta) ?? null)
    : null;
  const estadoSeleccionada = seleccionada ? estadoDeSalida(cruce, seleccionada) : null;
  const publicable = seleccionada ? horasGuardadas.has(seleccionada.hora) : false;

  return (
    <div className="tablero-salidas-bloque">
      <p className="tablero-salidas-ayuda">
        Los días marcados son los que salen viajes. Tocá uno para ver o cargar sus horarios.
      </p>

      <div className="tablero-dias" role="group" aria-label="Día de la semana">
        {DIAS.map((d) => {
          const cargado = (planilla[d.clave] ?? []).length;
          return (
            <button
              key={d.clave}
              type="button"
              className={`tablero-dia${d.clave === dia ? " activo" : ""}${cargado ? " cargado" : ""}`}
              aria-pressed={d.clave === dia}
              title={`${d.etiqueta}: ${cargado || "sin"} ${cargado === 1 ? "salida" : "salidas"}`}
              onClick={() => setDia(d.clave)}
            >
              <span className="tablero-dia-nombre">{d.corto}</span>
              <span className="tablero-dia-cuenta">{cargado || "–"}</span>
              {d.clave === hoy && <span className="tablero-dia-hoy" aria-label="hoy" />}
            </button>
          );
        })}
      </div>

      <div className="tablero-alta-hora">
        <label>
          <span>Salidas del {nombreDia}</span>
          <input
            type="time"
            step="300"
            value={nueva}
            disabled={publicando}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              agregar();
            }}
          />
        </label>
        <button
          type="button"
          className="tablero-mas"
          title="Agregar este horario"
          aria-label={`Agregar una salida del ${nombreDia}`}
          disabled={!nueva || publicando}
          onClick={agregar}
        >
          +
        </button>
      </div>

      {horas.length === 0 ? (
        <p className="tablero-sin-horarios">
          El {nombreDia} todavía no sale ninguna lancha. Elegí la hora y tocá «+».
        </p>
      ) : (
        <ul className="tablero-horarios">
          {horas.map((hora) => {
            const estado = esHoy
              ? estadoDeSalida(cruce, { hora, ...(cruce.estados_salida?.[hora] ?? {}) })
              : null;
            const marcada = Boolean(estado?.propio && estado.alterado);
            const activa = esHoy && abierta === hora;
            return (
              <li
                key={hora}
                className={`tablero-horario${marcada ? " marcada" : ""}${activa ? " abierta" : ""}`}
                style={estado ? { "--tono-estado": estado.color } : undefined}
              >
                {esHoy ? (
                  <button
                    type="button"
                    className="tablero-horario-hora"
                    aria-expanded={activa}
                    title="Cómo viene esta salida"
                    onClick={() => setAbierta(activa ? null : hora)}
                  >
                    <span>{hora}</span>
                    {marcada && (
                      <span className="tablero-horario-estado">
                        {estado.etiqueta}
                        {estado.clave === "demorado" && estado.demora_min
                          ? ` ${estado.demora_min}′`
                          : ""}
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="tablero-horario-hora">{hora}</span>
                )}
                <button
                  type="button"
                  className="tablero-horario-quitar"
                  aria-label={`Quitar la salida de las ${hora}`}
                  title="Quitar este horario"
                  onClick={() => quitar(hora)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="tablero-repetir"
        disabled={horas.length === 0}
        onClick={repetirEnLaSemana}
      >
        Repetir en toda la semana
      </button>

      {seleccionada && (
        <div className="tablero-panel-salida">
          <div className="tablero-panel-salida-cabecera">
            <strong>Salida de las {seleccionada.hora}</strong>
            <button
              type="button"
              className="boton-quitar"
              aria-label="Cerrar"
              onClick={() => setAbierta(null)}
            >
              ✕
            </button>
          </div>

          {/* La botonera arranca con el estado que la salida ya tiene y no en
              blanco: recién cargada eso es «A horario», que es la verdad y no
              una casilla sin contestar. Por eso tampoco hace falta un botón
              para deshacer una demora — se toca el estado que va. */}
          <Botonera
            opciones={ESTADOS_SALIDA}
            actual={estadoSeleccionada.clave}
            demora={estadoSeleccionada.demora_min}
            publicando={publicando}
            etiqueta={`Estado de la salida de las ${seleccionada.hora}`}
            onCambiar={(parcial) =>
              onCambiarEstadoSalida(seleccionada.hora, {
                estado: estadoSeleccionada.clave,
                demora_min: estadoSeleccionada.demora_min,
                ...parcial,
              })
            }
          />

          {!publicable && (
            <p className="tablero-panel-salida-aviso">Guardá primero para poder marcarla.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Cómo se va a ver esa fila en la ficha del nauta, en un renglón. */
function Vista({ cruce }) {
  const salida = proximaSalida(cruce);
  const partes = [
    salida
      ? `próxima ${salida.estimada ?? salida.hora}${
          salida.manana ? " (mañana)" : ` · ${faltanEnTexto(salida.faltan)}`
        }`
      : null,
    frecuenciaEnTexto(cruce.frecuencia_min),
    precioEnTexto(cruce.precio),
    cruce.ultimo_regreso ? `vuelve hasta ${cruce.ultimo_regreso}` : null,
  ].filter(Boolean);

  if (partes.length === 0) return null;
  return <p className="tablero-vista">Así lo ven: {partes.join(" · ")}</p>;
}

function FilaEditor({
  cruce,
  horasGuardadas,
  publicando,
  onCambiarCampo,
  onCambiarEstado,
  onCambiarEstadoSalida,
  onQuitar,
}) {
  return (
    <li className="tablero-editor-fila">
      <div className="tablero-editor-encabezado">
        {/* El destino en un titulo, ademas de en su campo: con seis cruces
            cargados hay que poder saber en cual estas parado sin leer el
            contenido de un input. */}
        <h4 className="tablero-editor-titulo">{cruce.destino?.trim() || "Cruce nuevo"}</h4>
        <button
          type="button"
          className="boton-quitar"
          aria-label={`Quitar el cruce a ${cruce.destino || "sin destino"}`}
          onClick={onQuitar}
        >
          ✕
        </button>
      </div>

      <div className="tablero-interruptores">
        <p className="tablero-interruptores-ayuda">Estado del recorrido</p>
        <Botonera
          opciones={ESTADOS_CRUCE}
          actual={cruce.estado ?? "a_horario"}
          demora={cruce.demora_min}
          publicando={publicando}
          etiqueta={`Estado de ${cruce.destino || "el cruce"}`}
          onCambiar={onCambiarEstado}
        />
        {estadoCruce(cruce.estado).alterado && (
          <CampoNota nota={cruce.nota} publicando={publicando} onCambiar={onCambiarEstado} />
        )}
      </div>

      <div className="tablero-editor-campos">
        <label>
          <span>Destino</span>
          <input
            type="text"
            maxLength={80}
            placeholder="Isla del Cerrito"
            value={cruce.destino ?? ""}
            onChange={(e) => onCambiarCampo({ destino: e.target.value })}
          />
          <small>A dónde cruza.</small>
        </label>

        <label>
          <span>Desde</span>
          <input
            type="text"
            maxLength={80}
            placeholder="Puerto Corrientes"
            value={cruce.origen ?? ""}
            onChange={(e) => onCambiarCampo({ origen: e.target.value })}
          />
          <small>De dónde sale. Opcional.</small>
        </label>

        {/* Los numericos van como type="text" con teclado numerico y no como
            type="number", por dos razones: es lo que ya hace el resto del panel
            (ver EditorCarta) y las flechitas del spinner son un control que
            ningun otro campo de la app tiene. */}
        <label>
          <span>Frecuencia</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="30"
            value={cruce.frecuencia_min ?? ""}
            onChange={(e) => onCambiarCampo({ frecuencia_min: aNumero(e.target.value) })}
          />
          <small>Cada cuántos minutos.</small>
        </label>

        <label>
          <span>Precio</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={9}
            placeholder="3500"
            value={cruce.precio ?? ""}
            onChange={(e) => onCambiarCampo({ precio: aNumero(e.target.value) })}
          />
          <small>Por persona, ida.</small>
        </label>

        <label>
          <span>Duración</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="25"
            value={cruce.duracion_min ?? ""}
            onChange={(e) => onCambiarCampo({ duracion_min: aNumero(e.target.value) })}
          />
          <small>Minutos de viaje.</small>
        </label>

        <label>
          <span>Último regreso</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="19:30"
            maxLength={5}
            value={cruce.ultimo_regreso ?? ""}
            onChange={(e) => onCambiarCampo({ ultimo_regreso: e.target.value })}
          />
          <small>La última vuelta del día.</small>
        </label>
      </div>

      <EditorSalidas
        cruce={cruce}
        horasGuardadas={horasGuardadas}
        publicando={publicando}
        onCambiarCampo={onCambiarCampo}
        onCambiarEstadoSalida={onCambiarEstadoSalida}
      />

      <Vista cruce={cruce} />
    </li>
  );
}

/**
 * El tablero de cruces, del lado del lanchero.
 *
 * La pantalla hace dos cosas con reglas distintas y eso está a la vista:
 *
 * - Los INTERRUPTORES de estado se publican solos, en el acto. Son lo que se
 *   toca todos los días y desde el muelle. Hay dos niveles: el del recorrido
 *   entero y el de cada salida, que lo pisa cuando hace falta.
 * - Los DATOS del cruce (horarios, frecuencia, precio) se guardan con el
 *   botón de abajo, como el resto del panel: se cargan una vez y se corrigen
 *   de vez en cuando, y guardar en cada tecla mandaría un request por letra.
 *
 * Ninguna de las dos pasa por moderación: el tablero no publica un lugar
 * nuevo en el mapa, actualiza un dato que envejece en minutos.
 */
export default function EditorTablero({
  comercio,
  onGuardarTablero,
  onCambiarEstadoCruce,
  onCambiarEstadoSalida,
  guardando,
}) {
  const [cruces, setCruces] = useState(() => comercio.cruces ?? []);
  const [publicando, setPublicando] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  // La ficha vuelve del servidor después de cada guardado y también después de
  // cada interruptor. Se re-sincroniza solo lo que el servidor decide —los
  // estados y su vigencia, en los dos niveles— y no la fila entera: pisar todo
  // acá borraría lo que el lanchero está escribiendo en otro campo.
  useEffect(() => {
    const guardados = new Map((comercio.cruces ?? []).map((c) => [c.id, c]));
    setCruces((previos) =>
      previos.map((cruce) => {
        const guardado = guardados.get(cruce.id);
        if (!guardado) return cruce;
        const { estado, demora_min, nota, estado_desde, estados_salida } = guardado;
        // Solo lo que decide el servidor: los estados y su vigencia. La
        // planilla no se pisa — borraria lo que se esta escribiendo.
        return { ...cruce, estado, demora_min, nota, estado_desde, estados_salida };
      }),
    );
  }, [comercio.cruces]);

  // Qué salidas conoce ya el servidor: son las únicas cuyo interruptor puede
  // publicarse suelto.
  const horasPorCruce = useMemo(
    () =>
      new Map(
        (comercio.cruces ?? []).map((c) => [c.id, new Set(salidasDe(c).map((s) => s.hora))]),
      ),
    [comercio.cruces],
  );

  const clave = (cruce) => cruce.id ?? cruce._clave;

  const hayCambios = useMemo(() => {
    // Los estados quedan afuera de la comparación en los dos niveles: los
    // mueven los interruptores, que se publican solos y no por este botón.
    const limpiar = (lista) =>
      (lista ?? []).map(
        ({ _clave, _nueva, estado, demora_min, nota, estado_desde, estados_salida, ...resto }) => ({
          ...resto,
          // La planilla se compara dia por dia y con las horas ordenadas: el
          // orden en que se escribieron no es un cambio.
          salidas: Object.fromEntries(
            DIAS.map((d) => [d.clave, [...(resto.salidas?.[d.clave] ?? [])].sort()]),
          ),
        }),
      );
    return JSON.stringify(limpiar(cruces)) !== JSON.stringify(limpiar(comercio.cruces));
  }, [cruces, comercio.cruces]);

  const cambiarCampo = (id, parcial) => {
    setCruces((previos) => previos.map((c) => (clave(c) === id ? { ...c, ...parcial } : c)));
    setMensaje("");
  };

  /** Pinta el cambio en el borrador y, si hay a qué aplicárselo, lo publica. */
  async function publicar(cruce, parcheLocal, enviar, revertir) {
    cambiarCampo(clave(cruce), parcheLocal);
    if (cruce._nueva || !cruce.id) return;

    setError("");
    setPublicando(cruce.id);
    try {
      await enviar();
      setMensaje("Listo, ya se ve así en el mapa.");
    } catch (e) {
      // Se revierte lo pintado: dejar el botón marcado cuando el cambio no
      // llegó haría creer al lanchero que avisó algo que nadie va a ver.
      cambiarCampo(clave(cruce), revertir);
      setError(e.message || "No pudimos publicar el estado. Fijate la conexión.");
    } finally {
      setPublicando(null);
    }
  }

  /** El interruptor del recorrido entero. */
  function cambiarEstado(cruce, parcial) {
    const siguiente = { ...cruce, ...parcial };
    return publicar(
      cruce,
      parcial,
      () =>
        onCambiarEstadoCruce(cruce.id, {
          estado: siguiente.estado ?? "a_horario",
          demora_min: siguiente.estado === "demorado" ? (siguiente.demora_min ?? null) : null,
          nota: siguiente.nota || null,
        }),
      { estado: cruce.estado, demora_min: cruce.demora_min, nota: cruce.nota },
    );
  }

  /** El interruptor de una salida de hoy. */
  function cambiarEstadoSalida(cruce, hora, parcial) {
    const previos = { ...(cruce.estados_salida ?? {}) };
    const estados = { ...previos };
    if (parcial.estado === null || parcial.estado === undefined) {
      delete estados[hora];
    } else {
      estados[hora] = {
        estado: parcial.estado,
        demora_min: parcial.estado === "demorado" ? (parcial.demora_min ?? null) : null,
      };
    }
    const guardadas = horasPorCruce.get(cruce.id);

    // Una salida que el servidor no conoce todavia viaja con el boton de
    // guardar, igual que el resto de la fila.
    if (!guardadas?.has(hora)) {
      cambiarCampo(clave(cruce), { estados_salida: estados });
      return Promise.resolve();
    }

    return publicar(
      cruce,
      { estados_salida: estados },
      () =>
        onCambiarEstadoSalida(cruce.id, hora, {
          estado: parcial.estado ?? null,
          demora_min: parcial.estado === "demorado" ? (parcial.demora_min ?? null) : null,
        }),
      { estados_salida: previos },
    );
  }

  async function guardar() {
    setError("");
    setMensaje("");
    if (cruces.some((c) => !(c.destino ?? "").trim())) {
      setError("Todos los cruces necesitan un destino. Completalo o quitá la fila.");
      return;
    }
    try {
      const actualizado = await onGuardarTablero(
        cruces.map(({ _clave, _nueva, ...resto }) => resto),
      );
      setCruces(actualizado.cruces ?? []);
      setMensaje("Listo, guardamos tu tablero.");
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    }
  }

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        El tablero que ve el nauta en tu ficha: a qué hora cruzás cada día, cada cuánto,
        cuánto sale y hasta qué hora puede volver.
      </p>

      {cruces.length === 0 ? (
        <p className="estado">
          Todavía no cargaste ningún cruce. Agregá el primero y va a aparecer en tu ficha
          apenas lo guardes.
        </p>
      ) : (
        <ul className="tablero-editor">
          {cruces.map((cruce) => (
            <FilaEditor
              key={clave(cruce)}
              cruce={cruce}
              horasGuardadas={horasPorCruce.get(cruce.id) ?? new Set()}
              publicando={publicando === cruce.id}
              onCambiarCampo={(parcial) => cambiarCampo(clave(cruce), parcial)}
              onCambiarEstado={(parcial) => cambiarEstado(cruce, parcial)}
              onCambiarEstadoSalida={(hora, parcial) => cambiarEstadoSalida(cruce, hora, parcial)}
              onQuitar={() =>
                setCruces((previos) => previos.filter((c) => clave(c) !== clave(cruce)))
              }
            />
          ))}
        </ul>
      )}

      {error && <div className="mensaje-error">{error}</div>}
      {mensaje && <div className="mensaje-ok">{mensaje}</div>}

      <div className="fila-acciones">
        <button
          type="button"
          className="boton-secundario"
          onClick={() => setCruces((previos) => [...previos, nuevoCruce()])}
        >
          Agregar un cruce
        </button>
        <button type="button" onClick={guardar} disabled={!hayCambios || guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
