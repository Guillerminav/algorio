import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Texto as Text } from "./Texto.jsx";
import { COLORES } from "./tema.js";

const ALTO_PUNTA = 10;
const MARGEN_SUPERIOR = 6;

/**
 * Hacia dónde queda el lugar, apuntando de verdad.
 *
 * La aguja apunta al destino RELATIVO A CÓMO ESTÁS PARADO: al rumbo se le
 * resta la orientación del teléfono, así que si girás, la aguja se queda
 * apuntando al parador. Eso es lo que la hace usable arriba de una lancha —
 * una flecha que apunta "al noreste" obliga a saber dónde queda el noreste.
 *
 * Si no hay magnetómetro (el emulador no tiene, y algún teléfono viejo
 * tampoco) se cae con elegancia: la aguja pasa a apuntar al rumbo absoluto con
 * el norte arriba, y abajo queda la letra de la rosa, que sigue sirviendo con
 * una brújula aparte o el sol de referencia. `norteArriba` no es un estado de
 * error: es el modo degradado.
 *
 * Las dos capas que giran son cajas del tamaño completo del círculo, no
 * elementos con `transformOrigin` corrido: así rotan sobre el centro por
 * construcción y el dibujo no se desarma al cambiar `tamano`.
 */
export default function Brujula({ grados, letras, tamano = 64 }) {
  const [orientacion, setOrientacion] = useState(null);

  useEffect(() => {
    let suscripcion;
    let cancelado = false;

    (async () => {
      try {
        // El permiso ya lo pide useUbicacion al arrancar; acá solo se
        // confirma, porque sin él watchHeadingAsync tira.
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted" || cancelado) return;

        suscripcion = await Location.watchHeadingAsync((lectura) => {
          if (cancelado) return;
          // `trueHeading` es -1 mientras el teléfono no lo calculó (hay que
          // mover el aparato). Ahí sirve el magnético: se diferencian por la
          // declinación, que en el litoral es menos de 10° y no cambia por qué
          // lado conviene salir.
          const grados = lectura.trueHeading >= 0 ? lectura.trueHeading : lectura.magHeading;
          if (typeof grados === "number" && grados >= 0) setOrientacion(grados);
        });
      } catch {
        // Sin magnetómetro queda el modo norte arriba, que ya es el estado.
      }
    })();

    return () => {
      cancelado = true;
      suscripcion?.remove?.();
    };
  }, []);

  if (grados === null || grados === undefined) return null;

  const norteArriba = orientacion === null;
  const anguloAguja = norteArriba ? grados : (grados - orientacion + 360) % 360;
  const radio = tamano / 2;
  // La varilla llega justo al centro: margen + punta + varilla = radio.
  const altoVarilla = Math.max(radio - MARGEN_SUPERIOR - ALTO_PUNTA, 2);

  return (
    <View
      style={[estilos.circulo, { width: tamano, height: tamano, borderRadius: radio }]}
      accessibilityLabel={letras ? `El lugar queda al ${letras}` : "Rumbo al lugar"}
    >
      {/* La rosa gira con el teléfono… */}
      <View
        style={[
          StyleSheet.absoluteFill,
          estilos.capa,
          { transform: [{ rotate: `${norteArriba ? 0 : -orientacion}deg` }] },
        ]}
      >
        <Text style={estilos.norte}>N</Text>
      </View>

      {/* …y la aguja, con el destino. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          estilos.capa,
          { transform: [{ rotate: `${anguloAguja}deg` }] },
        ]}
      >
        <View style={estilos.punta} />
        <View style={[estilos.varilla, { height: altoVarilla }]} />
      </View>

      <View style={estilos.centro} />
      {letras && <Text style={estilos.letras}>{letras}</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  circulo: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  capa: { alignItems: "center", paddingTop: MARGEN_SUPERIOR },
  norte: { fontSize: 9, fontWeight: "800", color: COLORES.textoSuave, letterSpacing: 0.5 },
  punta: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: ALTO_PUNTA,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: COLORES.acento,
  },
  varilla: { width: 2.5, borderRadius: 2, backgroundColor: COLORES.acento },
  centro: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORES.acento,
  },
  letras: { position: "absolute", bottom: 5, fontSize: 10, fontWeight: "800", color: COLORES.textoSuave },
});
