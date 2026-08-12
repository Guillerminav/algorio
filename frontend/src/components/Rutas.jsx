import React, { useEffect, useState } from "react";

import { pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import AvisoCupo from "./AvisoCupo.jsx";
import FormRuta from "./FormRuta.jsx";
import OverlayCargando from "./OverlayCargando.jsx";
import TarjetaRuta from "./TarjetaRuta.jsx";

export default function Rutas() {
  const { usuario } = useAuth();
  const [plantillas, setPlantillas] = useState([]);
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [estacionesDisponibles, setEstacionesDisponibles] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [rutaEnEdicion, setRutaEnEdicion] = useState(null);
  const [plantillaPrecargada, setPlantillaPrecargada] = useState(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [estado, setEstado] = useState("");
  // Arranca en true: la primera pintura pasa antes de que llegue la respuesta,
  // y ahi todavia no se puede afirmar que el usuario no tenga rutas.
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [errorFormulario, setErrorFormulario] = useState("");

  async function cargarRutas() {
    try {
      const filas = await pedirJSON("/api/rutas");
      setRutas(filas);
      setEstado(`${filas.length} ruta${filas.length === 1 ? "" : "s"} guardada${filas.length === 1 ? "" : "s"}`);
    } catch (e) {
      setEstado(`Error cargando tus rutas: ${e.message}`);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [datosPlantillas, activos, estaciones] = await Promise.all([
          pedirJSON("/api/rutas/plantillas"),
          pedirJSON("/api/activos"),
          pedirJSON("/api/estaciones-disponibles"),
        ]);
        setPlantillas(datosPlantillas.plantillas);
        setEmbarcaciones(activos.filter((a) => a.tipo === "embarcacion"));
        setEstacionesDisponibles(estaciones);
      } catch (e) {
        setEstado(`Error cargando los datos de referencia: ${e.message}`);
      }
    })();
    cargarRutas();
  }, []);

  function abrirPlantilla(plantilla) {
    setRutaEnEdicion(null);
    setPlantillaPrecargada(plantilla);
    setFormAbierto(true);
    setErrorFormulario("");
  }

  function abrirVacio() {
    setRutaEnEdicion(null);
    setPlantillaPrecargada(null);
    setFormAbierto(true);
    setErrorFormulario("");
  }

  function cerrarForm() {
    setFormAbierto(false);
    setRutaEnEdicion(null);
    setPlantillaPrecargada(null);
    setErrorFormulario("");
  }

  async function guardarRuta(cuerpo) {
    setErrorFormulario("");
    // El overlay cubre el guardado Y la recarga: el backend recalcula el
    // calado de cada estacion contra el dataset completo, asi que la lista
    // tarda unos segundos en reflejar el alta.
    setGuardando(rutaEnEdicion ? "Recalculando la ruta…" : "Calculando la ruta…");
    try {
      const url = rutaEnEdicion ? `/api/rutas/${rutaEnEdicion.id}` : "/api/rutas";
      await pedirJSON(url, {
        method: rutaEnEdicion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      cerrarForm();
      await cargarRutas();
    } catch (e) {
      setErrorFormulario(e.message);
    } finally {
      setGuardando(null);
    }
  }

  async function eliminarRuta(id) {
    setGuardando("Eliminando…");
    try {
      await pedirJSON(`/api/rutas/${id}`, { method: "DELETE" });
      await cargarRutas();
    } catch (e) {
      setEstado(`Error eliminando: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  }

  // El lapiz de cada tramo guarda la profundidad propia en la ruta y recalcula:
  // se manda el diccionario entero {id_tramo: pies} porque un PUT parcial de
  // una clave sola dejaria las otras correcciones afuera.
  async function cambiarProfundidad(ruta, idTramo, pies) {
    const actuales = { ...(ruta.profundidades_pies ?? {}) };
    if (pies === null) delete actuales[idTramo];
    else actuales[idTramo] = pies;

    setGuardando("Recalculando con la profundidad nueva…");
    try {
      await pedirJSON(`/api/rutas/${ruta.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profundidades_pies: actuales }),
      });
      await cargarRutas();
    } catch (e) {
      setEstado(`Error actualizando la profundidad: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  }

  // El analisis queda congelado en el momento en que se calculo, asi que esta
  // es la unica forma de traer una ruta guardada al dia de hoy.
  async function recalcularRuta(id) {
    setGuardando("Recalculando con los niveles de hoy…");
    try {
      await pedirJSON(`/api/rutas/${id}/recalcular`, { method: "POST" });
      await cargarRutas();
    } catch (e) {
      setEstado(`Error recalculando: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  }

  function editarRuta(ruta) {
    setPlantillaPrecargada(null);
    setRutaEnEdicion(ruta);
    setFormAbierto(true);
    setErrorFormulario("");
  }

  return (
    <div>
      {guardando && <OverlayCargando mensaje={guardando} />}

      <p className="descripcion">
        Armá el trayecto que va a hacer una de tus embarcaciones y el sistema cruza
        el nivel del río en <strong>todas</strong> las estaciones que tiene que pasar:
        te dice hasta qué calado puede salir, cuál es el paso que la limita y cuántas
        toneladas puede cargar. Una ruta sin embarcación asociada se guarda igual,
        pero solo muestra los niveles del trayecto: sin las características del buque
        no hay con qué comparar el agua disponible.
      </p>

      <AvisoCupo recurso="rutas" usados={rutas.length} singular="ruta" plural="rutas" />

      <div className="rutas-plantillas">
        <span className="rutas-plantillas-titulo">Rutas principales</span>
        <div className="rutas-plantillas-botones">
          {plantillas.map((p) => (
            <button
              key={p.clave}
              type="button"
              className="boton-plantilla"
              onClick={() => abrirPlantilla(p)}
              title={p.descripcion}
            >
              <span className="boton-plantilla-titulo">{p.boton}</span>
              <span className="boton-plantilla-sub">{p.carga_tipica}</span>
            </button>
          ))}
          <button type="button" className="boton-plantilla boton-plantilla-vacia" onClick={abrirVacio}>
            <span className="boton-plantilla-titulo">Ruta propia</span>
            <span className="boton-plantilla-sub">Elegí las estaciones a mano</span>
          </button>
        </div>
      </div>

      {embarcaciones.length === 0 && (
        <p className="mensaje-aviso">
          Todavía no tenés ninguna embarcación cargada. Podés guardar rutas igual, pero
          para que se calculen el calado admisible y las toneladas hay que crear primero
          una embarcación en <strong>Mi flota</strong>.
        </p>
      )}

      {formAbierto && (
        <FormRuta
          rutaEnEdicion={rutaEnEdicion}
          plantillaPrecargada={plantillaPrecargada}
          embarcaciones={embarcaciones}
          estacionesDisponibles={estacionesDisponibles}
          onGuardar={guardarRuta}
          onCancelar={cerrarForm}
          error={errorFormulario}
        />
      )}

      <div className="estado">{cargando ? "Cargando…" : estado}</div>

      {!cargando && rutas.length === 0 ? (
        <p className="rutas-vacio">
          Todavía no guardaste ninguna ruta. Empezá por una de las rutas principales
          de arriba: vienen con las estaciones intermedias ya cargadas y en orden.
        </p>
      ) : (
        <div className="rutas-lista">
          {rutas.map((ruta) => (
            <TarjetaRuta
              key={ruta.id}
              ruta={ruta}
              unidadNivel={usuario?.unidad_nivel}
              onEditar={editarRuta}
              onEliminar={eliminarRuta}
              onCambiarProfundidad={cambiarProfundidad}
              onRecalcular={recalcularRuta}
            />
          ))}
        </div>
      )}
    </div>
  );
}
