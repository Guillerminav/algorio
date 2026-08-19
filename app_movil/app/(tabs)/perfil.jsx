import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Texto as Text } from "../../src/Texto.jsx";

import { Boton, Estrellas, Vacio } from "../../src/componentes.jsx";
import { EMBARCACIONES } from "../../src/embarcaciones.js";
import { useSesion } from "../../src/sesion.jsx";
import { COLORES, tipoPoi } from "../../src/tema.js";

export default function PantallaPerfil() {
  const { usuario, actualizarPerfil, salir, api } = useSesion();
  const router = useRouter();
  const [misResenas, setMisResenas] = useState([]);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    let cancelado = false;
    api("/api/mis-resenas")
      .then((d) => !cancelado && setMisResenas(d))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [api]);

  async function cambiarEmbarcacion(clave) {
    if (clave === usuario?.tipo_embarcacion) return;
    setGuardando(clave);
    try {
      await actualizarPerfil({ tipo_embarcacion: clave });
    } catch (e) {
      Alert.alert("No se pudo guardar", e.message);
    } finally {
      setGuardando(null);
    }
  }

  function confirmarSalida() {
    Alert.alert("Cerrar sesión", "¿Querés salir de tu cuenta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          await salir();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.tarjeta}>
        <Text style={estilos.nombre}>{usuario?.nombre_completo || usuario?.usuario}</Text>
        <Text style={estilos.email}>{usuario?.email}</Text>
      </View>

      <View style={estilos.tarjeta}>
        <Text style={estilos.tarjetaTitulo}>¿Con qué salís?</Text>
        <Text style={estilos.ayuda}>
          Define desde qué viento te avisamos que el río está picado.
        </Text>
        <View style={estilos.grilla}>
          {EMBARCACIONES.map((embarcacion) => {
            const activa = embarcacion.clave === usuario?.tipo_embarcacion;
            return (
              <Pressable
                key={embarcacion.clave}
                onPress={() => cambiarEmbarcacion(embarcacion.clave)}
                disabled={guardando !== null}
                style={[
                  estilos.chip,
                  activa && estilos.chipActivo,
                  guardando === embarcacion.clave && estilos.chipGuardando,
                ]}
              >
                <Text style={[estilos.chipTexto, activa && estilos.chipTextoActivo]}>
                  {embarcacion.emoji} {embarcacion.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={estilos.tarjeta}>
        <Text style={estilos.tarjetaTitulo}>Mis reseñas</Text>
        {misResenas.length === 0 ? (
          <Vacio>Todavía no puntuaste ningún lugar.</Vacio>
        ) : (
          misResenas.map((resena) => (
            <Pressable
              key={resena.id}
              style={estilos.resena}
              onPress={() => router.push(`/lugar/${resena.poi_id}`)}
            >
              <View style={estilos.resenaEncabezado}>
                <Text style={estilos.resenaLugar} numberOfLines={1}>
                  {tipoPoi(resena.poi_tipo).emoji} {resena.poi_nombre}
                </Text>
                <Estrellas puntaje={resena.puntaje} tamano={13} />
              </View>
              {resena.comentario && (
                <Text style={estilos.resenaComentario} numberOfLines={2}>
                  {resena.comentario}
                </Text>
              )}
            </Pressable>
          ))
        )}
      </View>

      <Boton titulo="Cerrar sesión" variante="secundario" onPress={confirmarSalida} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 16 },
  tarjeta: {
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES.borde,
    padding: 16,
    gap: 10,
  },
  nombre: { fontSize: 20, fontWeight: "800", color: COLORES.texto },
  email: { fontSize: 14, color: COLORES.textoSuave },
  tarjetaTitulo: { fontSize: 16, fontWeight: "800", color: COLORES.texto },
  ayuda: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave, marginTop: -4 },

  grilla: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  chipActivo: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  chipGuardando: { opacity: 0.5 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: COLORES.textoSuave },
  chipTextoActivo: { color: COLORES.acento },

  resena: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
    gap: 4,
  },
  resenaEncabezado: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  resenaLugar: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORES.texto },
  resenaComentario: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
});
