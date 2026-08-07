import React, { useState } from "react";

import { formatearNivel, formatearTendencia } from "../api.js";
import { descargarInformeRuta } from "../exportarInformeRuta.js";

// Que quiere decir cada veredicto, en el orden en que le importa al operador:
// primero si sale o no sale, despues cuanto puede cargar.
const VEREDICTOS = {
  viable: { texto: "Carga completa", clase: "ok", detalle: "El río da de sobra: el límite es el calado de diseño del buque." },
  limitada: { texto: "Carga limitada por el río", clase: "ajustado", detalle: "El punto crítico obliga a salir con menos calado del que aguanta el buque." },
  sin_carga: { texto: "No puede cargar", clase: "critico", detalle: "Con el agua de hoy el buque no llega a levantar carga en este trayecto." },
  inviable: { texto: "No pasa", clase: "critico", detalle: "No hay agua suficiente ni para pasar en lastre." },
  sin_embarcacion: { texto: "Sin embarcación", clase: "neutro", detalle: "Asociá una embarcación para calcular calado y toneladas." },
  sin_ficha: { texto: "Ficha incompleta", clase: "neutro", detalle: "Faltan datos de la embarcación para calcular la carga." },
  sin_datos: { texto: "Sin datos", clase: "neutro", detalle: "Ninguna estación del trayecto aporta un calado disponible." },
};

const VEREDICTO_ESTACION = { critico: "Punto crítico", ajustado: "Ajustado", ok: "OK", sin_datos: "Sin dato" };

const formatearToneladas = (valor) =>
  typeof valor === "number" ? valor.toLocaleString("es-AR", { maximumFractionDigits: 0 }) : "—";

const formatearPies = (valor) => (typeof valor === "number" ? `${valor.toFixed(1)} ft` : "—");

export default function TarjetaRuta({ ruta, unidadNivel, onEditar, onEliminar, onCambiarProfundidad }) {
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [tramoEnEdicion, setTramoEnEdicion] = useState(null);
  const [valorProfundidad, setValorProfundidad] = useState("");
  // El primer click baja el chunk de jsPDF, asi que puede tardar un momento:
  // sin esto el boton parece que no hizo nada y se lo aprieta de nuevo.
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState("");

  async function exportarInforme() {
    setErrorExportar("");
    setExportando(true);
    try {
      await descargarInformeRuta(ruta);
    } catch (e) {
      setErrorExportar(`No se pudo generar el informe: ${e.message}`);
    } finally {
      setExportando(false);
    }
  }

  const veredicto = VEREDICTOS[ruta.veredicto] ?? VEREDICTOS.sin_datos;
  const origen = ruta.estaciones?.[0];
  const destino = ruta.estaciones?.[ruta.estaciones.length - 1];

  const carga = ruta.carga_min_t === ruta.carga_max_t
    ? formatearToneladas(ruta.carga_max_t)
    : `${formatearToneladas(ruta.carga_min_t)} – ${formatearToneladas(ruta.carga_max_t)}`;

  function empezarAEditar(tramo) {
    setTramoEnEdicion(tramo.tramo);
    setValorProfundidad(String(tramo.profundidad_pies ?? ""));
  }

  function confirmarProfundidad(tramo) {
    const numero = Number(valorProfundidad);
    setTramoEnEdicion(null);
    // Volver al sugerido se hace borrando el campo; un valor invalido o igual
    // al que ya estaba no dispara un guardado al pedo.
    const nuevo = valorProfundidad.trim() === "" ? null : numero;
    if (nuevo !== null && (!Number.isFinite(numero) || numero <= 0)) return;
    if (nuevo === (tramo.es_propia ? tramo.profundidad_pies : null)) return;
    onCambiarProfundidad(ruta, tramo.tramo, nuevo);
  }

  return (
    <article className="tarjeta-ruta">
      <header className="tarjeta-ruta-cabecera">
        <div>
          <h3>{ruta.nombre}</h3>
          <p className="tarjeta-ruta-trayecto">
            {origen} ➔ {destino} · {ruta.estaciones?.length ?? 0} estaciones ·{" "}
            {ruta.sentido === "ascendente" ? "subiendo" : "bajando"}
            {ruta.embarcacion ? ` · ${ruta.embarcacion.nombre}` : " · sin embarcación"}
            {ruta.embarcacion?.cantidad_barcazas ? ` (${ruta.embarcacion.cantidad_barcazas} barcazas)` : ""}
          </p>
        </div>
        <span className={`chip-veredicto ${veredicto.clase}`}>{veredicto.texto}</span>
      </header>

      {/* El resumen en una frase ("Ruta X inviable hoy para Y, cuello de
          botella en Z") va solo en el informe exportado, no aca: en pantalla
          los mismos datos ya estan abiertos en los KPIs de abajo. */}
      <p className="tarjeta-ruta-detalle-veredicto">{veredicto.detalle}</p>

      <div className="tarjeta-ruta-kpis">
        <div className="ruta-kpi">
          <span className="ruta-kpi-etiqueta">Calado admisible</span>
          <span className="ruta-kpi-valor">{formatearPies(ruta.calado_operativo_pies ?? ruta.calado_ruta_pies)}</span>
          <span className="ruta-kpi-sub">
            {ruta.limitado_por === "embarcacion"
              ? "lo limita el buque"
              : ruta.limitado_por === "rio"
                ? "lo limita el río"
                : "según el río"}
          </span>
        </div>
        <div className="ruta-kpi">
          <span className="ruta-kpi-etiqueta">Punto crítico</span>
          <span className="ruta-kpi-valor">{ruta.punto_critico?.estacion ?? "—"}</span>
          <span className="ruta-kpi-sub">
            {ruta.punto_critico
              ? `${formatearNivel(ruta.punto_critico.nivel_actual_m, unidadNivel)} · ${formatearPies(ruta.punto_critico.calado_disponible_pies)} disponibles`
              : "sin datos"}
          </span>
        </div>
        <div className="ruta-kpi">
          <span className="ruta-kpi-etiqueta">Carga estimada</span>
          <span className="ruta-kpi-valor">{ruta.carga_max_t != null ? `${carga} t` : "—"}</span>
          <span className="ruta-kpi-sub">
            {ruta.aprovechamiento_pct != null
              ? `${ruta.aprovechamiento_pct}% del DWT (${formatearToneladas(ruta.dwt_max_t)} t)`
              : "necesita embarcación"}
          </span>
        </div>
        <div className="ruta-kpi">
          <span className="ruta-kpi-etiqueta">Sensibilidad</span>
          <span className="ruta-kpi-valor">
            {ruta.toneladas_por_cm != null ? `${formatearToneladas(ruta.toneladas_por_cm)} t` : "—"}
          </span>
          <span className="ruta-kpi-sub">por cada cm de río</span>
        </div>
      </div>

      {ruta.advertencias?.length > 0 && (
        <ul className="ruta-advertencias">
          {ruta.advertencias.map((texto) => (
            <li key={texto}>{texto}</li>
          ))}
        </ul>
      )}

      {ruta.tramos_usados?.length > 0 && (
        <div className="ruta-tramos">
          <span className="ruta-tramos-titulo">Profundidad garantizada por tramo</span>
          {ruta.tramos_usados.map((tramo) => (
            <div key={tramo.tramo} className="ruta-tramo">
              <span className="ruta-tramo-nombre">{tramo.nombre}</span>
              {tramoEnEdicion === tramo.tramo ? (
                <span className="ruta-tramo-edicion">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    autoFocus
                    value={valorProfundidad}
                    onChange={(e) => setValorProfundidad(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmarProfundidad(tramo);
                      if (e.key === "Escape") setTramoEnEdicion(null);
                    }}
                    placeholder={String(tramo.profundidad_sugerida_pies ?? "")}
                  />
                  <button type="button" className="boton-fila" onClick={() => confirmarProfundidad(tramo)}>
                    Aplicar
                  </button>
                  <button type="button" className="boton-fila" onClick={() => setTramoEnEdicion(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <span className="ruta-tramo-valor">
                  <strong>{tramo.profundidad_pies != null ? `${tramo.profundidad_pies} ft` : "sin dato"}</strong>
                  <span className={`ruta-tramo-origen${tramo.es_propia ? " propia" : ""}`}>
                    {tramo.es_propia ? `propia (sugerida ${tramo.profundidad_sugerida_pies} ft)` : "sugerida"}
                  </span>
                  <button
                    type="button"
                    className="boton-lapiz"
                    onClick={() => empezarAEditar(tramo)}
                    aria-label={`Editar profundidad de ${tramo.nombre}`}
                    title="Editar la profundidad de este tramo"
                  >
                    ✎
                  </button>
                </span>
              )}
            </div>
          ))}
          <p className="ruta-tramos-nota">
            Los valores sugeridos salen de una tabla de referencia, no de una carta náutica
            oficial. Si Prefectura limitó un paso o hay una draga parada, corregí el número
            acá: manda el tuyo.
          </p>
        </div>
      )}

      <div className="tarjeta-ruta-acciones">
        {/* El informe sale siempre en metros para el nivel y pies para el
            calado, sin importar la preferencia de unidad del usuario: lo lee
            un tercero (el capitán, el jefe de operaciones) en las mismas
            unidades en que vienen los partes. */}
        <button
          type="button"
          className="boton-primario"
          disabled={exportando}
          onClick={exportarInforme}
        >
          {exportando ? "Generando…" : "Exportar informe (PDF)"}
        </button>
        <button type="button" className="boton-secundario" onClick={() => setDetalleAbierto((v) => !v)}>
          {detalleAbierto ? "Ocultar estaciones" : `Ver las ${ruta.estaciones_detalle?.length ?? 0} estaciones`}
        </button>
        <button type="button" className="boton-fila" onClick={() => onEditar(ruta)}>Editar</button>
        <button type="button" className="boton-fila boton-fila-peligro" onClick={() => onEliminar(ruta.id)}>
          Eliminar
        </button>
      </div>

      {errorExportar && <p className="mensaje-error">{errorExportar}</p>}

      {detalleAbierto && (
        <div className="tabla-contenedor">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Estación</th>
                <th>Río</th>
                <th className="num">Nivel</th>
                <th>Tendencia</th>
                <th className="num">Prof. tramo</th>
                <th className="num">Calado disponible</th>
                <th className="num">Margen</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ruta.estaciones_detalle?.map((d, indice) => {
                const tendencia = formatearTendencia(d.tendencia_diferencia_m ?? d.tendencia, unidadNivel);
                return (
                  <tr key={d.estacion} className={d.veredicto === "critico" ? "fila-critica" : ""}>
                    <td>{indice + 1}</td>
                    <td>{d.estacion}</td>
                    <td>{d.rio ?? "—"}</td>
                    <td className="num">{formatearNivel(d.nivel_actual_m, unidadNivel)}</td>
                    <td className={`tendencia ${tendencia.clase}`}>{tendencia.texto}</td>
                    <td className="num">
                      {d.profundidad_garantizada_pies != null ? `${d.profundidad_garantizada_pies} ft` : "—"}
                    </td>
                    <td className="num">{formatearPies(d.calado_disponible_pies)}</td>
                    <td className="num">
                      {d.margen_sobre_critico_m != null
                        ? formatearNivel(d.margen_sobre_critico_m, unidadNivel)
                        : "—"}
                    </td>
                    <td className={`veredicto-estacion ${d.veredicto}`} title={d.motivo_sin_calado ?? ""}>
                      {VEREDICTO_ESTACION[d.veredicto] ?? d.veredicto}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
