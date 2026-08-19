import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Boton, Error } from "./componentes.jsx";
import { useSesion } from "./sesion.jsx";
import { CampoTexto as TextInput, Texto as Text } from "./Texto.jsx";
import { COLORES, DURACIONES, SEVERIDADES, TIPOS_REPORTE, tipoReporte } from "./tema.js";

/**
 * Formulario para reportar algo en un punto del rio.
 *
 * El punto ya viene elegido: se toca el mapa antes de abrir esto, porque pedir
 * coordenadas dentro del modal obligaria a meter un segundo mapa adentro del
 * primero.
 *
 * La duracion es obligatoria y no hay opcion "para siempre" a proposito. Un
 * tronco se va con la correntada y un banco se mueve con la creciente: un
 * aviso permanente termina llenando el mapa de peligros que ya no estan, y eso
 * es peor que no tener nada porque el nauta deja de creerle.
 */
export default function ModalReporte({ punto, visible, onCerrar, onCreado }) {
  const { api } = useSesion();
  const [tipo, setTipo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [severidad, setSeveridad] = useState("comentario");
  const [comentario, setComentario] = useState("");
  const [duracionHoras, setDuracionHoras] = useState(24);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const definicion = tipo ? tipoReporte(tipo) : null;

  function limpiar() {
    setTipo("");
    setDetalle("");
    setSeveridad("comentario");
    setComentario("");
    setDuracionHoras(24);
    setError("");
  }

  async function enviar() {
    setError("");
    setEnviando(true);
    try {
      await api("/api/reportes", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          detalle: detalle.trim() || null,
          severidad,
          comentario: comentario.trim() || null,
          duracion_horas: duracionHoras,
          lat: punto.latitude,
          lon: punto.longitude,
        }),
      });
      await onCreado();
      limpiar();
      onCerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={estilos.fondo}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={estilos.hoja}>
          <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
            <Text style={estilos.titulo}>¿Qué viste?</Text>
            {punto && (
              <Text style={estilos.punto}>
                En {punto.latitude.toFixed(4)}, {punto.longitude.toFixed(4)}
              </Text>
            )}

            <View style={estilos.tipos}>
              {Object.entries(TIPOS_REPORTE).map(([clave, def]) => (
                <Pressable
                  key={clave}
                  onPress={() => setTipo(clave)}
                  style={[estilos.tipo, clave === tipo && estilos.tipoElegido]}
                >
                  <Text style={estilos.tipoEmoji}>{def.emoji}</Text>
                  <Text style={[estilos.tipoTexto, clave === tipo && estilos.tipoTextoElegido]}>
                    {def.etiqueta}
                  </Text>
                </Pressable>
              ))}
            </View>

            {definicion?.pideDetalle && (
              <View style={estilos.campo}>
                <Text style={estilos.etiqueta}>
                  {tipo === "animal" ? "¿Qué animal?" : "¿Qué es?"}
                </Text>
                <TextInput
                  style={estilos.input}
                  maxLength={60}
                  placeholder={definicion.ejemploDetalle}
                  placeholderTextColor={COLORES.textoSuave}
                  value={detalle}
                  onChangeText={setDetalle}
                />
              </View>
            )}

            <Text style={estilos.etiqueta}>¿Cuánto importa?</Text>
            <View style={estilos.severidades}>
              {SEVERIDADES.map((opcion) => {
                const activa = opcion.clave === severidad;
                return (
                  <Pressable
                    key={opcion.clave}
                    onPress={() => setSeveridad(opcion.clave)}
                    style={[
                      estilos.severidad,
                      activa && { borderColor: opcion.color, backgroundColor: COLORES.fondo },
                    ]}
                  >
                    <View style={[estilos.puntoSeveridad, { backgroundColor: opcion.color }]} />
                    <Text style={estilos.severidadTitulo}>{opcion.etiqueta}</Text>
                    <Text style={estilos.severidadAyuda}>{opcion.ayuda}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={estilos.etiqueta}>¿Hasta cuándo lo mostramos?</Text>
            <View style={estilos.duraciones}>
              {DURACIONES.map((opcion) => (
                <Pressable
                  key={opcion.horas}
                  onPress={() => setDuracionHoras(opcion.horas)}
                  style={[estilos.duracion, opcion.horas === duracionHoras && estilos.duracionActiva]}
                >
                  <Text
                    style={[
                      estilos.duracionTexto,
                      opcion.horas === duracionHoras && estilos.duracionTextoActivo,
                    ]}
                  >
                    {opcion.etiqueta}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={estilos.nota}>
              Después se borra solo. Si sigue estando, lo renovás desde tu perfil.
            </Text>

            <View style={estilos.campo}>
              <Text style={estilos.etiqueta}>Comentario</Text>
              <TextInput
                style={[estilos.input, estilos.textarea]}
                multiline
                maxLength={500}
                placeholder="Contá lo que viste (opcional)"
                placeholderTextColor={COLORES.textoSuave}
                value={comentario}
                onChangeText={setComentario}
              />
            </View>

            <Error>{error}</Error>

            <Boton
              titulo="Publicar aviso"
              onPress={enviar}
              cargando={enviando}
              deshabilitado={!tipo}
            />
            <Boton
              titulo="Cancelar"
              variante="secundario"
              onPress={() => {
                limpiar();
                onCerrar();
              }}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(11,50,82,0.5)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
  },
  contenido: { padding: 20, paddingBottom: 34, gap: 12 },

  titulo: { fontSize: 21, fontWeight: "800", color: COLORES.texto },
  punto: { fontSize: 12, color: COLORES.textoSuave, marginTop: -8 },

  tipos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tipo: {
    width: "31.5%",
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  tipoElegido: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  tipoEmoji: { fontSize: 22 },
  tipoTexto: { fontSize: 12, fontWeight: "600", color: COLORES.texto, textAlign: "center" },
  tipoTextoElegido: { color: COLORES.acento },

  campo: { gap: 6 },
  etiqueta: { fontSize: 14, fontWeight: "600", color: COLORES.texto },
  input: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
  },
  textarea: { minHeight: 80, textAlignVertical: "top" },

  severidades: { gap: 8 },
  severidad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  puntoSeveridad: { width: 11, height: 11, borderRadius: 6 },
  severidadTitulo: { fontSize: 14, fontWeight: "700", color: COLORES.texto },
  severidadAyuda: { flex: 1, fontSize: 12, color: COLORES.textoSuave },

  duraciones: { flexDirection: "row", gap: 8 },
  duracion: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  duracionActiva: { borderColor: COLORES.acento, backgroundColor: COLORES.acento },
  duracionTexto: { fontSize: 13, fontWeight: "600", color: COLORES.textoSuave },
  duracionTextoActivo: { color: "#fff" },

  nota: { fontSize: 12, lineHeight: 17, color: COLORES.textoSuave, marginTop: -4 },
});
