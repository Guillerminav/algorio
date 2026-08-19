import React, { useCallback, useEffect, useState } from "react";

import { formatearFecha, pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  DIAS,
  enlaceComoLlegar,
  enlaceWhatsApp,
  estadoApertura,
  formatearDistancia,
  tipoPoi,
} from "./constantes.js";
import ModalResena from "./ModalResena.jsx";
import { Estrellas } from "./piezas.jsx";

// Cada acción de contacto se cuenta antes de salir de la página: es la métrica
// que el comerciante ve en su panel. Se dispara sin await ni catch — si el
// conteo falla, el enlace tiene que abrirse igual (ver pois.registrar_visita).
function registrarVisita(poiId, tipo) {
  pedirJSON(`/api/pois/${poiId}/visita`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo }),
  }).catch(() => {});
}

function Acciones({ lugar }) {
  const acciones = [
    lugar.whatsapp && {
      clave: "whatsapp",
      etiqueta: "WhatsApp",
      emoji: "💬",
      href: enlaceWhatsApp(lugar.whatsapp),
    },
    lugar.telefono && {
      clave: "telefono",
      etiqueta: "Llamar",
      emoji: "📞",
      href: `tel:${lugar.telefono}`,
    },
    {
      clave: "como_llegar",
      etiqueta: "Cómo llegar",
      emoji: "🧭",
      href: enlaceComoLlegar(lugar.lat, lugar.lon),
    },
  ].filter(Boolean);

  return (
    <div className="acciones-lugar">
      {acciones.map((accion) => (
        <a
          key={accion.clave}
          className="accion-lugar"
          href={accion.href}
          target="_blank"
          rel="noreferrer"
          onClick={() => registrarVisita(lugar.id, accion.clave)}
        >
          <span className="accion-lugar-emoji">{accion.emoji}</span>
          {accion.etiqueta}
        </a>
      ))}
    </div>
  );
}

/**
 * La ficha completa de un lugar, en el panel lateral del mapa.
 *
 * Pide el detalle por su cuenta y no lo recibe del mapa: la lista de pines
 * trae lo justo para dibujar el marcador, mientras que acá hacen falta el
 * menú, los horarios y las reseñas.
 */
export default function PanelLugar({ poiId, onCerrar }) {
  const { usuario } = useAuth();
  const [lugar, setLugar] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLugar(await pedirJSON(`/api/pois/${poiId}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [poiId]);

  useEffect(() => {
    setCargando(true);
    setError("");
    setLugar(null);
    cargar();
    // Abrir la ficha es la métrica base del comerciante.
    registrarVisita(poiId, "ficha");
  }, [cargar, poiId]);

  if (cargando) {
    return (
      <aside className="panel-lugar">
        <button type="button" className="boton-cerrar-panel" title="Cerrar" onClick={onCerrar}>✕</button>
        <div className="estado">Cargando…</div>
      </aside>
    );
  }

  if (error || !lugar) {
    return (
      <aside className="panel-lugar">
        <button type="button" className="boton-cerrar-panel" title="Cerrar" onClick={onCerrar}>✕</button>
        <div className="mensaje-error">{error || "No pudimos abrir este lugar."}</div>
      </aside>
    );
  }

  const definicion = tipoPoi(lugar.tipo);
  const apertura = estadoApertura(lugar.horarios);
  const distancia = formatearDistancia(lugar.distancia_km);
  const miResena = lugar.resenas.find((r) => r.usuario === usuario?.usuario) ?? null;
  const esMio = lugar.usuario === usuario?.usuario;

  return (
    <aside className="panel-lugar">
      <button type="button" className="boton-cerrar-panel" title="Cerrar" onClick={onCerrar}>✕</button>

      {lugar.fotos?.length > 0 && (
        <div className="lugar-fotos">
          {lugar.fotos.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ))}
        </div>
      )}

      <span className="lugar-tipo" style={{ color: definicion.color }}>
        {definicion.emoji} {definicion.singular}
      </span>
      <h2 className="lugar-nombre">{lugar.nombre}</h2>

      <div className="lugar-meta">
        {lugar.puntaje_promedio === null || lugar.puntaje_promedio === undefined ? (
          <span>Sin reseñas todavía</span>
        ) : (
          <>
            <Estrellas puntaje={lugar.puntaje_promedio} tamano={14} />
            <span>
              {lugar.puntaje_promedio.toFixed(1)} · {lugar.cantidad_resenas}{" "}
              {lugar.cantidad_resenas === 1 ? "reseña" : "reseñas"}
            </span>
          </>
        )}
        {distancia && <span>· a {distancia}</span>}
      </div>

      {apertura && (
        <div className={`lugar-apertura ${apertura.abierto ? "abierto" : "cerrado"}`}>
          {apertura.texto}
        </div>
      )}

      {lugar.descripcion && <p className="lugar-descripcion">{lugar.descripcion}</p>}

      <Acciones lugar={lugar} />

      {lugar.servicios?.length > 0 && (
        <div className="lugar-bloque">
          <h3>Servicios</h3>
          <div className="chips-servicios">
            {lugar.servicios.map((servicio) => (
              <span key={servicio} className="chip-servicio-lectura">{servicio}</span>
            ))}
          </div>
        </div>
      )}

      {lugar.menu?.length > 0 && (
        <div className="lugar-bloque">
          {lugar.menu.map((seccion, i) => (
            <div key={i} className="lugar-menu-seccion">
              {seccion.seccion && <h3>{seccion.seccion}</h3>}
              {(seccion.items ?? []).map((item, j) => (
                <div key={j} className="lugar-menu-item">
                  <span>{item.nombre}</span>
                  {item.precio && <strong>${item.precio}</strong>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {lugar.horarios && Object.keys(lugar.horarios).length > 0 && (
        <div className="lugar-bloque">
          <h3>Horarios</h3>
          {DIAS.map(([clave, etiqueta]) => {
            const dia = lugar.horarios[clave];
            if (!dia) return null;
            return (
              <div key={clave} className="lugar-horario-fila">
                <span>{etiqueta}</span>
                <span className="lugar-horario-valor">
                  {dia.cerrado ? "Cerrado" : `${dia.abre} a ${dia.cierra}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="lugar-bloque">
        <h3>Reseñas</h3>

        {/* Al dueño no se le ofrece reseñar: el backend lo rechaza igual, y
            un botón que siempre falla es peor que no mostrarlo. */}
        {!esMio && (
          <button type="button" className="boton-secundario" onClick={() => setModalAbierto(true)}>
            {miResena ? "Editar mi reseña" : "Escribir una reseña"}
          </button>
        )}

        {lugar.resenas.length === 0 ? (
          <p className="estado">Todavía nadie escribió nada. Podés ser el primero.</p>
        ) : (
          <ul className="lista-resenas">
            {lugar.resenas.map((resena) => (
              <li key={resena.id}>
                <div className="resena-encabezado">
                  <strong>{resena.autor}</strong>
                  <Estrellas puntaje={resena.puntaje} tamano={13} />
                  <span className="resena-fecha">{formatearFecha(resena.creado_en)}</span>
                </div>
                {resena.comentario && <p className="resena-comentario">{resena.comentario}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalAbierto && (
        <ModalResena
          poiId={lugar.id}
          resenaPropia={miResena}
          onCerrar={() => setModalAbierto(false)}
          onGuardada={cargar}
        />
      )}
    </aside>
  );
}
