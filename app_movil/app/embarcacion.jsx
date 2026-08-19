import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Texto as Text } from "../src/Texto.jsx";
import { SafeAreaView } from "react-native-safe-area-context";

import { Boton, Error } from "../src/componentes.jsx";
import { EMBARCACIONES } from "../src/embarcaciones.js";
import { useSesion } from "../src/sesion.jsx";
import { COLORES } from "../src/tema.js";

/**
 * Onboarding de una sola pregunta: ¿con qué salís?
 *
 * No es un dato de perfil decorativo. Todo el resto de la app lo usa para
 * decidir a partir de qué viento le avisa que el río está picado (ver
 * backend/clima.py): 20 km/h es una tarde tranquila para una lancha de siete
 * metros y un problema serio para un kayak. Sin esta respuesta, la app solo
 * podría mostrar el número crudo, que es lo que ya hace cualquier app del
 * clima.
 */
export default function ElegirEmbarcacion() {
  const { usuario, actualizarPerfil } = useSesion();
  const router = useRouter();
  const [elegida, setElegida] = useState(usuario?.tipo_embarcacion ?? null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function continuar() {
    setError("");
    setGuardando(true);
    try {
      await actualizarPerfil({ tipo_embarcacion: elegida });
      router.replace("/(tabs)");
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.pantalla} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <View style={estilos.encabezado}>
          <Text style={estilos.titulo}>¿Con qué salís?</Text>
          <Text style={estilos.bajada}>
            Con esto calibramos los avisos de viento. Podés cambiarlo cuando quieras
            desde tu perfil.
          </Text>
        </View>

        <View style={estilos.grilla}>
          {EMBARCACIONES.map((embarcacion) => {
            const activa = embarcacion.clave === elegida;
            return (
              <Pressable
                key={embarcacion.clave}
                onPress={() => setElegida(embarcacion.clave)}
                style={[estilos.tarjeta, activa && estilos.tarjetaActiva]}
              >
                <Text style={estilos.emoji}>{embarcacion.emoji}</Text>
                <Text style={[estilos.tarjetaTexto, activa && estilos.tarjetaTextoActivo]}>
                  {embarcacion.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Error>{error}</Error>
      </ScrollView>

      <View style={estilos.pie}>
        <Boton
          titulo="Listo"
          onPress={continuar}
          cargando={guardando}
          deshabilitado={!elegida}
        />
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.fondo },
  contenido: { padding: 20, gap: 24 },
  encabezado: { gap: 8, paddingTop: 12 },
  titulo: { fontSize: 28, fontWeight: "800", color: COLORES.texto },
  bajada: { fontSize: 15, lineHeight: 22, color: COLORES.textoSuave },

  grilla: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tarjeta: {
    // Dos columnas con 12 de separacion: 48% deja el hueco justo sin tener
    // que medir el ancho de la pantalla.
    width: "48%",
    aspectRatio: 1.35,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  tarjetaActiva: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  emoji: { fontSize: 32 },
  tarjetaTexto: { fontSize: 14, fontWeight: "600", color: COLORES.texto },
  tarjetaTextoActivo: { color: COLORES.acento },

  pie: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
    backgroundColor: COLORES.superficie,
  },
});
