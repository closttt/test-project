/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * `/api/unfurl` in-process during `npm run dev`. It needs no secrets and no session, so there is no
 * reason to make link previews depend on `vercel dev` running alongside — every other `/api/*`
 * still goes through the proxy below. The real Vercel handler is loaded as-is through Vite's SSR
 * loader and given the small slice of the Vercel req/res API it uses.
 */
function devUnfurl(): Plugin {
  return {
    name: "dev-unfurl",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/unfurl", async (req, res) => {
        try {
          const mod = await server.ssrLoadModule("/api/unfurl.ts");
          const url = new URL(req.url ?? "", "http://localhost");
          const vreq = Object.assign(req, { query: Object.fromEntries(url.searchParams) });
          const vres = Object.assign(res, {
            status(code: number) { res.statusCode = code; return vres; },
            json(body: unknown) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); return vres; },
          });
          await mod.default(vreq, vres);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devUnfurl()],
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
