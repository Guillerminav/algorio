import React from "react";

import { ETIQUETAS_ESTADO, tipoDe } from "./tiposComercio.js";

/**
 * Mis comercios, cada uno desplegando sus pantallas de edición.
 *
 * Antes esto era una lista plana de comercios y, aparte, una sección llamada
 * "Mi comercio" con las pantallas del que estuviera activo. Eran dos controles
 * para una sola idea, y el segundo mentía: con tres cargados, "mi comercio"
 * no dice cuál.
 *
 * Ahora el encabezado de cada grupo dice **de qué comercio se trata** —su
 * nombre y su rubro— y adentro cuelgan sus pantallas: la ficha, el menú o el
 * tablero según el rubro, y los horarios. Son suyas y no de la cuenta: los
 * horarios de un parador no tienen nada que ver con los de la cabaña de al
 * lado, aunque las administre la misma persona.
 *
 * Lo que NO cuelga de acá es métricas y reseñas. Esas son de la cuenta entera
 * —«¿cómo me está yendo?» se pregunta una vez, no una por pin— y viven abajo,
 * con su propio filtro por comercio.
 *
 * Solo se despliega el activo. Con los tres abiertos la barra es una lista de
 * quince renglones donde encontrar algo cuesta más que cambiar de comercio.
 */
export default function SelectorComercio({
  comercios,
  activo,
  seccionActiva,
  seccionesDe,
  onElegir,
  onElegirSeccion,
  puedeAgregar,
  onAgregar,
}) {
  return (
    <div className="selector-comercio">
      <p className="selector-comercio-titulo">Mis comercios</p>

      <ul className="selector-comercio-lista">
        {comercios.map((c) => {
          const definicion = tipoDe(c.tipo);
          const abierto = c.id === activo;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`selector-comercio-item${abierto ? " activo" : ""}`}
                aria-expanded={abierto}
                onClick={() => onElegir(c.id)}
              >
                <span className="selector-comercio-flecha" aria-hidden="true">
                  {abierto ? "▾" : "▸"}
                </span>
                <span className="selector-comercio-datos">
                  <span className="selector-comercio-nombre">{c.nombre}</span>
                  <span className="selector-comercio-meta">
                    {definicion.etiqueta}
                    {/* El estado solo cuando NO está publicado: "aprobado" es
                        lo normal y repetirlo en cada renglón convierte la
                        lista en una columna de la misma palabra. */}
                    {c.estado !== "aprobado" && (
                      <>
                        {" · "}
                        <span className={`selector-comercio-estado estado-${c.estado}`}>
                          {ETIQUETAS_ESTADO[c.estado] ?? c.estado}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </button>

              {abierto && (
                <ul className="selector-comercio-pantallas">
                  {seccionesDe(c).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`selector-comercio-pantalla${
                          s.id === seccionActiva ? " activa" : ""
                        }`}
                        aria-current={s.id === seccionActiva ? "page" : undefined}
                        onClick={() => onElegirSeccion(s.id)}
                      >
                        {s.etiqueta}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Sin lugar el botón se apaga en vez de desaparecer: quien busca cómo
          agregar otro necesita enterarse de que hay un tope, no quedarse
          pensando que la opción no existe. */}
      <button
        type="button"
        className={`selector-comercio-agregar${activo === null ? " activo" : ""}`}
        disabled={!puedeAgregar}
        title={puedeAgregar ? "Cargar otro comercio" : "Llegaste al máximo de comercios"}
        onClick={onAgregar}
      >
        + Agregar otro
      </button>
    </div>
  );
}
