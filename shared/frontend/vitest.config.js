import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", include: ["tests/**/*.test.jsx"], clearMocks: true, pool: "threads", maxWorkers: 1 },
});
