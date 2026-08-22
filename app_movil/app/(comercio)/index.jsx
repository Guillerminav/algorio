import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { tipoComercio } from "../../src/comercio.js";
import { Boton, Campo, Cargando, Error } from "../../src/componentes.jsx";
import { AvisoEstado, ChipEstado, Tarjeta } from "../../src/piezasComercio.jsx";
import SinComercio from "../../src/SinComercio.jsx";
import { CampoTexto as TextInput, Texto as Text } from "../../src/Texto.jsx";
import { COLORES } from "../../src/tema.js";
import { useComercio } from "../../src/useComercio.js";

// Los campos que esta pantalla edita. Se guardan solo los que cambiaron.
const CAMPOS = ["nombre", "descripcion", "telefono", "whatsapp", "instagram", "servicios"];

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default function MiComercio() {
  const router = useRouter();
  const { comercio, reclamo, cargando, error, guardando, guardar, eliminar, recargar } =
    useComercio();
  const [valores, setValores] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [errorGuardado, setErrorGuardado] = useState("");

  // La ficha llega despues del primer render: se copia a estado local cuando
  // aparece, y tambien cuando vuelve actualizada del guardado.
  useEffect(() => {
    if (comercio) setValores(Object.fromEntries(CAMPOS.map((c) => [c, comercio[c]])));
  }, [comercio]);

  if (cargando) return <Cargando />;
  if (error) {
    return (
      <View style={estilos.contenido}>
        <Error>{error}</Error>
      </View>
    );
  }

  // Sin ficha cargada no hay panel posible. Pero puede que la cuenta no tenga
  // ficha y SI un reclamo en curso, asi que no se manda derecho al alta: eso
  // lo decide SinComercio, igual que en la web.
  if (!comercio) return <SinComercio reclamo={reclamo} onRecargar={recargar} />;
  if (!valores) return <Cargando />;

  const definicion = tipoComercio(comercio.tipo);
  const cambiados = CAMPOS.filter((c) => !igual(valores[c], comercio[c]));
  const hayCambios = cambiados.length > 0;

  const cambiar = (campo, valor) => {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    setMensaje("");
  };

  const alternarServicio = (servicio) => {
    const elegidos = valores.servicios ?? [];
    cambiar(
      "servicios",
      elegidos.includes(servicio)
        ? elegidos.filter((s) => s !== servicio)
        : [...elegidos, servicio],
    );
  };

  async function guardarCambios() {
    setErrorGuardado("");
    setMensaje("");
    try {
      await guardar(Object.fromEntries(cambiados.map((c) => [c, valores[c]])));
      setMensaje("Listo, guardamos los cambios.");
    } catch (e) {
      setErrorGuardado(e.message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.pantalla}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={110}
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <AvisoEstado comercio={comercio} />

        <Tarjeta>
          <View style={estilos.encabezado}>
            <Text style={estilos.emoji}>{definicion.emoji}</Text>
            <View style={estilos.flex}>
              <Text style={estilos.nombre}>{comercio.nombre}</Text>
              <Text style={estilos.tipo}>{definicion.etiqueta}</Text>
            </View>
          </View>
          <ChipEstado estado={comercio.estado} />
          {/* El rubro se muestra pero no se edita: quedo atado al comercio en
              el alta. Se aclara con todas las letras en vez de esconderlo —
              quien lo busque para cambiarlo merece enterarse de por que no
              esta (ver pois.CAMPOS_EDITABLES). */}
          <Text style={estilos.notaRubro}>
            El rubro queda asociado a este comercio desde el alta y no se puede cambiar.
          </Text>
        </Tarjeta>

        <Tarjeta titulo="Datos">
          <Campo
            etiqueta="Nombre"
            value={valores.nombre ?? ""}
            onChangeText={(t) => cambiar("nombre", t)}
            maxLength={120}
          />
          <View style={estilos.campo}>
            <Text style={estilos.campoEtiqueta}>Descripción</Text>
            <TextInput
              style={estilos.textarea}
              multiline
              maxLength={600}
              placeholder="Contá en dos líneas qué te hace distinto."
              placeholderTextColor={COLORES.textoSuave}
              value={valores.descripcion ?? ""}
              onChangeText={(t) => cambiar("descripcion", t)}
            />
          </View>
          {!igual(valores.nombre, comercio.nombre) && comercio.estado === "aprobado" && (
            <Text style={estilos.avisoRevision}>
              Cambiar el nombre devuelve la ficha a revisión y deja de verse en el mapa
              hasta que la aprobemos de nuevo.
            </Text>
          )}
        </Tarjeta>

        <Tarjeta titulo="Contacto">
          <Campo
            etiqueta="WhatsApp"
            keyboardType="phone-pad"
            value={valores.whatsapp ?? ""}
            onChangeText={(t) => cambiar("whatsapp", t)}
          />
          <Campo
            etiqueta="Teléfono"
            keyboardType="phone-pad"
            value={valores.telefono ?? ""}
            onChangeText={(t) => cambiar("telefono", t)}
          />
          <Campo
            etiqueta="Instagram"
            autoCapitalize="none"
            value={valores.instagram ?? ""}
            onChangeText={(t) => cambiar("instagram", t)}
          />
        </Tarjeta>

        <Tarjeta titulo="Servicios">
          <View style={estilos.chips}>
            {definicion.servicios.map((servicio) => {
              const activo = (valores.servicios ?? []).includes(servicio);
              return (
                <Pressable
                  key={servicio}
                  onPress={() => alternarServicio(servicio)}
                  style={[estilos.chip, activo && estilos.chipActivo]}
                >
                  <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>
                    {servicio}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Tarjeta>

        <Tarjeta titulo="Dónde estás">
          {/* El mapa es de solo lectura: mover el pin devuelve la ficha a
              revisión, así que se hace en su propia pantalla, con el aviso
              correspondiente, y no de un arrastre accidental acá. */}
          <MapView
            style={estilos.mapa}
            initialRegion={{
              latitude: comercio.lat,
              longitude: comercio.lon,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            mapType="hybrid"
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            toolbarEnabled={false}
          >
            <Marker coordinate={{ latitude: comercio.lat, longitude: comercio.lon }} />
          </MapView>
          <Boton
            titulo="Cambiar ubicación"
            variante="secundario"
            onPress={() => router.push("/comercio/ubicacion")}
          />
        </Tarjeta>

        {/* El tablero va en su propia tarjeta y ARRIBA de "Más": es lo unico
            de este panel que se abre todos los dias —marcar una demora antes
            de salir— y esconderlo entre los accesos secundarios lo dejaria a
            dos toques de distancia justo cuando hay apuro. */}
        {definicion.tieneTablero && (
          <Tarjeta titulo="Tablero de cruces">
            <Text style={estilos.ayudaTablero}>
              A qué hora cruzás, cada cuánto, cuánto sale y si hoy va demorada. Los estados
              se publican en el momento, sin revisión.
            </Text>
            <Boton titulo="Abrir el tablero" onPress={() => router.push("/comercio/tablero")} />
          </Tarjeta>
        )}

        <Tarjeta titulo="Más">
          <Boton
            titulo="Horarios"
            variante="secundario"
            onPress={() => router.push("/comercio/horarios")}
          />
          {definicion.tieneCarta && (
            <Boton
              titulo="Menú"
              variante="secundario"
              onPress={() => router.push("/comercio/carta")}
            />
          )}
        </Tarjeta>

        <Error>{errorGuardado}</Error>
        {mensaje !== "" && <Text style={estilos.ok}>{mensaje}</Text>}

        <Boton
          titulo="Guardar cambios"
          onPress={guardarCambios}
          cargando={guardando}
          deshabilitado={!hayCambios}
        />

        <ZonaRiesgo comercio={comercio} onEliminar={eliminar} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Eliminar el comercio. Abajo de todo, apartado y en rojo.
 *
 * Está separado del formulario —y no es un botón más al lado de Guardar—
 * porque no es una edición: es la única acción de esta pantalla que no se
 * puede deshacer y que se lleva puestas cosas que no son del comerciante. Al
 * borrar el POI caen con él las reseñas, las visitas y las fotos
 * (ON DELETE CASCADE, ver db.py), así que las reseñas que dejaron los nautas
 * desaparecen sin que nadie les avise.
 *
 * Por eso se confirma escribiendo el nombre y no con un "¿estás seguro?": el
 * sí automático de un Alert se toca sin leerlo, y tipear el nombre del propio
 * parador obliga a mirar qué se está por borrar.
 *
 * Espeja la ZonaRiesgo de frontend/src/comercio/MiComercio.jsx.
 */
function ZonaRiesgo({ comercio, onEliminar }) {
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  const nombre = (comercio.nombre ?? "").trim();
  const coincide = texto.trim().toLocaleLowerCase() === nombre.toLocaleLowerCase();

  async function eliminarAhora() {
    setError("");
    setEliminando(true);
    try {
      await onEliminar();
      // Sin navegar: al quedar la ficha en null, esta misma pantalla pasa a
      // mostrar SinComercio, que es de donde se sale a cargar otra o a
      // reclamar una del mapa.
    } catch (e) {
      setError(e.message || "No pudimos eliminar el comercio.");
      setEliminando(false);
    }
  }

  return (
    <View style={estilos.zonaRiesgo}>
      <Text style={estilos.zonaRiesgoTitulo}>Eliminar el comercio</Text>
      <Text style={estilos.zonaRiesgoTexto}>
        <Text style={estilos.zonaRiesgoFuerte}>{nombre}</Text> se va del mapa y se borran
        sus reseñas, sus fotos y las visitas que tenés en Métricas. No se puede deshacer.
      </Text>
      {/* La alternativa, dicha acá y no en Ayuda: la mayoría de las veces que
          alguien busca este botón lo que quiere es dejar de figurar un tiempo,
          no perder tres años de reseñas. */}
      <Text style={estilos.zonaRiesgoAlternativa}>
        Si solo querés dejar de aparecer por un tiempo, no hace falta borrar nada: vaciá
        los horarios y tu ficha va a figurar como cerrada.
      </Text>

      <Error>{error}</Error>

      {confirmando ? (
        <>
          <Text style={estilos.zonaRiesgoTexto}>
            Escribí <Text style={estilos.zonaRiesgoFuerte}>{nombre}</Text> para confirmar
          </Text>
          <TextInput
            style={estilos.zonaRiesgoCampo}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!eliminando}
            value={texto}
            onChangeText={setTexto}
          />
          <Boton
            titulo={eliminando ? "Eliminando…" : "Eliminar para siempre"}
            onPress={eliminarAhora}
            cargando={eliminando}
            deshabilitado={!coincide}
          />
          <Boton
            titulo="Cancelar"
            variante="secundario"
            deshabilitado={eliminando}
            onPress={() => {
              setConfirmando(false);
              setTexto("");
              setError("");
            }}
          />
        </>
      ) : (
        <Pressable style={estilos.botonPeligro} onPress={() => setConfirmando(true)}>
          <Text style={estilos.botonPeligroTexto}>Eliminar comercio</Text>
        </Pressable>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.fondo },
  contenido: { padding: 16, gap: 14, paddingBottom: 32 },
  flex: { flex: 1 },

  ayudaTablero: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
  notaRubro: { fontSize: 12.5, lineHeight: 18, color: COLORES.textoSuave },

  encabezado: { flexDirection: "row", alignItems: "center", gap: 12 },
  emoji: { fontSize: 30 },
  nombre: { fontSize: 19, fontWeight: "800", color: COLORES.texto },
  tipo: { fontSize: 13, color: COLORES.textoSuave, marginTop: 1 },

  // Apartada del resto y en rojo: no es una edicion mas, es lo unico de la
  // pantalla que no se deshace. Ir a buscarla tiene que costar un poco.
  zonaRiesgo: {
    gap: 8,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES.peligro,
    backgroundColor: COLORES.superficie,
  },
  zonaRiesgoTitulo: { fontSize: 15.5, fontWeight: "700", color: COLORES.peligro },
  zonaRiesgoTexto: { fontSize: 13, lineHeight: 19, color: COLORES.textoSuave },
  zonaRiesgoFuerte: { fontWeight: "700", color: COLORES.texto },
  zonaRiesgoAlternativa: {
    fontSize: 12.5,
    lineHeight: 18,
    padding: 9,
    borderRadius: 9,
    backgroundColor: COLORES.chipFondo,
    color: COLORES.textoSuave,
  },
  zonaRiesgoCampo: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORES.texto,
    backgroundColor: COLORES.fondo,
  },
  botonPeligro: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORES.peligro,
  },
  botonPeligroTexto: { fontSize: 14, fontWeight: "700", color: COLORES.peligro },

  campo: { gap: 6 },
  campoEtiqueta: { fontSize: 14, fontWeight: "600", color: COLORES.texto },
  textarea: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    padding: 12,
    minHeight: 90,
    fontSize: 16,
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
    textAlignVertical: "top",
  },
  avisoRevision: { fontSize: 12, lineHeight: 18, color: COLORES.alerta },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  chipActivo: { backgroundColor: COLORES.acento, borderColor: COLORES.acento },
  chipTexto: { fontSize: 13, color: COLORES.textoSuave, fontWeight: "600" },
  chipTextoActivo: { color: "#fff" },

  mapa: { height: 170, borderRadius: 10 },

  ok: { fontSize: 14, color: COLORES.ok },
});
