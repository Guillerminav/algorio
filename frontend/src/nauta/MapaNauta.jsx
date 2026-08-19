import L from "leaflet";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { pedirJSON } from "../api.js";
import {
  ATRIBUCION_SATELITAL,
  TILES_ETIQUETAS,
  TILES_SATELITAL,
  iconoCircular,
} from "../mapaSatelital.js";
import CapaReportes from "./CapaReportes.jsx";
import FichaRapida from "./FichaRapida.jsx";
import { TIPOS_POI, tipoPoi } from "./constantes.js";
import ModalReporte from "./ModalReporte.jsx";
import PanelLugar from "./PanelLugar.jsx";
import { useRio } from "./ContextoRio.jsx";
import { BarraViento } from "./piezas.jsx";

const ZOOM_INICIAL = 11;

// Marcador de "acá estás". Distinto de los pines de lugares a propósito: es
// azul, más chico y con halo, para no confundirse con un parador.
const ICONO_YO = L.divIcon({
  className: "marcador-yo",
  html: "<span></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Leaflet mide el contenedor una sola vez al montar. Si el layout todavía se
// está acomodando (pasa al abrir el panel lateral, o al rotar el celular),
// queda con el tamaño viejo y se ve cortado.
function SincronizarTamano({ dependencia }) {
  const mapa = useMap();
  useEffect(() => {
    const recalcular = () => mapa.invalidateSize();
    const id = setTimeout(recalcular, 250);
    window.addEventListener("resize", recalcular);
    window.addEventListener("orientationchange", recalcular);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", recalcular);
      window.removeEventListener("orientationchange", recalcular);
    };
  }, [mapa, dependencia]);
  return null;
}

/**
 * Centra el mapa en la posición del navegador.
 *
 * Automáticamente la primera vez (la posición puede tardar segundos y llegar
 * después del primer pintado), y después a pedido con el botón de "Mi
 * ubicación" — que es lo que se necesita cuando uno arrastró el mapa mirando
 * otra zona y quiere volver a donde está.
 *
 * El botón vive acá adentro y no afuera porque `useMap()` solo funciona dentro
 * del <MapContainer>.
 */
function ControlUbicacion({ posicion, permitido, buscando, onPedirUbicacion }) {
  const mapa = useMap();
  const yaCentro = useRef(false);

  useEffect(() => {
    if (!posicion || yaCentro.current) return;
    yaCentro.current = true;
    mapa.setView([posicion.lat, posicion.lon], 13);
  }, [mapa, posicion]);

  // El botón se dibuja siempre, tenga o no posición. Escondiéndolo cuando
  // falta —que era lo que hacía antes— desaparecía justo para quien más lo
  // necesita: el que todavía no dio permiso, o a quien le falló el primer
  // intento. Sin posición, tocarlo vuelve a pedirla.
  const hayPosicion = Boolean(posicion);

  return (
    <button
      type="button"
      className={`boton-mi-ubicacion${buscando ? " buscando" : ""}`}
      title={
        buscando
          ? "Buscando tu ubicación…"
          : hayPosicion
            ? "Centrar en mi ubicación"
            : "Usar mi ubicación"
      }
      aria-label={hayPosicion ? "Centrar el mapa en mi ubicación" : "Usar mi ubicación"}
      disabled={buscando}
      onClick={() => {
        if (hayPosicion) {
          mapa.setView([posicion.lat, posicion.lon], Math.max(mapa.getZoom(), 14));
        } else {
          onPedirUbicacion();
        }
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" />
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" strokeLinecap="round" />
      </svg>
      {permitido === false && !buscando && <span className="boton-mi-ubicacion-punto" aria-hidden="true" />}
    </button>
  );
}

// Mientras dura el modo reporte, el proximo toque en el mapa es el punto del
// aviso. Se usa el mapa de verdad y no un mini-mapa dentro del modal: el punto
// hay que elegirlo mirando la costa, con el zoom que uno ya tenia puesto.
function CapturarPuntoReporte({ activo, onElegir }) {
  useMapEvents({
    click: (evento) => {
      if (activo) onElegir({ lat: evento.latlng.lat, lon: evento.latlng.lng });
    },
  });
  return null;
}

export default function MapaNauta({ onIrAClima }) {
  // Todo sale del mismo proveedor: si el mapa y la pantalla de Clima pidieran
  // la ubicacion por su cuenta, cada una podria resolverla en un momento
  // distinto y terminar mostrando pronosticos de coordenadas diferentes.
  const {
    posicion, permitido, buscando, centro, pedirUbicacion,
    clima, cargandoClima, errorClima,
  } = useRio();

  const [lugares, setLugares] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  // La ventana de abajo se dibuja con el POI de la lista que el mapa ya
  // tiene, asi que aparece sin esperar ninguna consulta. `ampliado` es el id
  // de la ficha completa, que si se pide al backend y recien al tocar "Ver mas".
  const [seleccionado, setSeleccionado] = useState(null);
  const [ampliado, setAmpliado] = useState(null);
  const [tiposActivos, setTiposActivos] = useState(Object.keys(TIPOS_POI));
  const [reportes, setReportes] = useState([]);
  const [modoReporte, setModoReporte] = useState(false);
  const [puntoReporte, setPuntoReporte] = useState(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  // Se resuelve con una capa fija por CSS y no con la Fullscreen API del
  // navegador: esa no existe en Safari de iPhone para elementos que no sean
  // <video>, que es justo el caso de alguien mirando el mapa desde el celular.
  // Además, así la barra de viento y los filtros siguen encima del mapa.
  //
  // Con el mapa expandido el fondo no debe scrollear (mismo criterio que
  // MenuMovil): si no, el dedo mueve la página de atrás.
  useEffect(() => {
    if (!pantallaCompleta) return undefined;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const alPresionarEscape = (evento) => {
      if (evento.key === "Escape") setPantallaCompleta(false);
    };
    document.addEventListener("keydown", alPresionarEscape);

    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", alPresionarEscape);
    };
  }, [pantallaCompleta]);

  // Con ubicación, el backend devuelve cada lugar con su distancia ya
  // calculada y ordenados por cercanía; sin ella, todos.
  useEffect(() => {
    let cancelado = false;
    const parametros = posicion ? `?lat=${posicion.lat}&lon=${posicion.lon}` : "";
    pedirJSON(`/api/pois${parametros}`)
      .then((d) => !cancelado && setLugares(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [posicion]);

  const cargarReportes = useCallback(() => {
    const parametros = posicion ? `?lat=${posicion.lat}&lon=${posicion.lon}` : "";
    return pedirJSON(`/api/reportes${parametros}`)
      .then(setReportes)
      .catch(() => setReportes([]));
  }, [posicion]);

  useEffect(() => {
    cargarReportes();
  }, [cargarReportes]);

  const visibles = useMemo(
    () => lugares.filter((l) => tiposActivos.includes(l.tipo)),
    [lugares, tiposActivos],
  );

  function alternarTipo(clave) {
    setTiposActivos((previos) =>
      previos.includes(clave) ? previos.filter((t) => t !== clave) : [...previos, clave],
    );
    setSeleccionado(null);
    setAmpliado(null);
  }

  return (
    <div
      className={`mapa-nauta${modoReporte ? " eligiendo-punto" : ""}${ampliado ? " con-panel" : ""}${
        pantallaCompleta ? " pantalla-completa" : ""
      }`}
    >
      <div className="mapa-nauta-columna">
        <div className="mapa-nauta-contenedor">
          {/* Todo lo que antes vivía apilado ARRIBA del mapa ahora flota SOBRE
              él, en vidrio. El mapa es la pantalla; empujarlo hacia abajo con
              una barra, una fila de filtros y dos avisos le comía la mitad del
              alto justo en un celular, que es donde se usa.

              La capa no recibe el mouse (`pointer-events: none` en el CSS) y
              se lo devuelve a cada control: en los huecos entre controles el
              mapa se sigue arrastrando como si la capa no existiera. */}
          <div className="capa-mapa">
            <div className="capa-mapa-fila">
              <BarraViento
                clima={clima}
                cargando={cargandoClima}
                error={errorClima}
                onVerDetalle={onIrAClima}
              />

              <button
                type="button"
                className="boton-expandir-mapa"
                title={pantallaCompleta ? "Salir de pantalla completa (Esc)" : "Ver el mapa en pantalla completa"}
                onClick={() => setPantallaCompleta((previo) => !previo)}
              >
                <span aria-hidden="true">{pantallaCompleta ? "⤡" : "⤢"}</span>
                {/* La etiqueta se esconde en pantalla angosta (ver el CSS): al
                    lado del cartel del río no entra, y el ícono solo alcanza. */}
                <span className="boton-expandir-etiqueta">
                  {pantallaCompleta ? "Salir" : "Pantalla completa"}
                </span>
              </button>
            </div>

            <div className="mapa-nauta-filtros">
              {/* Prendido y apagado se distinguen por el punto —lleno o
                  hueco— y por el peso del texto, no pintando el chip entero.
                  Sobre la imagen satelital, tres chips llenos de color compiten
                  con los pines, que son lo que hay que mirar. El color del
                  rubro sigue estando donde sirve: en el punto y en el pin. */}
              {Object.entries(TIPOS_POI).map(([clave, definicion]) => {
                const activo = tiposActivos.includes(clave);
                return (
                  <button
                    key={clave}
                    type="button"
                    className={`chip-tipo${activo ? " activo" : ""}`}
                    aria-pressed={activo}
                    onClick={() => alternarTipo(clave)}
                  >
                    <span
                      className="chip-tipo-punto"
                      style={activo ? { background: definicion.color } : { borderColor: definicion.color }}
                      aria-hidden="true"
                    />
                    {definicion.etiqueta}
                  </button>
                );
              })}

              <button
                type="button"
                className={`boton-reportar${modoReporte ? " activo" : ""}`}
                onClick={() => {
                  setModoReporte((previo) => !previo);
                  setSeleccionado(null);
                  setAmpliado(null);
                }}
              >
                {modoReporte ? "Cancelar" : "+ Reportar"}
              </button>
            </div>

            {modoReporte && (
              <div className="aviso-nauta destacado">Tocá el punto del río donde lo viste.</div>
            )}
            {error && <div className="aviso-nauta error">{error}</div>}
            {permitido === false && (
              <div className="aviso-nauta">
                Sin permiso de ubicación no podemos mostrarte dónde estás ni a qué distancia
                queda cada lugar. El mapa igual funciona.
              </div>
            )}
            {!cargando && !error && visibles.length === 0 && (
              <div className="aviso-nauta">
                Todavía no hay lugares publicados por acá. Van a ir apareciendo.
              </div>
            )}
          </div>

          <MapContainer center={centro} zoom={ZOOM_INICIAL} className="mapa-contenedor" scrollWheelZoom>
            {/* Dos capas: el satelital de abajo muestra los bancos de arena,
                y la de nombres encima permite ubicarse. */}
            <TileLayer attribution={ATRIBUCION_SATELITAL} url={TILES_SATELITAL} maxZoom={19} />
            <TileLayer url={TILES_ETIQUETAS} maxZoom={19} />

            {posicion && <Marker position={[posicion.lat, posicion.lon]} icon={ICONO_YO} />}

            {visibles.map((lugar) => (
              <Marker
                key={lugar.id}
                position={[lugar.lat, lugar.lon]}
                icon={iconoCircular(tipoPoi(lugar.tipo).color)}
                eventHandlers={{ click: () => setSeleccionado(lugar) }}
              />
            ))}

            {/* Los avisos van después de los lugares para que queden encima:
                un tronco cruzado importa más que un parador cercano. */}
            <CapaReportes reportes={reportes} onCambio={cargarReportes} />

            <CapturarPuntoReporte
              activo={modoReporte}
              onElegir={(punto) => {
                setPuntoReporte(punto);
                setModoReporte(false);
              }}
            />
            <ControlUbicacion
              posicion={posicion}
              permitido={permitido}
              buscando={buscando}
              onPedirUbicacion={pedirUbicacion}
            />
            {/* Leaflet mide el contenedor una sola vez: al expandir a pantalla
                completa hay que pedirle que vuelva a medir, si no dibuja los
                tiles del tamaño anterior. */}
            <SincronizarTamano dependencia={`${ampliado}-${pantallaCompleta}`} />
          </MapContainer>
        </div>
      </div>

      {/* Primero la ventana de abajo con lo basico; la ficha completa —con
          reseñas, carta y horarios— recien detras de "Ver mas". */}
      {seleccionado && !ampliado && (
        <FichaRapida
          lugar={seleccionado}
          posicion={posicion}
          onVerMas={() => setAmpliado(seleccionado.id)}
          onCerrar={() => setSeleccionado(null)}
        />
      )}

      {ampliado && (
        <PanelLugar
          poiId={ampliado}
          onCerrar={() => {
            setAmpliado(null);
            setSeleccionado(null);
          }}
        />
      )}

      {puntoReporte && (
        <ModalReporte
          punto={puntoReporte}
          onCerrar={() => setPuntoReporte(null)}
          onCreado={cargarReportes}
        />
      )}
    </div>
  );
}
