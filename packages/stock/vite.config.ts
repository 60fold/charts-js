import { defineConfig } from "vite";
import { resolve } from "path";

// Library build for @sixtyfold/stock. Vite bundles the Web Worker entry
// (stock.worker.ts?worker); @sixtyfold/core is externalized.
const buildTarget = ["chrome87", "edge88", "firefox78", "safari15"];

export default defineConfig({
  base: "./",
  publicDir: false,
  worker: { format: "es" },
  build: {
    outDir: "dist",
    target: buildTarget,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        engine: resolve(__dirname, "src/engine.ts"),
        ohlcv: resolve(__dirname, "src/ohlcv.ts"),
        analytics: resolve(__dirname, "src/analytics.ts"),
        marketLayers: resolve(__dirname, "src/marketLayers.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      // @sixtyfold/core is externalized — one shared copy, never duplicated.
      // core ships per-file ESM with .js extensions, so this resolves in Node too.
      // (The worker bundle is a separate pass and necessarily carries its own
      // renderer code, since workers run in an isolated context.)
      external: [/^@sixtyfold\/core(\/.*)?$/],
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
