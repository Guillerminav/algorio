import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Texto as Text, TextoMarca } from "../src/Texto.jsx";

import { Boton, Campo, Error } from "../src/componentes.jsx";
import { useSesion } from "../src/sesion.jsx";
import { COLORES } from "../src/tema.js";

export default function Login() {
  const { ingresar } = useSesion();
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    setError("");
    setEntrando(true);
    try {
      const perfil = await ingresar(usuario.trim(), password);
      // Mismo criterio que app/index.jsx: cada perfil entra a lo suyo. Se
      // decide acá también (y no solo allá) porque después de un login hay que
      // reemplazar la pantalla actual, no volver a pasar por la de arranque.
      if (perfil.rol === "comercio") router.replace("/(comercio)");
      else if (perfil.rol === "naviera") router.replace("/solo-web");
      // Una cuenta de nauta creada en la web no eligio embarcacion todavia.
      else router.replace(perfil.tipo_embarcacion ? "/(tabs)" : "/embarcacion");
    } catch (e) {
      setError(e.message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.pantalla} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <View style={estilos.encabezado}>
            {/* Sin tilde: la tipografia del logo trae 187 glifos y ninguna
                vocal acentuada, asi que "AlgoRío" dibujaria la "í" con otra
                fuente. Mismo criterio que la web. */}
            <TextoMarca style={estilos.marca}>AlgoRio</TextoMarca>
            <Text style={estilos.bajada}>
              El río en el bolsillo: dónde estás, cómo está el viento y qué hay cerca.
            </Text>
          </View>

          <View style={estilos.formulario}>
            <Campo
              etiqueta="Usuario"
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              returnKeyType="next"
            />
            <Campo
              etiqueta="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={entrar}
            />

            <Error>{error}</Error>

            <Boton
              titulo="Entrar"
              onPress={entrar}
              cargando={entrando}
              deshabilitado={!usuario.trim() || !password}
            />

            {/* Debajo del botón de entrar: se busca justo después de que la
                contraseña falló, no antes de probarla. */}
            <Link href="/recuperar" asChild>
              <Boton titulo="Olvidé mi contraseña" variante="secundario" />
            </Link>

            <Link href="/registro" asChild>
              <Boton titulo="Crear una cuenta" variante="secundario" />
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.marca },
  flex: { flex: 1 },
  contenido: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 36 },
  encabezado: { gap: 12 },
  marca: { color: "#fff", fontSize: 40, fontWeight: "800", letterSpacing: 0.5 },
  bajada: { color: COLORES.marcaTextoSuave, fontSize: 16, lineHeight: 24 },
  formulario: {
    backgroundColor: COLORES.superficie,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
});
