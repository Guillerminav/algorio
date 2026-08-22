import React, { useCallback, useEffect, useState } from "react";

import { pedirJSON } from "../api.js";
import ModeracionPois from "../admin/ModeracionPois.jsx";
import ModeracionReclamos from "../admin/ModeracionReclamos.jsx";
import MenuMovil from "../components/MenuMovil.jsx";
import ModalAyuda from "../components/ModalAyuda.jsx";
import ModalPerfil from "../components/ModalPerfil.jsx";
import PantallaSuscripcion from "../components/PantallaSuscripcion.jsx";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { ProveedorRio } from "../nauta/ContextoRio.jsx";
import ClimaNauta from "../nauta/ClimaNauta.jsx";
import MapaNauta from "../nauta/MapaNauta.jsx";
import NivelRio from "../nauta/NivelRio.jsx";
import InicioComercio from "./InicioComercio.jsx";
import EditorCarta from "./EditorCarta.jsx";
import EditorHorarios from "./EditorHorarios.jsx";
import EditorTablero from "./EditorTablero.jsx";
import MetricasComercio from "./MetricasComercio.jsx";
import MiComercio from "./MiComercio.jsx";
import ResenasComercio from "./ResenasComercio.jsx";
import SelectorComercio from "./SelectorComercio.jsx";
import { tipoDe } from "./tiposComercio.js";

// Tiene que coincidir con pois.MAX_COMERCIOS del backend, que es el que manda:
// aca solo apaga el boton para no ofrecer algo que el servidor va a rechazar.
const MAX_COMERCIOS = 3;

// Aviso de arriba de todo: el estado de publicacion es lo primero que el
// comerciante quiere saber al entrar ("¿ya me ven?").
function BannerEstado({ comercio }) {
  if (comercio.estado === "aprobado") return null;

  if (comercio.estado === "rechazado") {
    return (
      <div className="banner-estado rechazado">
        <strong>Tu ficha fue rechazada.</strong>{" "}
        {comercio.motivo_rechazo || "Escribinos por Ayuda si no sabés por qué."} Corregí lo
        que haga falta y se vuelve a revisar sola.
      </div>
    );
  }

  return (
    <div className="banner-estado pendiente">
      <strong>Tu ficha está en revisión.</strong> Todavía no se ve en el mapa. Mientras
      tanto podés dejar listo el menú, los horarios y las fotos.
    </div>
  );
}

export default function ShellComercio() {
  const { usuario, suscripcion } = useAuth();
  // Una cuenta puede tener varios comercios, de rubros distintos. El shell
  // guarda la lista y CUAL se esta mirando; todo lo demas —que secciones
  // existen, que se edita— sale del seleccionado.
  const [comercios, setComercios] = useState([]);
  const [idActivo, setIdActivo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState("ficha");
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [pendientes, setPendientes] = useState({ pois: 0, reclamos: 0 });

  // Cuánto hay esperando en cada cola de moderación, para el numerito del
  // menú. Se pide al entrar y cada vez que se cambia de sección: alcanza para
  // que el admin que está trabajando vea aparecer lo que entra, y no justifica
  // un polling contra el servidor cada treinta segundos.
  useEffect(() => {
    if (!usuario?.es_admin) return;
    let cancelado = false;
    pedirJSON("/api/admin/pendientes")
      .then((d) => !cancelado && setPendientes(d))
      // Sin catch visible: que no se pueda contar la cola no es motivo para
      // ensuciar la pantalla con un error. El numerito no aparece y ya.
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [usuario?.es_admin, seccionActiva]);

  useEffect(() => {
    let cancelado = false;
    pedirJSON("/api/mis-comercios")
      .then((lista) => {
        if (cancelado) return;
        setComercios(lista);
        // Se abre en el primero. Lista vacia es un estado normal —la cuenta
        // todavia no cargo ninguno— y no un error.
        setIdActivo((previo) =>
          lista.some((c) => c.id === previo) ? previo : (lista[0]?.id ?? null),
        );
      })
      .catch((e) => !cancelado && setErrorCarga(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  // El que se esta mirando. Se deriva de la lista y no se guarda aparte: con
  // dos copias del mismo comercio, guardar en una pantalla dejaba la otra
  // mostrando lo viejo.
  const comercio = comercios.find((c) => c.id === idActivo) ?? null;

  /** Reemplaza en la lista el que volvio del servidor. */
  const reemplazar = useCallback((actualizado) => {
    setComercios((previos) =>
      previos.map((c) => (c.id === actualizado.id ? actualizado : c)),
    );
    return actualizado;
  }, []);

  const agregar = useCallback((creado) => {
    setComercios((previos) => [...previos, creado]);
    setIdActivo(creado.id);
    return creado;
  }, []);

  const quitar = useCallback((id) => {
    setComercios((previos) => {
      const quedan = previos.filter((c) => c.id !== id);
      setIdActivo(quedan[0]?.id ?? null);
      return quedan;
    });
  }, []);

  // Un solo guardar para las cuatro pantallas de edicion: todas mandan un
  // PUT parcial al mismo endpoint y se quedan con la ficha que vuelve.
  const guardar = useCallback(
    async (cambios) => {
      setGuardando(true);
      try {
        return reemplazar(
          await pedirJSON(`/api/mis-comercios/${idActivo}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cambios),
          }),
        );
      } finally {
        setGuardando(false);
      }
    },
    [idActivo, reemplazar],
  );

  // El tablero de cruces tiene su propio endpoint y no viaja por el PUT de
  // arriba: es la unica edicion del panel que NO pasa por moderacion y que
  // nunca devuelve la ficha a 'pendiente' (ver backend/tablero.py). Separarlo
  // aca tambien es lo que evita que un cambio futuro en `guardar` le aplique
  // sin querer las reglas de la ficha.
  const guardarTablero = useCallback(
    async (cruces) => {
      setGuardando(true);
      try {
        return reemplazar(
          await pedirJSON(`/api/mis-comercios/${idActivo}/tablero`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cruces }),
          }),
        );
      } finally {
        setGuardando(false);
      }
    },
    [idActivo, reemplazar],
  );

  // Un solo interruptor. No toca `guardando`: el boton de "Guardar cambios"
  // del editor no tiene por que apagarse porque alguien marco una demora, que
  // es otra operacion y se resuelve sola.
  const cambiarEstadoCruce = useCallback(
    async (cruceId, cuerpo) =>
      reemplazar(
        await pedirJSON(
          `/api/mis-comercios/${idActivo}/tablero/${encodeURIComponent(cruceId)}/estado`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo),
          },
        ),
      ),
    [idActivo, reemplazar],
  );

  // El de UNA salida. `estado` en null le saca la marca propia y la devuelve a
  // seguir al recorrido, que es como se deshace sin afirmar otra cosa.
  const cambiarEstadoSalida = useCallback(
    async (cruceId, hora, cuerpo) =>
      reemplazar(
        await pedirJSON(
          `/api/mis-comercios/${idActivo}/tablero/${encodeURIComponent(cruceId)}/salidas/${encodeURIComponent(hora)}/estado`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo),
          },
        ),
      ),
    [idActivo, reemplazar],
  );

  if (cargando) return null;

  if (errorCarga) {
    return (
      <div className="app app-comercio">
        <div className="columna-principal">
          <main className={seccionActiva === "mapa" ? "main-mapa" : undefined}>
            <div className="mensaje-error">No pudimos cargar tu comercio: {errorCarga}</div>
          </main>
        </div>
      </div>
    );
  }

  // El acceso vencido gana sobre todo lo demas, incluso sobre el alta: no
  // tiene sentido dejar cargar una ficha nueva a una cuenta que no puede
  // publicarla.
  const sinAcceso = suscripcion !== null && suscripcion.tiene_acceso === false;
  if (sinAcceso) {
    return (
      <div className="app app-comercio">
        <div className="columna-principal">
          <TopBar
            titulo="Suscripción"
            onEditarPerfil={() => setModalPerfilAbierto(true)}
            onAbrirAyuda={() => setModalAyudaAbierto(true)}
            onVerSuscripcion={() => {}}
            onAbrirMenu={() => setMenuMovilAbierto(true)}
          />
          <main className={seccionActiva === "mapa" ? "main-mapa" : undefined}>
            <PantallaSuscripcion onAbrirAyuda={() => setModalAyudaAbierto(true)} />
          </main>
        </div>
        {modalPerfilAbierto && <ModalPerfil onCerrar={() => setModalPerfilAbierto(false)} />}
        {modalAyudaAbierto && <ModalAyuda onCerrar={() => setModalAyudaAbierto(false)} />}
      </div>
    );
  }

  // Sin ficha cargada el asistente de alta es la seccion "ficha" —lo resuelve
  // el `main`, que sin comercio monta InicioComercio— y NO una pantalla suelta
  // que reemplace al shell.
  //
  // Antes acá se cortaba y se devolvia el asistente a pantalla completa. Eso
  // dejaba a la cuenta sin barra lateral, y con ella se iban el Mapa del rio,
  // el Clima y el Nivel: quien todavia no cargo su ficha no podia ni mirar el
  // mapa —ni, desde ahi, abrir el tablero de cruces de una lancha-taxi por
  // "Ver mas"—, que no depende en nada de tener comercio propio.
  //
  // InicioComercio sigue decidiendo entre cargar, reclamar y esperar un
  // reclamo en curso; lo unico que cambia es que ahora vive adentro del shell.

  const definicion = tipoDe(comercio?.tipo);

  // Las pantallas de UN comercio. Cuelgan de el en la barra —cada comercio es
  // un desplegable con las suyas— porque son suyas y no de la cuenta: los
  // horarios, las metricas y las reseñas de un parador no tienen nada que ver
  // con las de la cabaña de al lado, aunque las administre la misma persona.
  const seccionesDeComercio = (c) => {
    const def = tipoDe(c.tipo);
    return [
      { id: "ficha", etiqueta: "Ficha" },
      // La carta es solo del parador: es el unico rubro con una lista de
      // precios que cambia seguido y que el nauta quiere ver antes de parar.
      // Una cabaña o una lancha-taxi cuentan lo suyo en la descripcion y en
      // los servicios, sin una pantalla mas que mantener.
      ...(def.tieneCarta ? [{ id: "carta", etiqueta: def.etiquetaCarta }] : []),
      // El tablero es solo de la lancha-taxi y va ARRIBA de los horarios: es
      // lo que el lanchero abre todos los dias (marcar una demora), mientras
      // que los horarios de atencion se cargan una vez y no se tocan mas.
      ...(def.tieneTablero ? [{ id: "tablero", etiqueta: "Tablero de cruces" }] : []),
      { id: "horarios", etiqueta: "Horarios" },
    ];
  };

  const seccionesActivas = comercio ? seccionesDeComercio(comercio) : [];

  /**
   * Cambia de comercio sin dejar la pantalla en una seccion que ese rubro no
   * tiene. Estando en "Menú" de un parador y saltando a la lancha-taxi, la
   * seccion desaparecia de la barra pero seguia activa: quedaba el editor de
   * carta abierto sobre una lancha.
   */
  const elegirComercio = (id) => {
    const destino = comercios.find((c) => c.id === id);
    setIdActivo(id);
    if (destino && !seccionesDeComercio(destino).some((s) => s.id === seccionActiva)) {
      setSeccionActiva("ficha");
    }
  };

  // El arbol de comercios va arriba de la barra y no adentro de una seccion:
  // cambia TODO lo que se ve —las metricas, las reseñas, el tablero—, asi que
  // no puede vivir dentro de una de las pantallas que cambia.
  const selector =
    comercios.length > 0 ? (
      <SelectorComercio
        comercios={comercios}
        activo={idActivo}
        seccionActiva={seccionActiva}
        seccionesDe={seccionesDeComercio}
        onElegir={elegirComercio}
        onElegirSeccion={setSeccionActiva}
        puedeAgregar={usuario?.es_admin || comercios.length < MAX_COMERCIOS}
        onAgregar={() => {
          setIdActivo(null);
          setSeccionActiva("ficha");
        }}
      />
    ) : null;

  // Las de la cuenta, que no cuelgan de ningun comercio. El orden importa:
  //
  //   1. Los COMERCIOS arriba de todo, cada uno con su desplegable de edicion.
  //      Es a lo que el comerciante entra: lo suyo primero.
  //   2. METRICAS y RESEÑAS, que son de la cuenta entera y no de un comercio:
  //      "¿como me esta yendo?" se pregunta una vez, no una por pin. Adentro
  //      de cada desplegable, el total de la cuenta no existia en ningun lado
  //      y habia que sumar de cabeza.
  //   3. El rio: el MAPA, el CLIMA y el NIVEL. No es lo que viene a hacer aca,
  //      pero es la misma agua sobre la que trabaja — donde esta la
  //      competencia, si esta picado (no viene nadie al parador) y si el rio
  //      esta creciendo.
  const secciones = [
    ...(comercios.length > 0 ? [{ id: "__comercios", nodo: selector }] : []),
    // Sin ningun comercio cargado no hay arbol que desplegar, pero el asistente
    // de alta tiene que seguir a un toque de distancia: es lo que la cuenta
    // vino a hacer. Va como una seccion mas de la barra —y no como pantalla
    // entera, que era lo de antes— para que se pueda ir al mapa y volver.
    ...(comercios.length === 0 ? [{ id: "ficha", etiqueta: "Cargar mi comercio" }] : []),
    ...(comercios.length > 0
      ? [
          { id: "metricas", etiqueta: "Métricas" },
          { id: "resenas", etiqueta: "Reseñas" },
        ]
      : []),
    { id: "mapa", etiqueta: "Mapa del río" },
    // El clima es del comerciante tanto como del nauta, y por las mismas
    // razones al reves: si esta picado no viene nadie al parador, y el sabado
    // que sopla del sur el lanchero no cruza. Ademas es a donde tiene que
    // llevar el cartel de clima que flota sobre el mapa — antes caia en "Nivel
    // del rio", que contesta otra pregunta.
    { id: "clima", etiqueta: "Clima" },
    { id: "nivel", etiqueta: "Nivel del río" },
    ...(usuario?.es_admin
      ? [
          { id: "moderacion", etiqueta: "Moderación", pendientes: pendientes.pois },
          { id: "reclamos", etiqueta: "Reclamos", pendientes: pendientes.reclamos },
        ]
      : []),
  ];

  // El titulo de arriba junta las dos listas. Para las pantallas de un
  // comercio dice el nombre del comercio y no "Ficha": con tres cargados, el
  // encabezado es lo unico que confirma en cual estas parado.
  // Para las pantallas de un comercio el titulo es el NOMBRE del comercio y no
  // "Ficha": con tres cargados, el encabezado es lo unico que confirma en cual
  // estas parado. Metricas y reseñas son de la cuenta y conservan el suyo.
  const titulos = {
    ...Object.fromEntries(seccionesActivas.map((s) => [s.id, comercio?.nombre ?? s.etiqueta])),
    ...Object.fromEntries(secciones.filter((s) => s.etiqueta).map((s) => [s.id, s.etiqueta])),
    ficha: comercio?.nombre ?? "Cargar mi comercio",
    suscripcion: "Suscripción",
  };

  const abrirAyuda = () => setModalAyudaAbierto(true);
  const propsEdicion = { comercio, onGuardar: guardar, guardando };


  return (
    <ProveedorRio>
    {/* `mapa-pleno` saca la barra superior y estira el mapa a la pantalla
        entera en el celular, igual que en el shell del nauta. El comerciante
        mira el mismo mapa y desde el mismo lugar — arriba de una lancha —,
        asi que no hay razon para que le quede la mitad del alto. */}
    <div className={`app app-comercio${seccionActiva === "mapa" ? " mapa-pleno" : ""}`}>
      <Sidebar
        secciones={secciones}
        seccionActiva={seccionActiva}
        onCambiarSeccion={setSeccionActiva}
        onAbrirAyuda={abrirAyuda}
      />

      <div className="columna-principal">
        <TopBar
          titulo={titulos[seccionActiva] ?? seccionActiva}
          onEditarPerfil={() => setModalPerfilAbierto(true)}
          onAbrirAyuda={abrirAyuda}
          onVerSuscripcion={() => setSeccionActiva("suscripcion")}
          onAbrirMenu={() => setMenuMovilAbierto(true)}
        />

        <main className={seccionActiva === "mapa" ? "main-mapa" : undefined}>
          {/* El estado de publicación acompaña a las pantallas del propio
              comercio; en suscripción, moderación y nivel del río no viene a
              cuento y sería ruido fijo arriba de todo. */}
          {comercio &&
            !["suscripcion", "moderacion", "reclamos", "clima", "nivel", "mapa"].includes(
              seccionActiva,
            ) && <BannerEstado comercio={comercio} />}

          {/* `onEliminado` deja el shell sin ficha, que es exactamente el
              estado del que se sale por InicioComercio: la cuenta sigue viva y
              puede cargar otro comercio o reclamar uno del mapa.

              Sin ficha esta seccion ES el asistente de alta. Para una cuenta
              comun eso no cambia nada —es la unica seccion que tiene—, y para
              un admin es lo que le deja cargar la suya sin perder de vista las
              colas de moderacion. */}
          {seccionActiva === "ficha" &&
            (comercio ? (
              <MiComercio {...propsEdicion} onEliminado={() => quitar(comercio.id)} />
            ) : (
              <InicioComercio onCreado={agregar} yaTiene={comercios.length} />
            ))}
          {seccionActiva === "carta" && <EditorCarta {...propsEdicion} />}
          {seccionActiva === "tablero" && (
            <EditorTablero
              comercio={comercio}
              guardando={guardando}
              onGuardarTablero={guardarTablero}
              onCambiarEstadoCruce={cambiarEstadoCruce}
              onCambiarEstadoSalida={cambiarEstadoSalida}
            />
          )}
          {seccionActiva === "horarios" && <EditorHorarios {...propsEdicion} />}
          {seccionActiva === "metricas" && <MetricasComercio comercios={comercios} />}
          {seccionActiva === "resenas" && <ResenasComercio comercios={comercios} />}
          {seccionActiva === "mapa" && (
            <MapaNauta
              onIrAClima={() => setSeccionActiva("clima")}
              // Sin esto el boton de hamburguesa que flota sobre el mapa se
              // dibujaba igual (su CSS no depende del shell) pero no abria
              // nada, y con la barra superior escondida no quedaba ninguna
              // forma de salir de la seccion.
              onAbrirMenu={() => setMenuMovilAbierto(true)}
            />
          )}
          {seccionActiva === "clima" && <ClimaNauta />}
          {seccionActiva === "nivel" && <NivelRio />}
          {seccionActiva === "moderacion" && <ModeracionPois />}
          {seccionActiva === "reclamos" && <ModeracionReclamos />}
          {seccionActiva === "suscripcion" && <PantallaSuscripcion onAbrirAyuda={abrirAyuda} />}
        </main>
      </div>

      <MenuMovil
        abierto={menuMovilAbierto}
        onCerrar={() => setMenuMovilAbierto(false)}
        secciones={secciones}
        seccionActiva={seccionActiva}
        onCambiarSeccion={setSeccionActiva}
        onEditarPerfil={() => setModalPerfilAbierto(true)}
        onVerSuscripcion={() => setSeccionActiva("suscripcion")}
        onAbrirAyuda={abrirAyuda}
      />

      {modalPerfilAbierto && <ModalPerfil onCerrar={() => setModalPerfilAbierto(false)} />}
      {modalAyudaAbierto && <ModalAyuda onCerrar={() => setModalAyudaAbierto(false)} />}
    </div>
    </ProveedorRio>
  );
}
