// Piezas chicas que se repiten en varias pantallas.
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Texto as Text, CampoTexto as TextInput } from "./Texto.jsx";

import { COLORES } from "./tema.js";

export function Boton({ titulo, onPress, cargando, deshabilitado, variante = "primario", estilo }) {
  const apagado = deshabilitado || cargando;
  const esSecundario = variante === "secundario";
  return (
    <Pressable
      onPress={onPress}
      disabled={apagado}
      style={({ pressed }) => [
        estilos.boton,
        esSecundario && estilos.botonSecundario,
        apagado && estilos.botonApagado,
        pressed && !apagado && estilos.botonPresionado,
        estilo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={esSecundario ? COLORES.acento : "#fff"} />
      ) : (
        <Text style={[estilos.botonTexto, esSecundario && estilos.botonTextoSecundario]}>
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Campo de texto con etiqueta.
 *
 * `ayuda` es la aclaracion chica debajo del campo ("cada cuantos minutos") y
 * `estilo` sirve para que el contenedor participe de una grilla. Los dos son
 * opcionales: existen para que las pantallas que los necesitan no tengan que
 * armarse su propio campo con otras medidas — que es como termina habiendo dos
 * estilos de input en la misma app.
 */
export function Campo({ etiqueta, ayuda, estilo, ...props }) {
  return (
    <View style={[estilos.campo, estilo]}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <TextInput
        style={estilos.campoInput}
        placeholderTextColor={COLORES.textoSuave}
        {...props}
      />
      {ayuda ? <Text style={estilos.campoAyuda}>{ayuda}</Text> : null}
    </View>
  );
}

export function Error({ children }) {
  if (!children) return null;
  return <Text style={estilos.error}>{children}</Text>;
}

export function Cargando({ texto = "Cargando…" }) {
  return (
    <View style={estilos.cargando}>
      <ActivityIndicator color={COLORES.acento} />
      <Text style={estilos.cargandoTexto}>{texto}</Text>
    </View>
  );
}

export function Vacio({ children }) {
  return (
    <View style={estilos.cargando}>
      <Text style={estilos.cargandoTexto}>{children}</Text>
    </View>
  );
}

// Cinco estrellas siempre dibujadas, las llenas en color: es mas facil de leer
// de un vistazo que un numero suelto, y ocupa lo mismo con cualquier puntaje.
export function Estrellas({ puntaje, tamano = 15, onElegir }) {
  return (
    <View style={estilos.estrellas}>
      {[1, 2, 3, 4, 5].map((n) => {
        const estrella = (
          <Text
            style={{
              fontSize: tamano,
              color: n <= Math.round(puntaje ?? 0) ? COLORES.alerta : COLORES.borde,
            }}
          >
            ★
          </Text>
        );
        if (!onElegir) return <View key={n}>{estrella}</View>;
        return (
          <Pressable key={n} onPress={() => onElegir(n)} hitSlop={6} style={estilos.estrellaTocable}>
            {estrella}
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  boton: {
    backgroundColor: COLORES.acento,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  botonSecundario: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  botonApagado: { opacity: 0.5 },
  botonPresionado: { opacity: 0.85 },
  botonTexto: { color: "#fff", fontSize: 16, fontWeight: "700" },
  botonTextoSecundario: { color: COLORES.texto, fontWeight: "600" },

  campo: { gap: 6 },
  campoEtiqueta: { fontSize: 14, fontWeight: "600", color: COLORES.texto },
  campoAyuda: { fontSize: 12, color: COLORES.textoSuave },
  campoInput: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
  },

  error: { color: COLORES.peligro, fontSize: 14, lineHeight: 20 },

  cargando: { padding: 32, alignItems: "center", gap: 10 },
  cargandoTexto: { color: COLORES.textoSuave, fontSize: 14, textAlign: "center", lineHeight: 20 },

  estrellas: { flexDirection: "row", gap: 2 },
  estrellaTocable: { padding: 2 },
});
