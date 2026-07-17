/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  /**
   * Two layers:
   *  - *.test.ts   — pure logic (grouping, health, quests), runs in plain node.
   *  - *.test.tsx  — user-flow tests through the real store + real components in jsdom.
   * Flow tests replace a browser-driving E2E runner here: Playwright is off the table by
   * agreement and Cypress would drag in a ~300MB binary for a local, single-user app.
   */
  test: {
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
