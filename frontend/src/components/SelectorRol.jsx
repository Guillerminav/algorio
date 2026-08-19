import React from "react";

import { PRODUCTO } from "../producto.js";

// Los tres perfiles del producto, con el nombre que usa la gente y no el que
// usa la base. El `rol` es el valor que viaja al backend (ver
// backend/auth.py: ROLES_VALIDOS).
//
// Siguen definidos los tres aunque cada dominio muestre solo los suyos: el
// backend los conoce a todos, y `ROL_POR_CLAVE` se usa para poner el nombre de
// un rol en pantalla aunque no sea elegible acá (por ejemplo en la pantalla
// que avisa que la cuenta es del otro producto).
export const ROLES = [
  {
    rol: "recreativo",
    etiqueta: "Salgo al río",
    resumen: "Kayak, lancha, velero o tabla, por placer.",
    ventajas: [
      "Mapa satelital con los bancos de arena",
      "Viento y ráfagas, para saber si está picado",
      "Paradores, cabañas y lanchas-taxi cerca tuyo",
    ],
    precio: "Gratis",
  },
  {
    rol: "comercio",
    etiqueta: "Tengo un comercio en el río",
    resumen: "Parador, cabaña o lancha-taxi.",
    ventajas: [
      "Tu lugar en el mapa de todos los nautas",
      // "Servicios" y no "Menú": el rubro se elige después, y una cabaña o una
      // lancha-taxi no tienen carta.
      "Servicios, horarios y contacto al día",
      "Cuánta gente te miró y qué dicen de vos",
    ],
    precio: "Con suscripción",
  },
  {
    rol: "naviera",
    etiqueta: "Opero embarcaciones",
    resumen: "Naviera, terminal o servicio fluvial.",
    ventajas: [
      "Niveles, calado y alertas por estación",
      "Rutas con punto crítico y carga",
      "Histórico y exportación de datos",
    ],
    precio: "Con suscripción",
  },
];

export const ROL_POR_CLAVE = Object.fromEntries(ROLES.map((r) => [r.rol, r]));

/** Los que se pueden elegir en ESTE dominio. */
export const ROLES_DEL_PRODUCTO = PRODUCTO.roles.map((clave) => ROL_POR_CLAVE[clave]);

function TarjetaRol({ opcion, elegido, onCambiar }) {
  const elegida = opcion.rol === elegido;
  return (
    <label className={`tarjeta-rol${elegida ? " elegida" : ""}`}>
      <input
        type="radio"
        name="rol"
        value={opcion.rol}
        checked={elegida}
        onChange={() => onCambiar(opcion)}
      />
      <span className="tarjeta-rol-cabecera">
        <strong>{opcion.etiqueta}</strong>
        <span className="tarjeta-rol-precio">{opcion.precio}</span>
      </span>
      <span className="tarjeta-rol-resumen">{opcion.resumen}</span>
      <span className="tarjeta-rol-ventajas">
        {opcion.ventajas.map((v) => (
          <span key={v}>{v}</span>
        ))}
      </span>
    </label>
  );
}

/**
 * Primer paso del alta, y solo en el dominio que tiene más de un rol.
 *
 * Antes esta pantalla mostraba los tres perfiles juntos, agrupados en "Uso del
 * río" y "Navegación comercial" con una línea en el medio, porque eran dos
 * productos conviviendo en una misma web. Ya no hace falta esa línea: los dos
 * productos son dos dominios, y acá solo se elige entre los perfiles de este.
 * A quien se equivocó de puerta lo atiende <CruceProducto>.
 */
export default function SelectorRol({ valor, onCambiar }) {
  return (
    <fieldset className="selector-rol" aria-label="Tipo de cuenta">
      {ROLES_DEL_PRODUCTO.map((opcion) => (
        <TarjetaRol key={opcion.rol} opcion={opcion} elegido={valor} onCambiar={onCambiar} />
      ))}
    </fieldset>
  );
}
