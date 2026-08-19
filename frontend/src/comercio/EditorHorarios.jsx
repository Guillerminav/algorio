import React, { useState } from "react";

import { DIAS } from "./tiposComercio.js";

const VACIO = { cerrado: false, abre: "", cierra: "" };

/**
 * Horarios por dia de la semana.
 *
 * Se guardan en pois.horarios como {lun: {cerrado, abre, cierra}, ...}. La app
 * los usa para decir "abierto ahora" o "cierra a las 20" en el mapa, que es la
 * pregunta real de alguien que esta navegando y quiere parar a comer.
 *
 * Un dia sin horarios cargados no es lo mismo que un dia cerrado: el primero
 * significa "no sabemos" y la app no afirma nada; el segundo, "no abre", y se
 * muestra. Por eso "cerrado" es una tilde explicita y no la ausencia de datos.
 */
export default function EditorHorarios({ comercio, onGuardar, guardando }) {
  const [horarios, setHorarios] = useState(comercio.horarios ?? {});
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const hayCambios = JSON.stringify(horarios) !== JSON.stringify(comercio.horarios ?? {});

  const cambiarDia = (clave, parcial) => {
    setHorarios((previos) => ({ ...previos, [clave]: { ...VACIO, ...previos[clave], ...parcial } }));
    setMensaje("");
  };

  // Copiar el primer dia con horario al resto: casi todos los paradores abren
  // igual toda la semana y cargar siete veces lo mismo es la parte molesta de
  // esta pantalla.
  function replicarAlResto() {
    const origen = DIAS.map((d) => horarios[d.clave]).find((h) => h?.abre || h?.cierra);
    if (!origen) return;
    setHorarios(Object.fromEntries(DIAS.map((d) => [d.clave, { ...origen }])));
    setMensaje("");
  }

  async function guardar() {
    setError("");
    setMensaje("");
    // Los dias sin nada cargado se sacan del objeto: guardar {abre:"", cierra:""}
    // haria que la app crea que hay un horario definido y muestre un rango vacio.
    const limpios = Object.fromEntries(
      Object.entries(horarios).filter(([, valor]) => valor?.cerrado || valor?.abre || valor?.cierra),
    );
    try {
      await onGuardar({ horarios: limpios });
      setHorarios(limpios);
      setMensaje("Listo, guardamos tus horarios.");
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    }
  }

  return (
    <div className="panel-comercio">
      <p className="descripcion">
        Cargá a qué hora abrís cada día. Si un día no abrís, marcá &ldquo;Cerrado&rdquo;.
        Los días que dejes en blanco no se muestran.
      </p>

      <div className="tabla-contenedor">
      <table className="tabla-horarios">
        <thead>
          <tr>
            <th>Día</th>
            <th>Abre</th>
            <th>Cierra</th>
            <th>Cerrado</th>
          </tr>
        </thead>
        <tbody>
          {DIAS.map((dia) => {
            const valor = horarios[dia.clave] ?? VACIO;
            return (
              <tr key={dia.clave}>
                <td>{dia.etiqueta}</td>
                <td>
                  <input
                    type="time"
                    value={valor.abre ?? ""}
                    disabled={valor.cerrado}
                    onChange={(e) => cambiarDia(dia.clave, { abre: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={valor.cierra ?? ""}
                    disabled={valor.cerrado}
                    onChange={(e) => cambiarDia(dia.clave, { cierra: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(valor.cerrado)}
                    aria-label={`${dia.etiqueta} cerrado`}
                    onChange={(e) =>
                      cambiarDia(dia.clave, {
                        cerrado: e.target.checked,
                        // Al marcar cerrado se limpian las horas: dejarlas
                        // guardaria un dia "cerrado de 9 a 18".
                        ...(e.target.checked ? { abre: "", cierra: "" } : {}),
                      })
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {error && <div className="mensaje-error">{error}</div>}
      {mensaje && <div className="mensaje-ok">{mensaje}</div>}

      <div className="fila-acciones">
        <button type="button" className="boton-secundario" onClick={replicarAlResto}>
          Repetir en todos los días
        </button>
        <button type="button" onClick={guardar} disabled={!hayCambios || guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
