import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        line: "src/line.tsx",
        stock: "src/stock.tsx",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "react",
        "react/jsx-runtime",
        "@sixtyfold/core",
        "@sixtyfold/line",
        "@sixtyfold/stock",
      ],
      output: { entryFileNames: "[name].js" },
    },
  },
});
