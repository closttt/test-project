// Must stay the first import: installs the read-only network guard before any client is created.
import { setSnapshot, type Snapshot } from "@/design-lab/guard";

import { StrictMode, Suspense, lazy, useEffect, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";

import App from "@/App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataProvider } from "@/store/DataProvider";
import { UIProvider } from "@/store/UIProvider";
import { ToastProvider } from "@/store/ToastProvider";
import { PomodoroProvider } from "@/store/PomodoroProvider";
import { PomodoroBar } from "@/components/PomodoroBar";
import type { AppData } from "@/types";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "@/index.css";
import "@/design-lab/fonts.css";

// Agentation — visual feedback tool for AI agents (agentation.dev), same as the real app's dev
// entry. Only when the frame is opened on its own (bug hunting in a tab) — not inside the board's
// preview iframes, where it would sit on top of every concept.
const Agentation = import.meta.env.DEV && window.top === window.self
  ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
  : null;

/**
 * One preview frame of the design lab: the REAL app (same routes, store, actions) rendered on a
 * snapshot of production data, with a chosen set of skins layered on top.
 *
 *   design-lab-frame.html?route=/tasks&skins=graphite-glow,shell-dashboard/a
 *
 * Skins are plain CSS files in src/design-lab/skins — they restyle, they never change behaviour.
 */
const skinFiles = import.meta.glob("../skins/**/*.css", { query: "?inline", import: "default" }) as Record<
  string,
  () => Promise<string>
>;

/**
 * Composed screens — brand-new layouts built from scratch on the same data/actions
 * (src/design-lab/screens/<screen>/<style>/<variant>.tsx, default export):
 *   design-lab-frame.html?screen=dashboard/glow/v1
 */
const screenFiles = import.meta.glob("../screens/*/*/*.tsx") as Record<
  string,
  () => Promise<{ default: ComponentType }>
>;

const params = new URLSearchParams(location.search);
const screen = params.get("screen");
const route = params.get("route") ?? "/";
const skins = (params.get("skins") ?? "").split(",").filter(Boolean);

async function applySkins() {
  for (const name of skins) {
    const load = skinFiles[`../skins/${name}.css`];
    if (!load) {
      console.warn(`[design-lab] unknown skin: ${name}`);
      continue;
    }
    const style = document.createElement("style");
    style.dataset.skin = name;
    style.textContent = await load();
    document.head.appendChild(style);
  }
  document.documentElement.dataset.skins = skins.join(" ");
}

/** Tells the board where the user has clicked to inside the preview. */
function RouteReporter() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.parent?.postMessage({ type: "lab:route", route: pathname }, "*");
  }, [pathname]);
  return null;
}

async function boot() {
  const [snap] = await Promise.all([
    fetch("/design-lab/.data/snapshot.json").then((r) => {
      if (!r.ok) throw new Error("Нет снимка данных: запустите node scripts/design-lab-snapshot.mjs");
      return r.json() as Promise<Snapshot>;
    }),
    applySkins(),
  ]);
  setSnapshot(snap);
  const data = snap.app_state[0]?.data as AppData;
  let Screen: ComponentType | null = null;
  if (screen) {
    const load = screenFiles[`../screens/${screen}.tsx`];
    if (!load) throw new Error(`Нет экрана ${screen}`);
    Screen = lazy(load);
    document.documentElement.dataset.screen = screen;
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <MemoryRouter initialEntries={[route]}>
          <RouteReporter />
          <DataProvider sandboxData={data}>
            <UIProvider>
              <ToastProvider>
                <PomodoroProvider>
                  {Screen ? (
                    <Suspense fallback={null}>
                      <Screen />
                    </Suspense>
                  ) : (
                    <>
                      <App />
                      <PomodoroBar />
                    </>
                  )}
                  {Agentation && (
                    <Suspense fallback={null}>
                      <Agentation />
                    </Suspense>
                  )}
                </PomodoroProvider>
              </ToastProvider>
            </UIProvider>
          </DataProvider>
        </MemoryRouter>
      </ErrorBoundary>
    </StrictMode>
  );
}

boot().catch((e) => {
  document.getElementById("root")!.innerHTML = `<pre style="color:#f88;padding:24px;font:13px monospace">${String(e)}</pre>`;
});
