import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  publicDir: "public",
  plugins: [solid()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});
