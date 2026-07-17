import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataProvider } from "@/store/DataProvider";
import { UIProvider } from "@/store/UIProvider";
import { ToastProvider } from "@/store/ToastProvider";
import { PomodoroProvider } from "@/store/PomodoroProvider";
import { PomodoroBar } from "@/components/PomodoroBar";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./index.css";

// Agentation — visual feedback tool for AI agents (agentation.dev). Dev-only,
// lazy-loaded so it's excluded from production builds entirely.
const Agentation = import.meta.env.DEV
  ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
  : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <DataProvider>
          <UIProvider>
            <ToastProvider>
              <PomodoroProvider>
                <App />
                <PomodoroBar />
                {Agentation && (
                  <Suspense fallback={null}>
                    <Agentation />
                  </Suspense>
                )}
              </PomodoroProvider>
            </ToastProvider>
          </UIProvider>
        </DataProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

// Register the offline service worker in production builds only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is best-effort */
    });
  });
}
