import { defineConfig } from "vite";
import { resolve } from "path";

// Library build for @sixtyfold/line. Vite is used (rather than plain tsc) so
// the Web Worker entry (chart.worker.ts?worker) gets bundled. @sixtyfold/core
// is externalized — the consumer resolves it from the workspace.
const buildTarget = ["chrome87", "edge88", "firefox78", "safari15"];

export default defineConfig(({ mode }) => {
  const benchmarkPhasesEnabled = mode === "benchmark";

  return {
    base: "./",
    publicDir: false,
    define: {
      __SIXTYFOLD_LINE_BENCHMARK__: JSON.stringify(benchmarkPhasesEnabled),
    },
    worker: {
      format: "es",
      rollupOptions: {
        output: {
          sourcemapExcludeSources: !benchmarkPhasesEnabled,
        },
      },
    },
    build: {
      outDir: benchmarkPhasesEnabled ? "dist-benchmark" : "dist",
      target: buildTarget,
      sourcemap: true,
      lib: {
        entry: {
          index: resolve(__dirname, "src/index.ts"),
          engine: resolve(__dirname, "src/engine.ts"),
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
          // Keep source maps useful in production without embedding the
          // benchmark-only source text that Rollup has already dead-code
          // eliminated from the runtime chunks.
          sourcemapExcludeSources: !benchmarkPhasesEnabled,
        },
      },
    },
  };
});
