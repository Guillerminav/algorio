import React, { useEffect, useState } from "react";

import { formatearNivel, pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { CATEGORIAS_EMBARCACION } from "../embarcaciones.js";
import AvisoCupo from "./AvisoCupo.jsx";
import FilaTablaVacia from "./FilaTablaVacia.jsx";
import FormActivo from "./FormActivo.jsx";
import OverlayCargando from "./OverlayCargando.jsx";

const ETIQUETAS_TIPO_ACTIVO = { embarcacion: "Embarcación", draga: "Draga", muelle: "Muelle", tramo: "Tramo" };
// Dos alertas distintas (no dos niveles de la misma): el nivel toco el
// minimo (bajante) o el maximo (crecida). Ver backend/datos.py: estado_de_activo.
const ETIQUETAS_SEVERIDAD = { minimo: "▼ Bajo mínimo", maximo: "▲ Sobre máximo" };

export default function MiFlota() {
  const { usuario } = useAuth();
  const [estacionesDisponibles, setEstacionesDisponibles] = useState([]);
  const [activos, setActivos] = useState([]);
  const [activoEnEdicion, setActivoEnEdicion] = useState(null);
  const [estado, setEstado] = useState("");
  // Arranca en true: la primera pintura ocurre antes de que llegue la
  // respuesta, y ahi la tabla no puede afirmar todavia que no hay activos.
  const [cargando, setCargando] = useState(true);
  // Mensaje del overlay mientras se guarda/elimina, o null si no hay nada en
  // curso (asi el mismo estado dice "si esta ocupado" y "que esta haciendo").
  const [guardando, setGuardando] = useState(null);
  const [errorFormulario, setErrorFormulario] = useState("");

  async function cargarEstaciones() {
    setEstacionesDisponibles(await pedirJSON("/api/estaciones-disponibles"));
  }

  async function cargarActivos() {
    try {
      const filas = await pedirJSON("/api/activos");
      setActivos(filas);
      setEstado(`${filas.length} activos guardados`);
    } catch (e) {
      setEstado(`Error cargando tu flota: ${e.message}`);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarEstaciones();
    cargarActivos();
  }, []);

  async function guardarActivo(cuerpo) {
    setErrorFormulario("");
    // El overlay cubre el guardado Y la recarga posterior: el backend
    // recalcula el estado de cada activo contra todo el dataset, asi que la
    // tabla tarda varios segundos en reflejar el alta. Sin esto parecia que
    // el boton no habia hecho nada.
    setGuardando(activoEnEdicion ? "Guardando cambios…" : "Agregando a tu flota…");
    try {
      if (activoEnEdicion) {
        await pedirJSON(`/api/activos/${activoEnEdicion.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
      } else {
        await pedirJSON("/api/activos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
      }
      setActivoEnEdicion(null);
      await cargarActivos();
    } catch (e) {
      setErrorFormulario(e.message);
    } finally {
      setGuardando(null);
    }
  }

  async function eliminarActivo(id) {
    setGuardando("Eliminando…");
    try {
      await pedirJSON(`/api/activos/${id}`, { method: "DELETE" });
      await cargarActivos();
    } catch (e) {
      setEstado(`Error eliminando: ${e.message}`);
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div>
      {guardando && <OverlayCargando mensaje={guardando} />}
      <p className="descripcion">
        Guardá una vez tus embarcaciones, dragas, muelles o tramos de interés,
        con la estación que querés monitorear y tus umbrales de alerta: se
        avisa cuando el nivel baja hasta el mínimo (no se puede operar) o
        cuando llega al máximo (crecida). Si no cargás un máximo propio, se
        usa el umbral de alerta oficial de esa estación.
      </p>

      <AvisoCupo recurso="activos" usados={activos.length} singular="activo" plural="activos" />

      <FormActivo
        activoEnEdicion={activoEnEdicion}
        estacionesDisponibles={estacionesDisponibles}
        onGuardar={guardarActivo}
        onCancelar={() => setActivoEnEdicion(null)}
        error={errorFormulario}
      />

      <div className="estado">{cargando ? "Cargando…" : estado}</div>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Estación</th>
              <th>Río</th>
              <th className="num">Nivel actual</th>
              <th className="num">Umbral mínimo</th>
              <th className="num">Umbral máximo</th>
              <th>Estado</th>
              <th>Alertas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activos.length === 0 ? (
              <FilaTablaVacia
                colSpan={11}
                cargando={cargando}
                mensaje="Todavía no guardaste ningún activo."
              />
            ) : (
              activos.map((f) => {
                const umbralMinimo = f.umbral_minimo_efectivo_m != null
                  ? formatearNivel(f.umbral_minimo_efectivo_m, usuario?.unidad_nivel)
                  : "—";
                // El maximo puede venir del umbral oficial de la estacion si
                // el usuario no cargo uno propio; el minimo siempre es propio
                // (ninguna fuente publica umbrales de bajante).
                let umbralMaximo = "—";
                if (f.umbral_maximo_efectivo_m != null) {
                  const origen = f.umbral_maximo_m != null ? "propio" : "oficial";
                  umbralMaximo = `${formatearNivel(f.umbral_maximo_efectivo_m, usuario?.unidad_nivel)} (${origen})`;
                }
                const estadoTexto = f.severidad
                  ? ETIQUETAS_SEVERIDAD[f.severidad]
                  : f.tiene_datos ? "Normal" : "Sin datos";
                const categoria = CATEGORIAS_EMBARCACION[f.categoria_embarcacion]?.etiqueta ?? "—";

                return (
                  <tr key={f.id}>
                    <td>{f.nombre}</td>
                    <td>{ETIQUETAS_TIPO_ACTIVO[f.tipo] ?? f.tipo}</td>
                    <td>{f.tipo === "embarcacion" ? categoria : "—"}</td>
                    <td>{f.estacion_referencia}</td>
                    <td>{f.rio ?? "—"}</td>
                    <td className="num">{formatearNivel(f.nivel_actual_m, usuario?.unidad_nivel)}</td>
                    <td className="num">{umbralMinimo}</td>
                    <td className="num">{umbralMaximo}</td>
                    <td className={f.severidad ? `severidad ${f.severidad}` : ""}>{estadoTexto}</td>
                    <td>
                      <span className={`chip-alertas${f.alertas_email ? " activas" : ""}`}>
                        {f.alertas_email ? "✉ Por mail" : "Sin aviso"}
                      </span>
                    </td>
                    <td className="celda-acciones">
                      <button type="button" className="boton-fila" onClick={() => setActivoEnEdicion(f)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="boton-fila boton-fila-peligro"
                        onClick={() => eliminarActivo(f.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
