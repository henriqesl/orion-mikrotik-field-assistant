import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@workspace": fileURLToPath(new URL(
        mode === "routerboards" ? "../../routerboards/workspace.mjs" : "../../radios/workspace.mjs",
        import.meta.url,
      )),
    },
  },
  clearScreen: false,
  plugins: [react()],
  server: {
    fs: { allow: [".", "../../radios", "../../routerboards"].map((path) => fileURLToPath(new URL(path, import.meta.url))) },
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
