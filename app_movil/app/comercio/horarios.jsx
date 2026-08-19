import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";

import { DIAS } from "../../src/comercio.js";
import { Boton, Cargando, Error } from "../../src/componentes.jsx";
import { CampoTexto as TextInput, Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";

const VACIO = { cerrado: false, abre: "", cierra: "" };

/**
 * Horarios por dia.
 *
 * La hora se escribe a mano (HH:MM) y no con el selector nativo: el selector
 * son dos toques y un scroll por cada campo —catorce en total para una semana—
 * y en un teclado numerico son cuatro digitos. Ademas el formato de 24 h es el
 * que ya usa el cartel de cualquier parador.
 *
 * Un dia sin horarios cargados no es lo mismo que un dia cerrado: el primero
 * significa "no sabemos" y la app no afirma nada; el segundo, "no abre", y se
 * muestra. Por eso "cerrado" es un interruptor explicito.
 */
export default function HorariosComercio() {
  const router = useRouter();
  const { comercio, cargando, guardando, guardar } = useComercio();
  const [horarios, setHorarios] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (comercio) setHorarios(comercio.horarios ?? {});
  }, [comercio]);

  if (cargando || !horarios) return <Cargando />;

  const hayCambios = JSON.stringify(horarios) !== JSON.stringify(comercio.horarios ?? {});

  const cambiarDia = (clave, parcial) => {
    setHorarios((previos) => ({ ...previos, [clave]: { ...VACIO, ...previos[clave], ...parcial } }));
    setMensaje("");
  };

  // Casi todos los paradores abren igual toda la semana, y cargar siete veces
  // lo mismo es la parte molesta de esta pantalla.
  function replicar() {
    const origen = DIAS.map((d) => horarios[d.clave]).find((h) => h?.abre || h?.cierra);
    if (!origen) return;
    setHorarios(Object.fromEntries(DIAS.map((d) => [d.clave, { ...origen }])));
    setMensaje("");
  }

  async function guardarCambios() {
    setError("");
    setMensaje("");
    // Los dias sin nada cargado se sacan: guardar {abre:"", cierra:""} haria
    // que la app crea que hay horario definido y muestre un rango vacio.
    const limpios = Object.fromEntries(
      Object.entries(horarios).filter(([, v]) => v?.cerrado || v?.abre || v?.cierra),
    );
    try {
      await guardar({ horarios: limpios });
      setHorarios(limpios);
      setMensaje("Listo, guardamos tus horarios.");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <Text style={estilos.ayuda}>
        Cargá a qué hora abrís cada día, en formato 24 h. Si un día no abrís, marcá
        &ldquo;Cerrado&rdquo;. Los días que dejes en blanco no se muestran.
      </Text>

      {DIAS.map((dia) => {
        const valor = horarios[dia.clave] ?? VACIO;
        return (
          <View key={dia.clave} style={estilos.fila}>
            <Text style={estilos.dia}>{dia.etiqueta}</Text>

            {valor.cerrado ? (
              <Text style={estilos.cerradoTexto}>Cerrado</Text>
            ) : (
              <View style={estilos.horas}>
                <TextInput
                  style={estilos.hora}
                  placeholder="09:00"
                  placeholderTextColor={COLORES.textoSuave}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  value={valor.abre ?? ""}
                  onChangeText={(t) => cambiarDia(dia.clave, { abre: t })}
                />
                <Text style={estilos.a}>a</Text>
                <TextInput
                  style={estilos.hora}
                  placeholder="20:00"
                  placeholderTextColor={COLORES.textoSuave}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  value={valor.cierra ?? ""}
                  onChangeText={(t) => cambiarDia(dia.clave, { cierra: t })}
                />
              </View>
            )}

            <Switch
              value={Boolean(valor.cerrado)}
              trackColor={{ true: COLORES.acento }}
              onValueChange={(v) =>
                // Al marcar cerrado se limpian las horas: dejarlas guardaria un
                // dia "cerrado de 9 a 18".
                cambiarDia(dia.clave, { cerrado: v, ...(v ? { abre: "", cierra: "" } : {}) })
              }
            />
          </View>
        );
      })}

      <Pressable onPress={replicar} style={estilos.replicar}>
        <Text style={estilos.replicarTexto}>Repetir en todos los días</Text>
      </Pressable>

      <Error>{error}</Error>
      {mensaje !== "" && <Text style={estilos.ok}>{mensaje}</Text>}

      <Boton
        titulo="Guardar horarios"
        onPress={guardarCambios}
        cargando={guardando}
        deshabilitado={!hayCambios}
      />
      <Boton titulo="Volver" variante="secundario" onPress={() => router.back()} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 10, paddingBottom: 32 },
  ayuda: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave, marginBottom: 4 },

  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
  },
  dia: { width: 78, fontSize: 14, fontWeight: "600", color: COLORES.texto },

  horas: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  hora: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 15,
    color: COLORES.texto,
    textAlign: "center",
  },
  a: { fontSize: 13, color: COLORES.textoSuave },
  cerradoTexto: { flex: 1, fontSize: 14, color: COLORES.textoSuave },

  replicar: { alignSelf: "flex-start", paddingVertical: 8 },
  replicarTexto: { fontSize: 14, fontWeight: "600", color: COLORES.acento },

  ok: { fontSize: 14, color: COLORES.ok },
});
