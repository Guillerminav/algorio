import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { Boton, Campo, Cargando, Error } from "../../src/componentes.jsx";
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

/**
 * Las salidas del cruce: el renglón donde se cargan y el estado de cada una.
 *
 * El renglón guarda su propio texto mientras se escribe y solo lo interpreta al
 * salir del campo. Sin eso no se puede tipear: si el valor del campo se
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
  // como está escrito y no se le mueve el cursor a nadie.
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
    <View style={estilos.salidasBloque}>
      <Campo
        etiqueta="Salidas"
        ayuda="En 24 h, separadas por coma. Se ordenan solas."
        placeholder="07:00, 09:30, 12:00"
        keyboardType="numbers-and-punctuation"
        value={texto}
        onChangeText={setTexto}
        onBlur={confirmar}
      />

      {salidas.length > 0 ? (
        <>
          <Text style={estilos.ayudaChica}>
            Tocá una salida para marcarla aparte. Las que no toques siguen el estado del
            recorrido.
          </Text>
          <View style={estilos.chipsSalida}>
            {salidas.map((salida) => {
              const estado = estadoDeSalida(cruce, salida);
              const activa = abierta === salida.hora;
              return (
                <Pressable
                  key={salida.hora}
                  onPress={() => setAbierta(activa ? null : salida.hora)}
                  style={[
                    estilos.chipSalida,
                    // Una salida que hereda va neutra; la que se marcó aparte
                    // se tiñe. Con quince chips de colores no se distingue cuál
                    // es la excepción, que es lo único que hay que mirar.
                    estado.propio && { borderColor: estado.color },
                    activa && estilos.chipSalidaAbierta,
                  ]}
                >
                  <Text style={estilos.chipSalidaHora}>{salida.hora}</Text>
                  {estado.propio && estado.alterado ? (
                    <Text style={[estilos.chipSalidaEstado, { color: estado.color }]}>
                      {estado.etiqueta.toUpperCase()}
                      {estado.clave === "demorado" && estado.demora_min
                        ? ` ${estado.demora_min}′`
                        : ""}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {seleccionada ? (
        <View style={estilos.panelSalida}>
          <View style={estilos.panelSalidaCabecera}>
            <Text style={estilos.panelSalidaTitulo}>Salida de las {seleccionada.hora}</Text>
            <Pressable hitSlop={10} onPress={() => setAbierta(null)}>
              <Text style={estilos.quitar}>✕</Text>
            </Pressable>
          </View>

          <Botonera
            opciones={ESTADOS_SALIDA}
            actual={estadoSeleccionada.propio ? estadoSeleccionada.clave : null}
            demora={estadoSeleccionada.propio ? estadoSeleccionada.demora_min : null}
            publicando={publicando}
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
          <Pressable
            disabled={publicando || !estadoSeleccionada.propio}
            onPress={() => onCambiarEstadoSalida(seleccionada.hora, { estado: null, demora_min: null })}
            style={[estilos.heredar, !estadoSeleccionada.propio && estilos.apagado]}
          >
            <Text style={estilos.heredarTexto}>
              {estadoSeleccionada.propio
                ? "Que siga al recorrido"
                : `Sigue al recorrido (${estadoCruce(cruce.estado).etiqueta.toLowerCase()})`}
            </Text>
          </Pressable>

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
    (lista ?? []).map(({ _clave, _nueva, estado, demora_min, nota, estado_desde, ...resto }) => ({
      ...resto,
      salidas: salidasDe({ salidas: resto.salidas }).map((s) => s.hora),
    }));
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

  /** El interruptor de una salida suelta. */
  function cambiarEstadoDeSalida(cruce, hora, parcial) {
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

    // Una salida que el servidor no conoce todavía viaja con el botón de
    // guardar, igual que el resto de la fila.
    if (!horasPorCruce.get(cruce.id)?.has(hora)) {
      cambiarCampo(clave(cruce), parche);
      return Promise.resolve();
    }

    return publicar(
      cruce,
      parche,
      () =>
        cambiarEstadoSalida(cruce.id, hora, {
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
          Es el tablero que ve el nauta en tu ficha, como el de salidas de un aeropuerto.{" "}
          <Text style={estilos.ayudaFuerte}>Los botones de estado se publican en el momento</Text>,
          sin pasar por revisión — y vuelven solos a “A horario” al día siguiente, así no
          arrastrás una demora de ayer.
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

  // El renglón de texto carga la lista de horarios de un saque; los chips de
  // abajo son para lo otro: marcar UNA salida cuando se corrió solo esa. Van
  // juntos y en ese orden porque así se usa —primero se carga el día, después
  // se lo va corrigiendo—, y separarlos en dos pantallas obligaría a ir y venir
  // con el motor prendido.
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
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  // La abierta se marca con el fondo y no cambiando el borde: el borde de ese
  // chip ya significa otra cosa (su estado).
  chipSalidaAbierta: { backgroundColor: COLORES.chipFondo },
  chipSalidaHora: { fontSize: 14, fontWeight: "700", color: COLORES.texto },
  chipSalidaEstado: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },

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

  // Deshacer sin tener que afirmar otra cosa: marcar "a horario" para sacar un
  // "demorado" dejaría la salida pisando al recorrido para siempre.
  heredar: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORES.borde,
  },
  heredarTexto: { fontSize: 13, fontWeight: "600", color: COLORES.textoSuave },

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
