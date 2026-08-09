import { defineConfig } from "vite";
import { resolve } from "path";
import { readdirSync, statSync } from "fs";

// Build @sixtyfold/core as per-file ES modules (preserveModules) so the
// emitted JS carries real ".js" extensions on relative imports — required for
// raw-Node consumers (e.g. SSR) AND so it stays externalizable from line/stock
// (one shared copy of core, never duplicated). Types are emitted separately by
// tsc (tsconfig.types.json).
const buildTarget = ["chrome87", "edge88", "firefox78", "safari15"];

function tsEntries(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) tsEntries(p, acc);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
      acc.push(p);
  }
  return acc;
}

export default defineConfig({
  base: "./",
  publicDir: false,
  build: {
    outDir: "dist",
    target: buildTarget,
    sourcemap: true,
    minify: false,
    lib: {
      entry: tsEntries(resolve(__dirname, "src")),
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
      },
    },
  },
});
