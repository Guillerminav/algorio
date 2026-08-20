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
import MapaNauta from "../nauta/MapaNauta.jsx";
import NivelRio from "../nauta/NivelRio.jsx";
import InicioComercio from "./InicioComercio.jsx";
import EditorCarta from "./EditorCarta.jsx";
import EditorHorarios from "./EditorHorarios.jsx";
import EditorTablero from "./EditorTablero.jsx";
import MetricasComercio from "./MetricasComercio.jsx";
import MiComercio from "./MiComercio.jsx";
import ResenasComercio from "./ResenasComercio.jsx";
import { tipoDe } from "./tiposComercio.js";

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
  const [comercio, setComercio] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState("ficha");
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    pedirJSON("/api/mi-comercio")
      .then((d) => !cancelado && setComercio(d))
      // Un 404 no llega por aca: el backend devuelve null cuando la cuenta
      // todavia no cargo nada, que es un estado normal y no un error.
      .catch((e) => !cancelado && setErrorCarga(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  // Un solo guardar para las cuatro pantallas de edicion: todas mandan un
  // PUT parcial al mismo endpoint y se quedan con la ficha que vuelve.
  const guardar = useCallback(async (cambios) => {
    setGuardando(true);
    try {
      const actualizado = await pedirJSON("/api/mi-comercio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      setComercio(actualizado);
      return actualizado;
    } finally {
      setGuardando(false);
    }
  }, []);

  // El tablero de cruces tiene su propio endpoint y no viaja por el PUT de
  // arriba: es la unica edicion del panel que NO pasa por moderacion y que
  // nunca devuelve la ficha a 'pendiente' (ver backend/tablero.py). Separarlo
  // aca tambien es lo que evita que un cambio futuro en `guardar` le aplique
  // sin querer las reglas de la ficha.
  const guardarTablero = useCallback(async (cruces) => {
    setGuardando(true);
    try {
      const actualizado = await pedirJSON("/api/mi-comercio/tablero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cruces }),
      });
      setComercio(actualizado);
      return actualizado;
    } finally {
      setGuardando(false);
    }
  }, []);

  // Un solo interruptor. No toca `guardando`: el boton de "Guardar cambios"
  // del editor no tiene por que apagarse porque alguien marco una demora, que
  // es otra operacion y se resuelve sola.
  const cambiarEstadoCruce = useCallback(async (cruceId, cuerpo) => {
    const actualizado = await pedirJSON(
      `/api/mi-comercio/tablero/${encodeURIComponent(cruceId)}/estado`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      },
    );
    setComercio(actualizado);
    return actualizado;
  }, []);

  // El de UNA salida. `estado` en null le saca la marca propia y la devuelve a
  // seguir al recorrido, que es como se deshace sin afirmar otra cosa.
  const cambiarEstadoSalida = useCallback(async (cruceId, hora, cuerpo) => {
    const actualizado = await pedirJSON(
      `/api/mi-comercio/tablero/${encodeURIComponent(cruceId)}/salidas/${encodeURIComponent(hora)}/estado`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      },
    );
    setComercio(actualizado);
    return actualizado;
  }, []);

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

  // Sin ficha cargada no hay panel posible (no hay metricas, ni reseñas, ni
  // menu de nada), asi que el asistente ocupa la pantalla entera. Puede que la
  // cuenta no tenga ficha pero si un reclamo en curso: eso lo resuelve
  // InicioComercio, que decide entre cargar, reclamar y esperar.
  if (!comercio) {
    return <InicioComercio onCreado={setComercio} />;
  }

  const definicion = tipoDe(comercio.tipo);
  const secciones = [
    { id: "ficha", etiqueta: "Mi comercio" },
    // La carta es solo del parador: es el unico rubro con una lista de precios
    // que cambia seguido y que el nauta quiere ver antes de parar. Una cabaña
    // o una lancha-taxi cuentan lo suyo en la descripcion y en los servicios,
    // sin una pantalla mas que mantener.
    ...(definicion.tieneCarta ? [{ id: "carta", etiqueta: definicion.etiquetaCarta }] : []),
    // El tablero es solo de la lancha-taxi y va ARRIBA de los horarios: es lo
    // que el lanchero abre todos los dias (marcar una demora), mientras que
    // los horarios de atencion se cargan una vez y no se tocan mas.
    ...(definicion.tieneTablero ? [{ id: "tablero", etiqueta: "Tablero de cruces" }] : []),
    { id: "horarios", etiqueta: "Horarios" },
    { id: "metricas", etiqueta: "Métricas" },
    { id: "resenas", etiqueta: "Reseñas" },
    // El mismo mapa que ve el nauta. El comerciante esta sobre el rio igual
    // que sus clientes: le sirve ver donde esta la competencia, que reporto
    // la gente cerca y como viene el viento del fin de semana. Ademas puede
    // dejar sus propios reportes.
    { id: "mapa", etiqueta: "Mapa del río" },
    // Al final y no arriba: no es lo que el comerciante viene a hacer acá,
    // pero saber si el río está creciendo le cambia el fin de semana tanto
    // como al nauta. Es la misma pantalla que ve el nauta.
    { id: "nivel", etiqueta: "Nivel del río" },
    ...(usuario?.es_admin
      ? [
          { id: "moderacion", etiqueta: "Moderación" },
          { id: "reclamos", etiqueta: "Reclamos" },
        ]
      : []),
  ];

  const titulos = {
    ...Object.fromEntries(secciones.map((s) => [s.id, s.etiqueta])),
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
          {!["suscripcion", "moderacion", "reclamos", "nivel", "mapa"].includes(seccionActiva) && (
            <BannerEstado comercio={comercio} />
          )}

          {seccionActiva === "ficha" && <MiComercio {...propsEdicion} />}
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
          {seccionActiva === "metricas" && <MetricasComercio comercio={comercio} />}
          {seccionActiva === "resenas" && <ResenasComercio comercio={comercio} />}
          {seccionActiva === "mapa" && (
            <MapaNauta
              onIrAClima={() => setSeccionActiva("nivel")}
              // Sin esto el boton de hamburguesa que flota sobre el mapa se
              // dibujaba igual (su CSS no depende del shell) pero no abria
              // nada, y con la barra superior escondida no quedaba ninguna
              // forma de salir de la seccion.
              onAbrirMenu={() => setMenuMovilAbierto(true)}
            />
          )}
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
