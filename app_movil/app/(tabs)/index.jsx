import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Texto as Text } from "../../src/Texto.jsx";
import MapView, { Callout, Marker } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { estadoApertura, haceCuanto, vigenciaRestante } from "../../src/api.js";
import Brujula from "../../src/Brujula.jsx";
import { distanciaEnTexto, haciaElLugar } from "../../src/rumbo.js";
import { Estrellas } from "../../src/componentes.jsx";
import { embarcacionPorClave } from "../../src/embarcaciones.js";
import ModalReporte from "../../src/ModalReporte.jsx";
import { useSesion } from "../../src/sesion.jsx";
import {
  COLOR_ESTADO_SOBRE_VIDRIO,
  COLORES,
  TIPOS_POI,
  VIDRIO,
  severidadPorClave,
  tipoPoi,
  tipoReporte,
} from "../../src/tema.js";
import { estadoCruce, estadoResumen, faltanEnTexto, proximoCruce } from "../../src/tablero.js";
import { CENTRO_POR_DEFECTO, useUbicacion } from "../../src/useUbicacion.js";
import { Vidrio, VidrioTocable } from "../../src/Vidrio.jsx";

// Encuadre inicial: ~40 km de lado. Suficiente para ver el tramo de río donde
// se sale a navegar sin arrancar tan cerca que no se vea ningún parador.
const DELTA_INICIAL = { latitudeDelta: 0.35, longitudeDelta: 0.35 };

/**
 * El cartel de arriba: las tres cosas que se miran antes de largar amarras.
 *
 * Son tres lecturas distintas y por eso están separadas por una línea y no
 * amontonadas en una frase:
 *
 * - **Navegabilidad** — el veredicto cruzado con TU embarcación
 *   (backend/clima.py). Es lo único en negrita: es la respuesta a la pregunta.
 * - **Viento** — el número crudo, abajo y más chico. Solo no dice nada: 20
 *   km/h es una tarde tranquila en una lancha y un problema en un kayak.
 * - **Dirección** — de dónde sopla, como veleta. Es lo que decide por qué
 *   orilla conviene ir, y por eso vale una columna propia y no un renglón más.
 *
 * El semáforo quedó en un punto de color. Antes la barra entera se pintaba de
 * verde, ámbar o rojo: gritaba lo mismo un día de 30 km/h que uno de 60, y
 * encima le tapaba al mapa una franja de alto justo arriba, que es donde uno
 * está mirando.
 */
function PanelRio({ clima, cargando, embarcacion, onPress }) {
  if (cargando) {
    return (
      <Vidrio estilo={estilos.panel} radio={999} denso>
        <View style={estilos.panelCuerpo}>
          <ActivityIndicator color={VIDRIO.texto} size="small" />
          <Text style={estilos.panelVeredicto}>Viendo cómo está el río…</Text>
        </View>
      </Vidrio>
    );
  }

  const estadoRio = clima?.estado_rio;
  const actual = clima?.actual;
  const estado = estadoRio?.estado ?? "sin_datos";
  const color = COLOR_ESTADO_SOBRE_VIDRIO[estado] ?? COLOR_ESTADO_SOBRE_VIDRIO.sin_datos;

  // El detalle se arma acá y no se usa el `detalle` que manda el backend
  // ("Viento 14 km/h, ráfagas 22") porque en este cartel el número va sin la
  // palabra "Viento" adelante: ya está claro por dónde se lee.
  const viento = actual?.viento_kmh;
  const rafagas = actual?.rafagas_kmh;
  const lecturaViento =
    viento === null || viento === undefined
      ? "Sin datos de viento"
      : `${Math.round(viento)} km/h${
          rafagas !== null && rafagas !== undefined && rafagas > viento
            ? ` · ráfagas ${Math.round(rafagas)}`
            : ""
        }`;

  const grados = actual?.direccion_grados;
  const letras = actual?.direccion;
  const hayRumbo = grados !== null && grados !== undefined && Boolean(letras);

  return (
    <VidrioTocable estilo={estilos.panel} radio={999} denso onPress={onPress} accessibilityRole="button">
      <View style={estilos.panelCuerpo}>
        {/* El emoji recuerda de un vistazo que el veredicto es el umbral de TU
            embarcación y no uno genérico. Sin él, dos personas paradas en la
            misma orilla ven carteles distintos y no hay nada que lo explique. */}
        {embarcacion && <Text style={estilos.panelEmbarcacion}>{embarcacion.emoji}</Text>}

        <View style={estilos.panelLecturas}>
          <View style={estilos.panelFila}>
            <View style={[estilos.panelPunto, { backgroundColor: color }]} />
            <Text style={estilos.panelVeredicto} numberOfLines={1}>
              {estadoRio?.titulo ?? "Sin datos del río"}
            </Text>
          </View>
          <Text style={estilos.panelViento} numberOfLines={1}>{lecturaViento}</Text>
        </View>

        {hayRumbo && (
          <>
            <View style={estilos.panelSeparador} />
            {/* La flecha apunta al ORIGEN del viento, como una veleta: es la
                convención meteorológica que ya usa el backend (`rumbo()`), y
                la misma que dibuja la web. */}
            <View style={estilos.panelRumbo} accessibilityLabel={`Viento del ${letras}`}>
              <Text style={[estilos.panelFlecha, { transform: [{ rotate: `${grados}deg` }] }]}>↑</Text>
              <Text style={estilos.panelRumboLetras}>{letras}</Text>
            </View>
          </>
        )}

        <Text style={estilos.panelChevron}>›</Text>
      </View>
    </VidrioTocable>
  );
}

/**
 * Filtros por rubro.
 *
 * Prendido y apagado se distinguen por el punto —lleno o hueco— y por el peso
 * del texto, no por pintar el chip entero de azul. Sobre el mapa, tres chips
 * llenos de color compiten con los pines, que son lo que hay que mirar.
 */
function ChipsTipo({ activos, onAlternar }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={estilos.chips}
    >
      {Object.entries(TIPOS_POI).map(([clave, definicion]) => {
        const activo = activos.includes(clave);
        return (
          <VidrioTocable
            key={clave}
            radio={999}
            estilo={estilos.chip}
            onPress={() => onAlternar(clave)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
          >
            <View style={estilos.chipCuerpo}>
              <View
                style={[
                  estilos.chipPunto,
                  activo
                    ? { backgroundColor: definicion.color }
                    : { borderWidth: 1.5, borderColor: definicion.color },
                ]}
              />
              <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>
                {definicion.etiqueta}
              </Text>
            </View>
          </VidrioTocable>
        );
      })}
    </ScrollView>
  );
}

/**
 * El pin de una lancha-taxi: un cartel de terminal, no un globo de color.
 *
 * Los otros dos rubros son "un lugar al que se llega" y les alcanza con el pin
 * por defecto. Una lancha-taxi es de donde SALE el transporte, y esa
 * diferencia se lee por forma —sin zoom y sin leer nada— y no por un tercer
 * tono de azul. Es la misma distincion que hacen los mapas de ciudad entre un
 * comercio y una estacion.
 *
 * El punto de arriba a la derecha solo aparece cuando el tablero tiene una
 * alteracion (una demora, un cruce cancelado): si estuviera siempre, un mapa
 * donde todos los pines avisan algo es un mapa donde ninguno avisa nada.
 */
function PinTerminal({ lugar }) {
  const alterado = estadoResumen(lugar.cruces);
  return (
    <View style={estilos.pinTerminal}>
      <View style={estilos.pinTerminalCuerpo}>
        <Text style={estilos.pinTerminalGlifo}>⛴</Text>
        {alterado ? (
          <View style={[estilos.pinTerminalPunto, { backgroundColor: alterado.color }]} />
        ) : null}
      </View>
      {/* El pie del cartel: esta parado sobre el muelle, no flotando encima. */}
      <View style={estilos.pinTerminalPie} />
    </View>
  );
}

/**
 * El renglon de tablero de una lancha-taxi: cual es el proximo cruce que sale
 * y cuando. Es el equivalente de "abierto hasta las 20" de un parador — el
 * dato por el que se toco el pin. El tablero completo queda detras de "Ver
 * mas", igual que la carta.
 */
function ProximoCruce({ cruces }) {
  const proximo = proximoCruce(cruces);
  if (!proximo) return null;

  const { cruce, salida } = proximo;
  const estado = estadoCruce(cruce.estado);

  return (
    <View style={estilos.tarjetaCruce}>
      <Text style={estilos.tarjetaCruceHora}>{salida.estimada ?? salida.hora}</Text>
      <View style={estilos.flex}>
        <Text style={estilos.tarjetaCruceDestino} numberOfLines={1}>{cruce.destino}</Text>
        <Text style={estilos.tarjetaCruceFalta}>{faltanEnTexto(salida.faltan)}</Text>
      </View>
      {estado.alterado ? (
        <View style={[estilos.tarjetaCruceEstado, { backgroundColor: estado.color }]}>
          <Text style={estilos.tarjetaCruceEstadoTexto}>{estado.etiqueta.toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * La ventana de abajo al tocar un pin.
 *
 * Muestra lo básico y nada más: nombre, rubro, puntaje, si está abierto y —lo
 * que de verdad se necesita arriba de una lancha— a cuánto está y para qué
 * lado. Las reseñas, la carta y los horarios completos quedan detrás de "Ver
 * más", porque son para cuando ya decidiste ir.
 */
function TarjetaLugar({ lugar, posicion, onAbrir, onCerrar }) {
  const definicion = tipoPoi(lugar.tipo);
  const apertura = estadoApertura(lugar.horarios);
  // Se recalcula con la posición del momento y no se usa `distancia_km` del
  // backend a secas: esa se calculó cuando se pidió la lista, y mientras
  // navegás deja de ser cierta. El valor del backend queda de respaldo para
  // cuando todavía no hay GPS.
  const rumbo = haciaElLugar(posicion, lugar);
  const distancia = rumbo?.texto ?? distanciaEnTexto(lugar.distancia_km);

  return (
    <View style={estilos.tarjeta}>
      <Pressable onPress={onCerrar} hitSlop={10} style={estilos.tarjetaCerrar}>
        <Text style={estilos.tarjetaCerrarTexto}>✕</Text>
      </Pressable>

      <Pressable onPress={onAbrir}>
        <View style={estilos.tarjetaEncabezado}>
          <Text style={estilos.tarjetaEmoji}>{definicion.emoji}</Text>
          <View style={estilos.flex}>
            <Text style={estilos.tarjetaNombre} numberOfLines={1}>{lugar.nombre}</Text>
            <Text style={estilos.tarjetaTipo}>{definicion.etiqueta}</Text>
          </View>
        </View>

        <View style={estilos.tarjetaMeta}>
          {lugar.puntaje_promedio !== null && lugar.puntaje_promedio !== undefined ? (
            <View style={estilos.fila}>
              <Estrellas puntaje={lugar.puntaje_promedio} tamano={13} />
              <Text style={estilos.tarjetaMetaTexto}>
                {lugar.puntaje_promedio.toFixed(1)} ({lugar.cantidad_resenas})
              </Text>
            </View>
          ) : (
            <Text style={estilos.tarjetaMetaTexto}>Sin reseñas</Text>
          )}
          {distancia && <Text style={estilos.tarjetaMetaTexto}>· {distancia}</Text>}
          {apertura && (
            <Text
              style={[
                estilos.tarjetaMetaTexto,
                { color: apertura.abierto ? COLORES.ok : COLORES.peligro },
              ]}
            >
              · {apertura.texto}
            </Text>
          )}
        </View>

        <ProximoCruce cruces={lugar.cruces} />

        {rumbo && (
          <View style={estilos.tarjetaRumbo}>
            <Brujula grados={rumbo.grados} letras={rumbo.letras} tamano={48} />
            <View style={estilos.flex}>
              <Text style={estilos.tarjetaRumboDistancia}>{rumbo.texto}</Text>
              <Text style={estilos.tarjetaRumboTexto}>
                Navegando al {rumbo.letras} desde donde estás
              </Text>
            </View>
          </View>
        )}

        <Text style={estilos.tarjetaVerMas}>Ver más ›</Text>
      </Pressable>
    </View>
  );
}

/**
 * Los avisos sueltos sobre el mapa: mismo vidrio que el resto de la capa.
 *
 * `tono` decide cuanto grita. Los informativos van en vidrio pelado; el del
 * modo reporte se tiñe con el acento porque avisa de un modo activo —el
 * proximo toque en el mapa deja un aviso— y eso hay que verlo sin buscarlo.
 */
function Aviso({ children, tono = "normal" }) {
  return (
    <Vidrio
      estilo={estilos.aviso}
      radio={14}
      denso={tono !== "normal"}
      tinte={tono === "destacado" ? COLORES.acento : null}
    >
      <Text style={[estilos.avisoTexto, tono === "error" && estilos.avisoTextoError]}>
        {children}
      </Text>
    </Vidrio>
  );
}

export default function PantallaMapa() {
  const { api, usuario } = useSesion();
  const router = useRouter();
  const navegacion = useNavigation();
  const { posicion, permitido, buscando, centro, pedirUbicacion } = useUbicacion();
  // Los botones flotantes son `position: absolute` sobre la pantalla, o sea que
  // quedan fuera de cualquier <SafeAreaView>: en un iPhone con barra de inicio
  // el de ubicación caía justo abajo, encima de ella. Se corrigen a mano.
  const margenes = useSafeAreaInsets();
  const mapaRef = useRef(null);

  const [lugares, setLugares] = useState([]);
  const [clima, setClima] = useState(null);
  const [cargandoClima, setCargandoClima] = useState(true);
  const [error, setError] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [tiposActivos, setTiposActivos] = useState(Object.keys(TIPOS_POI));
  // Los pines con vista propia —el cartel de terminal de las lanchas-taxi—
  // necesitan dibujarse al menos una vez antes de congelarse: con
  // `tracksViewChanges` en false desde el arranque, Android se queda con el
  // marcador en blanco. Dejandolo prendido, en cambio, cada pin se vuelve a
  // renderizar en cada frame y el mapa se arrastra al desplazarlo.
  const [pinesDibujados, setPinesDibujados] = useState(false);
  const [reportes, setReportes] = useState([]);
  const [modoReporte, setModoReporte] = useState(false);
  const [puntoReporte, setPuntoReporte] = useState(null);

  // Los lugares se piden con la ubicacion cuando la hay (asi vienen con la
  // distancia ya calculada por el backend) y sin ella si no.
  useEffect(() => {
    let cancelado = false;
    const parametros = posicion
      ? `?lat=${posicion.latitude}&lon=${posicion.longitude}`
      : "";
    api(`/api/pois${parametros}`)
      .then((d) => !cancelado && setLugares(d))
      .catch((e) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [api, posicion]);

  // El clima se pide del centro del mapa, no de la ubicacion exacta: el
  // pronostico tiene resolucion de kilometros y pedirlo de nuevo cada vez que
  // el GPS se mueve treinta metros solo gastaria bateria.
  useEffect(() => {
    let cancelado = false;
    const punto = posicion ?? CENTRO_POR_DEFECTO;
    setCargandoClima(true);
    api(`/api/clima?lat=${punto.latitude}&lon=${punto.longitude}`)
      .then((d) => !cancelado && setClima(d))
      .catch(() => !cancelado && setClima(null))
      .finally(() => !cancelado && setCargandoClima(false));
    return () => {
      cancelado = true;
    };
  }, [api, posicion]);

  const cargarReportes = useCallback(
    () =>
      api("/api/reportes")
        .then(setReportes)
        .catch(() => setReportes([])),
    [api],
  );

  useEffect(() => {
    cargarReportes();
  }, [cargarReportes]);

  const yaCentro = useRef(false);
  useEffect(() => {
    if (!posicion || yaCentro.current) return;
    yaCentro.current = true;
    mapaRef.current?.animateToRegion({ ...posicion, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 600);
  }, [posicion]);

  useEffect(() => {
    setPinesDibujados(false);
    const id = setTimeout(() => setPinesDibujados(true), 600);
    return () => clearTimeout(id);
  }, [lugares]);

  const visibles = useMemo(
    () => lugares.filter((l) => tiposActivos.includes(l.tipo)),
    [lugares, tiposActivos],
  );

  const alternarTipo = useCallback((clave) => {
    setTiposActivos((previos) =>
      previos.includes(clave) ? previos.filter((t) => t !== clave) : [...previos, clave],
    );
    setSeleccionado(null);
  }, []);

  const irAMiUbicacion = useCallback(async () => {
    const destino = posicion ?? (await pedirUbicacion());
    if (!destino) return;
    // Delta chico: centrar sirve para ver qué hay alrededor tuyo, no para
    // quedar mirando la provincia entera.
    mapaRef.current?.animateToRegion(
      { ...destino, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      500,
    );
  }, [posicion, pedirUbicacion]);

  function abrirLugar(lugar) {
    // Se cuenta la apertura de la ficha, que es la metrica base del
    // comerciante. Sin await ni catch: si el conteo falla, la ficha se abre
    // igual (ver backend/pois.registrar_visita).
    api(`/api/pois/${lugar.id}/visita`, {
      method: "POST",
      body: JSON.stringify({ tipo: "ficha" }),
    }).catch(() => {});
    router.push(`/lugar/${lugar.id}`);
  }

  return (
    <View style={estilos.pantalla}>
      <MapView
        ref={mapaRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...centro, ...DELTA_INICIAL }}
        // Híbrido y no satelital puro: se ven los bancos de arena y la costa
        // real, pero con los nombres de los pueblos encima para ubicarse.
        mapType="hybrid"
        showsUserLocation={permitido === true}
        // El botón nativo de "mi ubicación" es solo de Google Maps en Android,
        // y encima aparece únicamente con el permiso ya concedido: en iPhone no
        // existe. Por eso abajo va uno propio, que además sirve para volver a
        // pedir el permiso si la primera vez falló.
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={(e) => {
          if (modoReporte) {
            setPuntoReporte(e.nativeEvent.coordinate);
            setModoReporte(false);
          } else {
            setSeleccionado(null);
          }
        }}
      >
        {reportes.map((reporte) => {
          const def = tipoReporte(reporte.tipo);
          const sev = severidadPorClave(reporte.severidad);
          return (
            <Marker
              key={`r-${reporte.id}`}
              coordinate={{ latitude: reporte.lat, longitude: reporte.lon }}
              pinColor={sev.color}
              onPress={(e) => e.stopPropagation()}
            >
              <Callout tooltip={false}>
                <View style={estilos.callout}>
                  <Text style={[estilos.calloutSeveridad, { color: sev.color }]}>
                    {sev.etiqueta.toUpperCase()}
                  </Text>
                  <Text style={estilos.calloutTitulo}>
                    {def.emoji} {reporte.detalle || def.etiqueta}
                  </Text>
                  {reporte.comentario ? (
                    <Text style={estilos.calloutTexto}>{reporte.comentario}</Text>
                  ) : null}
                  <Text style={estilos.calloutMeta}>
                    {haceCuanto(reporte.creado_en)}
                    {reporte.autor ? ` · ${reporte.autor}` : ""}
                  </Text>
                  <Text style={estilos.calloutMeta}>{vigenciaRestante(reporte.vence_en)}</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}

        {visibles.map((lugar) => (
          <Marker
            key={lugar.id}
            coordinate={{ latitude: lugar.lat, longitude: lugar.lon }}
            // La lancha-taxi lleva cartel propio; los otros dos rubros, el pin
            // por defecto pintado del color del rubro (ver PinTerminal).
            pinColor={tipoPoi(lugar.tipo).color}
            anchor={lugar.tipo === "lancha_taxi" ? { x: 0.5, y: 1 } : undefined}
            // `tracksViewChanges` apagado despues del primer dibujo: con el
            // prendido, cada pin con vista propia se re-renderiza en cada
            // frame del mapa y en Android eso arrastra el scroll entero.
            tracksViewChanges={lugar.tipo === "lancha_taxi" && !pinesDibujados}
            onPress={(e) => {
              // Sin esto, en Android el toque tambien llega al mapa y el
              // onPress de arriba cierra la tarjeta apenas se abre.
              e.stopPropagation();
              setSeleccionado(lugar);
            }}
          >
            {lugar.tipo === "lancha_taxi" ? <PinTerminal lugar={lugar} /> : null}
          </Marker>
        ))}
      </MapView>

      {/* Siempre visible, tenga o no ubicación: escondiéndolo cuando falta
          desaparecía justo para quien más lo necesita — el que todavía no dio
          permiso o a quien le falló el primer intento. */}
      {/* Reportar va arriba del boton de ubicacion, en la misma columna: son
          las dos acciones directas sobre el mapa.

          Los dos son de vidrio y no de color lleno. El acento se reserva para
          el modo activo: cuando el botón se pone azul, el próximo toque en el
          mapa deja un aviso, y eso sí hay que verlo sin dudar. */}
      <VidrioTocable
        radio={24}
        estilo={[estilos.botonFlotante, { bottom: 80 + margenes.bottom, right: 14 + margenes.right }]}
        tinte={modoReporte ? COLORES.acento : null}
        onPress={() => {
          setModoReporte((previo) => !previo);
          setSeleccionado(null);
        }}
        accessibilityLabel={modoReporte ? "Cancelar el reporte" : "Reportar algo en el río"}
      >
        <View style={estilos.botonFlotanteCuerpo}>
          <Text style={[estilos.botonReportarTexto, modoReporte && estilos.botonReportarTextoActivo]}>
            {modoReporte ? "✕" : "+"}
          </Text>
        </View>
      </VidrioTocable>

      <VidrioTocable
        radio={24}
        estilo={[
          estilos.botonFlotante,
          { bottom: 24 + margenes.bottom, right: 14 + margenes.right },
          buscando && estilos.botonApagado,
        ]}
        disabled={buscando}
        accessibilityLabel={posicion ? "Centrar el mapa en mi ubicación" : "Usar mi ubicación"}
        onPress={irAMiUbicacion}
      >
        <View style={estilos.botonFlotanteCuerpo}>
          {buscando ? (
            <ActivityIndicator color={VIDRIO.texto} size="small" />
          ) : (
            <Text style={estilos.botonUbicacionIcono}>◎</Text>
          )}
        </View>
      </VidrioTocable>

      <SafeAreaView style={estilos.capaSuperior} edges={["top"]} pointerEvents="box-none">
        <View style={estilos.filaSuperior}>
          {/* El mapa es la unica pantalla sin header, asi que el acceso al menu
              va flotando acá, en la misma fila que el cartel del río: suelto
              arriba se comeria una franja de alto al mapa. */}
          <VidrioTocable
            radio={999}
            estilo={estilos.botonMenu}
            onPress={() => navegacion.openDrawer()}
            hitSlop={8}
            accessibilityLabel="Abrir menú"
          >
            <View style={estilos.botonMenuCuerpo}>
              <View style={estilos.barraMenu} />
              <View style={estilos.barraMenu} />
              <View style={estilos.barraMenu} />
            </View>
          </VidrioTocable>

          <PanelRio
            clima={clima}
            cargando={cargandoClima}
            embarcacion={embarcacionPorClave(usuario?.tipo_embarcacion)}
            onPress={() => router.push("/(tabs)/clima")}
          />
        </View>
        <ChipsTipo activos={tiposActivos} onAlternar={alternarTipo} />
        {error !== "" && <Aviso tono="error">{error}</Aviso>}
        {permitido === false && (
          <Aviso>
            Sin permiso de ubicación no podemos mostrarte dónde estás ni a qué
            distancia queda cada lugar.
          </Aviso>
        )}
        {modoReporte && <Aviso tono="destacado">Tocá el punto del río donde lo viste.</Aviso>}
        {visibles.length === 0 && !error && (
          <Aviso>Todavía no hay lugares publicados por acá. Van a ir apareciendo.</Aviso>
        )}
      </SafeAreaView>

      <ModalReporte
        punto={puntoReporte}
        visible={Boolean(puntoReporte)}
        onCerrar={() => setPuntoReporte(null)}
        onCreado={cargarReportes}
      />

      {seleccionado && (
        <SafeAreaView style={estilos.capaInferior} edges={["bottom"]} pointerEvents="box-none">
          <TarjetaLugar
            lugar={seleccionado}
            posicion={posicion}
            onAbrir={() => abrirLugar(seleccionado)}
            onCerrar={() => setSeleccionado(null)}
          />
        </SafeAreaView>
      )}
    </View>
  );
}

// Las capas de vidrio no llevan borde ni fondo propio: eso lo pone <Vidrio>.
// Acá va solo la geometría (tamaño, posición, separaciones) y el texto.
const sombraFlotante = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { height: 4, width: 0 } },
  android: { elevation: 6 },
});

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORES.fondo },
  flex: { flex: 1 },
  fila: { flexDirection: "row", alignItems: "center", gap: 5 },

  capaSuperior: { position: "absolute", top: 0, left: 0, right: 0, gap: 8 },
  capaInferior: { position: "absolute", bottom: 0, left: 0, right: 0 },

  filaSuperior: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
  },

  botonMenu: { width: 48, ...sombraFlotante },
  botonMenuCuerpo: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4.5 },
  barraMenu: { width: 17, height: 1.5, borderRadius: 1, backgroundColor: VIDRIO.texto },

  // --- El cartel del río ---------------------------------------------------
  panel: { flex: 1, ...sombraFlotante },
  panelCuerpo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 13,
    paddingRight: 8,
  },
  panelEmbarcacion: { fontSize: 21 },
  panelLecturas: { flex: 1, gap: 1 },
  panelFila: { flexDirection: "row", alignItems: "center", gap: 7 },
  panelPunto: { width: 9, height: 9, borderRadius: 999 },
  panelVeredicto: { color: VIDRIO.texto, fontSize: 15.5, fontWeight: "700", letterSpacing: -0.2 },
  panelViento: { color: VIDRIO.textoSuave, fontSize: 12.5, fontWeight: "500" },

  panelSeparador: { width: StyleSheet.hairlineWidth * 2, alignSelf: "stretch", marginVertical: 2, backgroundColor: VIDRIO.separador },
  panelRumbo: { alignItems: "center", gap: 0, minWidth: 30 },
  panelFlecha: { color: VIDRIO.texto, fontSize: 15, lineHeight: 18, fontWeight: "700" },
  panelRumboLetras: { color: VIDRIO.textoSuave, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3 },
  panelChevron: { color: VIDRIO.textoSuave, fontSize: 22, fontWeight: "300", marginLeft: -2 },

  // --- Filtros de rubro ----------------------------------------------------
  chips: { paddingHorizontal: 12, gap: 8 },
  chip: sombraFlotante,
  chipCuerpo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  // Lleno cuando el rubro está prendido, hueco cuando no: el mismo punto que
  // identifica al rubro sirve de casilla de verificación.
  chipPunto: { width: 9, height: 9, borderRadius: 999 },
  chipTexto: { fontSize: 13, fontWeight: "500", color: VIDRIO.textoSuave },
  chipTextoActivo: { color: VIDRIO.texto, fontWeight: "700" },

  // --- Botones flotantes ---------------------------------------------------
  // `bottom` y `right` los pone el componente sumando los márgenes seguros.
  botonFlotante: { position: "absolute", width: 48, height: 48, ...sombraFlotante },
  botonFlotanteCuerpo: { flex: 1, alignItems: "center", justifyContent: "center" },
  botonApagado: { opacity: 0.6 },
  botonReportarTexto: { fontSize: 26, lineHeight: 30, color: VIDRIO.texto, fontWeight: "500" },
  botonReportarTextoActivo: { fontSize: 20, lineHeight: 24 },
  botonUbicacionIcono: { fontSize: 23, lineHeight: 27, color: VIDRIO.texto },

  // --- Avisos --------------------------------------------------------------
  aviso: { marginHorizontal: 12, ...sombraFlotante },
  avisoTexto: { fontSize: 13, lineHeight: 19, color: VIDRIO.texto, padding: 12 },
  avisoTextoError: { color: COLOR_ESTADO_SOBRE_VIDRIO.muy_picado, fontWeight: "600" },

  // --- Globo del reporte al tocar un pin -----------------------------------
  // Va en superficie clara y no en vidrio: lo dibuja el mapa nativo dentro de
  // su propio globo, no la capa de arriba.
  callout: { width: 210, gap: 3, padding: 2 },
  calloutSeveridad: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  calloutTitulo: { fontSize: 14, fontWeight: "700", color: COLORES.texto },
  calloutTexto: { fontSize: 13, lineHeight: 18, color: COLORES.texto },
  calloutMeta: { fontSize: 11, color: COLORES.textoSuave },

  // --- Ficha de abajo ------------------------------------------------------
  // Blanca y no de vidrio: es contenido para leer, no un control sobre el
  // mapa, y ahí el fondo tiene que dejar de competir del todo.
  tarjeta: {
    margin: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: COLORES.superficie,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { height: 4, width: 0 } },
      android: { elevation: 8 },
    }),
  },
  tarjetaCerrar: { position: "absolute", top: 10, right: 12, zIndex: 1, padding: 4 },
  tarjetaCerrarTexto: { fontSize: 16, color: COLORES.textoSuave },
  tarjetaEncabezado: { flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 24 },
  tarjetaEmoji: { fontSize: 24 },
  tarjetaNombre: { fontSize: 16.5, fontWeight: "800", color: COLORES.texto },
  tarjetaTipo: { fontSize: 13, color: COLORES.textoSuave, marginTop: 1 },
  tarjetaMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tarjetaMetaTexto: { fontSize: 13, color: COLORES.textoSuave },
  tarjetaRumbo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORES.bordeSuave,
  },
  tarjetaRumboDistancia: { fontSize: 19, fontWeight: "800", color: COLORES.texto },
  tarjetaRumboTexto: { fontSize: 12.5, color: COLORES.textoSuave, marginTop: 1 },
  tarjetaVerMas: { marginTop: 10, fontSize: 14, fontWeight: "700", color: COLORES.acento },

  // --- El renglon del proximo cruce, en la tarjeta -------------------------
  tarjetaCruce: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: COLORES.marca,
  },
  tarjetaCruceHora: { fontSize: 19, fontWeight: "800", color: "#fff" },
  tarjetaCruceDestino: { fontSize: 14, fontWeight: "700", color: "#fff" },
  tarjetaCruceFalta: { fontSize: 12, fontWeight: "600", color: COLORES.acentoClaro, marginTop: 1 },
  tarjetaCruceEstado: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  tarjetaCruceEstadoTexto: { fontSize: 9.5, fontWeight: "800", color: "#fff", letterSpacing: 0.6 },

  // --- El pin de terminal --------------------------------------------------
  pinTerminal: { alignItems: "center" },
  pinTerminalCuerpo: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORES.marca,
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinTerminalGlifo: { fontSize: 15, lineHeight: 19, color: "#fff" },
  pinTerminalPunto: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  pinTerminalPie: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#fff",
  },
});
