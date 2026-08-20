import React, { useEffect, useMemo, useState } from "react";

import {
  ESTADOS_CRUCE,
  ESTADOS_SALIDA,
  aHora,
  aMinutos,
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
  salidas: [],
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

const salidasATexto = (salidas) => salidasDe({ salidas }).map((s) => s.hora).join(", ");

/**
 * De "07:00, 09:30" a la lista de salidas, conservando lo que ya tenía cada una.
 *
 * `previas` importa: si al reescribir el renglón se perdiera el estado, tocar
 * una coma borraría el "demorado" que el lanchero acaba de marcar en la salida
 * de las 09:30.
 */
function textoASalidas(texto, previas = []) {
  const porHora = new Map(previas.map((salida) => [salida.hora, salida]));
  const vistas = new Set();
  const salidas = [];

  for (const trozo of String(texto).split(/[,;\s]+/)) {
    if (!trozo.trim()) continue;
    const hora = normalizarHora(trozo);
    if (vistas.has(hora)) continue;
    vistas.add(hora);
    salidas.push(porHora.get(hora) ?? { hora, estado: null, demora_min: null });
  }
  return salidas;
}

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
 * Las salidas del cruce: el renglón donde se cargan y el estado de cada una.
 *
 * El renglón guarda su propio texto mientras se escribe y solo lo interpreta al
 * salir del campo. Sin eso no se puede tipear: si el valor del input se
 * recalculara desde la lista en cada tecla, la coma que uno acaba de escribir
 * desaparecería al instante —se parsea, queda un elemento vacío, se descarta y
 * se vuelve a unir sin ella—, que es exactamente lo que pasaba antes.
 *
 * Debajo, una salida por chip. Tocar uno abre sus interruptores: es lo que
 * convierte esto en un tablero de aeropuerto de verdad, donde la demora es de
 * un vuelo y no de la aerolínea.
 */
function EditorSalidas({ cruce, horasGuardadas, publicando, onCambiarCampo, onCambiarEstadoSalida }) {
  const salidas = salidasDe(cruce);
  const canonico = salidasATexto(cruce.salidas);
  const [texto, setTexto] = useState(canonico);
  const [abierta, setAbierta] = useState(null);

  // Se adopta la versión del servidor solo cuando de verdad dice otra cosa: si
  // lo tipeado significa lo mismo (una coma de más, un espacio), se respeta
  // como está escrito y no se le reacomoda el cursor a nadie.
  useEffect(() => {
    setTexto((previo) => (salidasATexto(textoASalidas(previo)) === canonico ? previo : canonico));
  }, [canonico]);

  const confirmar = () => {
    const nuevas = textoASalidas(texto, salidas);
    if (JSON.stringify(nuevas) !== JSON.stringify(salidas)) onCambiarCampo({ salidas: nuevas });
    setTexto(salidasATexto(nuevas));
  };

  const seleccionada = salidas.find((s) => s.hora === abierta) ?? null;
  const estadoSeleccionada = seleccionada ? estadoDeSalida(cruce, seleccionada) : null;
  // Una salida que el servidor todavía no vio no se puede publicar suelta: no
  // hay a qué aplicarle el cambio del otro lado. Se edita en el borrador y
  // viaja con el botón de guardar, como el resto de la fila.
  const publicable = seleccionada ? horasGuardadas.has(seleccionada.hora) : false;

  return (
    <div className="tablero-salidas-bloque">
      <label>
        <span>Salidas</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="07:00, 09:30, 12:00"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <small>En 24 h, separadas por coma. Se ordenan solas.</small>
      </label>

      {salidas.length > 0 && (
        <>
          <p className="tablero-salidas-ayuda">
            Tocá una salida para marcarla aparte. Las que no toques siguen el estado del
            recorrido.
          </p>
          <div className="tablero-chips-salida">
            {salidas.map((salida) => {
              const estado = estadoDeSalida(cruce, salida);
              const activa = abierta === salida.hora;
              return (
                <button
                  key={salida.hora}
                  type="button"
                  className={`tablero-chip-salida${estado.propio ? " propia" : ""}${activa ? " abierta" : ""}`}
                  style={{ "--tono-estado": estado.color }}
                  aria-expanded={activa}
                  onClick={() => setAbierta(activa ? null : salida.hora)}
                >
                  <span className="tablero-chip-salida-hora">{salida.hora}</span>
                  {estado.propio && estado.alterado && (
                    <span className="tablero-chip-salida-estado">
                      {estado.etiqueta}
                      {estado.clave === "demorado" && estado.demora_min
                        ? ` ${estado.demora_min}′`
                        : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

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

          <Botonera
            opciones={ESTADOS_SALIDA}
            actual={estadoSeleccionada.propio ? estadoSeleccionada.clave : null}
            demora={estadoSeleccionada.propio ? estadoSeleccionada.demora_min : null}
            publicando={publicando}
            etiqueta={`Estado de la salida de las ${seleccionada.hora}`}
            onCambiar={(parcial) =>
              onCambiarEstadoSalida(seleccionada.hora, {
                estado: estadoSeleccionada.propio ? estadoSeleccionada.clave : "a_horario",
                demora_min: estadoSeleccionada.demora_min,
                ...parcial,
              })
            }
          />

          {/* Deshacer sin tener que afirmar otra cosa. Marcarla "a horario"
              para sacarle un "demorado" no es lo mismo: eso la deja pisando al
              recorrido para siempre, y si mañana el cruce entero va demorado,
              esta seguiría diciendo que sale bien. */}
          <button
            type="button"
            className="tablero-heredar"
            disabled={publicando || !estadoSeleccionada.propio}
            onClick={() => onCambiarEstadoSalida(seleccionada.hora, { estado: null, demora_min: null })}
          >
            {estadoSeleccionada.propio
              ? "Que siga al recorrido"
              : `Sigue al recorrido (${estadoCruce(cruce.estado).etiqueta.toLowerCase()})`}
          </button>

          {!publicable && (
            <p className="tablero-panel-salida-aviso">
              Esta salida todavía no está guardada: el estado va a publicarse cuando toques
              &ldquo;Guardar cambios&rdquo;.
            </p>
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
        <p className="tablero-interruptores-ayuda">
          Estado de todo el recorrido. Vale para las salidas que no marcaste aparte.
        </p>
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
        const porHora = new Map(salidasDe(guardado).map((s) => [s.hora, s]));
        const { estado, demora_min, nota, estado_desde } = guardado;
        return {
          ...cruce,
          estado,
          demora_min,
          nota,
          estado_desde,
          salidas: salidasDe(cruce).map((salida) => porHora.get(salida.hora) ?? salida),
        };
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
      (lista ?? []).map(({ _clave, _nueva, estado, demora_min, nota, estado_desde, ...resto }) => ({
        ...resto,
        salidas: salidasDe({ salidas: resto.salidas }).map((s) => s.hora),
      }));
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

  /** El interruptor de una salida suelta. */
  function cambiarEstadoSalida(cruce, hora, parcial) {
    const salidas = salidasDe(cruce);
    const previas = salidas.map((s) => ({ ...s }));
    const parche = {
      salidas: salidas.map((s) =>
        s.hora === hora
          ? {
              ...s,
              estado: parcial.estado ?? null,
              demora_min: parcial.estado === "demorado" ? (parcial.demora_min ?? null) : null,
            }
          : s,
      ),
    };
    const guardadas = horasPorCruce.get(cruce.id);

    // Una salida que el servidor no conoce todavía viaja con el botón de
    // guardar, igual que el resto de la fila.
    if (!guardadas?.has(hora)) {
      cambiarCampo(clave(cruce), parche);
      return Promise.resolve();
    }

    return publicar(
      cruce,
      parche,
      () =>
        onCambiarEstadoSalida(cruce.id, hora, {
          estado: parcial.estado ?? null,
          demora_min: parcial.estado === "demorado" ? (parcial.demora_min ?? null) : null,
        }),
      { salidas: previas },
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
        Es el tablero que ve el nauta en tu ficha, como el de salidas de un aeropuerto: a
        qué hora cruzás, cada cuánto, cuánto sale y hasta qué hora puede volver.{" "}
        <strong>Los botones de estado se publican en el momento</strong>, sin pasar por
        revisión — y vuelven solos a &ldquo;A horario&rdquo; al día siguiente, así no
        arrastrás una demora de ayer.
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
