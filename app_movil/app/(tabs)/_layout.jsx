import { Drawer } from "expo-router/drawer";
import React from "react";

import { BotonMenu, MenuLateral } from "../../src/MenuLateral.jsx";
import { conFuente } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";

// Menu hamburguesa en vez de la barra de tabs de abajo. Con tabs, cada seccion
// nueva le come ancho a las demas y el mapa —que es la pantalla que se usa de
// verdad— perdia 58 px de alto permanentes. El cajon lateral deja el mapa a
// pantalla completa y no pone techo a cuantas secciones puede haber.
//
// La carpeta se sigue llamando (tabs) a proposito: renombrarla cambiaria la
// URL de todas las rutas del nauta y habria que tocar cada router.push del
// proyecto. El nombre de un grupo no se ve en ningun lado.
export default function LayoutNauta() {
  return (
    <Drawer
      drawerContent={(props) => <MenuLateral {...props} subtitulo="Nauta" />}
      screenOptions={({ navigation }) => ({
        drawerStyle: { backgroundColor: COLORES.marca, width: 288 },
        headerStyle: { backgroundColor: COLORES.superficie },
        headerTintColor: COLORES.texto,
        headerTitleStyle: conFuente({ fontWeight: "700", fontSize: 17 }),
        headerLeft: () => <BotonMenu navigation={navigation} />,
        sceneStyle: { backgroundColor: COLORES.fondo },
      })}
    >
      <Drawer.Screen
        name="index"
        options={{
          title: "Mapa",
          // El mapa ocupa la pantalla entera: su propia barra flotante de
          // viento hace de encabezado. El boton del menu va flotando encima
          // (ver app/(tabs)/index.jsx).
          headerShown: false,
        }}
      />
      <Drawer.Screen name="clima" options={{ title: "Clima" }} />
      <Drawer.Screen name="perfil" options={{ title: "Mi perfil" }} />
    </Drawer>
  );
}
