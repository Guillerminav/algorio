import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, Share, StyleSheet, View } from "react-native";

import {
  enDecimal,
  enGradosMinutos,
  enlaceWhatsAppTexto,
  horaCorta,
  mensajeDeEmergencia,
} from "./coordenadas.js";
import { Texto as Text } from "./Texto.jsx";
import { COLORES } from "./tema.js";

// Precisión alta, al revés que el resto de la app.
//
// Para saber qué parador tenés cerca alcanza `Balanced` y ahorra batería (ver
// useUbicacion.js). Acá no: el que sale a buscarte barre el radio que le
// digas, y unos metros de más son minutos de más en el agua.
const PRECISION = Location.Accuracy.BestForNavigation;

/**
 * "Compartir mi ubicación": el botón para cuando se rompió el motor.
 *
 * El problema real que resuelve: por radio o por teléfono es imposible
 * explicar dónde estás en el río. No hay calles, no hay esquinas, y "frente a
 * la isla grande" no es una posición.
 *
 * Las coordenadas se muestran en pantalla ADEMÁS de poder mandarse, y en dos
 * notaciones. No es redundancia: puede que no haya datos para WhatsApp pero sí
 * señal de voz, o que del otro lado esté Prefectura por VHF — y ahí lo que
 * hace falta es leer grados y minutos en voz alta, no un link.
 */
export default function BotonSOS() {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);
  const vigilancia = useRef(null);

  const detener = useCallback(() => {
    vigilancia.current?.remove?.();
    vigilancia.current = null;
  }, []);

  /**
   * Se escucha el flujo de posiciones en vez de pedir una sola: el primer fix
   * suele venir con ±1000 m de la red de celdas y afinar a ±10 m recién a los
   * segundos. Con una sola lectura se manda la mala; así el número mejora solo
   * mientras la persona lee la pantalla.
   */
  const ubicar = useCallback(async () => {
    detener();
    setError("");
    setBuscando(true);
    setPosicion(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setBuscando(false);
        setError("Sin permiso de ubicación no podemos compartir dónde estás. Activalo en los ajustes del teléfono.");
        return;
      }
      vigilancia.current = await Location.watchPositionAsync(
        { accuracy: PRECISION, timeInterval: 1000, distanceInterval: 0 },
        (lectura) => {
          setPosicion({
            lat: lectura.coords.latitude,
            lon: lectura.coords.longitude,
            precision: lectura.coords.accuracy,
            hora: horaCorta(),
          });
          setBuscando(false);
          // Por debajo de 25 m ya no vale seguir escuchando: es mejor de lo
          // que necesita quien viene a buscarte, y el GPS prendido come
          // batería — que a la deriva es un recurso.
          if (lectura.coords.accuracy && lectura.coords.accuracy <= 25) detener();
        },
      );
    } catch {
      setBuscando(false);
      setError("No pudimos tomar tu ubicación. Probá salir a cielo abierto y reintentar.");
    }
  }, [detener]);

  useEffect(() => {
    if (abierto) ubicar();
    return detener;
  }, [abierto, ubicar, detener]);

  const texto = posicion ? mensajeDeEmergencia(posicion) : "";

  async function porWhatsApp() {
    const url = enlaceWhatsAppTexto(texto);
    const sePuede = await Linking.canOpenURL(url).catch(() => false);
    // Si no hay WhatsApp instalado se cae a la hoja de compartir del sistema
    // en vez de no hacer nada: el objetivo es que el mensaje salga por donde
    // sea, no por una app en particular.
    if (sePuede) Linking.openURL(url);
    else Share.share({ message: texto });
  }

  return (
    <>
      <Pressable style={estilos.boton} onPress={() => setAbierto(true)}>
        <Text style={estilos.botonIcono}>🆘</Text>
        <View style={estilos.flex}>
          <Text style={estilos.botonTitulo}>Compartir mi ubicación</Text>
          <Text style={estilos.botonAyuda}>Para pedir auxilio o remolque</Text>
        </View>
      </Pressable>

      <Modal visible={abierto} animationType="slide" transparent onRequestClose={() => setAbierto(false)}>
        <Pressable style={estilos.fondo} onPress={() => setAbierto(false)}>
          <Pressable style={estilos.panel} onPress={(e) => e.stopPropagation()}>
            <View style={estilos.encabezado}>
              <Text style={estilos.titulo}>Tu posición ahora</Text>
              <Pressable onPress={() => setAbierto(false)} hitSlop={12}>
                <Text style={estilos.cerrar}>✕</Text>
              </Pressable>
            </View>

            {buscando && !posicion ? (
              <View style={estilos.cargando}>
                <ActivityIndicator color={COLORES.acento} />
                <Text style={estilos.ayuda}>Tomando la posición del GPS…</Text>
              </View>
            ) : null}

            {error !== "" ? <Text style={estilos.error}>{error}</Text> : null}

            {posicion ? (
              <>
                {/* Grados y minutos primero y grandes: es lo que se lee por
                    radio, y por radio no se puede tocar un link. */}
                <View style={estilos.coordenadas}>
                  <Text style={estilos.coordenada}>{enGradosMinutos(posicion.lat, true)}</Text>
                  <Text style={estilos.coordenada}>{enGradosMinutos(posicion.lon, false)}</Text>
                </View>
                <Text style={estilos.decimal}>{enDecimal(posicion.lat, posicion.lon)}</Text>
                <Text style={estilos.precision}>
                  Precisión del GPS: ±{Math.round(posicion.precision)} m · tomada a las{" "}
                  {posicion.hora}
                  {buscando ? " · afinando…" : ""}
                </Text>

                <Pressable style={estilos.whatsapp} onPress={porWhatsApp}>
                  <Text style={estilos.whatsappTexto}>Enviar por WhatsApp</Text>
                </Pressable>
                <Pressable style={estilos.secundario} onPress={() => Share.share({ message: texto })}>
                  <Text style={estilos.secundarioTexto}>Compartir de otra forma</Text>
                </Pressable>
                <Pressable onPress={ubicar} style={estilos.reintentar}>
                  <Text style={estilos.reintentarTexto}>Volver a tomar la posición</Text>
                </Pressable>
              </>
            ) : null}

            {!posicion && !buscando ? (
              <Pressable style={estilos.secundario} onPress={ubicar}>
                <Text style={estilos.secundarioTexto}>Reintentar</Text>
              </Pressable>
            ) : null}

            {/* Los canales que no dependen de nosotros. Van como dato escrito
                y no como boton: en el rio se puede quedar sin datos pero con
                señal de voz, y ahi el numero anotado sirve mas que un enlace. */}
            <Text style={estilos.prefectura}>
              Emergencias náuticas: <Text style={estilos.fuerte}>106</Text> (Prefectura
              Naval) · canal VHF <Text style={estilos.fuerte}>16</Text>
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },

  // En tono bajo y al pie del cajon. La tentacion es la contraria —es un boton
  // de emergencia, que grite— y estaba asi al principio: arriba de todo y en
  // rojo pleno. Se cambio porque el menu se abre veinte veces para mirar el
  // clima y una para pedir auxilio.
  //
  // Un control de emergencia tiene que estar donde se lo pueda ENCONTRAR, y el
  // borde de abajo es un lugar fijo que no se mueve. Eso se aprende una vez;
  // gritar hay que aguantarlo siempre.
  boton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  botonIcono: { fontSize: 16, opacity: 0.9 },
  botonTitulo: { color: COLORES.marcaTextoSuave, fontSize: 14, fontWeight: "600" },
  botonAyuda: { color: "rgba(255,255,255,0.45)", fontSize: 11.5, marginTop: 1 },

  fondo: { flex: 1, justifyContent: "center", padding: 16, backgroundColor: "rgba(4,18,28,0.6)" },
  panel: { borderRadius: 16, backgroundColor: COLORES.superficie, padding: 18, gap: 10 },
  encabezado: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titulo: { fontSize: 17, fontWeight: "800", color: COLORES.texto },
  cerrar: { fontSize: 16, color: COLORES.textoSuave },

  cargando: { alignItems: "center", gap: 8, paddingVertical: 12 },
  ayuda: { fontSize: 13, color: COLORES.textoSuave, textAlign: "center" },
  error: { fontSize: 13, lineHeight: 19, color: COLORES.peligro },

  // Grande y tabular: es el numero que alguien va a leer en voz alta por radio
  // con el motor apagado y olas.
  coordenadas: { borderRadius: 12, backgroundColor: COLORES.marca, padding: 14, gap: 2 },
  coordenada: { color: "#fff", fontSize: 22, fontWeight: "800" },
  decimal: { fontSize: 13.5, color: COLORES.textoSuave, textAlign: "center" },
  precision: { fontSize: 12, color: COLORES.textoSuave, textAlign: "center", marginBottom: 4 },

  // El verde de WhatsApp y no el acento de la marca: es el unico boton que
  // promete abrir otra aplicacion, y el color lo anticipa.
  whatsapp: { borderRadius: 10, backgroundColor: "#25d366", paddingVertical: 14, alignItems: "center" },
  whatsappTexto: { color: "#04231a", fontSize: 15.5, fontWeight: "700" },

  secundario: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORES.borde,
    paddingVertical: 13,
    alignItems: "center",
  },
  secundarioTexto: { fontSize: 15, fontWeight: "600", color: COLORES.texto },

  reintentar: { alignItems: "center", paddingVertical: 6 },
  reintentarTexto: { fontSize: 13, color: COLORES.acento },

  prefectura: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORES.textoSuave,
    textAlign: "center",
  },
  fuerte: { fontWeight: "800", color: COLORES.texto },
});
