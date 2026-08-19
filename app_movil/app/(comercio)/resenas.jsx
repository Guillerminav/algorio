import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { Cargando, Error, Estrellas, Vacio } from "../../src/componentes.jsx";
import { Tarjeta } from "../../src/piezasComercio.jsx";
import { useSesion } from "../../src/sesion.jsx";
import { Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";

function formatearFecha(iso) {
  if (!iso) return "";
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

export default function ResenasComercio() {
  const { api } = useSesion();
  const { comercio } = useComercio();
  const [resenas, setResenas] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    setError("");
    try {
      setResenas(await api("/api/mi-comercio/resenas"));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [api]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <Cargando />;

  const promedio = comercio?.puntaje_promedio;

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
      <Error>{error}</Error>

      <Tarjeta>
        {promedio === null || promedio === undefined ? (
          <Vacio>Todavía nadie te puntuó.</Vacio>
        ) : (
          <View style={estilos.resumen}>
            <Text style={estilos.promedio}>{promedio.toFixed(1)}</Text>
            <View style={estilos.resumenDatos}>
              <Estrellas puntaje={Math.round(promedio)} tamano={18} />
              <Text style={estilos.cantidad}>
                {resenas.length} {resenas.length === 1 ? "reseña" : "reseñas"}
              </Text>
            </View>
          </View>
        )}
      </Tarjeta>

      {resenas.map((resena) => (
        <Tarjeta key={resena.id} estilo={estilos.resena}>
          <View style={estilos.resenaEncabezado}>
            <Text style={estilos.autor}>{resena.autor}</Text>
            <Estrellas puntaje={resena.puntaje} tamano={13} />
          </View>
          <Text style={estilos.fecha}>{formatearFecha(resena.creado_en)}</Text>
          {resena.comentario ? (
            <Text style={estilos.comentario}>{resena.comentario}</Text>
          ) : null}
        </Tarjeta>
      ))}

      <Text style={estilos.pie}>
        No se pueden borrar ni editar desde acá. Si algo te parece injusto, escribinos.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12 },

  resumen: { flexDirection: "row", alignItems: "center", gap: 14 },
  promedio: { fontSize: 40, fontWeight: "800", color: COLORES.texto, lineHeight: 44 },
  resumenDatos: { gap: 4 },
  cantidad: { fontSize: 13, color: COLORES.textoSuave },

  resena: { gap: 5 },
  resenaEncabezado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  autor: { flex: 1, fontSize: 15, fontWeight: "700", color: COLORES.texto },
  fecha: { fontSize: 12, color: COLORES.textoSuave },
  comentario: { fontSize: 14, lineHeight: 20, color: COLORES.texto, marginTop: 2 },

  pie: { fontSize: 12, lineHeight: 18, color: COLORES.textoSuave, paddingHorizontal: 2 },
});
