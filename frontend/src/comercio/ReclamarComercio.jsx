import L from "leaflet";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import { pedirJSON } from "../api.js";
import CapasMapa from "../components/CapasMapa.jsx";
import {
  ATRIBUCION_SATELITAL,
  CENTRO_POR_DEFECTO,
  TILES_ETIQUETAS,
  TILES_SATELITAL,
  iconoCircular,
} from "../mapaSatelital.js";
import { tipoPoi } from "../nauta/constantes.js";
import { tipoDe } from "./tiposComercio.js";

const ZOOM_INICIAL = 11;

const VISTAS = [
  { clave: "mapa", etiqueta: "En el mapa" },
  { clave: "lista", etiqueta: "En la lista" },
];

// Aire alrededor de los pines al encuadrar, para que el de más al norte no
// quede pisando el borde de arriba (donde además flotan los controles).
const MARGEN_ENCUADRE = [56, 56];

// El mismo marcador de "acá estás" que el mapa del nauta: azul, chico y con
// halo, para que no se confunda con el pin de un parador.
const ICONO_YO = L.divIcon({
  className: "marcador-yo",
  html: "<span></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/**
 * Los controles que flotan sobre el mapa: encuadrar y mi ubicación.
 *
 * Van adentro del <MapContainer> porque necesitan `useMap()` — react-leaflet
 * dibuja a sus hijos dentro del div del mapa, que es justo donde tienen que
 * estar.
 *
 * Son dos y no uno porque contestan dos preguntas distintas, y las dos se
 * hacen buscando el lugar propio: «¿dónde estoy yo?», que es lo que sirve al
 * que carga esto parado en su muelle, y «volveme a mostrar todo», que es lo
 * que hace falta después de arrastrar el mapa y perder de vista los pines.
 */
function ControlesMapa({ lugares, posicion, buscando, onPedirUbicacion }) {
  const mapa = useMap();

  const encuadrar = useCallback(() => {
    if (lugares.length === 0) return;
    mapa.fitBounds(
      lugares.map((l) => [l.lat, l.lon]),
      { padding: MARGEN_ENCUADRE, maxZoom: 14 },
    );
  }, [mapa, lugares]);

  // Al abrir, y cada vez que cambia lo que se está mostrando (una búsqueda
  // filtra los pines), el mapa se acomoda solo sobre lo que hay. Sin esto abre
  // en el centro del río y hay que buscar la zona propia a mano.
  useEffect(() => {
    const id = setTimeout(() => {
      mapa.invalidateSize();
      encuadrar();
    }, 200);
    return () => clearTimeout(id);
  }, [mapa, encuadrar]);

  return (
    <div className="mapa-controles">
      <button
        type="button"
        className="mapa-control"
        title="Ver todos los lugares"
        aria-label="Encuadrar el mapa sobre todos los lugares"
        disabled={lugares.length === 0}
        onClick={encuadrar}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 9V4.5A1.5 1.5 0 0 1 4.5 3H9M15 3h4.5A1.5 1.5 0 0 1 21 4.5V9M21 15v4.5a1.5 1.5 0 0 1-1.5 1.5H15M9 21H4.5A1.5 1.5 0 0 1 3 19.5V15" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        className={`mapa-control${buscando ? " buscando" : ""}`}
        title={buscando ? "Buscando tu ubicación…" : "Centrar en mi ubicación"}
        aria-label="Centrar el mapa en mi ubicación"
        disabled={buscando}
        onClick={() => {
          if (posicion) mapa.setView([posicion.lat, posicion.lon], Math.max(mapa.getZoom(), 14));
          else onPedirUbicacion();
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/** El rubro con su color, que es el mismo del pin en el mapa. */
function ChipRubro({ tipo }) {
  return (
    <span className="reclamable-rubro" style={{ "--tono-rubro": tipoPoi(tipo).color }}>
      <span className="reclamable-rubro-punto" aria-hidden="true" />
      {tipoDe(tipo).etiqueta}
    </span>
  );
}

/** Los datos de un lugar: los mismos en el mapa, en la lista y al confirmar. */
function DatosLugar({ lugar }) {
  return (
    <>
      <strong className="reclamable-nombre">{lugar.nombre}</strong>
      <ChipRubro tipo={lugar.tipo} />
      {lugar.descripcion && <span className="reclamable-descripcion">{lugar.descripcion}</span>}
      {/* Las coordenadas y el teléfono a la vista: es como alguien reconoce
          que ese pin es el suyo y no el del vecino que se llama parecido. */}
      <span className="reclamable-meta">
        {lugar.lat.toFixed(4)}, {lugar.lon.toFixed(4)}
        {lugar.whatsapp || lugar.telefono ? ` · tel. ${lugar.whatsapp || lugar.telefono}` : ""}
      </span>
    </>
  );
}

/**
 * "Ese lugar del mapa es mío": encontrar un comercio sin dueño y pedirlo.
 *
 * Existe porque muchos pines del mapa no los cargó su dueño —sembrados,
 * importados, o de una cuenta que se dio de baja— y obligarlo a cargar todo de
 * cero deja al nauta con dos pines del mismo parador y al comerciante sin las
 * reseñas que su lugar ya tenía.
 *
 * Se busca de dos maneras porque son dos formas de reconocer un lugar y no la
 * misma dos veces: en el MAPA, que es como alguien encuentra su propio muelle
 * —«el mío es el que está pasando la curva»—, y en la LISTA, que es como se
 * encuentra por nombre cuando el pin está a cien metros de donde debería. El
 * que carga esto desde el celular en su parador quiere el mapa; el que lo
 * carga desde una compu en la ciudad quiere la lista.
 *
 * Tocar un pin no salta directo a confirmar: abre una tarjeta sobre el mapa
 * con el lugar tocado. Saltar de pantalla ante cada toque castiga justo lo que
 * hay que hacer acá, que es mirar tres pines parecidos hasta reconocer el
 * propio.
 *
 * Lo aprueba un admin (ver backend/reclamos.py). Eso se dice arriba y no en un
 * cartel al final: quien entra por este camino tiene que saber, antes de
 * escribir nada, que no va a poder editar hoy.
 */
export default function ReclamarComercio({ onReclamado, onVolver }) {
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState("mapa");
  const [lugares, setLugares] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tocado, setTocado] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);

  // Se pide una vez y se filtra en memoria: son los comercios sin dueño de un
  // tramo de río, no un catálogo. Pedir al servidor en cada tecla sería un
  // request por letra para filtrar treinta filas.
  useEffect(() => {
    let cancelado = false;
    pedirJSON("/api/comercios-sin-dueno")
      .then((d) => !cancelado && setLugares(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return lugares;
    return lugares.filter(
      (l) =>
        l.nombre.toLowerCase().includes(texto) ||
        (l.descripcion ?? "").toLowerCase().includes(texto),
    );
  }, [lugares, busqueda]);

  // El pin tocado deja de existir si una búsqueda lo saca de pantalla: la
  // tarjeta de abajo no puede seguir mostrando algo que ya no está en el mapa.
  useEffect(() => {
    setTocado((previo) => (previo && visibles.some((l) => l.id === previo.id) ? previo : null));
  }, [visibles]);

  function pedirUbicacion() {
    if (!navigator.geolocation) return;
    setBuscandoUbicacion(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosicion({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setBuscandoUbicacion(false);
      },
      // Sin cartel de error: el botón queda disponible para reintentar, y un
      // permiso denegado no es algo que se arregle leyendo un mensaje acá.
      () => setBuscandoUbicacion(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await pedirJSON("/api/mi-comercio/reclamo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poi_id: elegido.id, mensaje: mensaje.trim() || null }),
      });
      onReclamado();
    } catch (e) {
      setError(e.message || "No pudimos enviar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  // --- Confirmar el que se eligió -------------------------------------------
  // Ocupa la tarjeta entera en vez de abrirse debajo de la lista: lo que sigue
  // es escribir por qué ese lugar es suyo, y tener treinta pines al lado
  // invita a seguir mirando en vez de contestar.
  if (elegido) {
    return (
      <div className="alta-comercio">
        <div className="alta-comercio-tarjeta a-pantalla">
          <h1>¿Es este tu comercio?</h1>
          <p className="descripcion">
            Si es el tuyo, contanos cómo lo sabemos y lo revisa alguien del equipo.
          </p>

          <div className="reclamable elegido">
            <span className="reclamable-cuerpo">
              <DatosLugar lugar={elegido} />
            </span>
          </div>

          <form onSubmit={enviar}>
            <label>
              ¿Cómo sabemos que es tuyo?
              <textarea
                rows={3}
                maxLength={600}
                placeholder="El teléfono que figura es el mío, o contanos algo que solo el dueño sepa. Nos ayuda a aprobarlo más rápido."
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
              />
            </label>

            <p className="descripcion">
              Cuando lo confirmemos vas a poder editar la ficha, y te quedan las reseñas y
              las métricas que el lugar ya tenía.
            </p>

            {error && <div className="mensaje-error">{error}</div>}

            <div className="fila-acciones">
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setElegido(null)}
                disabled={enviando}
              >
                No, buscar otro
              </button>
              <button type="submit" disabled={enviando}>
                {enviando ? "Enviando…" : "Sí, pedir este comercio"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- Buscar ---------------------------------------------------------------
  return (
    <div className="alta-comercio">
      <div className="alta-comercio-tarjeta ancha a-pantalla">
        <h1>Reclamar un comercio del mapa</h1>
        <p className="descripcion">
          Estos son los lugares ya publicados que todavía no tienen dueño. Encontrá el
          tuyo y tocá «Este es mi comercio».
        </p>

        {cargando ? (
          <p className="estado">Buscando comercios sin dueño…</p>
        ) : lugares.length === 0 ? (
          <>
            <p className="estado">
              Ahora mismo no hay comercios sin dueño en el mapa. Si el tuyo ya está
              publicado y no aparece acá, es porque otra cuenta lo tiene asignado —
              escribinos por Ayuda.
            </p>
            <div className="fila-acciones">
              <button type="button" onClick={onVolver}>Cargar mi comercio de cero</button>
            </div>
          </>
        ) : (
          <>
            <div className="reclamar-barra">
              <div className="selector-rango">
                {VISTAS.map((v) => (
                  <button
                    key={v.clave}
                    type="button"
                    className={`chip-rango${v.clave === vista ? " activo" : ""}`}
                    aria-pressed={v.clave === vista}
                    onClick={() => setVista(v.clave)}
                  >
                    {v.etiqueta}
                  </button>
                ))}
              </div>

              {/* El buscador no es un campo de formulario: no se manda ni se
                  guarda, filtra mientras se escribe. Por eso la lupa adentro y
                  no una etiqueta arriba — con la etiqueta ocupa dos renglones
                  al lado de las pestañas y se lee como un dato a completar. */}
              <div className="reclamar-buscador">
                <svg
                  className="reclamar-buscador-lupa"
                  viewBox="0 0 24 24"
                  width="17"
                  height="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="M15.5 15.5 21 21" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  aria-label="Buscar un comercio por nombre"
                  placeholder="Buscar por nombre…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  // Escape borra, como en cualquier buscador. El navegador lo
                  // hace solo en los `type="search"` con su ✕ nativo, que acá
                  // está apagado porque el nuestro se ve igual en todos lados.
                  onKeyDown={(e) => e.key === "Escape" && setBusqueda("")}
                />
                {busqueda && (
                  <button
                    type="button"
                    className="reclamar-buscador-limpiar"
                    aria-label="Borrar la búsqueda"
                    title="Borrar"
                    onClick={() => setBusqueda("")}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {error && <div className="mensaje-error">{error}</div>}

            {visibles.length === 0 ? (
              <p className="estado">
                Ninguno coincide con «{busqueda.trim()}». Probá con otra parte del nombre.
              </p>
            ) : vista === "mapa" ? (
              <div className="reclamar-mapa">
                <MapContainer
                  center={CENTRO_POR_DEFECTO}
                  zoom={ZOOM_INICIAL}
                  className="mapa-contenedor mapa-contenedor-reclamar"
                  scrollWheelZoom
                >
                  {/* El mismo fondo y el mismo selector que el mapa del nauta.
                      Aca el satelital importa por otra razon: es lo que deja
                      reconocer el muelle propio entre tres parecidos. */}
                  <CapasMapa />

                  <ControlesMapa
                    lugares={visibles}
                    posicion={posicion}
                    buscando={buscandoUbicacion}
                    onPedirUbicacion={pedirUbicacion}
                  />

                  {posicion && <Marker position={[posicion.lat, posicion.lon]} icon={ICONO_YO} />}

                  {visibles.map((lugar) => (
                    <Marker
                      key={lugar.id}
                      position={[lugar.lat, lugar.lon]}
                      icon={iconoCircular(tipoPoi(lugar.tipo).color)}
                      title={lugar.nombre}
                      opacity={tocado && tocado.id !== lugar.id ? 0.55 : 1}
                      eventHandlers={{ click: () => setTocado(lugar) }}
                    />
                  ))}
                </MapContainer>

                {tocado ? (
                  <div className="reclamar-tarjeta-pin">
                    <button
                      type="button"
                      className="boton-quitar"
                      aria-label="Cerrar"
                      onClick={() => setTocado(null)}
                    >
                      ✕
                    </button>
                    <span className="reclamable-cuerpo">
                      <DatosLugar lugar={tocado} />
                    </span>
                    <button
                      type="button"
                      className="boton-es-mio"
                      onClick={() => setElegido(tocado)}
                    >
                      Este es mi comercio
                    </button>
                  </div>
                ) : (
                  <p className="reclamar-pista">Tocá el pin de tu lugar para verlo acá.</p>
                )}
              </div>
            ) : (
              <ul className="lista-reclamables">
                {visibles.map((lugar) => (
                  <li key={lugar.id}>
                    <div className="reclamable">
                      <span className="reclamable-cuerpo">
                        <DatosLugar lugar={lugar} />
                      </span>
                      {/* El aria-label nombra el lugar: leídos de corrido,
                          treinta botones que dicen todos "Este es mi comercio"
                          no distinguen cuál se está por reclamar. */}
                      <button
                        type="button"
                        className="boton-es-mio"
                        aria-label={`Este es mi comercio: ${lugar.nombre}`}
                        onClick={() => setElegido(lugar)}
                      >
                        Este es mi comercio
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="fila-acciones">
              <button type="button" className="boton-secundario" onClick={onVolver}>
                Mejor lo cargo de cero
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
