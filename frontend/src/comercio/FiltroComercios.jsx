import React from "react";

/**
 * "¿De cuál de mis comercios?", para las pantallas que son de la cuenta entera.
 *
 * Métricas y reseñas no cuelgan de un comercio como la ficha o los horarios:
 * la pregunta que contestan —«¿cómo me está yendo?»— es de la persona, no del
 * pin. Quien tiene un parador y una cabaña quiere ver el total y recién
 * después abrir cuál de los dos lo traccionó.
 *
 * Por eso "Todos" es la opción por defecto y no un extra al final de la lista.
 *
 * Con un solo comercio no se dibuja: un filtro de una opción es un control que
 * no filtra nada.
 */
export default function FiltroComercios({ comercios, elegido, onElegir }) {
  if (comercios.length < 2) return null;

  return (
    <div className="selector-rango" role="group" aria-label="Filtrar por comercio">
      <button
        type="button"
        className={`chip-rango${elegido === null ? " activo" : ""}`}
        aria-pressed={elegido === null}
        onClick={() => onElegir(null)}
      >
        Todos
      </button>
      {comercios.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip-rango${elegido === c.id ? " activo" : ""}`}
          aria-pressed={elegido === c.id}
          onClick={() => onElegir(c.id)}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
}
