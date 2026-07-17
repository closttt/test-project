import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Notes = lazy(() => import("@/pages/Notes"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const FocusPage = lazy(() => import("@/pages/FocusPage"));
const Achievements = lazy(() => import("@/pages/Achievements"));
const Changelog = lazy(() => import("@/pages/Changelog"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Archive = lazy(() => import("@/pages/Archive"));
const Knowledge = lazy(() => import("@/pages/Knowledge"));

function PageFallback() {
  return (
    <div className="flex h-40 items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Focus mode is full-screen — outside the app shell chrome. */}
        <Route path="/focus" element={<FocusPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/changelog" element={<Changelog />} />
          {/* Stale/typo'd/removed deep links land on the dashboard instead of a blank shell. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
