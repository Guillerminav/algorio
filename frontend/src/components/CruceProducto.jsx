import React from "react";

import { OTRO_PRODUCTO } from "../producto.js";

/**
 * "Esto no es lo que buscabas" — el puente al otro producto.
 *
 * Es lo que reemplaza a la división visual que antes vivía dentro del selector
 * de rol, cuando las tres opciones convivían en una pantalla. Ahora los dos
 * productos son dos dominios, así que la división ya no es una línea entre dos
 * grupos de tarjetas: es este cartel.
 *
 * Va en el login y en el registro de los dos lados. Alguien que llega a
 * `app.algorio.com.ar` buscando calado de buques tiene que poder darse cuenta
 * acá, antes de crear una cuenta con el rol equivocado — que es el error caro,
 * porque el rol no se cambia solo desde la interfaz.
 */
export default function CruceProducto() {
  return (
    <a className="cruce-producto" href={OTRO_PRODUCTO.url}>
      <span className="cruce-producto-texto">
        <strong>{OTRO_PRODUCTO.nombre}</strong>
        <span>{OTRO_PRODUCTO.para}</span>
      </span>
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M3 8h10M9 4l4 4-4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
