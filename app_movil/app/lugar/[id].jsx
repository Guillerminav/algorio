import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { estadoApertura, formatearDistancia } from "../../src/api.js";
import { Boton, Cargando, Error, Estrellas } from "../../src/componentes.jsx";
import { useSesion } from "../../src/sesion.jsx";
import { CampoTexto as TextInput, Texto as Text } from "../../src/Texto.jsx";
import { COLORES, tipoPoi } from "../../src/tema.js";

const DIAS = [
  ["lun", "Lunes"], ["mar", "Martes"], ["mie", "Miércoles"], ["jue", "Jueves"],
  ["vie", "Viernes"], ["sab", "Sábado"], ["dom", "Domingo"],
];

/** Botones de contacto. Cada uno avisa al backend antes de salir de la app:
 *  es la métrica que el comerciante ve en su panel. */
function AccionesContacto({ lugar, onRegistrar }) {
  const acciones = [
    lugar.whatsapp && {
      clave: "whatsapp",
      etiqueta: "WhatsApp",
      emoji: "💬",
      url: `https://wa.me/${String(lugar.whatsapp).replace(/\D/g, "")}`,
    },
    lugar.telefono && {
      clave: "telefono",
      etiqueta: "Llamar",
      emoji: "📞",
      url: `tel:${lugar.telefono}`,
    },
    {
      clave: "como_llegar",
      etiqueta: "Cómo llegar",
      emoji: "🧭",
      // El esquema nativo abre la app de mapas del sistema; en Android el
      // "geo:" con query mantiene el nombre del lugar en el destino.
      url: Platform.select({
        ios: `maps://?daddr=${lugar.lat},${lugar.lon}`,
        android: `geo:${lugar.lat},${lugar.lon}?q=${lugar.lat},${lugar.lon}(${encodeURIComponent(lugar.nombre)})`,
        default: `https://www.google.com/maps?q=${lugar.lat},${lugar.lon}`,
      }),
    },
  ].filter(Boolean);

  return (
    <View style={estilos.acciones}>
      {acciones.map((accion) => (
        <Pressable
          key={accion.clave}
          style={estilos.accion}
          onPress={async () => {
            onRegistrar(accion.clave);
            const sePuede = await Linking.canOpenURL(accion.url).catch(() => false);
            if (!sePuede) {
              Alert.alert("No se pudo abrir", "Tu teléfono no tiene una app para esto.");
              return;
            }
            Linking.openURL(accion.url);
          }}
        >
          <Text style={estilos.accionEmoji}>{accion.emoji}</Text>
          <Text style={estilos.accionTexto}>{accion.etiqueta}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ModalResena({ visible, inicial, onCerrar, onGuardar }) {
  const [puntaje, setPuntaje] = useState(inicial?.puntaje ?? 0);
  const [comentario, setComentario] = useState(inicial?.comentario ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // El modal se mantiene montado entre aperturas, asi que hay que resembrar
  // los campos cada vez que se abre; si no, editar una reseña mostraria lo que
  // se habia escrito la vez anterior.
  useEffect(() => {
    if (visible) {
      setPuntaje(inicial?.puntaje ?? 0);
      setComentario(inicial?.comentario ?? "");
      setError("");
    }
  }, [visible, inicial]);

  async function guardar() {
    setError("");
    setGuardando(true);
    try {
      await onGuardar(puntaje, comentario);
      onCerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <View style={estilos.modalFondo}>
        <View style={estilos.modal}>
          <Text style={estilos.modalTitulo}>¿Cómo estuvo?</Text>

          <View style={estilos.modalEstrellas}>
            <Estrellas puntaje={puntaje} tamano={40} onElegir={setPuntaje} />
          </View>

          <TextInput
            style={estilos.modalTexto}
            placeholder="Contá cómo te fue (opcional)"
            placeholderTextColor={COLORES.textoSuave}
            value={comentario}
            onChangeText={setComentario}
            multiline
            maxLength={500}
          />

          <Error>{error}</Error>

          <Boton
            titulo="Publicar"
            onPress={guardar}
            cargando={guardando}
            deshabilitado={puntaje === 0}
          />
          <Boton titulo="Cancelar" variante="secundario" onPress={onCerrar} />
        </View>
      </View>
    </Modal>
  );
}

export default function FichaLugar() {
  const { id } = useLocalSearchParams();
  const navegacion = useNavigation();
  const { api, usuario } = useSesion();

  const [lugar, setLugar] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLugar(await api(`/api/pois/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [api, id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El titulo de la barra sale del lugar, que llega despues del primer render.
  useEffect(() => {
    if (lugar) navegacion.setOptions({ title: lugar.nombre });
  }, [navegacion, lugar]);

  const registrarVisita = useCallback(
    (tipo) => {
      api(`/api/pois/${id}/visita`, { method: "POST", body: JSON.stringify({ tipo }) }).catch(() => {});
    },
    [api, id],
  );

  async function guardarResena(puntaje, comentario) {
    await api(`/api/pois/${id}/resenas`, {
      method: "POST",
      body: JSON.stringify({ puntaje, comentario }),
    });
    await cargar();
  }

  if (cargando) return <Cargando />;
  if (error) {
    return (
      <View style={estilos.contenido}>
        <Error>{error}</Error>
      </View>
    );
  }

  const definicion = tipoPoi(lugar.tipo);
  const apertura = estadoApertura(lugar.horarios);
  const distancia = formatearDistancia(lugar.distancia_km);
  const miResena = lugar.resenas.find((r) => r.usuario === usuario?.usuario) ?? null;
  const esMio = lugar.usuario === usuario?.usuario;

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      {lugar.fotos?.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.fotos}>
          {lugar.fotos.map((url) => (
            <Image key={url} source={{ uri: url }} style={estilos.foto} />
          ))}
        </ScrollView>
      )}

      <View style={estilos.encabezado}>
        <Text style={estilos.tipo}>
          {definicion.emoji} {definicion.etiqueta}
        </Text>
        <Text style={estilos.nombre}>{lugar.nombre}</Text>
        <View style={estilos.meta}>
          {lugar.puntaje_promedio !== null && lugar.puntaje_promedio !== undefined ? (
            <>
              <Estrellas puntaje={lugar.puntaje_promedio} tamano={15} />
              <Text style={estilos.metaTexto}>
                {lugar.puntaje_promedio.toFixed(1)} · {lugar.cantidad_resenas}{" "}
                {lugar.cantidad_resenas === 1 ? "reseña" : "reseñas"}
              </Text>
            </>
          ) : (
            <Text style={estilos.metaTexto}>Sin reseñas todavía</Text>
          )}
          {distancia && <Text style={estilos.metaTexto}>· a {distancia}</Text>}
        </View>
        {apertura && (
          <Text style={[estilos.apertura, { color: apertura.abierto ? COLORES.ok : COLORES.peligro }]}>
            {apertura.texto}
          </Text>
        )}
      </View>

      {lugar.descripcion && <Text style={estilos.descripcion}>{lugar.descripcion}</Text>}

      <AccionesContacto lugar={lugar} onRegistrar={registrarVisita} />

      {lugar.servicios?.length > 0 && (
        <View style={estilos.tarjeta}>
          <Text style={estilos.tarjetaTitulo}>Servicios</Text>
          <View style={estilos.chips}>
            {lugar.servicios.map((servicio) => (
              <View key={servicio} style={estilos.chip}>
                <Text style={estilos.chipTexto}>{servicio}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {lugar.menu?.length > 0 && (
        <View style={estilos.tarjeta}>
          {lugar.menu.map((seccion, i) => (
            <View key={i} style={estilos.seccionMenu}>
              {seccion.seccion ? <Text style={estilos.tarjetaTitulo}>{seccion.seccion}</Text> : null}
              {(seccion.items ?? []).map((item, j) => (
                <View key={j} style={estilos.itemMenu}>
                  <Text style={estilos.itemNombre}>{item.nombre}</Text>
                  {item.precio ? <Text style={estilos.itemPrecio}>${item.precio}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {lugar.horarios && Object.keys(lugar.horarios).length > 0 && (
        <View style={estilos.tarjeta}>
          <Text style={estilos.tarjetaTitulo}>Horarios</Text>
          {DIAS.map(([clave, etiqueta]) => {
            const dia = lugar.horarios[clave];
            if (!dia) return null;
            return (
              <View key={clave} style={estilos.filaHorario}>
                <Text style={estilos.diaTexto}>{etiqueta}</Text>
                <Text style={estilos.horaTexto}>
                  {dia.cerrado ? "Cerrado" : `${dia.abre} a ${dia.cierra}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={estilos.tarjeta}>
        <Text style={estilos.tarjetaTitulo}>Reseñas</Text>

        {/* Al dueño no se le ofrece reseñar: el backend lo rechaza igual, y
            mostrar un botón que siempre falla es peor que no mostrarlo. */}
        {!esMio && (
          <Boton
            titulo={miResena ? "Editar mi reseña" : "Escribir una reseña"}
            variante="secundario"
            onPress={() => setModalAbierto(true)}
          />
        )}

        {lugar.resenas.length === 0 ? (
          <Text style={estilos.metaTexto}>Todavía nadie escribió nada. Podés ser el primero.</Text>
        ) : (
          lugar.resenas.map((resena) => (
            <View key={resena.id} style={estilos.resena}>
              <View style={estilos.resenaEncabezado}>
                <Text style={estilos.resenaAutor}>{resena.autor}</Text>
                <Estrellas puntaje={resena.puntaje} tamano={13} />
              </View>
              {resena.comentario && <Text style={estilos.resenaComentario}>{resena.comentario}</Text>}
            </View>
          ))
        )}
      </View>

      <ModalResena
        visible={modalAbierto}
        inicial={miResena}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={guardarResena}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 16 },

  fotos: { marginHorizontal: -16 },
  foto: { width: 260, height: 170, borderRadius: 12, marginLeft: 16 },

  encabezado: { gap: 6 },
  tipo: { fontSize: 13, fontWeight: "700", color: COLORES.textoSuave },
  nombre: { fontSize: 26, fontWeight: "800", color: COLORES.texto },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  metaTexto: { fontSize: 14, color: COLORES.textoSuave },
  apertura: { fontSize: 14, fontWeight: "700", marginTop: 2 },

  descripcion: { fontSize: 15, lineHeight: 23, color: COLORES.texto },

  acciones: { flexDirection: "row", gap: 10 },
  accion: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORES.superficie,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  accionEmoji: { fontSize: 22 },
  accionTexto: { fontSize: 13, fontWeight: "600", color: COLORES.texto },

  tarjeta: {
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES.borde,
    padding: 16,
    gap: 10,
  },
  tarjetaTitulo: { fontSize: 16, fontWeight: "800", color: COLORES.texto },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: COLORES.chipFondo,
  },
  chipTexto: { fontSize: 13, color: COLORES.acento, fontWeight: "600" },

  seccionMenu: { gap: 6 },
  itemMenu: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 3 },
  itemNombre: { flex: 1, fontSize: 15, color: COLORES.texto },
  itemPrecio: { fontSize: 15, fontWeight: "700", color: COLORES.texto },

  filaHorario: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  diaTexto: { fontSize: 14, color: COLORES.texto },
  horaTexto: { fontSize: 14, color: COLORES.textoSuave },

  resena: { paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORES.bordeSuave, gap: 4 },
  resenaEncabezado: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  resenaAutor: { fontSize: 14, fontWeight: "700", color: COLORES.texto },
  resenaComentario: { fontSize: 14, lineHeight: 20, color: COLORES.textoSuave },

  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    gap: 14,
  },
  modalTitulo: { fontSize: 20, fontWeight: "800", color: COLORES.texto, textAlign: "center" },
  modalEstrellas: { alignItems: "center", paddingVertical: 6 },
  modalTexto: {
    borderWidth: 1,
    borderColor: COLORES.borde,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    fontSize: 15,
    color: COLORES.texto,
    backgroundColor: COLORES.superficie,
    textAlignVertical: "top",
  },
});
