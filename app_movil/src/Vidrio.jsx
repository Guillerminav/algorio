// Las superficies que van ARRIBA del mapa.
//
// Todo lo que flota sobre la imagen satelital —el cartel del viento, los
// filtros de rubro, los botones sueltos— usa estas piezas y no un View con
// backgroundColor. La razon no es estetica: sobre un fondo que cambia de
// color cada vez que uno arrastra el mapa, un panel opaco tapa justo lo que se
// esta mirando, y uno translucido sin desenfoque deja el texto ilegible
// cuando abajo pasa una costa clara. El desenfoque resuelve las dos cosas: se
// sigue viendo que hay mapa debajo y el texto no depende de que hay.
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { VIDRIO } from "./tema.js";

// `experimentalBlurMethod` es lo que hace que Android desenfoque de verdad: sin
// eso expo-blur ahi solo pinta un velo del color de `tint` y el efecto se
// pierde. En iOS el desenfoque es nativo y la prop se ignora.
const PROPS_DESENFOQUE = Platform.select({
  android: { experimentalBlurMethod: "dimezisBlurView" },
  default: {},
});

/**
 * Las capas del vidrio, en orden de abajo hacia arriba.
 *
 * El velo va ENCIMA del desenfoque y no debajo: es lo que garantiza el
 * contraste del texto los dias que el blur no llega a aplicarse (Android
 * viejo, o el modo de ahorro de energia, que lo desactiva).
 *
 * El borde va en su propia capa y no como `borderWidth` del contenedor: en
 * Android el recorte del BlurView y el borde redondeado no siempre caen en el
 * mismo pixel y queda un hilito del fondo asomando en las esquinas.
 */
function Capas({ radio, denso, tinte }) {
  return (
    <>
      <BlurView
        intensity={VIDRIO.intensidadDesenfoque}
        tint="dark"
        style={StyleSheet.absoluteFill}
        {...PROPS_DESENFOQUE}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: denso ? VIDRIO.fondoDenso : VIDRIO.fondo },
        ]}
      />
      {/* Un color por encima del velo, para los estados que si necesitan
          gritar — el modo "estoy por dejar un aviso", por ejemplo. Va aca y no
          como fondo del contenedor porque el velo lo taparia. */}
      {tinte && <View style={[StyleSheet.absoluteFill, { backgroundColor: tinte }]} />}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radio,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: VIDRIO.borde,
          },
        ]}
      />
    </>
  );
}

/**
 * Panel de vidrio.
 *
 * `denso` es para lo que tiene que leerse si o si (el cartel del viento); el
 * resto va mas transparente para dejar ver el mapa.
 */
export function Vidrio({ children, estilo, radio = 16, denso = false, tinte = null, ...resto }) {
  return (
    <View style={[{ borderRadius: radio, overflow: "hidden" }, estilo]} {...resto}>
      <Capas radio={radio} denso={denso} tinte={tinte} />
      {children}
    </View>
  );
}

/** Lo mismo, pero que responde al toque. */
export function VidrioTocable({
  children,
  estilo,
  radio = 16,
  denso = false,
  tinte = null,
  onPress,
  ...resto
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { borderRadius: radio, overflow: "hidden" },
        estilo,
        pressed && { opacity: 0.75 },
      ]}
      {...resto}
    >
      <Capas radio={radio} denso={denso} tinte={tinte} />
      {children}
    </Pressable>
  );
}
