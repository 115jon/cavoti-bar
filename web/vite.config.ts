/// <reference types="vitest/config" />
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: { alias: { "@": resolve(fileURLToPath(new URL("./src", import.meta.url))) } },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(fileURLToPath(new URL(".", import.meta.url)), "../obj/GeneratedUi"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith(".css") ? "assets/index.css" : "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
