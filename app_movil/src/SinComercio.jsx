import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Boton, Error } from "./componentes.jsx";
import { useSesion } from "./sesion.jsx";
import { Texto as Text } from "./Texto.jsx";
import { COLORES } from "./tema.js";

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "");

/**
 * Lo que ve una cuenta de comercio que todavía no tiene ficha.
 *
 * Hay dos maneras de tener una y no una sola: cargarla de cero, o reclamar un
 * lugar que ya está en el mapa sin dueño. La segunda existe porque muchos
 * pines los cargó el equipo o una cuenta que se dio de baja, y hacer que el
 * dueño real empiece de cero deja al nauta con dos pines del mismo parador.
 *
 * Espeja frontend/src/comercio/InicioComercio.jsx.
 */
export default function SinComercio({ reclamo, onRecargar }) {
  const router = useRouter();
  const { api } = useSesion();
  const [error, setError] = useState("");
  const [cancelando, setCancelando] = useState(false);

  async function cancelar() {
    setCancelando(true);
    setError("");
    try {
      await api("/api/mi-comercio/reclamo", { method: "DELETE" });
      await onRecargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelando(false);
    }
  }

  // Esperando respuesta gana sobre todo lo demás: mientras haya un pedido en
  // curso, ofrecer "cargá tu comercio" sería invitar a duplicar justo lo que
  // se pidió unificar.
  if (reclamo?.estado === "pendiente") {
    return (
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.titulo}>Estamos revisando tu pedido</Text>
        <Text style={estilos.ayuda}>
          Pediste ser el dueño de <Text style={estilos.fuerte}>{reclamo.nombre_poi}</Text> el{" "}
          {fecha(reclamo.creado_en)}. Cuando lo confirmemos vas a poder editar la ficha,
          los horarios y las fotos desde acá.
        </Text>
        <Text style={estilos.ayuda}>
          Mientras tanto el lugar sigue publicado en el mapa tal como está: nadie pierde
          nada esperando.
        </Text>
        <Error>{error}</Error>
        {/* Poder arrepentirse importa: sin esto, quien se equivocó de lugar
            queda bloqueado hasta que un admin conteste. */}
        <Boton
          titulo="Cancelar el pedido"
          variante="secundario"
          onPress={cancelar}
          cargando={cancelando}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>Empecemos por tu comercio</Text>
      <Text style={estilos.ayuda}>
        Podés cargarlo de cero o, si tu lugar ya aparece en el mapa, pedir que te lo
        asignemos para editarlo vos.
      </Text>

      {/* El rechazo se muestra acá y no en otra pantalla: es exactamente el
          momento en que la persona vuelve a decidir qué hacer. */}
      {reclamo?.estado === "rechazado" ? (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTitulo}>Tu pedido anterior no prosperó</Text>
          <Text style={estilos.avisoTexto}>
            {reclamo.motivo_rechazo || "No pudimos confirmar que ese lugar sea tuyo."} Podés
            volver a intentarlo con otro lugar o cargar el tuyo de cero.
          </Text>
        </View>
      ) : null}

      <Pressable style={estilos.camino} onPress={() => router.push("/comercio/alta")}>
        <Text style={estilos.caminoTitulo}>Cargar mi comercio</Text>
        <Text style={estilos.caminoAyuda}>
          Todavía no está en el mapa. Lo creás vos y lo publicamos después de revisarlo.
        </Text>
      </Pressable>

      <Pressable style={estilos.camino} onPress={() => router.push("/comercio/reclamar")}>
        <Text style={estilos.caminoTitulo}>Ya está en el mapa y es mío</Text>
        <Text style={estilos.caminoAyuda}>
          Lo buscás en la lista y pedís que te lo asignemos. Conservás las reseñas y las
          visitas que ya tiene.
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { fontSize: 21, fontWeight: "800", color: COLORES.texto },
  ayuda: { fontSize: 14, lineHeight: 21, color: COLORES.textoSuave },
  fuerte: { fontWeight: "700", color: COLORES.texto },

  aviso: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f0c3bc",
    backgroundColor: "#fdefed",
    gap: 4,
  },
  avisoTitulo: { fontSize: 15, fontWeight: "800", color: "#6b4d0c" },
  avisoTexto: { fontSize: 13, lineHeight: 19, color: "#6b4d0c" },

  // Botones grandes y no un desplegable: es la primera decisión de alguien que
  // recién se registró, y las dos opciones tienen que poder leerse enteras
  // antes de elegir.
  camino: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORES.borde,
    backgroundColor: COLORES.superficie,
    gap: 4,
  },
  caminoTitulo: { fontSize: 16, fontWeight: "700", color: COLORES.texto },
  caminoAyuda: { fontSize: 13.5, lineHeight: 19, color: COLORES.textoSuave },
});
