import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Boton } from "../src/componentes.jsx";
import { useSesion } from "../src/sesion.jsx";
import { Texto as Text, TextoMarca } from "../src/Texto.jsx";
import { COLORES } from "../src/tema.js";

/**
 * Lo que ve en la app una cuenta de naviera.
 *
 * Es el unico de los tres perfiles sin version movil, y no por falta de
 * tiempo: ese producto son tablas densas de niveles, calado por estacion y
 * rutas con punto critico, que se leen en una pantalla ancha y se exportan a
 * CSV o PDF. Achicarlo a un telefono daria una version peor de algo que ya
 * funciona bien en la web.
 */
export default function SoloWeb() {
  const { usuario, salir } = useSesion();
  const router = useRouter();

  return (
    <SafeAreaView style={estilos.pantalla} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <TextoMarca style={estilos.marca}>AlgoRio</TextoMarca>

        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>
            Hola, {usuario?.nombre_completo || usuario?.usuario}.
          </Text>
          <Text style={estilos.texto}>
            Tu cuenta es de navegación comercial. Ese panel —niveles por estación, calado
            admisible, rutas e histórico— vive en la web, donde hay pantalla para las
            tablas y se puede exportar.
          </Text>
          <Text style={estilos.enlace}>pro.algorio.com.ar</Text>
          <Text style={estilos.nota}>
            Esta app es para nautas y para comercios sobre la costa. Si además tenés un
            parador o una lancha-taxi, podés crear una cuenta de comercio y administrarla
            desde acá.
          </Text>
        </View>

        <Boton
          titulo="Cerrar sesión"
          variante="secundario"
          onPress={async () => {
            await salir();
            router.replace("/login");
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.marca },
  contenido: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 24 },
  marca: { color: "#fff", fontSize: 32, letterSpacing: 0.5 },
  tarjeta: { backgroundColor: COLORES.superficie, borderRadius: 16, padding: 22, gap: 12 },
  titulo: { fontSize: 21, fontWeight: "800", color: COLORES.texto },
  texto: { fontSize: 15, lineHeight: 22, color: COLORES.texto },
  enlace: { fontSize: 16, fontWeight: "700", color: COLORES.acento },
  nota: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORES.textoSuave,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
    paddingTop: 12,
  },
});
