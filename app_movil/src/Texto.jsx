import React from "react";
import { StyleSheet, Text as TextRN, TextInput as TextInputRN } from "react-native";

import { FUENTE_MARCA } from "./tema.js";

/**
 * Texto de la app.
 *
 * A diferencia de la web —que usa Host Grotesk, la tipografia de la marca— la
 * app usa la del sistema: San Francisco en iPhone, Roboto en Android. Es una
 * decision deliberada y no una simplificacion:
 *
 * - Se lee mejor en las condiciones reales de uso. La fuente del sistema esta
 *   ajustada por el fabricante para pantallas chicas al sol, que es
 *   exactamente donde se usa esto.
 * - Respeta el tamaño de texto que el usuario configuro en su telefono.
 * - No hay que meter 290 KB de tipografias en el binario ni esperar a que
 *   carguen antes de dibujar la primera pantalla.
 *
 * En React Native, no declarar `fontFamily` YA da la fuente del sistema. Por
 * eso este componente no toca el estilo: es un pasamanos deliberado. Existe
 * igual, y las pantallas lo siguen usando, porque es el unico lugar donde vive
 * la decision tipografica de la app: si algun dia se vuelve a una fuente
 * propia, se cambia aca y en ningun otro lado.
 *
 * Ademas, al no forzar familia, `fontWeight` vuelve a funcionar nativamente:
 * el sistema tiene todos los pesos y no hay que mapear cada uno a un archivo.
 */
export function Texto(props) {
  return <TextRN {...props} />;
}

/**
 * Devuelve el estilo tal cual, para las opciones de navegacion
 * (headerTitleStyle, tabBarLabelStyle) que reciben un objeto y no un
 * componente.
 *
 * Hoy no transforma nada. Se mantiene por lo mismo que `Texto`: es el punto
 * unico por el que pasa la tipografia de la app, y sacarlo obligaria a tocar
 * los layouts el dia que haya que volver a intervenir.
 */
export function conFuente(estilo) {
  return StyleSheet.flatten(estilo) ?? {};
}

/**
 * El wordmark "AlgoRio", en la tipografia del logo.
 *
 * Es la unica excepcion: la marca no es texto de interfaz. OJO, va sin tilde
 * porque este archivo trae 187 glifos y ninguna vocal acentuada — "AlgoRío"
 * dibujaria la "í" con otra fuente. Mismo criterio que la web.
 */
export function TextoMarca({ style, ...props }) {
  const { fontWeight, ...resto } = StyleSheet.flatten(style) ?? {};
  return <TextRN {...props} style={{ ...resto, fontFamily: FUENTE_MARCA }} />;
}

/** Los campos de formulario, que tambien dibujan texto. */
export function CampoTexto(props) {
  return <TextInputRN {...props} />;
}
