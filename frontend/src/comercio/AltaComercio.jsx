import React, { useState } from "react";

import { pedirJSON } from "../api.js";
import FormularioFicha from "./FormularioFicha.jsx";
import { TIPOS_COMERCIO } from "./tiposComercio.js";

// Tres pasos y no un formulario largo: quien carga esto suele estar en el
// celular, y una pantalla con rubro + nombre + mapa + contacto + servicios
// junta se abandona a la mitad. Cada paso pide una sola cosa.
const PASOS = [
  {
    clave: "rubro",
    titulo: "Tipo de comercio náutico",
    // Se avisa que no se cambia JUSTO donde se elige, y no despues en "Mi
    // comercio": el rubro decide que pantallas existen (la carta es solo del
    // parador, el tablero solo de la lancha-taxi) y queda atado a la cuenta.
    ayuda: "Define cómo se muestra tu lugar en el mapa. Después no se puede cambiar.",
  },
  { clave: "datos", titulo: "Contanos de vos", ayuda: "El nombre y la descripción son lo primero que ve el nauta." },
  { clave: "ubicacion", titulo: "¿Dónde estás?", ayuda: "Marcá el punto y dejá por dónde te escriben." },
];

/**
 * Asistente de alta. Es lo que ve una cuenta de comercio que todavia no cargo
 * su ficha: hasta que no exista el POI no hay panel que mostrar (no hay
 * metricas, ni reseñas, ni menu), asi que ocupa la pantalla entera.
 */
export default function AltaComercio({ onCreado, onVolver }) {
  const [indicePaso, setIndicePaso] = useState(0);
  const [valores, setValores] = useState({ tipo: "", nombre: "", descripcion: "", servicios: [] });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const paso = PASOS[indicePaso];
  const esUltimo = indicePaso === PASOS.length - 1;

  const cambiar = (parcial) => setValores((previos) => ({ ...previos, ...parcial }));

  // Cada paso sabe cuando esta completo. Sin esto el asistente dejaria llegar
  // al final sin ubicacion y el backend rechazaria el alta al final de todo,
  // que es el peor momento para enterarse.
  const completo = {
    rubro: Boolean(valores.tipo),
    datos: Boolean((valores.nombre ?? "").trim()),
    ubicacion: typeof valores.lat === "number" && typeof valores.lon === "number",
  }[paso.clave];

  async function continuar(evento) {
    evento.preventDefault();
    setError("");

    if (!esUltimo) {
      setIndicePaso((i) => i + 1);
      return;
    }

    setEnviando(true);
    try {
      const creado = await pedirJSON("/api/mi-comercio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...valores,
          nombre: valores.nombre.trim(),
          descripcion: (valores.descripcion ?? "").trim() || null,
        }),
      });
      onCreado(creado);
    } catch (e) {
      setError(e.message || "No se pudo crear tu comercio. Intentá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="alta-comercio">
      <div className="alta-comercio-tarjeta">
        <div className="alta-comercio-progreso" aria-hidden="true">
          {PASOS.map((p, i) => (
            <span key={p.clave} className={`alta-comercio-punto${i <= indicePaso ? " activo" : ""}`} />
          ))}
        </div>

        <h1>{paso.titulo}</h1>
        <p className="descripcion">
          Paso {indicePaso + 1} de {PASOS.length} — {paso.ayuda}
        </p>

        <form onSubmit={continuar}>
          {paso.clave === "rubro" && (
            <div className="opciones-rubro">
              {TIPOS_COMERCIO.map((opcion) => (
                <label
                  key={opcion.tipo}
                  className={`opcion-rubro${opcion.tipo === valores.tipo ? " elegida" : ""}`}
                >
                  <input
                    type="radio"
                    name="tipo"
                    value={opcion.tipo}
                    checked={opcion.tipo === valores.tipo}
                    onChange={() => cambiar({ tipo: opcion.tipo, servicios: [] })}
                  />
                  <strong>{opcion.etiqueta}</strong>
                  <span>{opcion.resumen}</span>
                </label>
              ))}
            </div>
          )}

          {paso.clave === "datos" && (
            <>
              <label>
                Nombre
                <input
                  type="text"
                  required
                  maxLength={120}
                  autoFocus
                  placeholder="Parador El Remanso"
                  value={valores.nombre}
                  onChange={(e) => cambiar({ nombre: e.target.value })}
                />
              </label>
              <label>
                Descripción
                <textarea
                  rows={4}
                  maxLength={600}
                  placeholder="Contá en dos líneas qué te hace distinto: la vista, la comida, el amarre."
                  value={valores.descripcion}
                  onChange={(e) => cambiar({ descripcion: e.target.value })}
                />
              </label>
            </>
          )}

          {/* El ultimo paso reusa el formulario completo con el rubro y los
              datos ya cargados escondidos: lo que falta es ubicacion,
              contacto y servicios. */}
          {paso.clave === "ubicacion" && (
            <FormularioFicha
              valores={valores}
              onCambiar={cambiar}
              mostrarTipo={false}
            />
          )}

          <div className="mensaje-error">{error}</div>

          <div className="fila-acciones">
            {/* En el primer paso, "Atras" vuelve al selector de camino: quien
                entro por error a cargar de cero tiene que poder ir a reclamar
                sin recargar la pagina. */}
            {(indicePaso > 0 || onVolver) && (
              <button
                type="button"
                className="boton-secundario"
                onClick={() => {
                  setError("");
                  if (indicePaso === 0) onVolver();
                  else setIndicePaso((i) => i - 1);
                }}
              >
                Atrás
              </button>
            )}
            <button type="submit" disabled={!completo || enviando}>
              {enviando ? "Creando…" : esUltimo ? "Crear mi comercio" : "Continuar"}
            </button>
          </div>
        </form>

        {esUltimo && (
          <p className="descripcion alta-comercio-nota">
            Cuando lo crees queda <strong>en revisión</strong>. Lo miramos y, apenas lo
            aprobamos, aparece en el mapa de todos los nautas. Mientras tanto podés
            seguir cargando el menú y los horarios.
          </p>
        )}
      </div>
    </div>
  );
}
