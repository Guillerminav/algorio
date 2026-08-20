import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { tipoComercio } from "../../src/comercio.js";
import { Boton, Cargando, Error } from "../../src/componentes.jsx";
import { useSesion } from "../../src/sesion.jsx";
import { CampoTexto as TextInput, Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";

/**
 * "Ese lugar del mapa es mío": buscar un comercio sin dueño y pedirlo.
 *
 * Existe porque muchos pines del mapa no los cargó su dueño —sembrados,
 * importados, o de una cuenta que se dio de baja— y obligarlo a cargar todo de
 * cero deja al nauta con dos pines del mismo parador y al comerciante sin las
 * reseñas que su lugar ya tenía.
 *
 * Lo aprueba un admin (ver backend/reclamos.py), y eso se dice arriba de todo:
 * quien entra por acá tiene que saber, antes de escribir nada, que hoy no va a
 * poder editar.
 */
export default function ReclamarComercio() {
  const router = useRouter();
  const { api } = useSesion();
  const [lugares, setLugares] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Se pide una vez y se filtra en memoria: son los comercios sin dueño de un
  // tramo de río, no un catálogo.
  useEffect(() => {
    let cancelado = false;
    api("/api/comercios-sin-dueno")
      .then((d) => !cancelado && setLugares(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [api]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return lugares;
    return lugares.filter(
      (l) =>
        l.nombre.toLowerCase().includes(texto) ||
        (l.descripcion ?? "").toLowerCase().includes(texto),
    );
  }, [lugares, busqueda]);

  async function enviar() {
    setError("");
    setEnviando(true);
    try {
      await api("/api/mi-comercio/reclamo", {
        method: "POST",
        body: JSON.stringify({ poi_id: elegido.id, mensaje: mensaje.trim() || null }),
      });
      router.replace("/(comercio)");
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  if (cargando) return <Cargando texto="Buscando comercios sin dueño…" />;

  if (lugares.length === 0) {
    return (
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.ayuda}>
          Ahora mismo no hay comercios sin dueño en el mapa. Si el tuyo ya está publicado y
          no aparece acá, es porque otra cuenta lo tiene asignado — escribinos por Ayuda.
        </Text>
        <Boton titulo="Cargar mi comercio de cero" onPress={() => router.replace("/comercio/alta")} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={110}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.ayuda}>
          Buscá tu lugar entre los que ya están publicados y todavía no tienen dueño.
          Cuando confirmemos que es tuyo vas a poder editarlo, y te quedan las reseñas y
          las visitas que ya tenía.
        </Text>

        <TextInput
          style={estilos.buscador}
          placeholder="Nombre de tu parador, cabaña o lancha"
          placeholderTextColor={COLORES.textoSuave}
          value={busqueda}
          onChangeText={setBusqueda}
        />

        {visibles.length === 0 ? (
          <Text style={estilos.ayuda}>Ninguno coincide con eso.</Text>
        ) : (
          visibles.map((lugar) => {
            const activo = elegido?.id === lugar.id;
            return (
              <Pressable
                key={lugar.id}
                onPress={() => setElegido(lugar)}
                style={[estilos.fila, activo && estilos.filaElegida]}
              >
                <Text style={estilos.nombre}>{lugar.nombre}</Text>
                <Text style={estilos.rubro}>{tipoComercio(lugar.tipo).etiqueta}</Text>
                {lugar.descripcion ? (
                  <Text style={estilos.descripcion} numberOfLines={2}>{lugar.descripcion}</Text>
                ) : null}
                {/* Coordenadas y telefono a la vista: es como alguien reconoce
                    que ese pin es el suyo y no el del vecino que se llama
                    parecido. */}
                <Text style={estilos.meta}>
                  {lugar.lat.toFixed(4)}, {lugar.lon.toFixed(4)}
                  {lugar.whatsapp || lugar.telefono
                    ? ` · tel. ${lugar.whatsapp || lugar.telefono}`
                    : ""}
                </Text>
              </Pressable>
            );
          })
        )}

        {elegido ? (
          <View style={estilos.campo}>
            <Text style={estilos.campoEtiqueta}>¿Cómo sabemos que es tuyo?</Text>
            <TextInput
              style={estilos.textarea}
              multiline
              maxLength={600}
              placeholder="El teléfono que figura es el mío, o contanos algo que solo el dueño sepa."
              placeholderTextColor={COLORES.textoSuave}
              value={mensaje}
              onChangeText={setMensaje}
            />
          </View>
        ) : null}

        <Error>{error}</Error>

        <Boton
          titulo="Pedir este comercio"
          onPress={enviar}
          cargando={enviando}
          deshabilitado={!elegido}
        />
        <Boton
          titulo="Mejor lo cargo de cero"
          variante="secundario"
          onPress={() => router.replace("/comercio/alta")}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1 },
  contenido: { padding: 16, gap: 10, paddingBottom: 40 },
  ayuda: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },

  buscador: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
  },

  fila: {
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
    gap: 2,
  },
  filaElegida: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  nombre: { fontSize: 15.5, fontWeight: "700", color: COLORES.texto },
  rubro: { fontSize: 12.5, fontWeight: "600", color: COLORES.acento },
  descripcion: { fontSize: 13, lineHeight: 18, color: COLORES.textoSuave },
  meta: { fontSize: 12, color: COLORES.textoSuave, marginTop: 2 },

  campo: { gap: 6 },
  campoEtiqueta: { fontSize: 14, fontWeight: "600", color: COLORES.texto },
  textarea: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: "top",
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
  },
});
