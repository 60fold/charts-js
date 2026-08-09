import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: { line: "src/line.tsx", stock: "src/stock.tsx" },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "solid-js",
        "solid-js/web",
        "@sixtyfold/core",
        "@sixtyfold/line",
        "@sixtyfold/stock",
      ],
      output: { entryFileNames: "[name].js" },
    },
  },
});
