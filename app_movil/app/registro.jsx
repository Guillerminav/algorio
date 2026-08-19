import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Boton, Campo, Error } from "../src/componentes.jsx";
import { useSesion } from "../src/sesion.jsx";
import { Texto as Text } from "../src/Texto.jsx";
import { COLORES } from "../src/tema.js";

// Los dos perfiles que se pueden crear desde la app. El de naviera no está: su
// producto es un dashboard de tablas que solo existe en la web.
//
// Va como dos botones arriba y no como un paso aparte porque el nauta es la
// enorme mayoría: para él tiene que ser invisible, un toque para el que no.
const PERFILES = [
  {
    rol: "recreativo",
    etiqueta: "Salgo al río",
    detalle: "Kayak, lancha, velero o tabla. Es gratis.",
  },
  {
    rol: "comercio",
    etiqueta: "Tengo un comercio",
    detalle: "Parador, cabaña o lancha-taxi sobre la costa.",
  },
];

export default function Registro() {
  const { registrarse } = useSesion();
  const router = useRouter();
  const [rol, setRol] = useState("recreativo");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  const listo = usuario.trim() && email.trim() && password.length >= 8;

  async function crear() {
    setError("");
    setCreando(true);
    try {
      await registrarse({ usuario: usuario.trim(), email: email.trim(), password, rol });
      // Cada perfil arranca por lo suyo: el comerciante por cargar su ficha, el
      // nauta por decir con qué sale.
      router.replace(rol === "comercio" ? "/comercio/alta" : "/embarcacion");
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.bajada}>Es gratis y no pedimos tarjeta.</Text>

        <View style={estilos.perfiles}>
          {PERFILES.map((opcion) => {
            const activo = opcion.rol === rol;
            return (
              <Pressable
                key={opcion.rol}
                onPress={() => setRol(opcion.rol)}
                style={[estilos.perfil, activo && estilos.perfilElegido]}
              >
                <Text style={[estilos.perfilTitulo, activo && estilos.perfilTituloElegido]}>
                  {opcion.etiqueta}
                </Text>
                <Text style={estilos.perfilDetalle}>{opcion.detalle}</Text>
              </Pressable>
            );
          })}
        </View>

        <Campo
          etiqueta="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
        />
        <Campo
          etiqueta="Nombre de usuario"
          value={usuario}
          onChangeText={setUsuario}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
        />
        <Campo
          etiqueta="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Text style={estilos.ayuda}>Al menos 8 caracteres.</Text>

        <Error>{error}</Error>

        <Boton titulo="Crear cuenta" onPress={crear} cargando={creando} deshabilitado={!listo} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.fondo },
  contenido: { padding: 20, gap: 16, paddingBottom: 40 },
  bajada: { color: COLORES.textoSuave, fontSize: 15, lineHeight: 22 },

  perfiles: { gap: 10 },
  perfil: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
    gap: 3,
  },
  perfilElegido: { borderColor: COLORES.acento, backgroundColor: COLORES.chipFondo },
  perfilTitulo: { fontSize: 15, fontWeight: "700", color: COLORES.texto },
  perfilTituloElegido: { color: COLORES.acento },
  perfilDetalle: { fontSize: 13, color: COLORES.textoSuave },

  ayuda: { color: COLORES.textoSuave, fontSize: 13, marginTop: -8 },
});
