import { Drawer } from "expo-router/drawer";
import React from "react";

import { BotonMenu, MenuLateral } from "../../src/MenuLateral.jsx";
import { conFuente } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";

// Menu hamburguesa, igual que el del nauta. Acá ademas resuelve un problema
// concreto: las secciones del comerciante son cuatro y crecen (horarios, carta
// y ubicacion viven hoy como pantallas sueltas justamente porque no entraban
// en la barra de abajo). En el cajon entran todas sin apretarse.
export default function LayoutComercio() {
  return (
    <Drawer
      drawerContent={(props) => <MenuLateral {...props} subtitulo="Mi comercio" />}
      screenOptions={({ navigation }) => ({
        drawerStyle: { backgroundColor: COLORES.marca, width: 288 },
        headerStyle: { backgroundColor: COLORES.superficie },
        headerTintColor: COLORES.texto,
        headerTitleStyle: conFuente({ fontWeight: "700", fontSize: 17 }),
        headerLeft: () => <BotonMenu navigation={navigation} />,
        sceneStyle: { backgroundColor: COLORES.fondo },
      })}
    >
      <Drawer.Screen name="index" options={{ title: "Mi comercio" }} />
      <Drawer.Screen name="metricas" options={{ title: "Métricas" }} />
      <Drawer.Screen name="resenas" options={{ title: "Reseñas" }} />
      <Drawer.Screen name="cuenta" options={{ title: "Cuenta" }} />
    </Drawer>
  );
}
