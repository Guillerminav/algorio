import React from "react";

// Isotipo de AlgoRío: un cauce de río (curva celeste) con una gota. Se usa en
// el panel de login y en la barra lateral/superior.
export default function LogoIcono({ size = 34 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path
        d="M8,78 C32,60 28,32 52,26 C68,22 78,34 92,18"
        fill="none"
        stroke="#4fb3d9"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <polygon points="53,44 53,26 63,44" fill="#ffffff" />
      <rect x="45" y="44" width="18" height="7" rx="2" fill="#8a6a45" />
    </svg>
  );
}
