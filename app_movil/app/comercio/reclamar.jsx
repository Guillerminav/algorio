import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { tipoComercio } from "../../src/comercio.js";
import { Boton, Cargando, Error } from "../../src/componentes.jsx";
import { useSesion } from "../../src/sesion.jsx";
import { CampoTexto as TextInput, Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { CENTRO_POR_DEFECTO } from "../../src/useUbicacion.js";

const VISTAS = [
  { clave: "mapa", etiqueta: "En el mapa" },
  { clave: "lista", etiqueta: "En la lista" },
];

// Margen alrededor de los pines al encuadrar. Sin esto, el de más al norte
// queda pisando el borde de arriba y no se puede tocar.
const MARGEN_ENCUADRE = { top: 60, right: 50, bottom: 60, left: 50 };

// Cuánto abarca el mapa cuando hay un solo lugar (o ninguno) y no hay nada que
// encuadrar. Es el mismo del mapa del nauta: unos 35 km de lado.
const DELTA_INICIAL = { latitudeDelta: 0.35, longitudeDelta: 0.35 };

/**
 * "Ese lugar del mapa es mío": encontrar un comercio sin dueño y pedirlo.
 *
 * Existe porque muchos pines del mapa no los cargó su dueño —sembrados,
 * importados, o de una cuenta que se dio de baja— y obligarlo a cargar todo de
 * cero deja al nauta con dos pines del mismo parador y al comerciante sin las
 * reseñas que su lugar ya tenía.
 *
 * Se busca de dos maneras porque son dos formas de reconocer un lugar y no la
 * misma dos veces: en el MAPA, que es como alguien encuentra su propio muelle
 * —"el mío es el que está pasando la curva"—, y en la LISTA, que es como se
 * encuentra por nombre cuando el pin está a cien metros de donde debería.
 *
 * Lo aprueba un admin (ver backend/reclamos.py), y eso se dice arriba de todo:
 * quien entra por acá tiene que saber, antes de escribir nada, que hoy no va a
 * poder editar.
 *
 * Espeja frontend/src/comercio/ReclamarComercio.jsx.
 */
export default function ReclamarComercio() {
  const router = useRouter();
  const { api } = useSesion();
  const [lugares, setLugares] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState("mapa");
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const mapaRef = useRef(null);

  // Se pide una vez y se filtra en memoria: son los comercios sin dueño de un
  // tramo de río, no un catálogo.
  useEffect(() => {
    let cancelado = false;
    api("/api/comercios-sin-dueno")
      .then((d) => !cancelado && setLugares(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [api]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return lugares;
    return lugares.filter(
      (l) =>
        l.nombre.toLowerCase().includes(texto) ||
        (l.descripcion ?? "").toLowerCase().includes(texto),
    );
  }, [lugares, busqueda]);

  // Encuadrar sobre los pines que hay. Sin esto el mapa abre en el centro del
  // río y hay que buscar la zona propia a mano, que con dos dedos y desde un
  // muelle es justo lo que se quería evitar.
  useEffect(() => {
    if (vista !== "mapa" || visibles.length < 2) return;
    const id = setTimeout(() => {
      mapaRef.current?.fitToCoordinates(
        visibles.map((l) => ({ latitude: l.lat, longitude: l.lon })),
        { edgePadding: MARGEN_ENCUADRE, animated: false },
      );
    }, 400);
    return () => clearTimeout(id);
  }, [vista, visibles]);

  async function enviar() {
    setError("");
    setEnviando(true);
    try {
      await api("/api/mi-comercio/reclamo", {
        method: "POST",
        body: JSON.stringify({ poi_id: elegido.id, mensaje: mensaje.trim() || null }),
      });
      router.replace("/(comercio)");
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  if (cargando) return <Cargando texto="Buscando comercios sin dueño…" />;

  if (lugares.length === 0) {
    return (
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.ayuda}>
          Ahora mismo no hay comercios sin dueño en el mapa. Si el tuyo ya está publicado y
          no aparece acá, es porque otra cuenta lo tiene asignado — escribinos por Ayuda.
        </Text>
        <Boton titulo="Cargar mi comercio de cero" onPress={() => router.replace("/comercio/alta")} />
      </ScrollView>
    );
  }

  // --- Confirmar el que se eligió -------------------------------------------
  // Ocupa la pantalla entera en vez de abrirse debajo de la lista: lo que sigue
  // es escribir por qué ese lugar es suyo, y tener treinta pines al lado invita
  // a seguir mirando en vez de contestar.
  if (elegido) {
    return (
      <KeyboardAvoidingView
        style={estilos.pantalla}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={110}
      >
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>¿Es este tu comercio?</Text>

          <View style={[estilos.fila, estilos.filaElegida]}>
            <DatosLugar lugar={elegido} />
          </View>

          <View style={estilos.campo}>
            <Text style={estilos.campoEtiqueta}>¿Cómo sabemos que es tuyo?</Text>
            <TextInput
              style={estilos.textarea}
              multiline
              maxLength={600}
              placeholder="El teléfono que figura es el mío, o contanos algo que solo el dueño sepa."
              placeholderTextColor={COLORES.textoSuave}
              value={mensaje}
              onChangeText={setMensaje}
            />
          </View>

          <Text style={estilos.ayuda}>
            Lo revisa una persona del equipo. Cuando lo confirmemos vas a poder editar la
            ficha, y te quedan las reseñas y las visitas que el lugar ya tenía.
          </Text>

          <Error>{error}</Error>

          <Boton titulo="Sí, pedir este comercio" onPress={enviar} cargando={enviando} />
          <Boton
            titulo="No, buscar otro"
            variante="secundario"
            deshabilitado={enviando}
            onPress={() => setElegido(null)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // --- Buscar ---------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={110}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.ayuda}>
          Estos son los lugares ya publicados que todavía no tienen dueño. Encontrá el tuyo
          en el mapa o en la lista y tocá «Este es mi comercio».
        </Text>

        <View style={estilos.vistas}>
          {VISTAS.map((v) => {
            const activa = v.clave === vista;
            return (
              <Pressable
                key={v.clave}
                onPress={() => setVista(v.clave)}
                style={[estilos.chipVista, activa && estilos.chipVistaActivo]}
              >
                <Text style={[estilos.chipVistaTexto, activa && estilos.chipVistaTextoActivo]}>
                  {v.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          style={estilos.buscador}
          placeholder="Nombre de tu parador, cabaña o lancha"
          placeholderTextColor={COLORES.textoSuave}
          value={busqueda}
          onChangeText={setBusqueda}
        />

        {visibles.length === 0 ? (
          <Text style={estilos.ayuda}>Ninguno coincide con eso.</Text>
        ) : vista === "mapa" ? (
          <>
            <View style={estilos.mapaCaja}>
              <MapView
                ref={mapaRef}
                style={StyleSheet.absoluteFill}
                initialRegion={{ ...CENTRO_POR_DEFECTO, ...DELTA_INICIAL }}
                // Híbrido y no satelital puro: se ven la costa y los muelles
                // de verdad, que es con lo que alguien reconoce el suyo, pero
                // con los nombres de los pueblos encima para ubicarse.
                mapType="hybrid"
                toolbarEnabled={false}
              >
                {visibles.map((lugar) => (
                  <Marker
                    key={lugar.id}
                    coordinate={{ latitude: lugar.lat, longitude: lugar.lon }}
                    title={lugar.nombre}
                    description={tipoComercio(lugar.tipo).etiqueta}
                    pinColor={COLORES.acento}
                    onPress={() => setElegido(lugar)}
                  />
                ))}
              </MapView>
            </View>
            <Text style={estilos.ayuda}>
              Tocá el pin de tu lugar para reclamarlo. {visibles.length === 1
                ? "Hay 1 comercio sin dueño."
                : `Hay ${visibles.length} comercios sin dueño.`}
            </Text>
          </>
        ) : (
          visibles.map((lugar) => (
            <View key={lugar.id} style={estilos.fila}>
              <DatosLugar lugar={lugar} />
              <Pressable onPress={() => setElegido(lugar)} style={estilos.botonEsMio}>
                <Text style={estilos.botonEsMioTexto}>Este es mi comercio</Text>
              </Pressable>
            </View>
          ))
        )}

        <Error>{error}</Error>

        <Boton
          titulo="Mejor lo cargo de cero"
          variante="secundario"
          onPress={() => router.replace("/comercio/alta")}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Los datos de un lugar reclamable: lo mismo en la lista y al confirmar. */
function DatosLugar({ lugar }) {
  return (
    <>
      <Text style={estilos.nombre}>{lugar.nombre}</Text>
      <Text style={estilos.rubro}>{tipoComercio(lugar.tipo).etiqueta}</Text>
      {lugar.descripcion ? (
        <Text style={estilos.descripcion} numberOfLines={2}>{lugar.descripcion}</Text>
      ) : null}
      {/* Coordenadas y telefono a la vista: es como alguien reconoce que ese
          pin es el suyo y no el del vecino que se llama parecido. */}
      <Text style={estilos.meta}>
        {lugar.lat.toFixed(4)}, {lugar.lon.toFixed(4)}
        {lugar.whatsapp || lugar.telefono ? ` · tel. ${lugar.whatsapp || lugar.telefono}` : ""}
      </Text>
    </>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1 },
  contenido: { padding: 16, gap: 10, paddingBottom: 40 },
  ayuda: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
  titulo: { fontSize: 20, fontWeight: "700", color: COLORES.texto },

  vistas: { flexDirection: "row", gap: 6 },
  chipVista: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  chipVistaActivo: { backgroundColor: COLORES.acento, borderColor: COLORES.acento },
  chipVistaTexto: { fontSize: 13, fontWeight: "600", color: COLORES.textoSuave },
  chipVistaTextoActivo: { color: "#fff" },

  // Alto fijo: el mapa vive dentro de un ScrollView, y sin alto propio un
  // hijo con flex:1 ahi adentro colapsa a cero.
  mapaCaja: {
    height: 300,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORES.borde,
  },

  buscador: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
  },

  fila: {
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
    gap: 2,
  },
  filaElegida: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  nombre: { fontSize: 15.5, fontWeight: "700", color: COLORES.texto },
  rubro: { fontSize: 12.5, fontWeight: "600", color: COLORES.acento },
  descripcion: { fontSize: 13, lineHeight: 18, color: COLORES.textoSuave },
  meta: { fontSize: 12, color: COLORES.textoSuave, marginTop: 2 },

  // Un boton por lugar y no uno solo al pie: con la lista y el mapa mostrando
  // lo mismo, "cual estoy reclamando" tiene que contestarse en el renglon que
  // se toca y no en una seleccion que quedo tres pantallazos mas arriba.
  botonEsMio: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORES.acento,
  },
  botonEsMioTexto: { fontSize: 13.5, fontWeight: "700", color: COLORES.acento },

  campo: { gap: 6 },
  campoEtiqueta: { fontSize: 14, fontWeight: "600", color: COLORES.texto },
  textarea: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: "top",
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
  },
});
