import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Boton, Cargando, Error } from "../../src/componentes.jsx";
import { Tarjeta } from "../../src/piezasComercio.jsx";
import { CampoTexto as TextInput, Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";

/**
 * El menu del parador: secciones con platos adentro.
 *
 * Solo lo usa el parador (ver comercio.js: tieneCarta): es el unico rubro con
 * una lista de precios que cambia seguido y que el nauta quiere ver antes de
 * parar.
 *
 * El precio va como texto a proposito: en la practica se escribe "8500",
 * "desde $12.000" o "a convenir", y forzar un numero obligaria al comerciante
 * a mentir.
 */
export default function CartaComercio() {
  const router = useRouter();
  const { comercio, cargando, guardando, guardar } = useComercio();
  const [secciones, setSecciones] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (comercio) setSecciones(comercio.menu ?? []);
  }, [comercio]);

  if (cargando || !secciones) return <Cargando />;

  const hayCambios = JSON.stringify(secciones) !== JSON.stringify(comercio.menu ?? []);

  const actualizarSeccion = (i, parcial) => {
    setSecciones((p) => p.map((s, j) => (j === i ? { ...s, ...parcial } : s)));
    setMensaje("");
  };

  const actualizarItem = (iS, iI, parcial) => {
    setSecciones((p) =>
      p.map((s, j) =>
        j !== iS ? s : { ...s, items: s.items.map((it, k) => (k === iI ? { ...it, ...parcial } : it)) },
      ),
    );
    setMensaje("");
  };

  async function guardarCambios() {
    setError("");
    setMensaje("");
    // Se limpia al guardar y no mientras se escribe: borrar una fila vacia en
    // el momento haria desaparecer el renglon recien agregado bajo el dedo.
    const limpias = secciones
      .map((s) => ({
        seccion: (s.seccion ?? "").trim(),
        items: (s.items ?? []).filter((it) => (it.nombre ?? "").trim()),
      }))
      .filter((s) => s.seccion || s.items.length);
    try {
      await guardar({ menu: limpias });
      setSecciones(limpias);
      setMensaje("Listo, guardamos tu menú.");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.ayuda}>
          Agrupá lo que ofrecés en secciones y cargá cada plato o bebida con su precio.
          Es lo que el nauta ve al abrir tu ficha.
        </Text>

        {secciones.length === 0 && <Text style={estilos.vacio}>Todavía no cargaste nada.</Text>}

        {secciones.map((seccion, iS) => (
          <Tarjeta key={iS}>
            <View style={estilos.encabezado}>
              <TextInput
                style={estilos.tituloSeccion}
                placeholder="Bebidas"
                placeholderTextColor={COLORES.textoSuave}
                value={seccion.seccion ?? ""}
                onChangeText={(t) => actualizarSeccion(iS, { seccion: t })}
              />
              <Pressable
                hitSlop={8}
                onPress={() => setSecciones((p) => p.filter((_, j) => j !== iS))}
              >
                <Text style={estilos.quitar}>✕</Text>
              </Pressable>
            </View>

            {(seccion.items ?? []).map((item, iI) => (
              <View key={iI} style={estilos.item}>
                <TextInput
                  style={estilos.itemNombre}
                  placeholder="Cerveza artesanal"
                  placeholderTextColor={COLORES.textoSuave}
                  value={item.nombre ?? ""}
                  onChangeText={(t) => actualizarItem(iS, iI, { nombre: t })}
                />
                <TextInput
                  style={estilos.itemPrecio}
                  placeholder="$"
                  placeholderTextColor={COLORES.textoSuave}
                  value={item.precio ?? ""}
                  onChangeText={(t) => actualizarItem(iS, iI, { precio: t })}
                />
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    actualizarSeccion(iS, { items: seccion.items.filter((_, k) => k !== iI) })
                  }
                >
                  <Text style={estilos.quitar}>✕</Text>
                </Pressable>
              </View>
            ))}

            <Pressable
              onPress={() =>
                actualizarSeccion(iS, { items: [...(seccion.items ?? []), { nombre: "", precio: "" }] })
              }
            >
              <Text style={estilos.agregar}>+ Agregar plato o bebida</Text>
            </Pressable>
          </Tarjeta>
        ))}

        <Pressable onPress={() => setSecciones((p) => [...p, { seccion: "", items: [] }])}>
          <Text style={estilos.agregar}>+ Agregar sección</Text>
        </Pressable>

        <Error>{error}</Error>
        {mensaje !== "" && <Text style={estilos.ok}>{mensaje}</Text>}

        <Boton
          titulo="Guardar menú"
          onPress={guardarCambios}
          cargando={guardando}
          deshabilitado={!hayCambios}
        />
        <Boton titulo="Volver" variante="secundario" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.fondo },
  contenido: { padding: 16, gap: 12, paddingBottom: 32 },
  ayuda: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
  vacio: { fontSize: 14, color: COLORES.textoSuave, textAlign: "center", paddingVertical: 12 },

  encabezado: { flexDirection: "row", alignItems: "center", gap: 10 },
  tituloSeccion: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: COLORES.texto,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.bordeSuave,
    paddingVertical: 5,
  },

  item: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemNombre: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    color: COLORES.texto,
  },
  itemPrecio: {
    width: 92,
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    color: COLORES.texto,
    textAlign: "right",
  },
  quitar: { fontSize: 16, color: COLORES.textoSuave, paddingHorizontal: 4 },

  agregar: { fontSize: 14, fontWeight: "600", color: COLORES.acento, paddingVertical: 6 },
  ok: { fontSize: 14, color: COLORES.ok },
});
