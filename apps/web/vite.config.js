import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_TARGET = process.env.QRFORGE_API_URL || "http://localhost:8080";

export default defineConfig({
  // Served from a sub-path on GitHub Pages (e.g. VITE_BASE=/QrForge/).
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/r/": { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.js"],
  },
});
