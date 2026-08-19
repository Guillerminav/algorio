import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { TextoMarca } from "../src/Texto.jsx";
import { useSesion } from "../src/sesion.jsx";
import { COLORES } from "../src/tema.js";

/**
 * Puerta de entrada: decide a donde va cada quien al abrir la app.
 *
 * La app sirve a dos de los tres perfiles del producto, con pantallas
 * distintas: el nauta recreativo (mapa, clima, reseñas) y el comerciante
 * (su ficha, horarios, metricas). El tercero —naviera— es un dashboard denso
 * de tablas y no tiene version movil: se lo manda a la web.
 */
export default function Entrada() {
  const { usuario, cargando } = useSesion();

  if (cargando) {
    return (
      <View style={estilos.pantalla}>
        {/* Sin tilde a proposito: la tipografia del logo no trae acentos. */}
        <TextoMarca style={estilos.marca}>AlgoRio</TextoMarca>
        <ActivityIndicator color={COLORES.marcaTextoSuave} />
      </View>
    );
  }

  if (!usuario) return <Redirect href="/login" />;
  if (usuario.rol === "comercio") return <Redirect href="/(comercio)" />;
  if (usuario.rol === "naviera") return <Redirect href="/solo-web" />;

  // Nauta recreativo. Sin embarcacion elegida no se entra: es lo que calibra
  // los avisos de viento, y sin ese dato la app solo podria mostrar el numero
  // crudo, que es lo que ya hace cualquier app del clima.
  if (!usuario.tipo_embarcacion) return <Redirect href="/embarcacion" />;
  return <Redirect href="/(tabs)" />;
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: COLORES.marca,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  marca: { color: "#fff", fontSize: 34, letterSpacing: 0.5 },
});
