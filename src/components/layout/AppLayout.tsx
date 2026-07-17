import { useEffect, useRef } from "react";
import { Outlet, useNavigate, useMatch } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { BottomDock } from "@/components/BottomDock";
import { CommandPalette } from "@/components/CommandPalette";
import { QuickAddDialog } from "@/components/QuickAddDialog";
import { QuickNoteDialog } from "@/components/QuickNoteDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { ReminderEngine } from "@/components/ReminderEngine";
import { GamificationEngine } from "@/components/GamificationEngine";
import { MeetingSyncEngine } from "@/components/MeetingSyncEngine";
import { AiAssistant } from "@/components/AiAssistant";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { undoLast } from "@/lib/undoStack";

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

/** Persistent shell: sidebar + globals stay mounted across route changes. */
export function AppLayout() {
  const { setQuickAddOpen, setCommandOpen, setQuickNoteOpen, setAssistantOpen } = useUI();
  const { toast } = useToast();
  const navigate = useNavigate();
  const gPressed = useRef(false);
  // Quick-add opened while looking at a project should file into that project by default.
  const projectMatch = useMatch("/projects/:id");

  // Global single-key shortcuts + "G then letter" navigation (Linear-style).
  useEffect(() => {
    const GO: Record<string, string> = {
      d: "/", p: "/projects", t: "/tasks", n: "/notes",
      c: "/calendar", a: "/achievements", s: "/settings",
      y: "/analytics", r: "/archive",
    };
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Z — global undo, wins over the per-modifier bail-out below.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
        e.preventDefault();
        const label = undoLast();
        if (label) toast(`Отменено: ${label}`);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (gPressed.current && GO[e.key]) {
        e.preventDefault();
        gPressed.current = false;
        navigate(GO[e.key]);
        return;
      }
      gPressed.current = false;
      if (e.key === "g") {
        gPressed.current = true;
        setTimeout(() => { gPressed.current = false; }, 1200);
      } else if (e.key === "n") {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (e.key === "q") {
        e.preventDefault();
        setQuickNoteOpen(true);
      } else if (e.key === "a") {
        e.preventDefault();
        setAssistantOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setQuickAddOpen, setCommandOpen, setQuickNoteOpen, setAssistantOpen, navigate, toast]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <Outlet />
      </div>
      <MobileNav />
      <BottomDock />
      <CommandPalette />
      <QuickAddDialog defaultProjectId={projectMatch?.params.id} />
      <QuickNoteDialog />
      <ShortcutsDialog />
      <ReminderEngine />
      <GamificationEngine />
      <MeetingSyncEngine />
      <AiAssistant />
    </div>
  );
}
