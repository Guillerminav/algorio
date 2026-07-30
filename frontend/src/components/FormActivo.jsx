import React, { useEffect, useMemo, useState } from "react";

import { CATEGORIAS_EMBARCACION, categoriasDisponibles } from "../embarcaciones.js";

const CAMPOS_EMBARCACION_VACIOS = {
  categoria_embarcacion: "",
  eslora_m: "",
  manga_m: "",
  puntal_m: "",
  calado_max_pies: "",
  borde_libre_min_m: "",
  dwt_capacidad_t: "",
  ton_por_pie: "",
  radar_apto_rio: "",
};

function activoVacio() {
  return {
    nombre: "",
    tipo: "embarcacion",
    estacion_referencia: "",
    umbral_minimo_m: "",
    umbral_maximo_m: "",
    ...CAMPOS_EMBARCACION_VACIOS,
  };
}

export default function FormActivo({ activoEnEdicion, estacionesDisponibles, onGuardar, onCancelar, error }) {
  const [form, setForm] = useState(activoVacio());

  // Al elegir "Editar" en la tabla (o volver a "Agregar"), se resetea el formulario.
  useEffect(() => {
    if (activoEnEdicion) {
      setForm({
        nombre: activoEnEdicion.nombre,
        tipo: activoEnEdicion.tipo,
        estacion_referencia: activoEnEdicion.estacion_referencia,
        umbral_minimo_m: activoEnEdicion.umbral_minimo_m ?? "",
        umbral_maximo_m: activoEnEdicion.umbral_maximo_m ?? "",
        categoria_embarcacion: activoEnEdicion.categoria_embarcacion ?? "",
        eslora_m: activoEnEdicion.eslora_m ?? "",
        manga_m: activoEnEdicion.manga_m ?? "",
        puntal_m: activoEnEdicion.puntal_m ?? "",
        calado_max_pies: activoEnEdicion.calado_max_pies ?? "",
        borde_libre_min_m: activoEnEdicion.borde_libre_min_m ?? "",
        dwt_capacidad_t: activoEnEdicion.dwt_capacidad_t ?? "",
        ton_por_pie: activoEnEdicion.ton_por_pie ?? "",
        radar_apto_rio: activoEnEdicion.radar_apto_rio ?? "",
      });
    } else {
      setForm(activoVacio());
    }
  }, [activoEnEdicion]);

  const esEmbarcacion = form.tipo === "embarcacion";

  // Las categorias oceanicas (Panamax/Handymax/Handy) solo se ofrecen si la
  // estacion elegida esta rio abajo de Timbúes (ver embarcaciones.js).
  const opcionesCategoria = useMemo(
    () => categoriasDisponibles(form.estacion_referencia),
    [form.estacion_referencia],
  );

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function alElegirCategoria(clave) {
    const datos = CATEGORIAS_EMBARCACION[clave];
    setForm((f) => ({
      ...f,
      categoria_embarcacion: clave,
      ...(datos
        ? {
            eslora_m: datos.eslora_m,
            manga_m: datos.manga_m,
            puntal_m: datos.puntal_m,
            calado_max_pies: datos.calado_max_pies,
            borde_libre_min_m: datos.borde_libre_min_m,
            dwt_capacidad_t: datos.dwt_capacidad_t,
            ton_por_pie: datos.ton_por_pie,
            radar_apto_rio: datos.radar_apto_rio,
          }
        : {}),
    }));
  }

  function manejarSubmit(evento) {
    evento.preventDefault();
    const { categoria_embarcacion, eslora_m, manga_m, puntal_m, calado_max_pies,
      borde_libre_min_m, dwt_capacidad_t, ton_por_pie, radar_apto_rio, ...resto } = form;

    onGuardar({
      nombre: resto.nombre.trim(),
      tipo: resto.tipo,
      estacion_referencia: resto.estacion_referencia,
      umbral_minimo_m: resto.umbral_minimo_m ? parseFloat(resto.umbral_minimo_m) : null,
      umbral_maximo_m: resto.umbral_maximo_m ? parseFloat(resto.umbral_maximo_m) : null,
      caracteristicas_embarcacion: esEmbarcacion
        ? {
            categoria_embarcacion: categoria_embarcacion || null,
            eslora_m: eslora_m.trim() || null,
            manga_m: manga_m.trim() || null,
            puntal_m: puntal_m.trim() || null,
            calado_max_pies: calado_max_pies.trim() || null,
            borde_libre_min_m: borde_libre_min_m.trim() || null,
            dwt_capacidad_t: dwt_capacidad_t.trim() || null,
            ton_por_pie: ton_por_pie.trim() || null,
            radar_apto_rio: radar_apto_rio.trim() || null,
          }
        : {},
    });
  }

  return (
    <form className="form-activo" onSubmit={manejarSubmit}>
      <label>
        Nombre
        <input
          type="text"
          placeholder="Ej: Draga Norte II"
          required
          value={form.nombre}
          onChange={(e) => actualizarCampo("nombre", e.target.value)}
        />
      </label>
      <label>
        Tipo
        <select required value={form.tipo} onChange={(e) => actualizarCampo("tipo", e.target.value)}>
          <option value="embarcacion">Embarcación</option>
          <option value="draga">Draga</option>
          <option value="muelle">Muelle</option>
          <option value="tramo">Tramo</option>
        </select>
      </label>
      <label>
        Estación de referencia
        <select
          required
          value={form.estacion_referencia}
          onChange={(e) => actualizarCampo("estacion_referencia", e.target.value)}
        >
          <option value="">Elegir estación...</option>
          {estacionesDisponibles.map((est) => (
            <option key={est.estacion} value={est.estacion}>
              {est.rio ? `${est.estacion} (${est.rio})` : est.estacion}
            </option>
          ))}
        </select>
      </label>
      <label>
        Umbral de alerta mínimo (m)
        <input
          type="number"
          step="0.01"
          placeholder="Alerta por bajante"
          value={form.umbral_minimo_m}
          onChange={(e) => actualizarCampo("umbral_minimo_m", e.target.value)}
        />
      </label>
      <label>
        Umbral de alerta máximo (m)
        <input
          type="number"
          step="0.01"
          placeholder="Opcional, usa el oficial si se deja vacío"
          value={form.umbral_maximo_m}
          onChange={(e) => actualizarCampo("umbral_maximo_m", e.target.value)}
        />
      </label>

      {esEmbarcacion && (
        <div className="campos-embarcacion">
          <label>
            Categoría de embarcación
            <select value={form.categoria_embarcacion} onChange={(e) => alElegirCategoria(e.target.value)}>
              <option value="">Sin categoría (cargar a mano)</option>
              {opcionesCategoria.map(([clave, datos]) => (
                <option key={clave} value={clave}>{datos.etiqueta}</option>
              ))}
            </select>
          </label>
          <label>
            Eslora (m)
            <input type="text" value={form.eslora_m} onChange={(e) => actualizarCampo("eslora_m", e.target.value)} />
          </label>
          <label>
            Manga (m)
            <input type="text" value={form.manga_m} onChange={(e) => actualizarCampo("manga_m", e.target.value)} />
          </label>
          <label>
            Puntal (m)
            <input type="text" value={form.puntal_m} onChange={(e) => actualizarCampo("puntal_m", e.target.value)} />
          </label>
          <label>
            Calado máx. diseño (pies)
            <input
              type="text"
              value={form.calado_max_pies}
              onChange={(e) => actualizarCampo("calado_max_pies", e.target.value)}
            />
          </label>
          <label>
            Borde libre mín.
            <input
              type="text"
              value={form.borde_libre_min_m}
              onChange={(e) => actualizarCampo("borde_libre_min_m", e.target.value)}
            />
          </label>
          <label>
            DWT / Capacidad (t)
            <input
              type="text"
              value={form.dwt_capacidad_t}
              onChange={(e) => actualizarCampo("dwt_capacidad_t", e.target.value)}
            />
          </label>
          <label>
            Ton. por pie
            <input
              type="text"
              value={form.ton_por_pie}
              onChange={(e) => actualizarCampo("ton_por_pie", e.target.value)}
            />
          </label>
          <label>
            Radar apto río req.
            <input
              type="text"
              value={form.radar_apto_rio}
              onChange={(e) => actualizarCampo("radar_apto_rio", e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="mensaje-error">{error}</div>
      <div className="form-activo-botones">
        {activoEnEdicion && (
          <button type="button" onClick={onCancelar}>Cancelar edición</button>
        )}
        <button type="submit">{activoEnEdicion ? "Guardar cambios" : "Agregar a mi flota"}</button>
      </div>
    </form>
  );
}
