import React, { useState } from "react";

import { pedirJSON } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetchLista } from "../hooks/useFetchLista.js";
import { haceCuanto, tipoPoi, tipoReporte, vigenciaRestante } from "./constantes.js";
import { Estrellas } from "./piezas.jsx";
import SelectorEmbarcacion from "./SelectorEmbarcacion.jsx";

/**
 * Los avisos que dejó este nauta, incluidos los vencidos.
 *
 * Los vencidos se muestran acá (y no en el mapa) justamente para poder
 * renovarlos: un banco de arena real no deja de existir porque pasaron 24
 * horas, y sin esta pantalla la única forma de sostenerlo sería volver a
 * cargarlo desde cero.
 */
function MisReportes() {
  const { datos: reportes, cargando, error, recargar } = useFetchLista("/api/mis-reportes");
  const [enCurso, setEnCurso] = useState(null);

  async function accionar(reporte, accion) {
    setEnCurso(reporte.id);
    try {
      if (accion === "renovar") {
        await pedirJSON(`/api/reportes/${reporte.id}/renovar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duracion_horas: 24 }),
        });
      } else {
        await pedirJSON(`/api/reportes/${reporte.id}`, { method: "DELETE" });
      }
      recargar();
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <div className="tarjeta-nauta">
      <h3>Mis reportes</h3>
      <p className="descripcion">
        Se borran solos cuando vencen; si lo que reportaste
        sigue estando, renovalo.
      </p>

      {error && <div className="mensaje-error">{error.message}</div>}
      {cargando && <div className="estado">Cargando…</div>}
      {!cargando && !error && reportes.length === 0 && (
        <p className="estado">Todavía no reportaste nada.</p>
      )}

      <ul className="lista-mis-reportes">
        {reportes.map((reporte) => {
          const definicion = tipoReporte(reporte.tipo);
          return (
            <li key={reporte.id} className={reporte.vencido ? "vencido" : undefined}>
              <span aria-hidden="true">{definicion.emoji}</span>
              <div className="mi-reporte-datos">
                <div className="mi-reporte-titulo">
                  {reporte.detalle || definicion.etiqueta}
                </div>
                <div className="mi-reporte-meta">
                  {haceCuanto(reporte.creado_en)} ·{" "}
                  {reporte.vencido ? "vencido" : vigenciaRestante(reporte.vence_en)}
                </div>
              </div>
              <div className="mi-reporte-acciones">
                <button
                  type="button"
                  disabled={enCurso === reporte.id}
                  onClick={() => accionar(reporte, "renovar")}
                >
                  Sigue estando
                </button>
                <button
                  type="button"
                  disabled={enCurso === reporte.id}
                  onClick={() => accionar(reporte, "borrar")}
                >
                  Borrar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function PerfilNauta({ onVerLugar }) {
  const { usuario, actualizarPerfil } = useAuth();
  const { datos: misResenas, error, cargando } = useFetchLista("/api/mis-resenas");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorGuardado, setErrorGuardado] = useState("");

  async function cambiarEmbarcacion(clave) {
    if (clave === usuario?.tipo_embarcacion) return;
    setGuardando(true);
    setMensaje("");
    setErrorGuardado("");
    try {
      await actualizarPerfil({ tipo_embarcacion: clave });
      setMensaje("Listo, ya recalibramos los avisos de viento.");
    } catch (e) {
      setErrorGuardado(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="perfil-nauta">
      <div className="tarjeta-nauta">
        <h3>¿Con qué salís?</h3>
        <p className="descripcion">
          Define desde qué viento te avisamos que el río está picado.
        </p>
        <SelectorEmbarcacion
          valor={usuario?.tipo_embarcacion}
          onCambiar={cambiarEmbarcacion}
          deshabilitado={guardando}
        />
        {errorGuardado && <div className="mensaje-error">{errorGuardado}</div>}
        {mensaje && <div className="mensaje-ok">{mensaje}</div>}
      </div>

      <div className="tarjeta-nauta">
        <h3>Mis reseñas</h3>
        {error && <div className="mensaje-error">{error.message}</div>}
        {cargando && <div className="estado">Cargando…</div>}
        {!cargando && !error && misResenas.length === 0 && (
          <p className="estado">Todavía no puntuaste ningún lugar.</p>
        )}
        <ul className="lista-resenas">
          {misResenas.map((resena) => (
            <li key={resena.id}>
              <div className="resena-encabezado">
                <button
                  type="button"
                  className="enlace-boton"
                  onClick={() => onVerLugar(resena.poi_id)}
                >
                  {tipoPoi(resena.poi_tipo).emoji} {resena.poi_nombre}
                </button>
                <Estrellas puntaje={resena.puntaje} tamano={13} />
              </div>
              {resena.comentario && <p className="resena-comentario">{resena.comentario}</p>}
            </li>
          ))}
        </ul>
      </div>

      <MisReportes />

      <div className="tarjeta-nauta tarjeta-app">
        <h3>Llevátelo al río</h3>
        <p className="descripcion">
          Esto mismo funciona mejor desde el celular: la app usa el GPS en vivo y el
          mapa satelital a pantalla completa. Ingresás con este mismo usuario y
          contraseña, y tus reseñas te siguen.
        </p>
      </div>
    </div>
  );
}
