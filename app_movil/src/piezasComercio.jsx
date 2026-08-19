// Piezas compartidas por las pantallas del comerciante.
import React from "react";
import { StyleSheet, View } from "react-native";

import { ETIQUETAS_ESTADO } from "./comercio.js";
import { Texto as Text } from "./Texto.jsx";
import { COLORES } from "./tema.js";

const COLOR_POR_ESTADO = {
  aprobado: COLORES.ok,
  pendiente: COLORES.alerta,
  rechazado: COLORES.peligro,
};

export function ChipEstado({ estado }) {
  return (
    <View style={[estilos.chip, { backgroundColor: COLOR_POR_ESTADO[estado] ?? COLORES.textoSuave }]}>
      <Text style={estilos.chipTexto}>{ETIQUETAS_ESTADO[estado] ?? estado}</Text>
    </View>
  );
}

/**
 * Aviso de arriba de todo con el estado de publicacion.
 *
 * Es lo primero que el comerciante quiere saber al entrar ("¿ya me ven?"), y
 * por eso ocupa el lugar mas visible de la pantalla en vez de un chip
 * discreto. Cuando ya esta publicado no muestra nada: no hace falta un cartel
 * permanente para decir que todo esta bien.
 */
export function AvisoEstado({ comercio }) {
  if (!comercio || comercio.estado === "aprobado") return null;

  if (comercio.estado === "rechazado") {
    return (
      <View style={[estilos.aviso, estilos.avisoRechazado]}>
        <Text style={estilos.avisoTitulo}>Tu ficha fue rechazada</Text>
        <Text style={estilos.avisoTexto}>
          {comercio.motivo_rechazo || "Escribinos si no sabés por qué."} Corregí lo que
          haga falta y se vuelve a revisar sola.
        </Text>
      </View>
    );
  }

  return (
    <View style={[estilos.aviso, estilos.avisoPendiente]}>
      <Text style={estilos.avisoTitulo}>Tu ficha está en revisión</Text>
      <Text style={estilos.avisoTexto}>
        Todavía no se ve en el mapa. Mientras tanto podés dejar todo listo.
      </Text>
    </View>
  );
}

/** Bloque con titulo, del mismo alto y borde que el resto de las tarjetas. */
export function Tarjeta({ titulo, children, estilo }) {
  return (
    <View style={[estilos.tarjeta, estilo]}>
      {titulo ? <Text style={estilos.tarjetaTitulo}>{titulo}</Text> : null}
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  chip: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, alignSelf: "flex-start" },
  chipTexto: { color: "#fff", fontSize: 12, fontWeight: "700" },

  aviso: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 4 },
  avisoPendiente: { backgroundColor: "#fdf6e7", borderColor: "#e8d5a8" },
  avisoRechazado: { backgroundColor: "#fdefed", borderColor: "#f0c3bc" },
  avisoTitulo: { fontSize: 15, fontWeight: "800", color: "#6b4d0c" },
  avisoTexto: { fontSize: 13, lineHeight: 19, color: "#6b4d0c" },

  tarjeta: {
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES.borde,
    padding: 16,
    gap: 12,
  },
  tarjetaTitulo: { fontSize: 16, fontWeight: "800", color: COLORES.texto },
});
