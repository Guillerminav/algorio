import React, { useState } from "react";

import { tipoDe } from "./tiposComercio.js";

/**
 * Editor de la carta del comercio: secciones con items adentro.
 *
 * Una sola pantalla para los tres rubros, cambiando el vocabulario (ver
 * tiposComercio.js): el parador carga secciones con platos, la cabaña tipos de
 * alojamiento con unidades, la lancha-taxi tipos de servicio con recorridos.
 * La estructura es la misma —agrupar cosas con nombre y precio—, asi que
 * mantener tres editores casi iguales solo daria tres lugares donde arreglar
 * el mismo bug.
 *
 * Se guarda en pois.menu como [{seccion, items: [{nombre, precio, descripcion}]}].
 * El precio va como texto a proposito: en la practica se escribe "8500",
 * "desde $12.000" o "a convenir", y forzar un numero obligaria al comerciante
 * a mentir.
 */
export default function EditorCarta({ comercio, onGuardar, guardando }) {
  const definicion = tipoDe(comercio.tipo);
  const [secciones, setSecciones] = useState(comercio.menu ?? []);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const hayCambios = JSON.stringify(secciones) !== JSON.stringify(comercio.menu ?? []);

  const actualizarSeccion = (indice, parcial) => {
    setSecciones((previas) => previas.map((s, i) => (i === indice ? { ...s, ...parcial } : s)));
    setMensaje("");
  };

  const actualizarItem = (indiceSeccion, indiceItem, parcial) => {
    setSecciones((previas) =>
      previas.map((seccion, i) =>
        i !== indiceSeccion
          ? seccion
          : {
              ...seccion,
              items: seccion.items.map((item, j) => (j === indiceItem ? { ...item, ...parcial } : item)),
            },
      ),
    );
    setMensaje("");
  };

  async function guardar() {
    setError("");
    setMensaje("");
    // Se limpia al guardar y no mientras se escribe: borrar una fila vacia en
    // el momento haria desaparecer el renglon reciEn agregado bajo el cursor.
    const limpias = secciones
      .map((seccion) => ({
        seccion: (seccion.seccion ?? "").trim(),
        items: (seccion.items ?? []).filter((item) => (item.nombre ?? "").trim()),
      }))
      .filter((seccion) => seccion.seccion || seccion.items.length);

    try {
      await onGuardar({ menu: limpias });
      setSecciones(limpias);
      setMensaje("Listo, guardamos tu carta.");
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    }
  }

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        Agrupá lo que ofrecés en {definicion.pluralSeccion} y cargá cada {definicion.unidadItem} con
        su precio. Es lo que el nauta ve al abrir tu ficha.
      </p>

      {secciones.length === 0 && (
        <div className="estado">Todavía no cargaste nada.</div>
      )}

      {secciones.map((seccion, indiceSeccion) => (
        <div className="tarjeta-seccion" key={indiceSeccion}>
          <div className="tarjeta-seccion-encabezado">
            <input
              type="text"
              className="entrada-titulo"
              placeholder={`${definicion.ejemploSeccion}`}
              value={seccion.seccion ?? ""}
              onChange={(e) => actualizarSeccion(indiceSeccion, { seccion: e.target.value })}
            />
            <button
              type="button"
              className="boton-quitar"
              aria-label={`Quitar ${definicion.unidadSeccion}`}
              onClick={() => setSecciones((previas) => previas.filter((_, i) => i !== indiceSeccion))}
            >
              ✕
            </button>
          </div>

          <ul className="lista-items">
            {(seccion.items ?? []).map((item, indiceItem) => (
              <li key={indiceItem}>
                <input
                  type="text"
                  placeholder={definicion.ejemploItem}
                  value={item.nombre ?? ""}
                  onChange={(e) => actualizarItem(indiceSeccion, indiceItem, { nombre: e.target.value })}
                />
                <input
                  type="text"
                  className="entrada-precio"
                  placeholder="$"
                  value={item.precio ?? ""}
                  onChange={(e) => actualizarItem(indiceSeccion, indiceItem, { precio: e.target.value })}
                />
                <button
                  type="button"
                  className="boton-quitar"
                  aria-label="Quitar"
                  onClick={() =>
                    actualizarSeccion(indiceSeccion, {
                      items: seccion.items.filter((_, j) => j !== indiceItem),
                    })
                  }
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="boton-secundario"
            onClick={() =>
              actualizarSeccion(indiceSeccion, {
                items: [...(seccion.items ?? []), { nombre: "", precio: "" }],
              })
            }
          >
            + Agregar {definicion.unidadItem}
          </button>
        </div>
      ))}

      <button
        type="button"
        className="boton-secundario"
        onClick={() => setSecciones((previas) => [...previas, { seccion: "", items: [] }])}
      >
        + Agregar {definicion.unidadSeccion}
      </button>

      {error && <div className="mensaje-error">{error}</div>}
      {mensaje && <div className="mensaje-ok">{mensaje}</div>}

      <div className="fila-acciones">
        <button type="button" onClick={guardar} disabled={!hayCambios || guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
