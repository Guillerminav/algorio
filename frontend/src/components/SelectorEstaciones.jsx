import React, { useEffect, useRef, useState } from "react";

// Selector multiple compacto: cerrado ocupa lo mismo que cualquier filtro, y
// abierto despliega la lista con buscador. Con ~100 estaciones, mostrarlas
// todas como pastillas se comia media pantalla.
export default function SelectorEstaciones({
  estaciones,
  seleccionadas,
  onAlternar,
  colorDe,
  maximo,
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedorRef = useRef(null);

  useEffect(() => {
    function alHacerClickFuera(evento) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener("click", alHacerClickFuera);
    return () => document.removeEventListener("click", alHacerClickFuera);
  }, []);

  // Sin distinguir mayusculas NI tildes: "rosario" encuentra "Rosario" y
  // "ituzaingo" encuentra "Ituzaingó" (varias estaciones llevan tilde y
  // escribirla al buscar es incomodo).
  const paraBuscar = (texto) =>
    texto
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  const termino = paraBuscar(busqueda.trim());
  const filtradas = estaciones.filter((e) => paraBuscar(e).includes(termino));
  const tope = seleccionadas.length >= maximo;

  const resumen = seleccionadas.length === 0
    ? "Seleccionar una estación"
    : seleccionadas.length === 1
      ? seleccionadas[0]
      : `${seleccionadas.length} estaciones`;

  return (
    <div className="selector-estaciones" ref={contenedorRef}>
      <button
        type="button"
        className="selector-estaciones-boton"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((a) => !a);
        }}
        aria-expanded={abierto}
      >
        <span className="selector-estaciones-resumen">{resumen}</span>
        <span className="selector-estaciones-flecha" aria-hidden="true">{abierto ? "▴" : "▾"}</span>
      </button>

      {abierto && (
        <div className="selector-estaciones-panel">
          <input
            type="search"
            className="selector-estaciones-busqueda"
            placeholder="Buscar estación..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoFocus
          />
          <div className="selector-estaciones-lista">
            {filtradas.length === 0 ? (
              <p className="selector-estaciones-vacio">Ninguna estación coincide.</p>
            ) : (
              filtradas.map((estacion) => {
                const activa = seleccionadas.includes(estacion);
                return (
                  <label
                    key={estacion}
                    className={`selector-estaciones-opcion${!activa && tope ? " deshabilitada" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={activa}
                      disabled={!activa && tope}
                      onChange={() => onAlternar(estacion)}
                    />
                    <span
                      className="selector-estaciones-punto"
                      style={{ background: activa ? colorDe(estacion) : "var(--borde)" }}
                    />
                    {estacion}
                  </label>
                );
              })
            )}
          </div>
          {tope && (
            <p className="selector-estaciones-tope">
              Máximo {maximo} estaciones. Destildá una para elegir otra.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
