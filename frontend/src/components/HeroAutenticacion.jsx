import React from "react";

// Decoracion abstracta del panel (no hay foto real del rio todavia: se usa un
// patron de ondas en vez de un placeholder de imagen vacio).
function OndasDecorativas() {
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">
      <path d="M-20,90 C60,60 120,120 200,90 C280,60 340,120 420,90" fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="10" />
      <path d="M-20,140 C60,110 120,170 200,140 C280,110 340,170 420,140" fill="none" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="10" />
      <path d="M-20,190 C60,160 120,220 200,190 C280,160 340,220 420,190" fill="none" stroke="#4fb3d9" strokeOpacity="0.28" strokeWidth="10" />
    </svg>
  );
}

// Panel izquierdo de las pantallas de acceso. Es un componente compartido y
// no una copia en cada pantalla a proposito: cuando estaba duplicado, login y
// registro se desincronizaron (registro quedo sin la imagen).
export default function HeroAutenticacion() {
  return (
    <div className="login-hero">
      <div className="login-hero-logo">
        <div className="login-hero-marca">AlgoRío</div>
      </div>

      <div className="login-hero-cuerpo">
        <div className="login-hero-titulo">Monitoreo y alertas hidrológicas en tiempo real</div>
        <p className="login-hero-texto">
          Niveles, caudal y tendencias del Paraná y el Paraguay, unificados
          desde INA, Prefectura Naval y Yacyretá en un solo panel.
        </p>
        <div className="login-hero-imagen">
          <OndasDecorativas />
        </div>
      </div>

      <div className="login-hero-footer">Estaciones de INA · Prefectura Naval · Yacyretá</div>
    </div>
  );
}
