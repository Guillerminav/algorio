import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Texto as Text } from "../../src/Texto.jsx";

import { diaDe, formatearHora, nombreDeDia } from "../../src/api.js";
import { Cargando, Error } from "../../src/componentes.jsx";
import { embarcacionPorClave } from "../../src/embarcaciones.js";
import { useSesion } from "../../src/sesion.jsx";
import { COLOR_POR_ESTADO_RIO, COLORES } from "../../src/tema.js";
import { CENTRO_POR_DEFECTO, useUbicacion } from "../../src/useUbicacion.js";

function Dato({ etiqueta, valor, unidad }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoValor}>
        {valor ?? "—"}
        {valor !== null && valor !== undefined && unidad ? (
          <Text style={estilos.datoUnidad}> {unidad}</Text>
        ) : null}
      </Text>
      <Text style={estilos.datoEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

/**
 * Una fila por hora. La barra de color es la lectura rapida: se recorre el dia
 * con el pulgar buscando dónde deja de estar en verde, que es la pregunta real
 * ("¿hasta qué hora puedo estar afuera?").
 */
/**
 * De donde sopla el viento, como flecha.
 *
 * La flecha apunta hacia el origen, como una veleta: con viento del sudeste
 * apunta al sudeste. Es lo que se pregunta antes de salir —"¿de donde me va a
 * venir?"— y se lee de un vistazo, cosa que "ESE" no.
 *
 * Open-Meteo ya entrega la direccion en convencion meteorologica (de donde
 * sopla), asi que el angulo se usa tal cual: la flecha base apunta al norte y
 * se la rota esos grados en sentido horario.
 *
 * Es un caracter rotado y no un SVG para no sumar react-native-svg al proyecto
 * por una sola flecha.
 */
function FlechaViento({ grados }) {
  if (grados === null || grados === undefined) {
    return <Text style={estilos.filaDireccion}>—</Text>;
  }
  return (
    <Text style={[estilos.filaDireccion, { transform: [{ rotate: `${grados}deg` }] }]}>
      ↑
    </Text>
  );
}

function FilaHora({ hora, maximo }) {
  const color = COLOR_POR_ESTADO_RIO[hora.estado] ?? COLORES.textoSuave;
  const ancho = maximo > 0 ? Math.max((hora.viento_kmh ?? 0) / maximo, 0.04) : 0;

  return (
    <View style={estilos.filaHora}>
      <Text style={estilos.filaHoraTexto}>{formatearHora(hora.hora)}</Text>
      <View style={estilos.filaBarraFondo}>
        <View style={[estilos.filaBarra, { width: `${ancho * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={estilos.filaViento}>
        {hora.viento_kmh === null || hora.viento_kmh === undefined ? "—" : Math.round(hora.viento_kmh)}
        {hora.rafagas_kmh > hora.viento_kmh ? ` / ${Math.round(hora.rafagas_kmh)}` : ""}
      </Text>
      <FlechaViento grados={hora.direccion_grados} />
    </View>
  );
}

export default function PantallaClima() {
  const { api, usuario } = useSesion();
  const { posicion } = useUbicacion();
  const [clima, setClima] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const punto = posicion ?? CENTRO_POR_DEFECTO;

  async function cargar() {
    setError("");
    try {
      setClima(await api(`/api/clima?lat=${punto.latitude}&lon=${punto.longitude}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }

  useEffect(() => {
    cargar();
    // Se recarga cuando aparece la ubicacion; `cargar` se redefine en cada
    // render y ponerla en las dependencias seria un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto.latitude, punto.longitude]);

  if (cargando) return <Cargando texto="Consultando el pronóstico…" />;

  if (error) {
    return (
      <View style={estilos.contenido}>
        <Error>{error}</Error>
      </View>
    );
  }

  const { actual, estado_rio: estado, pronostico, umbrales_kmh: umbrales } = clima;
  const embarcacion = embarcacionPorClave(usuario?.tipo_embarcacion);
  const maximoViento = Math.max(...pronostico.map((h) => h.viento_kmh ?? 0), 1);

  return (
    <ScrollView
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl
          refreshing={refrescando}
          onRefresh={() => {
            setRefrescando(true);
            cargar();
          }}
          tintColor={COLORES.acento}
        />
      }
    >
      {/* Tarjeta clara con un punto de color, y no un bloque entero pintado
          de verde, ámbar o rojo. Es la misma decisión que en el mapa: el
          semáforo tiene que leerse de reojo, no quedarse con la pantalla. Acá
          además el bloque a sangre competía con la tabla de 48 horas, que sí
          usa color y ahí el color es el dato. */}
      <View style={estilos.veredicto}>
        <View style={estilos.veredictoFila}>
          <View
            style={[
              estilos.veredictoPunto,
              { backgroundColor: COLOR_POR_ESTADO_RIO[estado.estado] ?? COLORES.textoSuave },
            ]}
          />
          <Text style={estilos.veredictoTitulo}>{estado.titulo}</Text>
        </View>
        {estado.detalle && <Text style={estilos.veredictoDetalle}>{estado.detalle}</Text>}
        {embarcacion && (
          <Text style={estilos.veredictoNota}>
            Calibrado para {embarcacion.etiqueta.toLowerCase()}: se pone picado desde{" "}
            {umbrales.picado} km/h y conviene no salir desde {umbrales.muy_picado}.
          </Text>
        )}
      </View>

      <View style={estilos.tarjeta}>
        <Text style={estilos.tarjetaTitulo}>Ahora</Text>
        <View style={estilos.datos}>
          <Dato etiqueta="Viento" valor={redondear(actual.viento_kmh)} unidad="km/h" />
          <Dato etiqueta="Ráfagas" valor={redondear(actual.rafagas_kmh)} unidad="km/h" />
          <Dato etiqueta="Dirección" valor={actual.direccion} />
          <Dato etiqueta="Temperatura" valor={redondear(actual.temperatura_c)} unidad="°" />
        </View>
      </View>

      <View style={estilos.tarjeta}>
        <Text style={estilos.tarjetaTitulo}>Próximas 48 horas</Text>
        <View style={estilos.encabezadoTabla}>
          <Text style={[estilos.encabezadoTexto, estilos.colHora]}>Hora</Text>
          <Text style={[estilos.encabezadoTexto, estilos.flex]}>Viento</Text>
          <Text style={[estilos.encabezadoTexto, estilos.colViento]}>km/h</Text>
          <Text style={[estilos.encabezadoTexto, estilos.colDireccion]}>Dir.</Text>
        </View>

        {pronostico.map((hora, indice) => {
          // Separador cuando cambia el dia: 48 horas seguidas sin cortes no
          // dejan ver donde termina hoy y empieza mañana, que es justo lo que
          // se mira para decidir cuando salir.
          const cambiaDia =
            indice === 0 || diaDe(hora.hora) !== diaDe(pronostico[indice - 1].hora);
          return (
            <React.Fragment key={hora.hora}>
              {cambiaDia && (
                <Text style={[estilos.separadorDia, indice === 0 && estilos.separadorDiaPrimero]}>
                  {nombreDeDia(hora.hora)}
                </Text>
              )}
              <FilaHora hora={hora} maximo={maximoViento} />
            </React.Fragment>
          );
        })}
      </View>

      <Text style={estilos.pie}>
        Pronóstico de Open-Meteo para tu posición. Las ráfagas van después de la
        barra cuando superan al viento sostenido. La flecha apunta de dónde viene
        el viento.
      </Text>
    </ScrollView>
  );
}

const redondear = (n) => (typeof n === "number" ? Math.round(n) : null);

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 16 },
  flex: { flex: 1 },

  veredicto: {
    borderRadius: 16,
    padding: 18,
    gap: 4,
    backgroundColor: COLORES.superficie,
    borderWidth: 1,
    borderColor: COLORES.borde,
  },
  veredictoFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  veredictoPunto: { width: 12, height: 12, borderRadius: 999 },
  veredictoTitulo: { color: COLORES.texto, fontSize: 24, fontWeight: "800" },
  veredictoDetalle: { color: COLORES.textoSuave, fontSize: 15 },
  veredictoNota: { color: COLORES.textoSuave, fontSize: 13, lineHeight: 19, marginTop: 6 },

  tarjeta: {
    backgroundColor: COLORES.superficie,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORES.borde,
    padding: 16,
    gap: 12,
  },
  tarjetaTitulo: { fontSize: 16, fontWeight: "800", color: COLORES.texto },

  datos: { flexDirection: "row", flexWrap: "wrap" },
  dato: { width: "50%", paddingVertical: 8, gap: 2 },
  datoValor: { fontSize: 26, fontWeight: "800", color: COLORES.texto },
  datoUnidad: { fontSize: 14, fontWeight: "600", color: COLORES.textoSuave },
  datoEtiqueta: { fontSize: 13, color: COLORES.textoSuave },

  encabezadoTabla: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.bordeSuave,
  },
  encabezadoTexto: { fontSize: 11, fontWeight: "700", color: COLORES.textoSuave, textTransform: "uppercase" },

  filaHora: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  filaHoraTexto: { fontSize: 13, color: COLORES.texto, width: 44 },
  colHora: { width: 44 },
  filaBarraFondo: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORES.bordeSuave },
  filaBarra: { height: 8, borderRadius: 4 },
  filaViento: { fontSize: 13, color: COLORES.texto, width: 58, textAlign: "right" },
  colViento: { width: 58, textAlign: "right" },
  filaDireccion: { fontSize: 15, color: COLORES.textoSuave, width: 32, textAlign: "center" },
  colDireccion: { width: 32, textAlign: "center" },

  separadorDia: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORES.borde,
    fontSize: 12,
    fontWeight: "700",
    color: COLORES.textoSuave,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // El primero va pegado al encabezado, sin la linea ni el aire de arriba.
  separadorDiaPrimero: { marginTop: 4, paddingTop: 0, borderTopWidth: 0 },

  pie: { fontSize: 12, lineHeight: 18, color: COLORES.textoSuave, paddingHorizontal: 4 },
});
