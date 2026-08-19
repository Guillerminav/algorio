import React from "react";

import { useAuth } from "../context/AuthContext.jsx";

// Lo que trae la cuenta del nauta. Es la lista del perfil recreativo y no la
// del producto de navieras: al kayakista no le dice nada el calado admisible.
const INCLUYE = [
  {
    titulo: "El mapa del río, sobre el satelital",
    detalle: "Paradores, alojamientos y lanchas-taxi con horarios, fotos, contacto y cómo llegar.",
  },
  {
    titulo: "¿Está picado?, para tu embarcación",
    detalle: "El pronóstico cruzado con lo que navegás: 20 km/h no significan lo mismo en un kayak que en una lancha de siete metros.",
  },
  {
    titulo: "Los avisos del río",
    detalle: "Un yacaré, un banco que se corrió, un tronco a la deriva. Los deja quien los vio y vencen solos, así el mapa no se llena de peligros que ya no existen.",
  },
  {
    titulo: "Reseñas de gente que estuvo",
    detalle: "Puntuás los lugares a los que fuiste, y lo que escribís le llega al dueño a su panel.",
  },
  {
    titulo: "Nivel del río y pronóstico",
    detalle: "Las estaciones de INA y Prefectura Naval cerca tuyo, y el viento de los próximos días.",
  },
  {
    titulo: "En el celular y en la computadora",
    detalle: "La misma cuenta y los mismos datos en los dos lados.",
  },
];

/**
 * La pantalla de suscripción de una cuenta que no paga.
 *
 * Existe porque el menú de perfil ofrece "Suscripción" para todos los perfiles,
 * y en el del nauta ese botón llevaba a "Mi perfil": la etiqueta prometía una
 * cosa y abría otra. Mandarlo a <PantallaSuscripcion> tampoco servía — esa
 * pantalla está armada para cuentas que pagan, y a un nauta le hubiera dicho
 * "USD 0 por mes", "Prueba gratis" (el estado que guarda la base) y "escribinos
 * para que no pierdas el acceso", que es exactamente lo contrario de lo que
 * pasa: el perfil recreativo no vence nunca (ver ROL_GRATUITO en
 * backend/suscripciones.py).
 *
 * Acá no hay nada que cambiar ni que cobrar, así que la pantalla no es un
 * formulario: es la respuesta a "¿qué tengo?" y el recordatorio de que esto se
 * sostiene con lo que aporta cada uno.
 */
export default function PantallaGratis() {
  const { suscripcion } = useAuth();

  return (
    <div className="gratis">
      <section className="gratis-panel">
        {/* Mismo motivo de ondas que las pantallas de acceso y el hero de la
            landing: es la misma marca. */}
        <svg className="gratis-ondas" viewBox="0 0 1440 420" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-40,150 C220,90 420,230 720,160 C1020,90 1240,220 1480,150" fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="26" />
          <path d="M-40,250 C220,190 420,330 720,260 C1020,190 1240,320 1480,250" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="26" />
          <path d="M-40,350 C220,290 420,430 720,360 C1020,290 1240,420 1480,350" fill="none" stroke="#4fb3d9" strokeOpacity="0.22" strokeWidth="26" />
        </svg>

        <div className="gratis-panel-cuerpo">
          {/* El nombre del plan sale del backend y no está escrito acá: si
              algún día cambia, cambia solo. */}
          <span className="gratis-etiqueta">
            Tu plan{suscripcion?.etiqueta ? ` · ${suscripcion.etiqueta}` : ""}
          </span>

          <p className="gratis-precio">Gratis</p>

          <p className="gratis-nota">
            Para siempre, y no es una prueba: tu cuenta no tiene fecha de
            vencimiento en ningún lado. No pedimos tarjeta porque no hay nada
            que cobrarte.
          </p>

          {/* La leyenda que pidió el usuario. Va abajo del precio y más chica a
              propósito: es el porqué, no el qué. */}
          <p className="gratis-leyenda">
            El río lo cuidamos entre todos.{" "}
            <span>
              Lo que hace que esto sirva no lo ponemos nosotros: es el banco de
              arena que avisaste, la reseña que dejaste y el parador que cargó
              otro. Cada aviso tuyo es el que le va a evitar un susto al que
              salga mañana.
            </span>
          </p>
        </div>
      </section>

      <section className="gratis-incluye">
        <h3>Qué incluye</h3>
        <ul>
          {INCLUYE.map((item) => (
            <li key={item.titulo}>
              <span className="gratis-check" aria-hidden="true">✓</span>
              <div>
                <strong>{item.titulo}</strong>
                <p>{item.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
