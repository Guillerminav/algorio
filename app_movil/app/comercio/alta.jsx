import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { TIPOS_COMERCIO } from "../../src/comercio.js";
import { Boton, Campo, Error } from "../../src/componentes.jsx";
import { CampoTexto as TextInput, Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";
import { CENTRO_POR_DEFECTO, useUbicacion } from "../../src/useUbicacion.js";

// Tres pasos y no un formulario largo: quien carga esto esta en el celular, y
// una pantalla con rubro + nombre + mapa + contacto junta se abandona a la
// mitad. Cada paso pide una sola cosa.
const PASOS = [
  { clave: "rubro", titulo: "Tipo de comercio náutico", ayuda: "Define cómo se muestra tu lugar en el mapa." },
  { clave: "datos", titulo: "Contanos de vos", ayuda: "El nombre es lo primero que ve el nauta." },
  { clave: "ubicacion", titulo: "¿Dónde estás?", ayuda: "Marcá el punto sobre la costa y dejá por dónde te escriben." },
];

export default function AltaComercio() {
  const router = useRouter();
  const { crear } = useComercio();
  const { posicion } = useUbicacion();
  const [indice, setIndice] = useState(0);
  const [valores, setValores] = useState({ tipo: "", nombre: "", descripcion: "", whatsapp: "" });
  const [punto, setPunto] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const paso = PASOS[indice];
  const esUltimo = indice === PASOS.length - 1;
  const cambiar = (campo, valor) => setValores((p) => ({ ...p, [campo]: valor }));

  // Cada paso sabe cuando esta completo: sin esto se podria llegar al final
  // sin ubicacion y el backend rechazaria el alta recien ahi, que es el peor
  // momento para enterarse.
  const completo = {
    rubro: Boolean(valores.tipo),
    datos: Boolean(valores.nombre.trim()),
    ubicacion: Boolean(punto),
  }[paso.clave];

  async function continuar() {
    setError("");
    if (!esUltimo) {
      setIndice((i) => i + 1);
      return;
    }
    setEnviando(true);
    try {
      await crear({
        tipo: valores.tipo,
        nombre: valores.nombre.trim(),
        descripcion: valores.descripcion.trim() || null,
        whatsapp: valores.whatsapp.trim() || null,
        lat: punto.latitude,
        lon: punto.longitude,
      });
      router.replace("/(comercio)");
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <View style={estilos.progreso}>
          {PASOS.map((p, i) => (
            <View key={p.clave} style={[estilos.punto, i <= indice && estilos.puntoActivo]} />
          ))}
        </View>

        <Text style={estilos.titulo}>{paso.titulo}</Text>
        <Text style={estilos.ayuda}>
          Paso {indice + 1} de {PASOS.length} — {paso.ayuda}
        </Text>

        {paso.clave === "rubro" && (
          <View style={estilos.rubros}>
            {TIPOS_COMERCIO.map((opcion) => (
              <Pressable
                key={opcion.tipo}
                onPress={() => cambiar("tipo", opcion.tipo)}
                style={[estilos.rubro, opcion.tipo === valores.tipo && estilos.rubroElegido]}
              >
                <Text style={estilos.rubroEmoji}>{opcion.emoji}</Text>
                <View style={estilos.flex}>
                  <Text style={estilos.rubroTitulo}>{opcion.etiqueta}</Text>
                  <Text style={estilos.rubroResumen}>{opcion.resumen}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {paso.clave === "datos" && (
          <>
            <Campo
              etiqueta="Nombre"
              value={valores.nombre}
              onChangeText={(t) => cambiar("nombre", t)}
              placeholder="Parador El Remanso"
              maxLength={120}
            />
            <View style={estilos.campo}>
              <Text style={estilos.campoEtiqueta}>Descripción</Text>
              <TextInput
                style={estilos.textarea}
                multiline
                maxLength={600}
                placeholder="Contá en dos líneas qué te hace distinto."
                placeholderTextColor={COLORES.textoSuave}
                value={valores.descripcion}
                onChangeText={(t) => cambiar("descripcion", t)}
              />
            </View>
          </>
        )}

        {paso.clave === "ubicacion" && (
          <>
            <Text style={estilos.ayuda}>
              Tocá el mapa donde está tu lugar. Es lo que va a ver el nauta y lo que usa
              el botón &ldquo;Cómo llegar&rdquo;.
            </Text>
            <MapView
              style={estilos.mapa}
              initialRegion={{
                ...(posicion ?? CENTRO_POR_DEFECTO),
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              mapType="hybrid"
              showsUserLocation={Boolean(posicion)}
              toolbarEnabled={false}
              onPress={(e) => setPunto(e.nativeEvent.coordinate)}
            >
              {punto && <Marker coordinate={punto} draggable
                onDragEnd={(e) => setPunto(e.nativeEvent.coordinate)} />}
            </MapView>
            <Text style={estilos.coords}>
              {punto
                ? `${punto.latitude.toFixed(5)}, ${punto.longitude.toFixed(5)}`
                : "Todavía no marcaste el punto."}
            </Text>

            <Campo
              etiqueta="WhatsApp"
              keyboardType="phone-pad"
              value={valores.whatsapp}
              onChangeText={(t) => cambiar("whatsapp", t)}
              placeholder="3794000000"
            />
          </>
        )}

        <Error>{error}</Error>

        <View style={estilos.acciones}>
          {indice > 0 && (
            <Boton
              titulo="Atrás"
              variante="secundario"
              estilo={estilos.flex}
              onPress={() => {
                setError("");
                setIndice((i) => i - 1);
              }}
            />
          )}
          <Boton
            titulo={esUltimo ? "Crear mi comercio" : "Continuar"}
            estilo={estilos.flex}
            onPress={continuar}
            cargando={enviando}
            deshabilitado={!completo}
          />
        </View>

        {esUltimo && (
          <Text style={estilos.nota}>
            Cuando lo crees queda en revisión. Lo miramos y, apenas lo aprobamos, aparece
            en el mapa de todos los nautas.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.fondo },
  contenido: { padding: 20, gap: 14, paddingBottom: 40 },
  flex: { flex: 1 },

  progreso: { flexDirection: "row", gap: 6, marginBottom: 6 },
  punto: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORES.borde },
  puntoActivo: { backgroundColor: COLORES.acento },

  titulo: { fontSize: 25, fontWeight: "800", color: COLORES.texto },
  ayuda: { fontSize: 14, lineHeight: 21, color: COLORES.textoSuave },

  rubros: { gap: 10, marginTop: 4 },
  rubro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  rubroElegido: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  rubroEmoji: { fontSize: 26 },
  rubroTitulo: { fontSize: 15, fontWeight: "700", color: COLORES.texto },
  rubroResumen: { fontSize: 13, color: COLORES.textoSuave, marginTop: 2 },

  campo: { gap: 6 },
  campoEtiqueta: { fontSize: 14, fontWeight: "600", color: COLORES.texto },
  textarea: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    padding: 12,
    minHeight: 90,
    fontSize: 16,
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
    textAlignVertical: "top",
  },

  mapa: { height: 280, borderRadius: 12 },
  coords: { fontSize: 12, color: COLORES.textoSuave, fontVariant: ["tabular-nums"] },

  acciones: { flexDirection: "row", gap: 10, marginTop: 6 },
  nota: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
});
