import { Outlet, useMatch } from "react-router-dom";

import { BottomDock } from "@/components/BottomDock";
import { CommandPalette } from "@/components/CommandPalette";
import { QuickAddDialog } from "@/components/QuickAddDialog";
import { QuickNoteDialog } from "@/components/QuickNoteDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { ReminderEngine } from "@/components/ReminderEngine";
import { GamificationEngine } from "@/components/GamificationEngine";
import { MeetingSyncEngine } from "@/components/MeetingSyncEngine";
import { CalendarSyncEngine } from "@/components/CalendarSyncEngine";
import { AiAssistant } from "@/components/AiAssistant";
import { useGlobalShortcuts } from "@/components/layout/useGlobalShortcuts";

/**
 * Everything that must stay mounted on every page, whatever chrome the page draws itself:
 * reminders/meeting alerts, calendar + meeting sync, gamification, the global dialogs and
 * shortcuts. The Craft Dark screens bring their own sidebar; the legacy Архив page nests
 * inside AppLayout for its own.
 */
export function GlobalLayout() {
  // Quick-add opened while looking at a project should file into that project by default.
  const projectMatch = useMatch("/projects/:id");
  // Full-screen focus mode stays distraction-free: no floating dock there.
  const focus = useMatch("/focus");
  useGlobalShortcuts();

  return (
    <>
      <Outlet />
      {!focus && <BottomDock />}
      <CommandPalette />
      <QuickAddDialog defaultProjectId={projectMatch?.params.id} />
      <QuickNoteDialog />
      <ShortcutsDialog />
      <ReminderEngine />
      <GamificationEngine />
      <MeetingSyncEngine />
      <CalendarSyncEngine />
      <AiAssistant />
    </>
  );
}
