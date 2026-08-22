import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { pedirJSON } from "../src/api.js";
import { Boton, Campo, Error } from "../src/componentes.jsx";
import { Texto as Text, TextoMarca } from "../src/Texto.jsx";
import { COLORES } from "../src/tema.js";

const LARGO_MINIMO = 8;

/**
 * "Olvidé mi contraseña", en dos pasos y una sola pantalla.
 *
 * 1. Se pide el mail y sale el correo.
 * 2. Se pega el código que vino en ese correo y se elige la contraseña nueva.
 *
 * El código en vez del link: el mail trae las dos cosas (ver
 * backend/recuperacion.py), y el link abre la web. Alguien que está en la app
 * del celular tendría que saltar al navegador, cambiarla ahí y volver — con el
 * código se queda donde estaba. Es el mismo token, así que vale una hora y una
 * sola vez.
 *
 * Los dos pasos van juntos y no en dos rutas porque entre uno y otro hay que
 * salir a la casilla de correo: al volver, la app tiene que estar donde se la
 * dejó, y no en una pantalla que ya perdió el estado.
 *
 * Espeja frontend/src/components/RecuperarPassword.jsx y RestablecerPassword.jsx.
 */
export default function RecuperarPassword() {
  const router = useRouter();
  const [paso, setPaso] = useState("pedir");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const corta = password.length > 0 && password.length < LARGO_MINIMO;
  const noCoinciden = repetida.length > 0 && password !== repetida;

  async function pedirElMail() {
    setError("");
    setEnviando(true);
    try {
      const r = await pedirJSON("/api/auth/recuperar", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      // El aviso es el mismo exista o no la cuenta: lo decide el backend a
      // propósito, para que este formulario no sea un verificador de casillas.
      setAviso(r.mensaje);
      setPaso("codigo");
    } catch (e) {
      setError(e.message || "No pudimos mandar el mail. Probá de nuevo en un rato.");
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarla() {
    if (password !== repetida) {
      setError("Las dos contraseñas tienen que ser iguales.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      await pedirJSON("/api/auth/restablecer", {
        method: "POST",
        body: JSON.stringify({ token: codigo.trim(), password }),
      });
      setPaso("listo");
    } catch (e) {
      setError(e.message || "No pudimos cambiar la contraseña.");
    } finally {
      setEnviando(false);
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
            {/* Sin tilde: la tipografia del logo no trae vocales acentuadas. */}
            <TextoMarca style={estilos.marca}>AlgoRio</TextoMarca>
          </View>

          {paso === "listo" ? (
            <View style={estilos.formulario}>
              <Text style={estilos.titulo}>Listo</Text>
              <Text style={estilos.ayuda}>Ya podés entrar con tu contraseña nueva.</Text>
              <Boton titulo="Ir a ingresar" onPress={() => router.replace("/login")} />
            </View>
          ) : paso === "pedir" ? (
            <View style={estilos.formulario}>
              <Text style={estilos.titulo}>Recuperar tu contraseña</Text>
              <Text style={estilos.ayuda}>
                Escribí el mail con el que te registraste y te mandamos un código para
                elegir una nueva.
              </Text>

              <Campo
                etiqueta="Correo electrónico"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={pedirElMail}
              />

              <Error>{error}</Error>

              <Boton
                titulo="Mandarme el código"
                onPress={pedirElMail}
                cargando={enviando}
                deshabilitado={!email.trim()}
              />
              <Boton
                titulo="Volver a ingresar"
                variante="secundario"
                onPress={() => router.replace("/login")}
              />
            </View>
          ) : (
            <View style={estilos.formulario}>
              <Text style={estilos.titulo}>Elegí una contraseña nueva</Text>
              <Text style={estilos.ayuda}>{aviso}</Text>
              <Text style={estilos.ayuda}>
                Copiá el código que está en el mail y pegalo acá. Vale por una hora y se
                puede usar una sola vez.
              </Text>
              {/* Se le dice a todo el mundo por igual: eso es lo que permite
                  dar la pista sin delatar qué direcciones tienen cuenta. */}
              <Text style={estilos.ayuda}>
                Si entrás con «Continuar con Google», el mail te deja ponerle además una
                contraseña propia. El botón de Google te va a seguir funcionando igual.
              </Text>

              <Campo
                etiqueta="Código del mail"
                value={codigo}
                onChangeText={setCodigo}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
              />
              <Campo
                etiqueta="Contraseña nueva"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                ayuda={`Al menos ${LARGO_MINIMO} caracteres.`}
              />
              <Campo
                etiqueta="Repetila"
                value={repetida}
                onChangeText={setRepetida}
                secureTextEntry
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={cambiarla}
              />

              {/* Los avisos salen mientras se escribe y no recién al mandar:
                  enterarse de que era corta después de tipearla dos veces es
                  tipearla dos veces de nuevo. */}
              <Error>
                {error ||
                  (corta ? `Le faltan ${LARGO_MINIMO - password.length} caracteres.` : "") ||
                  (noCoinciden ? "Las dos contraseñas tienen que ser iguales." : "")}
              </Error>

              <Boton
                titulo="Cambiar la contraseña"
                onPress={cambiarla}
                cargando={enviando}
                deshabilitado={!codigo.trim() || !password || corta || noCoinciden}
              />
              <Boton
                titulo="No me llegó, mandarlo de nuevo"
                variante="secundario"
                deshabilitado={enviando}
                onPress={() => {
                  setError("");
                  setPaso("pedir");
                }}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.marca },
  flex: { flex: 1 },
  contenido: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 28 },
  encabezado: { gap: 12 },
  marca: { color: "#fff", fontSize: 40, fontWeight: "800", letterSpacing: 0.5 },
  formulario: {
    backgroundColor: COLORES.superficie,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  titulo: { fontSize: 21, fontWeight: "800", color: COLORES.texto },
  ayuda: { fontSize: 13.5, lineHeight: 20, color: COLORES.textoSuave },
});
