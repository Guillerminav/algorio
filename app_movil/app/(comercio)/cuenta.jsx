import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { formatearNivel, formatearTendencia } from "../../src/api.js";
import { Boton, Vacio } from "../../src/componentes.jsx";
import { Tarjeta } from "../../src/piezasComercio.jsx";
import { useSesion } from "../../src/sesion.jsx";
import { Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { CENTRO_POR_DEFECTO, useUbicacion } from "../../src/useUbicacion.js";

const COLOR_ESTADO = { verde: COLORES.ok, amarillo: COLORES.alerta, rojo: COLORES.peligro };
const ETIQUETA_ESTADO = { verde: "Normal", amarillo: "Precaución", rojo: "Alerta" };

/**
 * Cuenta del comerciante: sus datos, el nivel del rio y la salida.
 *
 * El nivel del rio vive aca y no en una tab propia porque el comerciante no
 * entra a la app para eso; pero saber si el rio esta creciendo le cambia el
 * fin de semana tanto como al nauta, asi que tiene que estar a mano.
 */
export default function CuentaComercio() {
  const { usuario, salir, api } = useSesion();
  const { posicion } = useUbicacion();
  const router = useRouter();
  const [estaciones, setEstaciones] = useState([]);

  useEffect(() => {
    let cancelado = false;
    const punto = posicion ?? CENTRO_POR_DEFECTO;
    api(`/api/nivel-rio?lat=${punto.latitude}&lon=${punto.longitude}`)
      // Solo las tres mas cercanas: es un vistazo, no la pantalla de una
      // naviera.
      .then((d) => !cancelado && setEstaciones(d.slice(0, 3)))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [api, posicion]);

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
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Tarjeta>
        <Text style={estilos.nombre}>{usuario?.nombre_completo || usuario?.usuario}</Text>
        <Text style={estilos.email}>{usuario?.email}</Text>
      </Tarjeta>

      <Tarjeta titulo="Nivel del río">
        {estaciones.length === 0 ? (
          <Vacio>Buscando las estaciones más cercanas…</Vacio>
        ) : (
          estaciones.map((estacion) => {
            const tendencia = formatearTendencia(estacion.tendencia, usuario?.unidad_nivel);
            return (
              <View key={estacion.id} style={estilos.estacion}>
                <View style={estilos.flex}>
                  <Text style={estilos.estacionNombre}>{estacion.nombre}</Text>
                  <Text style={estilos.estacionMeta}>
                    {estacion.rio}
                    {typeof estacion.distancia_km === "number" ? ` · a ${estacion.distancia_km} km` : ""}
                  </Text>
                </View>
                <View style={estilos.estacionNivel}>
                  <Text style={estilos.estacionValor}>
                    {formatearNivel(estacion.nivel_actual_m, usuario?.unidad_nivel)}
                  </Text>
                  <Text style={[estilos.estacionEstado, { color: COLOR_ESTADO[estacion.estado] }]}>
                    {ETIQUETA_ESTADO[estacion.estado] ?? ""} · {tendencia.texto}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </Tarjeta>

      <Tarjeta titulo="Suscripción">
        <Text style={estilos.nota}>
          El plan y el cobro se manejan desde la web, en app.algorio.com.ar. Acá podés
          administrar tu ficha, pero no cambiar de plan.
        </Text>
      </Tarjeta>

      <Boton titulo="Cerrar sesión" variante="secundario" onPress={confirmarSalida} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 14 },
  flex: { flex: 1 },

  nombre: { fontSize: 19, fontWeight: "800", color: COLORES.texto },
  email: { fontSize: 14, color: COLORES.textoSuave },

  estacion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
  },
  estacionNombre: { fontSize: 15, fontWeight: "600", color: COLORES.texto },
  estacionMeta: { fontSize: 12, color: COLORES.textoSuave },
  estacionNivel: { alignItems: "flex-end" },
  estacionValor: { fontSize: 17, fontWeight: "800", color: COLORES.texto },
  estacionEstado: { fontSize: 12, fontWeight: "600" },

  nota: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
});
