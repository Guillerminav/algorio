import React, { useRef, useState } from "react";

import { pedirJSON } from "../api.js";

import { fotoImposible, redimensionar, TIPOS_ACEPTADOS } from "../fotos.js";
import FormularioFicha from "./FormularioFicha.jsx";
import { ETIQUETAS_ESTADO, tipoDe } from "./tiposComercio.js";

// Cuantas fotos se pueden tener. Tiene que coincidir con
// almacen_fotos.MAX_FOTOS del backend, que es el que manda.
const MAX_FOTOS = 8;

/**
 * Las fotos de la ficha: se suben como archivo.
 *
 * Antes esto era un campo para pegar una URL, con el texto "pegá el link de
 * una foto tuya ya publicada (Instagram, Drive, tu web)". Era pedirle a la
 * gente algo que no puede funcionar: un link de Instagram es una pagina, no un
 * archivo, y el navegador termina con ERR_TOO_MANY_REDIRECTS. Ahora se elige
 * la foto del telefono y listo.
 *
 * La foto se achica en el navegador ANTES de subirla (ver fotos.js): una foto
 * de celular son 4 a 8 MB y mandarlas enteras desde un muelle no termina
 * nunca. Quedan en 200-400 KB.
 *
 * Subir y publicar son dos cosas distintas: la foto se guarda al elegirla y la
 * URL se agrega a la lista, pero la ficha recien cambia cuando se toca
 * "Guardar cambios". Asi se pueden subir tres, borrar una y despues decidir.
 */
function EditorFotos({ poiId, fotos, onCambiar }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  // Las que el navegador no pudo cargar. Antes se escondian con
  // `display: none` en el onError, y ese era el peor comportamiento posible:
  // el comerciante no veia nada raro y se iba convencido de que su foto estaba
  // publicada mientras el nauta no veia ninguna.
  const [rotas, setRotas] = useState({});
  const entrada = useRef(null);

  const actuales = fotos ?? [];
  const lleno = actuales.length >= MAX_FOTOS;

  async function elegir(evento) {
    const archivos = [...(evento.target.files ?? [])];
    // El input se limpia enseguida: sin esto, elegir la MISMA foto dos veces
    // seguidas no dispara el onChange y parece que la app se colgo.
    evento.target.value = "";
    if (archivos.length === 0) return;

    setError("");
    setSubiendo(true);
    const subidas = [];
    try {
      for (const archivo of archivos.slice(0, MAX_FOTOS - actuales.length)) {
        const blob = await redimensionar(archivo);
        const cuerpo = new FormData();
        cuerpo.append("archivo", blob, "foto.jpg");
        // Sin Content-Type a mano: el navegador tiene que ponerlo con el
        // `boundary` del multipart, y fijarlo rompe el parseo del lado del
        // servidor.
        const { url } = await pedirJSON(`/api/mis-comercios/${poiId}/fotos`, {
          method: "POST",
          body: cuerpo,
        });
        subidas.push(url);
      }
      if (subidas.length > 0) onCambiar([...actuales, ...subidas]);
      if (archivos.length > subidas.length) {
        setError(`Solo entraron ${subidas.length}: el máximo es ${MAX_FOTOS} fotos.`);
      }
    } catch (e) {
      // Lo que ya se subio se conserva: si fallo la cuarta, no tiene sentido
      // hacerle perder las tres primeras.
      if (subidas.length > 0) onCambiar([...actuales, ...subidas]);
      setError(e.message || "No pudimos subir la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <fieldset className="grupo-campos" aria-label="Fotos">
      <legend>Fotos</legend>
      <p className="descripcion">
        Elegí las fotos desde tu teléfono o tu computadora. La primera es la que se ve en
        el mapa. Hasta {MAX_FOTOS}.
      </p>

      {actuales.length > 0 && (
        <ul className="grilla-fotos">
          {actuales.map((url, indice) => (
            <li key={`${url}-${indice}`} className={rotas[url] ? "foto-rota" : undefined}>
              {rotas[url] ? (
                <div className="foto-rota-aviso">
                  <span aria-hidden="true">⚠</span>
                  <span>
                    No carga.{" "}
                    {fotoImposible(url)
                      ? "Es un link de una red social, y esas no dejan mostrar sus fotos desde afuera."
                      : "Ese link no es una imagen."}{" "}
                    Borrala y subí el archivo.
                  </span>
                </div>
              ) : (
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  onError={() => setRotas((p) => ({ ...p, [url]: true }))}
                />
              )}

              {indice === 0 && !rotas[url] && <span className="foto-principal">Principal</span>}

              <button
                type="button"
                className="foto-quitar"
                aria-label={`Quitar la foto ${indice + 1}`}
                onClick={() => {
                  onCambiar(actuales.filter((_, i) => i !== indice));
                  setError("");
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={entrada}
        type="file"
        accept={TIPOS_ACEPTADOS.join(",")}
        multiple
        className="oculto"
        onChange={elegir}
      />
      <div className="fila-acciones">
        <button
          type="button"
          className="boton-secundario"
          disabled={subiendo || lleno}
          onClick={() => entrada.current?.click()}
        >
          {subiendo ? "Subiendo…" : actuales.length === 0 ? "Elegir fotos" : "Agregar otra"}
        </button>
        {lleno && <span className="descripcion">Llegaste al máximo de {MAX_FOTOS}.</span>}
      </div>

      {error && <p className="mensaje-error">{error}</p>}
    </fieldset>
  );
}

/**
 * "Mi comercio": los datos base de la ficha, editables.
 *
 * Trabaja sobre una copia local y solo manda lo que cambio al apretar
 * Guardar. Guardar en cada tecla mandaria decenas de PUT y, peor, cada cambio
 * de nombre o de ubicacion devolveria la ficha a revision mientras se escribe.
 */
export default function MiComercio({ comercio, onGuardar, onEliminado, guardando }) {
  const [valores, setValores] = useState(comercio);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const definicion = tipoDe(comercio.tipo);
  const cambiar = (parcial) => {
    setValores((previos) => ({ ...previos, ...parcial }));
    setMensaje("");
  };

  // Compara contra la ficha guardada, no contra el primer render: despues de
  // guardar, `comercio` llega actualizado y el boton vuelve a apagarse solo.
  // Sin "tipo": el rubro se elige en el alta y despues queda atado al comercio
  // (el backend lo rechaza igual, ver pois.CAMPOS_EDITABLES).
  const CAMPOS = ["nombre", "descripcion", "lat", "lon", "telefono", "whatsapp", "instagram", "fotos", "servicios"];
  const hayCambios = CAMPOS.some(
    (campo) => JSON.stringify(valores[campo] ?? null) !== JSON.stringify(comercio[campo] ?? null),
  );

  // Cambiar nombre o ubicacion vuelve a mandar la ficha a revision (lo decide
  // el backend, ver pois.actualizar). Se avisa antes de guardar para que no sea
  // una sorpresa: nadie espera que corregir un typo lo saque del mapa.
  const volveraARevision =
    comercio.estado === "aprobado" &&
    ["nombre", "lat", "lon"].some(
      (campo) => JSON.stringify(valores[campo] ?? null) !== JSON.stringify(comercio[campo] ?? null),
    );

  async function guardar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    const cambios = Object.fromEntries(
      CAMPOS.filter((campo) => JSON.stringify(valores[campo] ?? null) !== JSON.stringify(comercio[campo] ?? null))
        .map((campo) => [campo, valores[campo]]),
    );
    try {
      await onGuardar(cambios);
      setMensaje("Listo, guardamos los cambios.");
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    }
  }

  return (
    <>
      <form className="panel-comercio" onSubmit={guardar}>
      <p className="descripcion">
        {definicion.etiqueta} · <span className={`chip-publicacion estado-${comercio.estado}`}>
          {ETIQUETAS_ESTADO[comercio.estado] ?? comercio.estado}
        </span>
      </p>

      {/* El rubro se muestra pero no se edita: quedo atado a este comercio en el
          alta. Se aclara con todas las letras en vez de esconderlo — quien lo
          busque para cambiarlo merece enterarse de por que no esta, y no
          pensar que la pantalla se rompio. */}
      <p className="nota-rubro-fijo">
        El rubro queda asociado a este comercio desde el alta y no se puede cambiar:
        define qué pantallas tiene y cómo se dibuja su pin en el mapa. Si querés otro
        rubro, cargalo como un comercio aparte.
      </p>

      <FormularioFicha valores={valores} onCambiar={cambiar} mostrarTipo={false} />
      <EditorFotos
        poiId={comercio.id}
        fotos={valores.fotos}
        onCambiar={(fotos) => cambiar({ fotos })}
      />

      {volveraARevision && (
        <div className="aviso-revision">
          Cambiaste el nombre o la ubicación: la ficha vuelve a revisión y no se va a ver
          en el mapa hasta que la aprobemos de nuevo.
        </div>
      )}

      {error && <div className="mensaje-error">{error}</div>}
      {mensaje && <div className="mensaje-ok">{mensaje}</div>}

      <div className="fila-acciones">
        <button type="submit" disabled={!hayCambios || guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
      </form>

      <ZonaRiesgo comercio={comercio} onEliminado={onEliminado} />
    </>
  );
}

/**
 * Eliminar el comercio. Abajo de todo, apartado y en rojo.
 *
 * Está separado del formulario —y no es un botón más en la fila de acciones—
 * porque no es una edición: es la única acción de esta pantalla que no se
 * puede deshacer y que se lleva puestas cosas que no son del comerciante. Al
 * borrar el POI caen con él las reseñas, las visitas y las fotos
 * (ON DELETE CASCADE, ver db.py), así que las reseñas que dejaron los nautas
 * desaparecen sin que nadie les avise.
 *
 * Por eso se confirma escribiendo el nombre y no con un "¿estás seguro?": el
 * sí automático de un confirm() se toca sin leerlo, y tipear el nombre del
 * propio parador obliga a mirar qué se está por borrar. Es el mismo gesto que
 * pide GitHub para borrar un repo, por la misma razón.
 *
 * Vive fuera del <form> a propósito: adentro, cualquier botón sin type sería
 * un submit y el Enter del campo guardaría la ficha en vez de confirmar.
 */
function ZonaRiesgo({ comercio, onEliminado }) {
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  const nombre = (comercio.nombre ?? "").trim();
  const coincide = texto.trim().toLocaleLowerCase() === nombre.toLocaleLowerCase();

  async function eliminar() {
    setError("");
    setEliminando(true);
    try {
      await pedirJSON(`/api/mis-comercios/${comercio.id}`, { method: "DELETE" });
      onEliminado();
    } catch (e) {
      setError(e.message || "No pudimos eliminar el comercio.");
      setEliminando(false);
    }
  }

  return (
    <section className="zona-riesgo">
      <h3>Eliminar el comercio</h3>
      <p>
        <strong>{nombre}</strong> se va del mapa y se borran sus reseñas, sus fotos y las
        visitas que tenés en Métricas. No se puede deshacer.
      </p>
      {/* La alternativa, dicha acá y no en Ayuda: la mayoría de las veces que
          alguien busca este botón lo que quiere es dejar de figurar un tiempo,
          no perder tres años de reseñas. */}
      <p className="zona-riesgo-alternativa">
        Si solo querés dejar de aparecer por un tiempo, no hace falta borrar nada: vaciá
        los horarios y tu ficha va a figurar como cerrada.
      </p>

      {error && <div className="mensaje-error">{error}</div>}

      {confirmando ? (
        <>
          <label className="zona-riesgo-campo">
            <span>
              Escribí <strong>{nombre}</strong> para confirmar
            </span>
            <input
              type="text"
              autoComplete="off"
              value={texto}
              disabled={eliminando}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
          <div className="fila-acciones">
            <button
              type="button"
              className="boton-secundario"
              disabled={eliminando}
              onClick={() => {
                setConfirmando(false);
                setTexto("");
                setError("");
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="boton-peligro"
              disabled={!coincide || eliminando}
              onClick={eliminar}
            >
              {eliminando ? "Eliminando…" : "Eliminar para siempre"}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="boton-peligro" onClick={() => setConfirmando(true)}>
          Eliminar comercio
        </button>
      )}
    </section>
  );
}
