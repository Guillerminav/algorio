import React, { useEffect, useMemo, useState } from "react";

import { barcazasPorDefecto, esConvoy } from "../embarcaciones.js";

// Mismo criterio que normalizar_estacion() en normalizacion.py: sin tildes y
// en mayusculas, para poder cruzar la grafia de INA con la de Prefectura.
const normalizar = (nombre) =>
  (nombre ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().trim();

function rutaVacia() {
  return {
    nombre: "",
    activo_id: "",
    estaciones: [],
    sentido: "descendente",
    cantidad_barcazas: "",
    resguardo_quilla_pies: "",
    plantilla: null,
  };
}

// El orden de `estaciones` ES el trayecto, asi que el selector no puede ser un
// multi-select comun: hace falta agregar de a una y poder reordenar. Cuando la
// ruta sale de una plantilla ya vienen ordenadas y esto queda solo para
// retocar (sacar una escala que no interesa, agregar una intermedia).
export default function FormRuta({
  rutaEnEdicion,
  plantillaPrecargada,
  embarcaciones,
  estacionesDisponibles,
  onGuardar,
  onCancelar,
  error,
}) {
  const [form, setForm] = useState(rutaVacia());
  const [aAgregar, setAAgregar] = useState("");

  useEffect(() => {
    if (rutaEnEdicion) {
      setForm({
        nombre: rutaEnEdicion.nombre,
        activo_id: rutaEnEdicion.activo_id ?? "",
        estaciones: rutaEnEdicion.estaciones ?? [],
        sentido: rutaEnEdicion.sentido ?? "descendente",
        cantidad_barcazas: rutaEnEdicion.cantidad_barcazas ?? "",
        resguardo_quilla_pies: rutaEnEdicion.resguardo_quilla_pies ?? "",
        plantilla: rutaEnEdicion.plantilla ?? null,
      });
    } else if (plantillaPrecargada) {
      setForm({
        ...rutaVacia(),
        nombre: plantillaPrecargada.nombre,
        estaciones: [...plantillaPrecargada.estaciones],
        sentido: plantillaPrecargada.sentido,
        plantilla: plantillaPrecargada.clave,
      });
    } else {
      setForm(rutaVacia());
    }
  }, [rutaEnEdicion, plantillaPrecargada]);

  const embarcacionElegida = embarcaciones.find((e) => String(e.id) === String(form.activo_id));
  const categoria = embarcacionElegida?.categoria_embarcacion;
  const mostrarBarcazas = esConvoy(categoria);

  // Una estacion ya agregada no se vuelve a ofrecer: una ruta no pasa dos
  // veces por la misma escala. La comparacion va normalizada porque las
  // plantillas guardan la grafia de Prefectura Naval ("ROSARIO") y el selector
  // ofrece la del listado de estaciones ("Rosario"): comparando el texto crudo
  // se colaba la misma estacion dos veces.
  const disponibles = useMemo(() => {
    const yaEstan = new Set(form.estaciones.map(normalizar));
    return estacionesDisponibles.filter((e) => !yaEstan.has(normalizar(e.estacion)));
  }, [estacionesDisponibles, form.estaciones]);

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Cambiar el sentido da vuelta el trayecto: el mismo recorrido subiendo se
  // navega en el orden inverso al de bajando, y dejar las estaciones como
  // estaban implicaba que el usuario tuviera que reordenarlas de a una con
  // las flechas. Si vuelve a cambiarlo, se vuelven a invertir y queda como al
  // principio, asi que la accion se deshace sola.
  function cambiarSentido(sentido) {
    setForm((f) => (
      sentido === f.sentido ? f : { ...f, sentido, estaciones: [...f.estaciones].reverse() }
    ));
  }

  function agregarEstacion(nombre) {
    if (!nombre) return;
    setForm((f) => ({ ...f, estaciones: [...f.estaciones, nombre] }));
    setAAgregar("");
  }

  function quitarEstacion(indice) {
    setForm((f) => ({ ...f, estaciones: f.estaciones.filter((_, i) => i !== indice) }));
  }

  function moverEstacion(indice, desplazamiento) {
    setForm((f) => {
      const destino = indice + desplazamiento;
      if (destino < 0 || destino >= f.estaciones.length) return f;
      const copia = [...f.estaciones];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return { ...f, estaciones: copia };
    });
  }

  function manejarSubmit(evento) {
    evento.preventDefault();
    const aNumero = (valor) => (valor === "" || valor === null ? null : Number(valor));
    onGuardar({
      nombre: form.nombre.trim(),
      estaciones: form.estaciones,
      plantilla: form.plantilla,
      activo_id: aNumero(form.activo_id),
      sentido: form.sentido,
      cantidad_barcazas: mostrarBarcazas ? aNumero(form.cantidad_barcazas) : null,
      resguardo_quilla_pies: aNumero(form.resguardo_quilla_pies),
    });
  }

  return (
    <form className="form-activo form-ruta" onSubmit={manejarSubmit}>
      <label>
        Nombre de la ruta
        <input
          type="text"
          value={form.nombre}
          onChange={(e) => actualizarCampo("nombre", e.target.value)}
          placeholder="Ej: Bajada de agosto"
          required
        />
      </label>

      <label>
        Embarcación
        <select value={form.activo_id} onChange={(e) => actualizarCampo("activo_id", e.target.value)}>
          <option value="">Sin embarcación (solo niveles)</option>
          {embarcaciones.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      </label>

      <label>
        Sentido
        <select value={form.sentido} onChange={(e) => cambiarSentido(e.target.value)}>
          <option value="descendente">Descendente (bajando)</option>
          <option value="ascendente">Ascendente (subiendo)</option>
        </select>
      </label>

      {mostrarBarcazas && (
        <label>
          Barcazas del convoy
          <input
            type="number"
            min="1"
            max="60"
            value={form.cantidad_barcazas}
            onChange={(e) => actualizarCampo("cantidad_barcazas", e.target.value)}
            placeholder={String(barcazasPorDefecto(categoria))}
          />
        </label>
      )}

      <label>
        Resguardo bajo quilla (pies)
        <input
          type="number"
          step="0.5"
          min="0"
          value={form.resguardo_quilla_pies}
          onChange={(e) => actualizarCampo("resguardo_quilla_pies", e.target.value)}
          placeholder={embarcacionElegida ? "Según tipo (2 oceánico / 1 fluvial)" : "1"}
        />
      </label>

      <div className="ruta-estaciones">
        <span className="ruta-estaciones-titulo">
          Trayecto ({form.estaciones.length} estaciones) — el orden es la ruta
        </span>

        {form.estaciones.length === 0 ? (
          <p className="ruta-estaciones-vacio">
            Todavía no agregaste estaciones. Usá un botón de ruta rápida o agregalas de a una.
          </p>
        ) : (
          <ol className="ruta-estaciones-lista">
            {form.estaciones.map((estacion, indice) => (
              <li key={estacion} className="ruta-estacion-item">
                <span className="ruta-estacion-orden">{indice + 1}</span>
                <span className="ruta-estacion-nombre">{estacion}</span>
                <button
                  type="button"
                  className="boton-fila"
                  onClick={() => moverEstacion(indice, -1)}
                  disabled={indice === 0}
                  aria-label={`Subir ${estacion}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="boton-fila"
                  onClick={() => moverEstacion(indice, 1)}
                  disabled={indice === form.estaciones.length - 1}
                  aria-label={`Bajar ${estacion}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="boton-fila boton-fila-peligro"
                  onClick={() => quitarEstacion(indice)}
                  aria-label={`Quitar ${estacion}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}

        <select
          className="ruta-estaciones-agregar"
          value={aAgregar}
          onChange={(e) => agregarEstacion(e.target.value)}
        >
          <option value="">+ Agregar estación al final…</option>
          {disponibles.map((e) => (
            <option key={e.estacion} value={e.estacion}>
              {e.estacion}{e.rio ? ` — ${e.rio}` : ""}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mensaje-error">{error}</p>}

      <div className="form-activo-botones">
        <button type="submit">{rutaEnEdicion ? "Guardar cambios" : "Guardar ruta"}</button>
        {(rutaEnEdicion || plantillaPrecargada || form.estaciones.length > 0) && (
          <button type="button" onClick={onCancelar}>Cancelar</button>
        )}
      </div>
    </form>
  );
}
