import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const resolvePath = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@workspace": resolvePath(
        mode === "routerboards" ? "../../routerboards/workspace.mjs" : "../../radios/workspace.mjs",
      ),
    },
  },
  clearScreen: false,
  plugins: [react()],
  server: {
    fs: { allow: [".", "../../radios", "../../routerboards"].map(resolvePath) },
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
