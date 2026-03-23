import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

function copyManifest() {
  return {
    name: "copy-manifest",
    closeBundle() {
      mkdirSync("dist", { recursive: true });
      copyFileSync("manifest.json", "dist/manifest.json");
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  css: {
    postcss: "./postcss.config.js",
  },
  resolve: {
    preserveSymlinks: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, "sidebar/index.html"),
        background: resolve(__dirname, "background.ts"),
        "content/youtube": resolve(__dirname, "content/youtube.ts"),
        "content/webpage": resolve(__dirname, "content/webpage.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
