import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { GlobalLayout } from "@/components/layout/GlobalLayout";
import { AppLayout } from "@/components/layout/AppLayout";

/**
 * Pages are the Craft Dark screens the owner approved in the design lab (src/design-lab/screens,
 * one chosen concept per section — see design-lab/notes.md). They run on the same store and
 * actions as the old pages, so the data is untouched; only the UI changed. The old pages stay in
 * src/pages for the sections not redesigned yet (Архив, Story, Focus).
 */
const Dashboard = lazy(() => import("@/design-lab/screens/dashboard/mix/v1"));
const Clients = lazy(() => import("@/design-lab/screens/clients/craft/v5"));
const Projects = lazy(() => import("@/design-lab/screens/projects/craft/v6"));
const ProjectDetail = lazy(() => import("@/design-lab/screens/project/craft/v5"));
const Tasks = lazy(() => import("@/design-lab/screens/tasks/craft/v1"));
const Notes = lazy(() => import("@/design-lab/screens/notes/craft/v4"));
const Analytics = lazy(() => import("@/design-lab/screens/analytics/craft/v5"));
const Knowledge = lazy(() => import("@/design-lab/screens/knowledge/craft/v5"));
const SettingsPage = lazy(() => import("@/design-lab/screens/settings/craft/v1"));
const Achievements = lazy(() => import("@/design-lab/screens/achievements/craft/v1"));
const FocusPage = lazy(() => import("@/design-lab/screens/focus/craft/v1"));
const Changelog = lazy(() => import("@/design-lab/screens/changelog/craft/v1"));
const Archive = lazy(() => import("@/pages/Archive"));

function PageFallback() {
  return <div className="min-h-screen" style={{ background: "#060607" }} />;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<GlobalLayout />}>
          {/* Focus mode is full-screen (no sidebar, no dock) but keeps the global engines, so
              meeting alerts still ring while focusing. */}
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/changelog" element={<Changelog />} />
          {/* Not redesigned yet — keeps its legacy chrome. Out of the menu (owner, 2026-10-12);
              still reachable from «+N в архиве» on a project and via g→r. */}
          <Route element={<AppLayout />}>
            <Route path="/archive" element={<Archive />} />
          </Route>
          {/* «Планер» removed by the owner (2026-10-12). Its data (planBlocks/planTemplates) stays
              in AppData untouched; the page code is in pages/Planner.tsx. */}
          <Route path="/planner" element={<Navigate to="/" replace />} />
          {/* «Сервисы» (почта, Notion) и «Календарь» отключены — старые закладки ведут на дашборд. */}
          <Route path="/services" element={<Navigate to="/" replace />} />
          <Route path="/mail" element={<Navigate to="/" replace />} />
          <Route path="/calendar" element={<Navigate to="/" replace />} />
          {/* Stale/typo'd/removed deep links land on the dashboard instead of a blank shell. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
