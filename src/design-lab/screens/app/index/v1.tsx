/**
 * «Индекс» — the whole app in the chosen minimal system. One shell, every section as a routed page,
 * all on the same store/actions as production (inside the lab sandbox).
 * Pages live in ./pages and are filled in section by section.
 */
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { Shell } from "@/design-lab/screens/_kit/index";
import { TaskPanelHost } from "@/design-lab/screens/_kit/index-ui";
import Overlays from "./overlays/Overlays";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Clients = lazy(() => import("./pages/Clients"));
const Planner = lazy(() => import("./pages/Planner"));
const Notes = lazy(() => import("./pages/Notes"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const System = lazy(() => import("./pages/System"));
const Archive = lazy(() => import("./pages/Archive"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Changelog = lazy(() => import("./pages/Changelog"));
const Focus = lazy(() => import("./pages/Focus"));

export default function IndexApp() {
  return (
    <TaskPanelHost>
    <Suspense fallback={null}>
      <Routes>
        {/* Focus mode is full-screen — outside the shell, like the real app. */}
        <Route path="/focus" element={<Focus />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/system" element={<System />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Overlays />
    </Suspense>
    </TaskPanelHost>
  );
}
