import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: { line: "src/line.ts", stock: "src/stock.ts" },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["vue", "@sixtyfold/core", "@sixtyfold/line", "@sixtyfold/stock"],
      output: { entryFileNames: "[name].js" },
    },
  },
});
