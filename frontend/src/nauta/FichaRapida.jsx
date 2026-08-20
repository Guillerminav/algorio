import React from "react";

import Brujula from "./Brujula.jsx";
import { estadoApertura, tipoPoi } from "./constantes.js";
import { Estrellas } from "./piezas.jsx";
import { distanciaEnTexto, haciaElLugar } from "./rumbo.js";
import { estadoCruce, faltanEnTexto, proximoCruce } from "../tablero.js";

/**
 * El renglon de tablero de una lancha-taxi: cual es el proximo cruce que sale
 * y cuando.
 *
 * Es el equivalente de "abierto hasta las 20" de un parador: el dato por el
 * que se toco el pin. El tablero completo —frecuencia, precio, ultimo
 * regreso— queda detras de "Ver mas", igual que la carta.
 */
function ProximoCruce({ cruces }) {
  const proximo = proximoCruce(cruces);
  if (!proximo) return null;

  const { cruce, salida } = proximo;
  const estado = estadoCruce(cruce.estado);

  return (
    <div className="ficha-rapida-cruce">
      <span className="ficha-rapida-cruce-hora">{salida.estimada ?? salida.hora}</span>
      <div className="ficha-rapida-cruce-texto">
        <strong>{cruce.destino}</strong>
        <span>{faltanEnTexto(salida.faltan)}</span>
      </div>
      {estado.alterado && (
        <span className="ficha-rapida-cruce-estado" style={{ "--tono-estado": estado.color }}>
          {estado.etiqueta}
        </span>
      )}
    </div>
  );
}

/**
 * La ventana de abajo al tocar un pin.
 *
 * Es el primer escalón: nombre, rubro, puntaje, si está abierto y —lo que de
 * verdad importa arriba de una lancha— a cuánto está y para qué lado. Las
 * reseñas, la carta y los horarios completos quedan detrás de "Ver más".
 *
 * Antes el click en un pin abría directamente el panel completo al costado.
 * Eso está bien con mouse y pantalla ancha, pero en un celular tapaba el mapa
 * entero para contestar algo que casi siempre se resuelve con dos datos: si
 * está abierto y a cuánto está.
 *
 * Los datos salen de la lista que el mapa ya tiene cargada, así que la ventana
 * aparece sin esperar a ninguna consulta. El fetch de la ficha completa recién
 * ocurre al tocar "Ver más".
 */
export default function FichaRapida({ lugar, posicion, onVerMas, onCerrar }) {
  const definicion = tipoPoi(lugar.tipo);
  const apertura = estadoApertura(lugar.horarios);
  const rumbo = haciaElLugar(posicion, lugar);
  const distancia = rumbo?.texto ?? distanciaEnTexto(lugar.distancia_km);

  return (
    <div className="ficha-rapida" role="dialog" aria-label={lugar.nombre}>
      <button type="button" className="ficha-rapida-cerrar" onClick={onCerrar} aria-label="Cerrar">
        ✕
      </button>

      <div className="ficha-rapida-cabecera">
        <span className="ficha-rapida-emoji" aria-hidden="true">{definicion.emoji}</span>
        <div className="ficha-rapida-titulo">
          <strong>{lugar.nombre}</strong>
          <span>{definicion.singular}</span>
        </div>
      </div>

      <div className="ficha-rapida-meta">
        {lugar.puntaje_promedio !== null && lugar.puntaje_promedio !== undefined ? (
          <span className="ficha-rapida-puntaje">
            <Estrellas puntaje={lugar.puntaje_promedio} tamano={13} />
            {lugar.puntaje_promedio.toFixed(1)} ({lugar.cantidad_resenas})
          </span>
        ) : (
          <span>Sin reseñas</span>
        )}
        {apertura && (
          <span className={apertura.abierto ? "ficha-rapida-abierto" : "ficha-rapida-cerrado"}>
            {apertura.texto}
          </span>
        )}
      </div>

      <ProximoCruce cruces={lugar.cruces} />

      {/* Cómo llegar, pero para el agua. Sin ubicación no se inventa nada: se
          dicen las coordenadas, que es lo que se carga a mano en un GPS. */}
      {rumbo ? (
        <div className="ficha-rapida-rumbo">
          <Brujula grados={rumbo.grados} letras={rumbo.letras} tamano={64} />
          <div>
            <strong>{distancia}</strong>
            <span>rumbo {rumbo.letras} desde donde estás</span>
          </div>
        </div>
      ) : (
        <p className="ficha-rapida-sin-ubicacion">
          Sin tu ubicación no podemos decirte a cuánto está. Queda en{" "}
          {lugar.lat.toFixed(5)}, {lugar.lon.toFixed(5)}.
        </p>
      )}

      <button type="button" className="ficha-rapida-vermas" onClick={onVerMas}>
        Ver más
      </button>
    </div>
  );
}
