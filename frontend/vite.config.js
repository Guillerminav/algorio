import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// La version vive en un unico lugar (VERSION en la raiz del repo) y se
// inyecta en el build. Si estuviera escrita a mano en el frontend habria dos
// fuentes de verdad y se desincronizarian a la primera distraccion.
const VERSION = readFileSync(fileURLToPath(new URL("../VERSION", import.meta.url)), "utf-8").trim();

// El backend (FastAPI, backend/main.py) sirve el build de produccion desde
// frontend/dist/. En desarrollo, `npm run dev` levanta el server de Vite en
// otro puerto y proxea /api/* al backend para no pelear con CORS/cookies.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8011",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
