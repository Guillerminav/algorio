import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// El backend (FastAPI, backend/main.py) sirve el build de produccion desde
// frontend/dist/. En desarrollo, `npm run dev` levanta el server de Vite en
// otro puerto y proxea /api/* al backend para no pelear con CORS/cookies.
export default defineConfig({
  plugins: [react()],
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
