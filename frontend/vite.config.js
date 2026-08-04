import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function resolveVersion() {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION.trim();
  }
  try {
    return readFileSync(fileURLToPath(new URL("../VERSION", import.meta.url)), "utf-8").trim();
  } catch {
    return "0.0.0-dev";
  }
}

const VERSION = resolveVersion();

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