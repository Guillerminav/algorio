import React, { useEffect, useMemo, useState } from "react";

import { pedirJSON } from "../api.js";
import { estadoApertura, TIPOS_POI, tipoPoi } from "./constantes.js";
import { useRio } from "./ContextoRio.jsx";
import { Estrellas } from "./piezas.jsx";
import { distanciaEnTexto, haciaElLugar } from "./rumbo.js";
import { estadoCruce, faltanEnTexto, proximoCruce } from "../tablero.js";

/**
 * Todos los lugares, en lista.
 *
 * El mapa es lo natural para "qué tengo cerca", pero es malo para dos cosas
 * muy reales: buscar un lugar por nombre —el que te recomendaron y no sabés
 * dónde queda— y recorrer todo lo que hay cuando los pines se amontonan o
 * quedan fuera del encuadre. Para eso está esta pantalla.
 *
 * Ordena por distancia cuando hay ubicación, que es el orden en el que se
 * decide; sin ubicación, alfabético, que es el único orden honesto que queda.
 */
export default function ListaLugares({ onVerLugar }) {
  const { posicion } = useRio();
  const [lugares, setLugares] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [tiposActivos, setTiposActivos] = useState(Object.keys(TIPOS_POI));

  useEffect(() => {
    let cancelado = false;
    const parametros = posicion ? `?lat=${posicion.lat}&lon=${posicion.lon}` : "";
    pedirJSON(`/api/pois${parametros}`)
      .then((d) => !cancelado && setLugares(d))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [posicion]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const filtrados = lugares.filter(
      (l) =>
        tiposActivos.includes(l.tipo) &&
        (texto === "" ||
          l.nombre.toLowerCase().includes(texto) ||
          (l.descripcion ?? "").toLowerCase().includes(texto)),
    );

    // Se ordena por la distancia que se MUESTRA, no por la que trajo el
    // backend. Son dos números distintos: el del backend se calculó cuando se
    // pidió la lista y el de la pantalla se recalcula con la posición actual.
    // Confiar en el orden del backend dejaba filas de 2,2 · 7,3 · 3,5 km, que
    // parece un error aunque cada número esté bien.
    if (posicion) {
      return [...filtrados].sort(
        (a, b) => (haciaElLugar(posicion, a)?.km ?? Infinity) - (haciaElLugar(posicion, b)?.km ?? Infinity),
      );
    }
    // Sin ubicación no hay cercanía que ordenar; alfabético al menos se recorre.
    return [...filtrados].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [lugares, tiposActivos, busqueda, posicion]);

  function alternarTipo(clave) {
    setTiposActivos((previos) =>
      previos.includes(clave) ? previos.filter((t) => t !== clave) : [...previos, clave],
    );
  }

  if (cargando) return <div className="estado">Buscando lugares…</div>;
  if (error) return <div className="mensaje-error">{error}</div>;

  return (
    <div className="lista-lugares">
      <div className="lista-lugares-controles">
        <input
          type="search"
          className="lista-lugares-busqueda"
          placeholder="Buscar por nombre"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar un lugar por nombre"
        />

        <div className="lista-lugares-filtros">
          {Object.entries(TIPOS_POI).map(([clave, definicion]) => {
            const activo = tiposActivos.includes(clave);
            return (
              <button
                key={clave}
                type="button"
                className={`chip-lista${activo ? " activo" : ""}`}
                aria-pressed={activo}
                onClick={() => alternarTipo(clave)}
              >
                {definicion.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {!posicion && (
        <p className="lista-lugares-nota">
          Sin tu ubicación no podemos ordenarlos por cercanía ni decirte a cuánto
          está cada uno. Van en orden alfabético.
        </p>
      )}

      {visibles.length === 0 ? (
        <div className="aviso-nauta lista-lugares-vacio">
          {lugares.length === 0
            ? "Todavía no hay lugares publicados. Van a ir apareciendo."
            : "Ningún lugar coincide con lo que buscaste."}
        </div>
      ) : (
        <ul className="lista-lugares-items">
          {visibles.map((lugar) => {
            const definicion = tipoPoi(lugar.tipo);
            const apertura = estadoApertura(lugar.horarios);
            const rumbo = haciaElLugar(posicion, lugar);
            const distancia = rumbo?.texto ?? distanciaEnTexto(lugar.distancia_km);
            // Para una lancha-taxi, "abierto hasta las 20" no es el dato: lo
            // es a que hora sale la proxima. Ocupa el mismo renglon de meta.
            const proximo = proximoCruce(lugar.cruces);

            return (
              <li key={lugar.id}>
                <button
                  type="button"
                  className="lugar-item"
                  onClick={() => onVerLugar(lugar.id)}
                >
                  <span className="lugar-item-emoji" aria-hidden="true">{definicion.emoji}</span>

                  <span className="lugar-item-cuerpo">
                    <span className="lugar-item-titulo">
                      <strong>{lugar.nombre}</strong>
                      <span className="lugar-item-rubro">{definicion.singular}</span>
                    </span>

                    <span className="lugar-item-meta">
                      {lugar.puntaje_promedio !== null && lugar.puntaje_promedio !== undefined ? (
                        <span className="lugar-item-puntaje">
                          <Estrellas puntaje={lugar.puntaje_promedio} tamano={12} />
                          {lugar.puntaje_promedio.toFixed(1)} ({lugar.cantidad_resenas})
                        </span>
                      ) : (
                        <span>Sin reseñas</span>
                      )}
                      {apertura && (
                        <span className={apertura.abierto ? "lugar-item-abierto" : "lugar-item-cerrado"}>
                          {apertura.texto}
                        </span>
                      )}
                      {proximo && (
                        <span
                          className="lugar-item-cruce"
                          style={{ "--tono-estado": estadoCruce(proximo.cruce.estado).color }}
                        >
                          {proximo.salida.estimada ?? proximo.salida.hora} a{" "}
                          {proximo.cruce.destino} · {faltanEnTexto(proximo.salida.faltan)}
                        </span>
                      )}
                    </span>
                  </span>

                  {/* La distancia a la derecha, con el rumbo abajo: es la
                      columna que se recorre con la vista para elegir. */}
                  {distancia && (
                    <span className="lugar-item-distancia">
                      <strong>{distancia}</strong>
                      {rumbo?.letras && <span>al {rumbo.letras}</span>}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
