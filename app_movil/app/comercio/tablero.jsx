import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { Boton, Campo, Cargando, Error } from "../../src/componentes.jsx";
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
} from "../../src/tablero.js";
import { Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";

// Las demoras que se cargan de verdad. Un campo libre obligaría a tipear un
// número con una mano desde el muelle; con chips es un toque, y "23 minutos"
// no es un dato más honesto que "media hora".
const DEMORAS = [10, 15, 30, 45, 60, 90];

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
 * obligaba a decidir si "el de las 09:30 está demorado" se refería al 09:30 de
 * todos los martes o al de hoy — y siempre es al de hoy.
 */
const ordenarHoras = (horas) =>
  [...new Set((horas ?? []).map(normalizarHora))]
    .filter((hora) => aMinutos(hora) !== null)
    .sort((a, b) => aMinutos(a) - aMinutos(b));

// Las dos columnas del selector. Los minutos van de cinco en cinco: ninguna
// lancha sale 07:03, y una rueda de sesenta números es una rueda que hay que
// buscar en vez de tocar.
const HORAS_DEL_DIA = Array.from({ length: 24 }, (_, i) => i);
const MINUTOS_DEL_RELOJ = Array.from({ length: 12 }, (_, i) => i * 5);

/**
 * La aclaración del lanchero ("río picado, sale del muelle chico").
 *
 * Se escribe contra un estado local y se manda al salir del campo, no en cada
 * tecla: cada cambio de nota es un request que además se publica en el acto.
 *
 * El texto no se lee del evento de blur (`nativeEvent.text` solo viene en iOS;
 * en Android llega vacío y borraría la nota que se acaba de escribir), y por
 * eso hay estado local en vez de un campo no controlado.
 */
function CampoNota({ nota, publicando, onCambiar }) {
  const [texto, setTexto] = useState(nota ?? "");

  // Si la nota cambia del otro lado —se guardó, o el estado caducó y volvió a
  // null— el campo la sigue. Sin esto quedaría mostrando lo de antes.
  useEffect(() => {
    setTexto(nota ?? "");
  }, [nota]);

  return (
    <Campo
      etiqueta="Aclaración para el pasajero"
      ayuda="Opcional: río picado, sale del muelle chico."
      maxLength={140}
      value={texto}
      editable={!publicando}
      onChangeText={setTexto}
      onBlur={() => {
        if (texto !== (nota ?? "")) onCambiar({ nota: texto });
      }}
    />
  );
}

/** La botonera de estados, con su demora. La comparten los dos niveles. */
function Botonera({ opciones, actual, demora, publicando, onCambiar }) {
  const definicion = estadoCruce(actual);

  return (
    <>
      <View style={estilos.botonera}>
        {opciones.map((estado) => {
          const activo = actual === estado.clave;
          return (
            <Pressable
              key={estado.clave}
              disabled={publicando}
              onPress={() => onCambiar({ estado: estado.clave })}
              style={[
                estilos.botonEstado,
                { borderColor: estado.color },
                activo && { backgroundColor: estado.color },
                publicando && estilos.apagado,
              ]}
            >
              <Text style={[estilos.botonEstadoTexto, activo && estilos.botonEstadoTextoActivo]}>
                {estado.etiqueta}
              </Text>
            </Pressable>
          );
        })}
        {publicando ? <ActivityIndicator color={COLORES.acento} style={estilos.spinner} /> : null}
      </View>

      {definicion.pideDemora ? (
        <View style={estilos.demoras}>
          <Text style={estilos.demorasEtiqueta}>¿Cuánto?</Text>
          {DEMORAS.map((minutos) => {
            const activo = demora === minutos;
            return (
              <Pressable
                key={minutos}
                disabled={publicando}
                onPress={() => onCambiar({ demora_min: activo ? null : minutos })}
                style={[estilos.chipDemora, activo && estilos.chipDemoraActivo]}
              >
                <Text style={[estilos.chipDemoraTexto, activo && estilos.chipDemoraTextoActivo]}>
                  {minutos}′
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

/** Una columna del reloj: las horas o los minutos, el elegido resaltado. */
function ColumnaReloj({ valores, elegido, etiqueta, onElegir }) {
  return (
    <View style={estilos.columna}>
      <Text style={estilos.columnaEtiqueta}>{etiqueta}</Text>
      <ScrollView
        style={estilos.columnaRueda}
        contentContainerStyle={estilos.columnaContenido}
        showsVerticalScrollIndicator={false}
      >
        {valores.map((n) => {
          const activo = n === elegido;
          return (
            <Pressable
              key={n}
              onPress={() => onElegir(n)}
              style={[estilos.numero, activo && estilos.numeroActivo]}
            >
              <Text style={[estilos.numeroTexto, activo && estilos.numeroTextoActivo]}>
                {String(n).padStart(2, "0")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * El selector de hora, como el de una alarma: dos ruedas, hora y minuto.
 *
 * Es propio y no el del sistema porque el picker nativo es un módulo aparte
 * (@react-native-community/datetimepicker) que hay que compilar dentro de la
 * app, y esta pantalla también corre en la web. Lo que importa del gesto —no
 * tipear una hora con una mano desde el muelle— lo da igual.
 */
function SelectorHora({ abierto, valor, onElegir, onCerrar }) {
  const minutos = aMinutos(valor) ?? 0;
  const hora = Math.floor(minutos / 60);
  // A la rueda de a cinco: una hora guardada 07:03 tiene que caer en alguna, y
  // 07:58 no puede redondear a un 07:60 que la rueda no tiene.
  const minuto = Math.min(55, Math.round((minutos % 60) / 5) * 5);

  const cambiar = (h, m) => onElegir(aHora(h * 60 + m));

  return (
    <Modal visible={abierto} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={estilos.fondoModal} onPress={onCerrar}>
        {/* El toque de adentro no cierra: sin esto, elegir una hora cerraría
            el selector porque el Pressable de afuera se lleva el gesto. */}
        <Pressable style={estilos.reloj} onPress={() => {}}>
          <Text style={estilos.relojTitulo}>Hora de la salida</Text>
          <Text style={estilos.relojValor}>{aHora(hora * 60 + minuto)}</Text>

          <View style={estilos.columnas}>
            <ColumnaReloj
              valores={HORAS_DEL_DIA}
              elegido={hora}
              etiqueta="Hora"
              onElegir={(h) => cambiar(h, minuto)}
            />
            <ColumnaReloj
              valores={MINUTOS_DEL_RELOJ}
              elegido={minuto}
              etiqueta="Minutos"
              onElegir={(m) => cambiar(hora, m)}
            />
          </View>

          <Boton titulo="Listo" onPress={onCerrar} />
        </Pressable>
      </Pressable>
    </Modal>
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
 * La hora se elige en el reloj —dos ruedas, como una alarma— y se agrega con
 * el "+". Antes era un renglón de texto con comas, y tipear "07:00, 09:30,
 * 12:00" sin equivocarse, con una mano y desde el muelle, es más trabajo que
 * elegir la hora y tocar más. Cada hora cargada queda como un chip con su ✕,
 * que es también la única forma de sacarla.
 */
function EditorSalidas({ cruce, horasGuardadas, publicando, onCambiarCampo, onCambiarEstadoSalida }) {
  const hoy = diaAR();
  const [dia, setDia] = useState(hoy);
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState("07:00");
  const [eligiendo, setEligiendo] = useState(false);

  const planilla = cruce.salidas ?? {};
  const horas = ordenarHoras(planilla[dia]);
  const esHoy = dia === hoy;
  const nombreDia = DIAS.find((d) => d.clave === dia).etiqueta.toLowerCase();
  const yaCargada = horas.includes(normalizarHora(nueva));

  const guardarDia = (clave, lista) =>
    onCambiarCampo({ salidas: { ...planilla, [clave]: lista } });

  function agregar() {
    const hora = normalizarHora(nueva);
    if (aMinutos(hora) === null || horas.includes(hora)) return;
    guardarDia(dia, ordenarHoras([...horas, hora]));
  }

  function quitar(hora) {
    guardarDia(
      dia,
      horas.filter((h) => h !== hora),
    );
    if (abierta === hora) setAbierta(null);
  }

  // El panel de estado es de HOY: el chip de un sábado, mirado un martes, es
  // solo el plan.
  const seleccionada = esHoy
    ? (salidasDe(cruce, dia).find((s) => s.hora === abierta) ?? null)
    : null;
  const estadoSeleccionada = seleccionada ? estadoDeSalida(cruce, seleccionada) : null;
  // Una salida que el servidor todavía no vio no se puede publicar suelta: no
  // hay a qué aplicarle el cambio del otro lado. Se edita en el borrador y
  // viaja con el botón de guardar, como el resto de la fila.
  const publicable = seleccionada ? horasGuardadas.has(seleccionada.hora) : false;

  return (
    <View style={estilos.salidasBloque}>
      <Text style={estilos.ayudaChica}>
        Los días marcados son los que salen viajes. Tocá uno para ver o cargar sus horarios.
      </Text>

      <View style={estilos.dias}>
        {DIAS.map((d) => {
          const cargado = (planilla[d.clave] ?? []).length;
          const activo = d.clave === dia;
          return (
            <Pressable
              key={d.clave}
              onPress={() => setDia(d.clave)}
              style={[estilos.dia, cargado > 0 && estilos.diaCargado, activo && estilos.diaActivo]}
            >
              <Text style={[estilos.diaTexto, cargado > 0 && estilos.diaTextoCargado, activo && estilos.diaTextoActivo]}>
                {d.corto}
              </Text>
              <View
                style={[
                  estilos.diaCuenta,
                  cargado > 0 && estilos.diaCuentaCargado,
                  activo && estilos.diaCuentaActivo,
                ]}
              >
                <Text
                  style={[
                    estilos.diaCuentaTexto,
                    (cargado > 0 || activo) && estilos.diaCuentaTextoFuerte,
                  ]}
                >
                  {cargado || "–"}
                </Text>
              </View>
              {d.clave === hoy ? <View style={estilos.diaHoy} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={estilos.altaHora}>
        <View style={estilos.altaHoraCampo}>
          <Text style={estilos.altaHoraEtiqueta}>Salidas del {nombreDia}</Text>
          <Pressable style={estilos.altaHoraValor} onPress={() => setEligiendo(true)}>
            <Text style={estilos.altaHoraValorTexto}>{nueva}</Text>
          </Pressable>
        </View>
        {/* El "+" se apaga cuando esa hora ya está cargada: un botón que
            responde al toque sin hacer nada se lee como que la app se colgó. */}
        <Pressable
          style={[estilos.mas, (publicando || yaCargada) && estilos.apagado]}
          disabled={publicando || yaCargada}
          onPress={agregar}
        >
          <Text style={estilos.masTexto}>+</Text>
        </Pressable>
      </View>

      <SelectorHora
        abierto={eligiendo}
        valor={nueva}
        onElegir={setNueva}
        onCerrar={() => setEligiendo(false)}
      />

      {horas.length === 0 ? (
        <Text style={estilos.ayudaChica}>
          El {nombreDia} todavía no sale ninguna lancha. Elegí la hora y tocá «+».
        </Text>
      ) : (
        <View style={estilos.chipsSalida}>
          {horas.map((hora) => {
            const estado = esHoy
              ? estadoDeSalida(cruce, { hora, ...(cruce.estados_salida?.[hora] ?? {}) })
              : null;
            const marcada = Boolean(estado?.propio && estado.alterado);
            const activa = esHoy && abierta === hora;
            return (
              <View
                key={hora}
                style={[
                  estilos.chipSalida,
                  // Una salida que va como va el recorrido queda neutra; la que
                  // se marcó aparte se tiñe. Con quince chips de colores no se
                  // distingue cuál es la excepción, que es lo único que hay que
                  // mirar.
                  marcada && { borderColor: estado.color },
                  activa && estilos.chipSalidaAbierta,
                ]}
              >
                <Pressable
                  disabled={!esHoy}
                  onPress={() => setAbierta(activa ? null : hora)}
                  style={estilos.chipSalidaCuerpo}
                >
                  <Text style={estilos.chipSalidaHora}>{hora}</Text>
                  {marcada ? (
                    <Text style={[estilos.chipSalidaEstado, { color: estado.color }]}>
                      {estado.etiqueta.toUpperCase()}
                      {estado.clave === "demorado" && estado.demora_min
                        ? ` ${estado.demora_min}′`
                        : ""}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable hitSlop={8} onPress={() => quitar(hora)} style={estilos.chipSalidaQuitar}>
                  <Text style={estilos.chipSalidaQuitarTexto}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Pressable
        disabled={horas.length === 0}
        onPress={() =>
          onCambiarCampo({ salidas: Object.fromEntries(DIAS.map((d) => [d.clave, [...horas]])) })
        }
        style={[estilos.repetir, horas.length === 0 && estilos.apagado]}
      >
        <Text style={estilos.repetirTexto}>Repetir en toda la semana</Text>
      </Pressable>

      {seleccionada ? (
        <View style={estilos.panelSalida}>
          <View style={estilos.panelSalidaCabecera}>
            <Text style={estilos.panelSalidaTitulo}>Salida de las {seleccionada.hora}</Text>
            <Pressable hitSlop={10} onPress={() => setAbierta(null)}>
              <Text style={estilos.quitar}>✕</Text>
            </Pressable>
          </View>

          {/* La botonera arranca con el estado que la salida ya tiene y no en
              blanco: recién cargada eso es "A horario", que es la verdad y no
              una casilla sin contestar. Por eso tampoco hace falta un botón
              para deshacer una demora — se toca el estado que va. */}
          <Botonera
            opciones={ESTADOS_SALIDA}
            actual={estadoSeleccionada.clave}
            demora={estadoSeleccionada.demora_min}
            publicando={publicando}
            onCambiar={(parcial) =>
              onCambiarEstadoSalida(seleccionada.hora, {
                estado: estadoSeleccionada.clave,
                demora_min: estadoSeleccionada.demora_min,
                ...parcial,
              })
            }
          />

          {!publicable ? (
            <Text style={estilos.ayudaChica}>
              Esta salida todavía no está guardada: el estado se publica cuando toques
              &ldquo;Guardar tablero&rdquo;.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
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
  return <Text style={estilos.vista}>Así lo ven: {partes.join(" · ")}</Text>;
}

/**
 * El tablero de cruces, del lado del lanchero.
 *
 * La pantalla hace dos cosas con reglas distintas y eso está a la vista:
 *
 * - Los INTERRUPTORES de estado se publican solos, en el acto. Son lo que se
 *   toca todos los días y desde el muelle. Hay dos niveles: el del recorrido
 *   entero y el de cada salida, que lo pisa cuando hace falta.
 * - Los DATOS del cruce (horarios, frecuencia, precio) se guardan con el botón
 *   de abajo, como el resto del panel: se cargan una vez y se corrigen de vez
 *   en cuando, y guardar en cada tecla mandaría un request por letra.
 *
 * Ninguna de las dos pasa por moderación: el tablero no publica un lugar nuevo
 * en el mapa, actualiza un dato que envejece en minutos.
 */
export default function TableroComercio() {
  const router = useRouter();
  const { comercio, cargando, guardando, guardarTablero, cambiarEstadoCruce, cambiarEstadoSalida } =
    useComercio();
  const [cruces, setCruces] = useState(null);
  const [publicando, setPublicando] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  // La ficha llega después del primer render y vuelve del servidor después de
  // cada interruptor. Se re-sincroniza solo lo que el servidor decide —los
  // estados y su vigencia, en los dos niveles— y no la fila entera: pisar todo
  // acá borraría lo que se está escribiendo en otro campo mientras tanto.
  useEffect(() => {
    if (!comercio) return;
    setCruces((previos) => {
      if (previos === null) return comercio.cruces ?? [];
      const guardados = new Map((comercio.cruces ?? []).map((c) => [c.id, c]));
      return previos.map((cruce) => {
        const guardado = guardados.get(cruce.id);
        if (!guardado) return cruce;
        const { estado, demora_min, nota, estado_desde, estados_salida } = guardado;
        // Solo lo que decide el servidor: los estados y su vigencia. La
        // planilla no se pisa — borraría lo que se está escribiendo.
        return { ...cruce, estado, demora_min, nota, estado_desde, estados_salida };
      });
    });
  }, [comercio]);

  if (cargando || cruces === null) return <Cargando />;

  const clave = (cruce) => cruce.id ?? cruce._clave;

  // Qué salidas conoce ya el servidor: son las únicas cuyo interruptor puede
  // publicarse suelto.
  const horasPorCruce = new Map(
    (comercio?.cruces ?? []).map((c) => [c.id, new Set(salidasDe(c).map((s) => s.hora))]),
  );

  // Los estados quedan afuera de la comparación en los dos niveles: los mueven
  // los interruptores, que se publican solos y no por este botón.
  const limpiar = (lista) =>
    (lista ?? []).map(
      ({ _clave, _nueva, estado, demora_min, nota, estado_desde, estados_salida, ...resto }) => ({
      ...resto,
      // Dia por dia y con las horas ordenadas: el orden en que se
      // escribieron no es un cambio.
      salidas: Object.fromEntries(
        DIAS.map((d) => [d.clave, [...(resto.salidas?.[d.clave] ?? [])].sort()]),
      ),
      }),
    );
  const hayCambios = JSON.stringify(limpiar(cruces)) !== JSON.stringify(limpiar(comercio?.cruces));

  const cambiarCampo = (id, parcial) => {
    setCruces((previos) => previos.map((c) => (clave(c) === id ? { ...c, ...parcial } : c)));
    setMensaje("");
  };

  /** Pinta el cambio en el borrador y, si hay a qué aplicárselo, lo publica. */
  async function publicar(cruce, parcheLocal, enviar, revertir) {
    // El pintado no espera al servidor: el interruptor tiene que responder al
    // toque aunque la conexión desde el río tarde tres segundos.
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
        cambiarEstadoCruce(cruce.id, {
          estado: siguiente.estado ?? "a_horario",
          demora_min: siguiente.estado === "demorado" ? (siguiente.demora_min ?? null) : null,
          nota: siguiente.nota || null,
        }),
      { estado: cruce.estado, demora_min: cruce.demora_min, nota: cruce.nota },
    );
  }

  /**
   * El interruptor de una salida suelta.
   *
   * El estado va en `estados_salida`, indexado por hora, y no adentro de la
   * planilla: la planilla es el plan de la semana —un diccionario de día a
   * horas— y esto es lo que pasa hoy. Es también la forma que espera el
   * backend (ver tablero._estados_salida).
   */
  function cambiarEstadoDeSalida(cruce, hora, parcial) {
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

    // Una salida que el servidor no conoce todavía viaja con el botón de
    // guardar, igual que el resto de la fila.
    if (!horasPorCruce.get(cruce.id)?.has(hora)) {
      cambiarCampo(clave(cruce), { estados_salida: estados });
      return Promise.resolve();
    }

    return publicar(
      cruce,
      { estados_salida: estados },
      () =>
        cambiarEstadoSalida(cruce.id, hora, {
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
      const actualizado = await guardarTablero(cruces.map(({ _clave, _nueva, ...resto }) => resto));
      setCruces(actualizado.cruces ?? []);
      setMensaje("Listo, guardamos tu tablero.");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={110}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.ayuda}>
          El tablero que ve el nauta en tu ficha: a qué hora cruzás cada día, cada cuánto
          y cuánto sale.
        </Text>

        {cruces.length === 0 ? (
          <Text style={estilos.vacio}>
            Todavía no cargaste ningún cruce. Agregá el primero y va a aparecer en tu ficha
            apenas lo guardes.
          </Text>
        ) : null}

        {cruces.map((cruce) => (
          <View key={clave(cruce)} style={estilos.fila}>
            <View style={estilos.filaEncabezado}>
              {/* El destino en un titulo ademas de en su campo: con seis
                  cruces cargados hay que poder saber en cual estas parado sin
                  leer el contenido de un input. */}
              <Text style={estilos.filaTitulo} numberOfLines={1}>
                {cruce.destino?.trim() || "Cruce nuevo"}
              </Text>
              <Pressable
                hitSlop={10}
                onPress={() =>
                  setCruces((previos) => previos.filter((c) => clave(c) !== clave(cruce)))
                }
              >
                <Text style={estilos.quitar}>✕</Text>
              </Pressable>
            </View>

            <View style={estilos.interruptores}>
              <Text style={estilos.ayudaChica}>
                Estado de todo el recorrido. Vale para las salidas que no marcaste aparte.
              </Text>
              <Botonera
                opciones={ESTADOS_CRUCE}
                actual={cruce.estado ?? "a_horario"}
                demora={cruce.demora_min}
                publicando={publicando === cruce.id}
                onCambiar={(parcial) => cambiarEstado(cruce, parcial)}
              />
              {estadoCruce(cruce.estado).alterado ? (
                <CampoNota
                  nota={cruce.nota}
                  publicando={publicando === cruce.id}
                  onCambiar={(parcial) => cambiarEstado(cruce, parcial)}
                />
              ) : null}
            </View>

            <View style={estilos.campos}>
              <Campo
                etiqueta="Destino"
                ayuda="A dónde cruza."
                estilo={estilos.campo}
                placeholder="Isla del Cerrito"
                maxLength={80}
                value={cruce.destino ?? ""}
                onChangeText={(t) => cambiarCampo(clave(cruce), { destino: t })}
              />
              <Campo
                etiqueta="Desde"
                ayuda="De dónde sale. Opcional."
                estilo={estilos.campo}
                placeholder="Puerto Corrientes"
                maxLength={80}
                value={cruce.origen ?? ""}
                onChangeText={(t) => cambiarCampo(clave(cruce), { origen: t })}
              />
              <Campo
                estilo={estilos.campo}
                etiqueta="Frecuencia"
                ayuda="Cada cuántos minutos."
                placeholder="30"
                keyboardType="number-pad"
                value={cruce.frecuencia_min == null ? "" : String(cruce.frecuencia_min)}
                onChangeText={(t) => cambiarCampo(clave(cruce), { frecuencia_min: aNumero(t) })}
              />
              <Campo
                estilo={estilos.campo}
                etiqueta="Precio"
                ayuda="Por persona, ida."
                placeholder="3500"
                keyboardType="number-pad"
                value={cruce.precio == null ? "" : String(cruce.precio)}
                onChangeText={(t) => cambiarCampo(clave(cruce), { precio: aNumero(t) })}
              />
              <Campo
                estilo={estilos.campo}
                etiqueta="Duración"
                ayuda="Minutos de viaje."
                placeholder="25"
                keyboardType="number-pad"
                value={cruce.duracion_min == null ? "" : String(cruce.duracion_min)}
                onChangeText={(t) => cambiarCampo(clave(cruce), { duracion_min: aNumero(t) })}
              />
              <Campo
                estilo={estilos.campo}
                etiqueta="Último regreso"
                ayuda="La última vuelta del día."
                placeholder="19:30"
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                value={cruce.ultimo_regreso ?? ""}
                onChangeText={(t) => cambiarCampo(clave(cruce), { ultimo_regreso: t })}
              />
            </View>

            <EditorSalidas
              cruce={cruce}
              horasGuardadas={horasPorCruce.get(cruce.id) ?? new Set()}
              publicando={publicando === cruce.id}
              onCambiarCampo={(parcial) => cambiarCampo(clave(cruce), parcial)}
              onCambiarEstadoSalida={(hora, parcial) => cambiarEstadoDeSalida(cruce, hora, parcial)}
            />

            <Vista cruce={cruce} />
          </View>
        ))}

        <Error>{error}</Error>
        {mensaje !== "" ? <Text style={estilos.ok}>{mensaje}</Text> : null}

        <Boton
          titulo="Agregar un cruce"
          variante="secundario"
          onPress={() => setCruces((previos) => [...previos, nuevoCruce()])}
        />
        <Boton
          titulo="Guardar tablero"
          onPress={guardar}
          cargando={guardando}
          deshabilitado={!hayCambios}
        />
        <Boton titulo="Volver" variante="secundario" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  ayuda: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
  ayudaFuerte: { fontWeight: "700", color: COLORES.texto },
  // Qué alcance tiene cada botonera. Sin este renglón, dos filas de botones
  // casi iguales —la del recorrido y la de una salida— se leen como un único
  // control roto en dos.
  ayudaChica: { fontSize: 12.5, lineHeight: 18, color: COLORES.textoSuave },
  vacio: { fontSize: 14, lineHeight: 21, color: COLORES.textoSuave, paddingVertical: 12 },

  fila: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
    gap: 12,
  },
  filaEncabezado: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  filaTitulo: { flex: 1, fontSize: 17, fontWeight: "700", color: COLORES.texto },
  quitar: { fontSize: 16, color: COLORES.textoSuave, paddingTop: 2 },

  interruptores: { gap: 8 },
  botonera: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  // Apagado es un contorno del tono del estado y prendido lo pinta entero. Los
  // seis en color pleno serían un semáforo roto; con contorno se lee cuál está
  // elegido y además se aprende qué color le toca a cada uno, que es el mismo
  // que después aparece en el pin del mapa.
  botonEstado: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  botonEstadoTexto: { fontSize: 13, fontWeight: "600", color: COLORES.textoSuave },
  botonEstadoTextoActivo: { color: "#fff", fontWeight: "700" },
  apagado: { opacity: 0.55 },
  spinner: { marginLeft: 2 },

  demoras: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  demorasEtiqueta: { fontSize: 13, color: COLORES.textoSuave, marginRight: 2 },
  chipDemora: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  chipDemoraActivo: { backgroundColor: COLORES.alerta, borderColor: COLORES.alerta },
  chipDemoraTexto: { fontSize: 13, fontWeight: "600", color: COLORES.textoSuave },
  chipDemoraTextoActivo: { color: "#fff" },

  campos: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
  },
  // Solo el ancho de la grilla: la etiqueta, la caja y la ayuda las pone el
  // <Campo> compartido (src/componentes.jsx), el mismo de todas las pantallas.
  campo: { flexGrow: 1, flexBasis: "45%" },

  // El reloj y el "+" cargan la planilla del día; los chips de abajo son las
  // horas ya cargadas y, en el día de hoy, sirven además para lo otro: marcar
  // UNA salida cuando se corrió solo esa. Van juntos y en ese orden porque así
  // se usa —primero se carga el día, después se lo va corrigiendo—, y
  // separarlos en dos pantallas obligaría a ir y venir con el motor prendido.
  //
  // Los siete días en una fila de a siete y no envueltos: es una semana, y una
  // semana cortada en 5 + 2 deja de leerse como semana justo cuando lo único
  // que se le pregunta es qué días sale.
  dias: { flexDirection: "row", gap: 4 },
  dia: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  // Un día que tiene horarios queda marcado —pintado y con la cuenta de
  // salidas abajo— y uno vacío con un guion. No es decoración: es lo que
  // contesta de un vistazo qué días sale la lancha a la isla y lo que evita
  // publicar un tablero al que le falta el domingo.
  diaCargado: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  diaActivo: { backgroundColor: COLORES.acento, borderColor: COLORES.acento },
  diaTexto: { fontSize: 12.5, fontWeight: "600", color: COLORES.textoSuave },
  diaTextoCargado: { color: COLORES.acento, fontWeight: "700" },
  diaTextoActivo: { color: "#fff" },
  diaCuenta: {
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: COLORES.chipFondo,
    alignItems: "center",
  },
  diaCuentaCargado: { backgroundColor: COLORES.acento },
  diaCuentaActivo: { backgroundColor: "rgba(255,255,255,0.3)" },
  diaCuentaTexto: { fontSize: 10, fontWeight: "800", color: COLORES.textoSuave, lineHeight: 15 },
  diaCuentaTextoFuerte: { color: "#fff" },
  // Los chips de estado son de HOY; sin esta marca no se entiende por que
  // aparecen o no segun la pestaña.
  diaHoy: {
    position: "absolute",
    top: 3,
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORES.ok,
  },

  // El alta de una hora: el reloj y un "+" al lado, del mismo alto. Los dos
  // tienen que ser un blanco de dedo, no un ícono.
  altaHora: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  altaHoraCampo: { flex: 1, gap: 4 },
  altaHoraEtiqueta: { fontSize: 13, fontWeight: "600", color: COLORES.texto },
  altaHoraValor: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: "#fff",
  },
  altaHoraValorTexto: { fontSize: 18, fontWeight: "700", color: COLORES.texto },
  mas: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: COLORES.acento,
  },
  masTexto: { fontSize: 24, lineHeight: 26, fontWeight: "700", color: "#fff" },

  // El reloj: dos ruedas, hora y minuto, como una alarma.
  fondoModal: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  reloj: {
    width: "100%",
    maxWidth: 340,
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORES.superficie,
  },
  relojTitulo: { fontSize: 14, fontWeight: "700", color: COLORES.texto },
  relojValor: {
    fontSize: 34,
    fontWeight: "800",
    color: COLORES.acento,
    textAlign: "center",
  },
  columnas: { flexDirection: "row", gap: 10 },
  columna: { flex: 1, gap: 4 },
  columnaEtiqueta: { fontSize: 11, fontWeight: "700", color: COLORES.textoSuave, textAlign: "center" },
  columnaRueda: {
    height: 190,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORES.bordeSuave,
    backgroundColor: COLORES.fondo,
  },
  columnaContenido: { paddingVertical: 4 },
  numero: { paddingVertical: 9, alignItems: "center" },
  numeroActivo: { backgroundColor: COLORES.acento },
  numeroTexto: { fontSize: 17, fontWeight: "600", color: COLORES.texto },
  numeroTextoActivo: { color: "#fff", fontWeight: "800" },

  repetir: { alignSelf: "flex-start", paddingVertical: 4 },
  repetirTexto: { fontSize: 13, fontWeight: "600", color: COLORES.acento },

  salidasBloque: {
    gap: 9,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
  },
  chipsSalida: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chipSalida: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  // La abierta se marca con el fondo y no cambiando el borde: el borde de ese
  // chip ya significa otra cosa (su estado).
  chipSalidaAbierta: { backgroundColor: COLORES.chipFondo },
  chipSalidaCuerpo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 11,
    paddingRight: 3,
    paddingVertical: 7,
  },
  chipSalidaHora: { fontSize: 14, fontWeight: "700", color: COLORES.texto },
  chipSalidaEstado: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  // Sin el renglón de texto, este "✕" es la única forma de sacar una hora: va
  // pegado a ella y no en un modo aparte de borrar.
  chipSalidaQuitar: { paddingLeft: 3, paddingRight: 10, paddingVertical: 7 },
  chipSalidaQuitarTexto: { fontSize: 12, fontWeight: "700", color: COLORES.textoSuave },

  panelSalida: {
    gap: 9,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.fondo,
  },
  panelSalidaCabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelSalidaTitulo: { fontSize: 14.5, fontWeight: "700", color: COLORES.texto },

  // Cómo queda del otro lado. Sin esto el lanchero carga cinco números sueltos
  // y no ve qué frase arman hasta abrir la ficha del nauta en otra pantalla.
  vista: {
    padding: 9,
    borderRadius: 9,
    backgroundColor: COLORES.chipFondo,
    fontSize: 12.5,
    color: COLORES.textoSuave,
  },

  ok: { fontSize: 14, color: COLORES.ok },
});
