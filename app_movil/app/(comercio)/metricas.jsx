import React, { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { ETIQUETAS_VISITA } from "../../src/comercio.js";
import { Cargando, Error, Vacio } from "../../src/componentes.jsx";
import { AvisoEstado, Tarjeta } from "../../src/piezasComercio.jsx";
import { useSesion } from "../../src/sesion.jsx";
import { Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";

// Los tres cortes que le importan a un comercio de rio: como viene el fin de
// semana, como viene el mes, y como viene la temporada.
const RANGOS = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
];

const COLOR = {
  ficha: COLORES.acento,
  whatsapp: COLORES.ok,
  telefono: COLORES.acentoClaro,
  como_llegar: COLORES.alerta,
};

/**
 * Barras horizontales en vez de un grafico de verdad.
 *
 * En una pantalla de telefono un grafico de 90 dias es una mancha ilegible, y
 * sumar una libreria de charts al bundle por eso no se justifica. Lo que el
 * comerciante necesita saber —cual accion le funciona y cuanto— se lee mejor
 * en cuatro barras comparadas entre si.
 */
function BarraMetrica({ clave, cantidad, maximo }) {
  const ancho = maximo > 0 ? Math.max(cantidad / maximo, cantidad > 0 ? 0.04 : 0) : 0;
  return (
    <View style={estilos.fila}>
      <Text style={estilos.filaEtiqueta}>{ETIQUETAS_VISITA[clave] ?? clave}</Text>
      <View style={estilos.filaBarraFondo}>
        <View style={[estilos.filaBarra, { width: `${ancho * 100}%`, backgroundColor: COLOR[clave] }]} />
      </View>
      <Text style={estilos.filaNumero}>{cantidad}</Text>
    </View>
  );
}

export default function MetricasComercio() {
  const { api } = useSesion();
  const { comercio, cargando: cargandoComercio } = useComercio();
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  async function cargar() {
    setError("");
    try {
      setDatos(await api(`/api/mi-comercio/metricas?dias=${dias}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }

  useEffect(() => {
    cargar();
    // `cargar` se redefine en cada render; ponerla en las dependencias seria
    // un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  if (cargandoComercio || cargando) return <Cargando />;

  const totales = datos?.totales ?? {};
  const claves = Object.keys(ETIQUETAS_VISITA);
  const maximo = Math.max(...claves.map((c) => totales[c] ?? 0), 1);
  const total = claves.reduce((suma, c) => suma + (totales[c] ?? 0), 0);

  return (
    <ScrollView
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl
          refreshing={refrescando}
          onRefresh={() => {
            setRefrescando(true);
            cargar();
          }}
          tintColor={COLORES.acento}
        />
      }
    >
      <AvisoEstado comercio={comercio} />

      <View style={estilos.rangos}>
        {RANGOS.map((rango) => (
          <Pressable
            key={rango.dias}
            onPress={() => setDias(rango.dias)}
            style={[estilos.chipRango, rango.dias === dias && estilos.chipRangoActivo]}
          >
            <Text style={[estilos.chipRangoTexto, rango.dias === dias && estilos.chipRangoTextoActivo]}>
              {rango.etiqueta}
            </Text>
          </Pressable>
        ))}
      </View>

      <Error>{error}</Error>

      <Tarjeta titulo={`${total} ${total === 1 ? "interacción" : "interacciones"}`}>
        {total === 0 ? (
          <Vacio>
            {comercio?.estado === "aprobado"
              ? "Todavía no hay movimiento en este período."
              : "Tu ficha todavía no está publicada, así que nadie puede verte en el mapa."}
          </Vacio>
        ) : (
          claves.map((clave) => (
            <BarraMetrica key={clave} clave={clave} cantidad={totales[clave] ?? 0} maximo={maximo} />
          ))
        )}
      </Tarjeta>

      <Text style={estilos.pie}>
        Se cuenta una vez por acción: abrir tu ficha, tocar tu teléfono, escribirte por
        WhatsApp o pedir cómo llegar.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 14 },

  rangos: { flexDirection: "row", gap: 8 },
  chipRango: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  chipRangoActivo: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  chipRangoTexto: { fontSize: 13, fontWeight: "600", color: COLORES.textoSuave },
  chipRangoTextoActivo: { color: COLORES.acento },

  fila: { gap: 5 },
  filaEtiqueta: { fontSize: 13, color: COLORES.texto },
  filaBarraFondo: {
    flexDirection: "row",
    alignItems: "center",
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORES.bordeSuave,
  },
  filaBarra: { height: 10, borderRadius: 5 },
  filaNumero: {
    position: "absolute",
    right: 0,
    top: 0,
    fontSize: 13,
    fontWeight: "800",
    color: COLORES.texto,
  },

  pie: { fontSize: 12, lineHeight: 18, color: COLORES.textoSuave, paddingHorizontal: 2 },
});
