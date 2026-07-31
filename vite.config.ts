/// <reference types="vitest/config" />
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const tauri = mode === "tauri";
  return {
    base: "./",
    resolve: { alias: { "@": resolve("src") } },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: tauri ? "dist" : "obj/GeneratedUi",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          entryFileNames: "assets/index.js",
          chunkFileNames: "assets/chunks/[name]-[hash].js",
          assetFileNames: (assetInfo) =>
            assetInfo.name?.endsWith(".css")
              ? "assets/index.css"
              : "assets/[name]-[hash][extname]",
        },
      },
    },
    server: tauri ? { port: 1420, strictPort: true } : undefined,
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
      exclude: ["tests/**"],
    },
  };
});
