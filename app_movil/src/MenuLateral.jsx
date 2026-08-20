import { DrawerContentScrollView } from "@react-navigation/drawer";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import BotonSOS from "./BotonSOS.jsx";
import { useSesion } from "./sesion.jsx";
import { Texto as Text, TextoMarca } from "./Texto.jsx";
import { COLORES } from "./tema.js";

/**
 * Contenido del menu hamburguesa, compartido por los dos perfiles.
 *
 * Se dibuja a mano en vez de usar el listado por defecto de React Navigation
 * porque abajo lleva el bloque de la cuenta —quien sos y el boton de salir—,
 * que no es una ruta mas y no puede quedar mezclado con las secciones. Es el
 * mismo criterio que el menu movil de la web (frontend/src/components/
 * MenuMovil.jsx).
 */
export function MenuLateral({ state, navigation, subtitulo }) {
  const { usuario, salir } = useSesion();
  const router = useRouter();

  const iniciales = (usuario?.nombre_completo || usuario?.usuario || "?")
    .split(/\s+/)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
    <View style={estilos.contenedor}>
      <DrawerContentScrollView contentContainerStyle={estilos.scroll}>
        <View style={estilos.encabezado}>
          {/* Sin tilde: la tipografia del logo no trae vocales acentuadas. */}
          <TextoMarca style={estilos.marca}>AlgoRio</TextoMarca>
          {subtitulo ? <Text style={estilos.subtitulo}>{subtitulo}</Text> : null}
        </View>

        <View style={estilos.secciones}>
          {state.routes.map((ruta, indice) => {
            const activa = state.index === indice;
            const { drawerLabel, title } = state.descriptors[ruta.key].options;
            return (
              <Pressable
                key={ruta.key}
                onPress={() => navigation.navigate(ruta.name)}
                style={[estilos.item, activa && estilos.itemActivo]}
              >
                <View style={[estilos.punto, activa && estilos.puntoActivo]} />
                <Text style={[estilos.itemTexto, activa && estilos.itemTextoActivo]}>
                  {drawerLabel ?? title ?? ruta.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DrawerContentScrollView>

      <View style={estilos.pie}>
        <View style={estilos.cuenta}>
          <View style={estilos.avatar}>
            <Text style={estilos.avatarTexto}>{iniciales}</Text>
          </View>
          <View style={estilos.cuentaDatos}>
            <Text style={estilos.cuentaNombre} numberOfLines={1}>
              {usuario?.nombre_completo || usuario?.usuario}
            </Text>
            <Text style={estilos.cuentaUsuario} numberOfLines={1}>@{usuario?.usuario}</Text>
          </View>
        </View>
        <Pressable onPress={confirmarSalida} style={estilos.salir}>
          <Text style={estilos.salirTexto}>Cerrar sesión</Text>
        </Pressable>

        {/* Ultimo y pegado al borde inferior. Va en el pie y no dentro del
            scroll a proposito: el pie no se mueve por mas que la lista de
            secciones crezca o se scrollee, asi que el boton queda siempre en
            el mismo lugar. Un control de emergencia se aprende una vez y
            despues la mano va sola — eso vale mas que gritar. */}
        <BotonSOS />
      </View>
    </View>
  );
}

/**
 * Boton de hamburguesa para el header. Se dibuja con tres barras y no con un
 * icono de fuente para no sumar una libreria de iconos por tres rectangulos.
 */
export function BotonMenu({ navigation }) {
  return (
    <Pressable
      onPress={() => navigation.toggleDrawer()}
      hitSlop={12}
      style={estilos.hamburguesa}
      accessibilityLabel="Abrir menú"
      accessibilityRole="button"
    >
      <View style={estilos.barra} />
      <View style={estilos.barra} />
      <View style={estilos.barra} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES.marca },
  scroll: { paddingTop: 0 },

  encabezado: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 22 },
  marca: { color: "#fff", fontSize: 26, letterSpacing: 0.5 },
  subtitulo: { color: COLORES.marcaTextoSuave, fontSize: 13, marginTop: 2 },

  secciones: { paddingHorizontal: 12, gap: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  itemActivo: { backgroundColor: COLORES.marcaSuave },
  punto: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORES.marcaTextoSuave, opacity: 0.5 },
  puntoActivo: { backgroundColor: COLORES.acentoClaro, opacity: 1 },
  itemTexto: { color: COLORES.marcaTextoSuave, fontSize: 16, fontWeight: "500" },
  itemTextoActivo: { color: "#fff", fontWeight: "700" },

  pie: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  cuenta: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORES.marcaSuave,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexto: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cuentaDatos: { flex: 1 },
  cuentaNombre: { color: "#fff", fontSize: 15, fontWeight: "600" },
  cuentaUsuario: { color: COLORES.marcaTextoSuave, fontSize: 13 },
  salir: {
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
  },
  salirTexto: { color: "#fff", fontSize: 15, fontWeight: "600" },

  hamburguesa: { paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  barra: { width: 20, height: 2, borderRadius: 1, backgroundColor: COLORES.texto },
});
