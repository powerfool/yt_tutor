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

// Firefox rejects crossorigin CORS fetches for moz-extension:// same-origin resources.
// Strip the attribute Vite injects into the sidebar HTML entry point.
function removeCrossorigin() {
  return {
    name: "remove-crossorigin",
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
    },
  };
}

// Content scripts run as classic scripts and cannot use ES module import statements.
// Rollup may split shared helpers into separate chunks; this plugin inlines those
// chunks back into the content script so the final file is self-contained.
function inlineContentScriptChunks() {
  return {
    name: "inline-content-script-chunks",
    generateBundle(_opts: unknown, bundle: Record<string, any>) {
      for (const [name, chunk] of Object.entries(bundle)) {
        if (!name.startsWith("content/") || chunk.type !== "chunk") continue;
        if (!chunk.imports?.length) continue;

        let preamble = "";
        const remainingImports: string[] = [];

        for (const importedName of chunk.imports as string[]) {
          const dep = bundle[importedName];
          if (!dep || dep.type !== "chunk") {
            remainingImports.push(importedName);
            continue;
          }

          // Parse exported bindings: export{o as c,l as g}
          const exportMap: Record<string, string> = {};
          const exportMatch = dep.code.match(/export\{([^}]+)\}/);
          if (exportMatch) {
            for (const binding of exportMatch[1].split(",")) {
              const parts = binding.trim().split(/\s+as\s+/);
              const local = parts[0].trim();
              const exported = (parts[1] ?? parts[0]).trim();
              exportMap[exported] = local;
            }
          }

          // Match the import statement in the content script by chunk basename
          const basename = importedName.split("/").pop()!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const importPattern = new RegExp(`import\\{([^}]+)\\}from"[^"]*${basename}";?\\n?`);
          const importMatch = chunk.code.match(importPattern);
          if (!importMatch) continue;

          // Build var aliases: var gt=o; var vt=l; etc.
          const aliases: string[] = [];
          for (const binding of importMatch[1].split(",")) {
            const parts = binding.trim().split(/\s+as\s+/);
            const exportedName = parts[0].trim();
            const localAlias = (parts[1] ?? parts[0]).trim();
            const originalLocal = exportMap[exportedName];
            if (originalLocal) aliases.push(`var ${localAlias}=${originalLocal};`);
          }

          let depCode = dep.code.replace(/export\{[^}]+\};?\s*/, "");
          if (aliases.length) depCode += "\n" + aliases.join("");
          preamble += depCode + "\n";
          chunk.code = chunk.code.replace(importPattern, "");
        }

        if (preamble) {
          chunk.code = preamble + chunk.code;
          chunk.imports = remainingImports;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifest(), removeCrossorigin(), inlineContentScriptChunks()],
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
