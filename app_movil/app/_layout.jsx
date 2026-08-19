import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ProveedorSesion } from "../src/sesion.jsx";
import { conFuente } from "../src/Texto.jsx";
import { COLORES, FUENTES } from "../src/tema.js";

// La pantalla de arranque se sostiene a mano hasta que las fuentes esten
// cargadas. Si no, la app se dibuja un instante con la tipografia del sistema
// y despues salta a la de la marca: el clasico parpadeo de texto.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function LayoutRaiz() {
  const [fuentesListas, errorFuentes] = useFonts(FUENTES);

  useEffect(() => {
    // Se suelta tambien si las fuentes fallaron: quedarse en la pantalla de
    // arranque para siempre es peor que mostrar la app con la tipografia del
    // sistema.
    if (fuentesListas || errorFuentes) SplashScreen.hideAsync().catch(() => {});
  }, [fuentesListas, errorFuentes]);

  if (!fuentesListas && !errorFuentes) return null;

  return (
    // GestureHandlerRootView es obligatorio para que el gesto de arrastrar
    // abra el menu lateral en Android; sin el, el cajon solo responde al
    // boton de hamburguesa.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ProveedorSesion>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: COLORES.superficie },
              headerTintColor: COLORES.texto,
              // Los titulos de la barra de navegacion los dibuja React
              // Navigation, no nuestro <Texto>, asi que la fuente hay que
              // resolverla a mano (ver conFuente en src/Texto.jsx).
              headerTitleStyle: conFuente({ fontWeight: "700", fontSize: 17 }),
              contentStyle: { backgroundColor: COLORES.fondo },
            }}
          >
            {/* Los grupos (tabs) y (comercio) traen su propio menu lateral con
                su header, asi que el Stack de afuera no debe agregar otro. */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(comercio)" options={{ headerShown: false }} />
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="registro" options={{ title: "Crear cuenta" }} />
            <Stack.Screen name="embarcacion" options={{ headerShown: false }} />
            <Stack.Screen name="solo-web" options={{ headerShown: false }} />
            <Stack.Screen name="lugar/[id]" options={{ title: "" }} />

            {/* Pantallas del comerciante que se abren desde "Mi comercio". El
                alta no lleva boton de volver: cuando aparece es porque la cuenta
                todavia no tiene ficha, y no hay ningun lado atras al que ir. */}
            <Stack.Screen name="comercio/alta" options={{ title: "Cargá tu comercio", headerBackVisible: false }} />
            <Stack.Screen name="comercio/horarios" options={{ title: "Horarios" }} />
            <Stack.Screen name="comercio/carta" options={{ title: "Menú" }} />
            <Stack.Screen name="comercio/ubicacion" options={{ title: "Ubicación" }} />
          </Stack>
        </ProveedorSesion>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
