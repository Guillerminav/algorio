import React, { useState } from "react";

import FormularioFicha from "./FormularioFicha.jsx";
import { ETIQUETAS_ESTADO, tipoDe } from "./tiposComercio.js";

// Las fotos se guardan como URLs (pois.fotos). Todavia no hay storage de
// imagenes en el proyecto, asi que el comerciante pega el link de una foto que
// ya tenga publicada; cuando exista un bucket, este bloque pasa a ser un
// selector de archivos y el resto de la pantalla no cambia.
function EditorFotos({ fotos, onCambiar }) {
  const [nueva, setNueva] = useState("");

  function agregar() {
    const url = nueva.trim();
    if (!url) return;
    onCambiar([...(fotos ?? []), url]);
    setNueva("");
  }

  return (
    <fieldset className="grupo-campos" aria-label="Fotos">
      <legend>Fotos</legend>
      <p className="descripcion">
        Pegá el link de una foto tuya ya publicada (Instagram, Drive, tu web). La primera
        es la que se ve en el mapa.
      </p>

      {(fotos ?? []).length > 0 && (
        <ul className="lista-fotos">
          {fotos.map((url, indice) => (
            <li key={`${url}-${indice}`}>
              <img src={url} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <span className="lista-fotos-url">{url}</span>
              <button
                type="button"
                className="boton-quitar"
                aria-label="Quitar foto"
                onClick={() => onCambiar(fotos.filter((_, i) => i !== indice))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="fila-agregar">
        <input
          type="url"
          placeholder="https://…"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          // Enter agrega la foto en vez de mandar el formulario entero, que
          // guardaria la ficha con el campo a medio escribir.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
        />
        <button type="button" className="boton-secundario" onClick={agregar}>Agregar</button>
      </div>
    </fieldset>
  );
}

/**
 * "Mi comercio": los datos base de la ficha, editables.
 *
 * Trabaja sobre una copia local y solo manda lo que cambio al apretar
 * Guardar. Guardar en cada tecla mandaria decenas de PUT y, peor, cada cambio
 * de nombre o de ubicacion devolveria la ficha a revision mientras se escribe.
 */
export default function MiComercio({ comercio, onGuardar, guardando }) {
  const [valores, setValores] = useState(comercio);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const definicion = tipoDe(comercio.tipo);
  const cambiar = (parcial) => {
    setValores((previos) => ({ ...previos, ...parcial }));
    setMensaje("");
  };

  // Compara contra la ficha guardada, no contra el primer render: despues de
  // guardar, `comercio` llega actualizado y el boton vuelve a apagarse solo.
  const CAMPOS = ["tipo", "nombre", "descripcion", "lat", "lon", "telefono", "whatsapp", "instagram", "fotos", "servicios"];
  const hayCambios = CAMPOS.some(
    (campo) => JSON.stringify(valores[campo] ?? null) !== JSON.stringify(comercio[campo] ?? null),
  );

  // Cambiar nombre, rubro o ubicacion vuelve a mandar la ficha a revision (lo
  // decide el backend, ver pois.actualizar). Se avisa antes de guardar para que
  // no sea una sorpresa: nadie espera que corregir un typo lo saque del mapa.
  const volveraARevision =
    comercio.estado === "aprobado" &&
    ["nombre", "tipo", "lat", "lon"].some(
      (campo) => JSON.stringify(valores[campo] ?? null) !== JSON.stringify(comercio[campo] ?? null),
    );

  async function guardar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    const cambios = Object.fromEntries(
      CAMPOS.filter((campo) => JSON.stringify(valores[campo] ?? null) !== JSON.stringify(comercio[campo] ?? null))
        .map((campo) => [campo, valores[campo]]),
    );
    try {
      await onGuardar(cambios);
      setMensaje("Listo, guardamos los cambios.");
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    }
  }

  return (
    <form className="panel-comercio" onSubmit={guardar}>
      <p className="descripcion">
        {definicion.etiqueta} · <span className={`chip-publicacion estado-${comercio.estado}`}>
          {ETIQUETAS_ESTADO[comercio.estado] ?? comercio.estado}
        </span>
      </p>

      <FormularioFicha valores={valores} onCambiar={cambiar} />
      <EditorFotos fotos={valores.fotos} onCambiar={(fotos) => cambiar({ fotos })} />

      {volveraARevision && (
        <div className="aviso-revision">
          Cambiaste el nombre, el rubro o la ubicación: la ficha vuelve a revisión y no se
          va a ver en el mapa hasta que la aprobemos de nuevo.
        </div>
      )}

      {error && <div className="mensaje-error">{error}</div>}
      {mensaje && <div className="mensaje-ok">{mensaje}</div>}

      <div className="fila-acciones">
        <button type="submit" disabled={!hayCambios || guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
