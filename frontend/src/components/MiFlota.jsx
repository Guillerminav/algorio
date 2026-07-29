import React, { useEffect, useState } from "react";

import { formatearNivel, pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { CATEGORIAS_EMBARCACION } from "../embarcaciones.js";
import FormActivo from "./FormActivo.jsx";

const ETIQUETAS_TIPO_ACTIVO = { embarcacion: "Embarcación", draga: "Draga", muelle: "Muelle", tramo: "Tramo" };
const ETIQUETAS_SEVERIDAD = { alerta: "▲ Alerta", evacuacion: "▲ Evacuación" };

export default function MiFlota() {
  const { usuario } = useAuth();
  const [estacionesDisponibles, setEstacionesDisponibles] = useState([]);
  const [activos, setActivos] = useState([]);
  const [activoEnEdicion, setActivoEnEdicion] = useState(null);
  const [estado, setEstado] = useState("");
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
    }
  }

  useEffect(() => {
    cargarEstaciones();
    cargarActivos();
  }, []);

  async function guardarActivo(cuerpo) {
    setErrorFormulario("");
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
    }
  }

  async function eliminarActivo(id) {
    try {
      await pedirJSON(`/api/activos/${id}`, { method: "DELETE" });
      await cargarActivos();
    } catch (e) {
      setEstado(`Error eliminando: ${e.message}`);
    }
  }

  return (
    <div>
      <p className="descripcion">
        Guardá una vez tus embarcaciones, dragas, muelles o tramos de interés,
        con la estación que querés monitorear y, si tu equipo lo requiere, un
        umbral de alerta propio distinto al oficial.
      </p>

      <FormActivo
        activoEnEdicion={activoEnEdicion}
        estacionesDisponibles={estacionesDisponibles}
        onGuardar={guardarActivo}
        onCancelar={() => setActivoEnEdicion(null)}
        error={errorFormulario}
      />

      <div className="estado">{estado}</div>
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
              <th>Umbral aplicado</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activos.length === 0 ? (
              <tr>
                <td className="vacio" colSpan={9}>Todavía no guardaste ningún activo.</td>
              </tr>
            ) : (
              activos.map((f) => {
                let umbralAplicado = "—";
                if (f.umbral_alerta_efectivo_m != null) {
                  umbralAplicado = `${formatearNivel(f.umbral_alerta_efectivo_m, usuario?.unidad_nivel)} (${f.usa_umbral_propio ? "propio" : "oficial"})`;
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
                    <td>{umbralAplicado}</td>
                    <td className={f.severidad ? `severidad ${f.severidad}` : ""}>{estadoTexto}</td>
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
