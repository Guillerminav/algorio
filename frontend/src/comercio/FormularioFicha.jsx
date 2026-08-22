import React from "react";

import MapaUbicacion from "./MapaUbicacion.jsx";
import { SERVICIO_ACAMPE, TIPOS_COMERCIO, tipoDe } from "./tiposComercio.js";

/**
 * Los datos base del comercio: rubro, nombre, descripcion, ubicacion y
 * contacto. Es el mismo formulario en el alta (dentro del asistente) y en
 * "Mi comercio" (suelto), asi que no trae ni titulo ni boton de guardar: eso
 * lo pone quien lo usa.
 *
 * Es controlado (`valores` + `onCambiar`) y no maneja estado propio para que
 * el asistente pueda validar paso por paso sin duplicar los campos.
 */
export default function FormularioFicha({ valores, onCambiar, mostrarTipo = true }) {
  const definicion = tipoDe(valores.tipo);
  const cambiar = (campo) => (evento) => onCambiar({ [campo]: evento.target.value });

  // Los precios viajan como numero y no como texto: se guardan en columnas
  // enteras y el dia que haya un filtro de "paradores hasta $X" tiene que
  // poder compararse. Vacio es null —"no lo dice"— y distinto de 0, que es
  // "es gratis" y sí es un dato.
  const cambiarPrecio = (campo) => (evento) => {
    const limpio = evento.target.value.replace(/[^\d]/g, "");
    onCambiar({ [campo]: limpio === "" ? null : Number(limpio) });
  };

  const admiteAcampe = (valores.servicios ?? []).includes(SERVICIO_ACAMPE);

  return (
    <>
      {mostrarTipo && (
        <fieldset className="grupo-campos" aria-label="Tipo de comercio náutico">
          <legend>Tipo de comercio náutico</legend>
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
                  onChange={() => onCambiar({ tipo: opcion.tipo })}
                />
                <strong>{opcion.etiqueta}</strong>
                <span>{opcion.resumen}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Nombre y descripción van dentro de su propio recuadro, igual que el
          resto: sueltos quedaban pegados al borde de la tarjeta mientras los
          demás campos aparecían indentados dentro de un <fieldset>, y la
          diferencia de alineación se notaba. */}
      <fieldset className="grupo-campos" aria-label="Datos del comercio">
        <legend>Datos</legend>

        <label>
          Nombre
          <input
            type="text"
            required
            maxLength={120}
            placeholder="Parador El Remanso"
            value={valores.nombre ?? ""}
            onChange={cambiar("nombre")}
          />
        </label>

        <label>
          Descripción
          <textarea
            rows={3}
            maxLength={600}
            placeholder="Contá en dos líneas qué te hace distinto: la vista, la comida, el amarre."
            value={valores.descripcion ?? ""}
            onChange={cambiar("descripcion")}
          />
        </label>
      </fieldset>

      <fieldset className="grupo-campos" aria-label="Ubicación">
        <legend>¿Dónde estás?</legend>
        <p className="descripcion">
          Marcá el punto exacto sobre la costa. Es lo que va a ver el nauta en el mapa
          y lo que usa el botón &ldquo;Cómo llegar&rdquo;.
        </p>
        <MapaUbicacion
          lat={valores.lat}
          lon={valores.lon}
          onCambiar={(lat, lon) => onCambiar({ lat, lon })}
        />
      </fieldset>

      <fieldset className="grupo-campos" aria-label="Contacto">
        <legend>¿Cómo te contactan?</legend>
        <div className="fila-campos">
          <label>
            WhatsApp
            <input
              type="tel"
              placeholder="3794000000"
              value={valores.whatsapp ?? ""}
              onChange={cambiar("whatsapp")}
            />
          </label>
          <label>
            Teléfono
            <input
              type="tel"
              placeholder="3794000000"
              value={valores.telefono ?? ""}
              onChange={cambiar("telefono")}
            />
          </label>
          <label>
            Instagram
            <input
              type="text"
              placeholder="@elremanso"
              value={valores.instagram ?? ""}
              onChange={cambiar("instagram")}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="grupo-campos" aria-label="Servicios">
        <legend>¿Qué ofrecés?</legend>
        <div className="chips-servicios">
          {definicion.servicios.map((servicio) => {
            const elegidos = valores.servicios ?? [];
            const activo = elegidos.includes(servicio);
            return (
              <button
                key={servicio}
                type="button"
                className={`chip-servicio${activo ? " activo" : ""}`}
                aria-pressed={activo}
                onClick={() =>
                  onCambiar({
                    servicios: activo
                      ? elegidos.filter((s) => s !== servicio)
                      : [...elegidos, servicio],
                  })
                }
              >
                {servicio}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Los precios van DESPUES de los servicios y no arriba con el resto de
          los datos: el de acampe aparece al tildar "Se puede acampar", que es
          un chip de la caja de arriba, y pedirlo antes de que se pueda tildar
          no se entiende. */}
      {definicion.tienePrecios && (
        <fieldset className="grupo-campos" aria-label="Precios">
          <legend>¿Cuánto sale?</legend>
          <p className="descripcion">
            Lo que ve el nauta antes de decidir a dónde va. Dejalo vacío si preferís no
            publicarlo; poné <strong>0</strong> si la entrada es libre.
          </p>

          <div className="fila-campos">
            <label>
              Entrada por persona
              <input
                type="text"
                inputMode="numeric"
                maxLength={9}
                placeholder="3500"
                value={valores.precio_estadia ?? ""}
                onChange={cambiarPrecio("precio_estadia")}
              />
            </label>

            {admiteAcampe && (
              <label>
                Acampe por persona
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="5000"
                  value={valores.precio_acampe ?? ""}
                  onChange={cambiarPrecio("precio_acampe")}
                />
              </label>
            )}
          </div>

          {!admiteAcampe && (
            <p className="descripcion">
              ¿También se puede acampar? Tildá <strong>«{SERVICIO_ACAMPE}»</strong> arriba y
              aparece el precio del acampe.
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}
