/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * The secret-free `/api/*` functions in-process during `npm run dev`: link previews (`/api/unfurl`)
 * and the calendar feed relay (`/api/google/ical`). Neither needs keys, so there is no reason to
 * make them depend on `vercel dev` running alongside — every other `/api/*` still goes through the
 * proxy below. The real Vercel handlers are loaded as-is through Vite's SSR loader and given the
 * small slice of the Vercel req/res API they use.
 */
function devApi(): Plugin {
  const routes: { path: string; file: string; query?: Record<string, string> }[] = [
    { path: "/api/unfurl", file: "/api/unfurl.ts" },
    { path: "/api/google/ical", file: "/api/google/[action].ts", query: { action: "ical" } },
  ];
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      for (const route of routes) {
        server.middlewares.use(route.path, async (req, res) => {
          try {
            const mod = await server.ssrLoadModule(route.file);
            const url = new URL(req.url ?? "", "http://localhost");
            let body = "";
            if (req.method === "POST") for await (const chunk of req) body += chunk;
            const vreq = Object.assign(req, { query: { ...Object.fromEntries(url.searchParams), ...route.query }, body });
            const vres = Object.assign(res, {
              status(code: number) { res.statusCode = code; return vres; },
              json(b: unknown) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(b)); return vres; },
              send(b: string) { res.end(b); return vres; },
            });
            await mod.default(vreq, vres);
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
          }
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // `/api/*` are Vercel functions. Run `npx vercel dev --listen 3000` alongside `npm run dev`
    // to exercise auth/Notion/Gmail locally; without it these calls just fail (and auth stays open).
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: false },
    },
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
