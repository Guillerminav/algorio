import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { Boton, Cargando, Error } from "../../src/componentes.jsx";
import { Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";
import { useUbicacion } from "../../src/useUbicacion.js";

/**
 * Mover el pin del comercio.
 *
 * Va en su propia pantalla y no dentro de la ficha porque mudar la ubicacion
 * devuelve el comercio a moderacion (ver backend/pois.actualizar): tiene que
 * ser un acto deliberado y con el aviso a la vista, no un arrastre accidental
 * mientras se corrige un telefono.
 */
export default function UbicacionComercio() {
  const router = useRouter();
  const { comercio, cargando, guardando, guardar } = useComercio();
  const { posicion } = useUbicacion();
  const [punto, setPunto] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (comercio) setPunto({ latitude: comercio.lat, longitude: comercio.lon });
  }, [comercio]);

  if (cargando || !punto) return <Cargando />;

  const seMovio =
    punto.latitude !== comercio.lat || punto.longitude !== comercio.lon;

  async function guardarUbicacion() {
    setError("");
    try {
      await guardar({ lat: punto.latitude, lon: punto.longitude });
      router.back();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Text style={estilos.ayuda}>
        Tocá el mapa o arrastrá el pin hasta donde está tu lugar.
      </Text>

      <MapView
        style={estilos.mapa}
        initialRegion={{ ...punto, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        mapType="hybrid"
        showsUserLocation={Boolean(posicion)}
        toolbarEnabled={false}
        onPress={(e) => setPunto(e.nativeEvent.coordinate)}
      >
        <Marker
          coordinate={punto}
          draggable
          onDragEnd={(e) => setPunto(e.nativeEvent.coordinate)}
        />
      </MapView>

      <Text style={estilos.coords}>
        {punto.latitude.toFixed(5)}, {punto.longitude.toFixed(5)}
      </Text>

      {seMovio && comercio.estado === "aprobado" && (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>
            Mover el pin devuelve tu ficha a revisión: deja de verse en el mapa hasta que
            la aprobemos de nuevo.
          </Text>
        </View>
      )}

      <Error>{error}</Error>

      <Boton
        titulo="Guardar ubicación"
        onPress={guardarUbicacion}
        cargando={guardando}
        deshabilitado={!seMovio}
      />
      <Boton titulo="Cancelar" variante="secundario" onPress={() => router.back()} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 32 },
  ayuda: { fontSize: 14, lineHeight: 20, color: COLORES.textoSuave },
  mapa: { height: 360, borderRadius: 12 },
  coords: { fontSize: 12, color: COLORES.textoSuave, fontVariant: ["tabular-nums"] },
  aviso: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fdf6e7",
    borderWidth: 1,
    borderColor: "#e8d5a8",
  },
  avisoTexto: { fontSize: 13, lineHeight: 19, color: "#6b4d0c" },
});
