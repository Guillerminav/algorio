import React from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { PRODUCTO, productoDeRol } from "../producto.js";
import PantallaMarca from "./PantallaMarca.jsx";

/**
 * Entraste por el dominio equivocado.
 *
 * Pasa de verdad y de dos maneras: alguien que tenía `app.algorio.com.ar`
 * marcado de antes de la separación y su cuenta es de naviera, o alguien que
 * llega por un link viejo. Antes de que existieran los dos dominios,
 * `ShellSegunRol` caía en el dashboard de navieras para cualquier rol
 * desconocido; ahora ese default sería peor, porque montaría el producto que
 * este dominio no es.
 *
 * No se redirige solo: mandar a alguien a otro dominio sin avisar, y que
 * encima tenga que volver a iniciar sesión ahí (la cookie es host-only), se
 * lee como que la cuenta se rompió. Se explica y se le da el botón.
 */
export default function CuentaDeOtroProducto({ rol }) {
  const { usuario, logout } = useAuth();
  const suyo = productoDeRol(rol);

  return (
    <PantallaMarca>
      <div className="tarjeta-vidrio pantalla-cruce">
        <h1>Tu cuenta es de {suyo?.nombre ?? "otro producto"}</h1>
        <p>
          Entraste a <strong>{PRODUCTO.nombre}</strong>, pero la cuenta{" "}
          <strong>{usuario?.usuario}</strong> es de {suyo?.nombre ?? "otro producto"}
          {suyo ? ` — ${suyo.para.toLowerCase()}.` : "."}
        </p>

        {suyo && (
          <a className="boton-vidrio-primario" href={suyo.url}>
            Ir a {suyo.nombre}
          </a>
        )}

        <p className="pantalla-cruce-nota">
          Vas a tener que iniciar sesión de nuevo del otro lado: cada uno tiene su
          propia sesión. Es la misma cuenta y la misma contraseña.
        </p>

        <button type="button" className="enlace-boton" onClick={logout}>
          Cerrar sesión acá
        </button>
      </div>
    </PantallaMarca>
  );
}
