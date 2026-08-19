import React, { useState } from "react";

import ModeracionPois from "../admin/ModeracionPois.jsx";
import PantallaSuscripcion from "../components/PantallaSuscripcion.jsx";
import MenuMovil from "../components/MenuMovil.jsx";
import ModalAyuda from "../components/ModalAyuda.jsx";
import ModalPerfil from "../components/ModalPerfil.jsx";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import ClimaNauta from "./ClimaNauta.jsx";
import { ProveedorRio } from "./ContextoRio.jsx";
import ListaLugares from "./ListaLugares.jsx";
import MapaNauta from "./MapaNauta.jsx";
import NivelRio from "./NivelRio.jsx";
import OnboardingEmbarcacion from "./OnboardingEmbarcacion.jsx";
import PanelLugar from "./PanelLugar.jsx";
import PerfilNauta from "./PerfilNauta.jsx";

// Tres secciones y el mapa primero: es la pregunta con la que alguien abre
// esto un sábado a la mañana ("¿dónde voy y cómo está?"). Clima y Perfil se
// consultan; el mapa es la app.
const SECCIONES = [
  { id: "mapa", etiqueta: "Mapa" },
  // El mapa es lo natural para "qué tengo cerca", pero es malo para buscar por
  // nombre y para recorrer todo lo que hay cuando los pines se amontonan o
  // quedan fuera del encuadre. La lista cubre eso.
  { id: "lugares", etiqueta: "Lugares" },
  { id: "clima", etiqueta: "Clima" },
  { id: "nivel", etiqueta: "Nivel del río" },
  { id: "perfil", etiqueta: "Mi perfil" },
];

const TITULOS = {
  ...Object.fromEntries(SECCIONES.map((s) => [s.id, s.etiqueta])),
  moderacion: "Moderación",
  // No va en SECCIONES: se llega desde el menú de perfil, no desde la barra.
  // Es un dato de la cuenta, no una sección más del producto (mismo criterio
  // que AppShell).
  suscripcion: "Suscripción",
};

/**
 * La web del nauta recreativo.
 *
 * Mismo backend y mismos datos que la app móvil (`app_movil/`), otra
 * interfaz: acá hay pantalla ancha y mouse, así que el detalle de un lugar va
 * en un panel al costado del mapa en vez de un cajón que sube desde abajo.
 *
 * No pasa por la pantalla de suscripción: este perfil es gratis y
 * `suscripciones.tiene_acceso()` siempre lo deja entrar.
 */
export default function ShellNauta() {
  const { usuario } = useAuth();
  const [seccionActiva, setSeccionActiva] = useState("mapa");
  const [lugarSuelto, setLugarSuelto] = useState(null);
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  // Sin embarcación elegida no se entra: es lo que calibra todos los avisos de
  // viento. Una cuenta creada en la web pasa por acá igual que una creada en
  // la app.
  if (!usuario?.tipo_embarcacion) return <OnboardingEmbarcacion />;

  // La cola de moderacion de comercios no depende del rol sino del permiso de
  // la cuenta: quien aprueba paradores puede ser un nauta.
  const secciones = [
    ...SECCIONES,
    ...(usuario?.es_admin ? [{ id: "moderacion", etiqueta: "Moderación" }] : []),
  ];

  const abrirAyuda = () => setModalAyudaAbierto(true);

  return (
    <ProveedorRio>
    <div className="app app-nauta">
      <Sidebar
        secciones={secciones}
        seccionActiva={seccionActiva}
        onCambiarSeccion={setSeccionActiva}
        onAbrirAyuda={abrirAyuda}
      />

      <div className="columna-principal">
        <TopBar
          titulo={TITULOS[seccionActiva] ?? seccionActiva}
          onEditarPerfil={() => setModalPerfilAbierto(true)}
          onAbrirAyuda={abrirAyuda}
          // Este perfil no tiene suscripción que mirar: el enlace del menú
          // lleva a su propia sección de perfil, que es lo que sí puede tocar.
          onVerSuscripcion={() => setSeccionActiva("suscripcion")}
          onAbrirMenu={() => setMenuMovilAbierto(true)}
        />

        <main className={seccionActiva === "mapa" ? "main-mapa" : undefined}>
          {seccionActiva === "mapa" && (
            <MapaNauta onIrAClima={() => setSeccionActiva("clima")} />
          )}
          {seccionActiva === "lugares" && (
            <ListaLugares onVerLugar={(poiId) => setLugarSuelto(poiId)} />
          )}
          {seccionActiva === "clima" && <ClimaNauta />}
          {seccionActiva === "nivel" && <NivelRio />}
          {seccionActiva === "moderacion" && <ModeracionPois />}
          {seccionActiva === "suscripcion" && <PantallaSuscripcion onAbrirAyuda={abrirAyuda} />}
          {seccionActiva === "perfil" && (
            <PerfilNauta onVerLugar={(poiId) => setLugarSuelto(poiId)} />
          )}
        </main>
      </div>

      {/* Abrir un lugar desde "mis reseñas" no lo busca en el mapa: se muestra
          la misma ficha como panel flotante, que es lo que se quería ver. */}
      {lugarSuelto && (
        <div className="capa-lugar-suelto">
          <PanelLugar poiId={lugarSuelto} onCerrar={() => setLugarSuelto(null)} />
        </div>
      )}

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
