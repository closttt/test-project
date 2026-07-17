import { fetchIncomingMeetings, deleteIncomingMeeting } from "@/lib/supabase";
import type { Meeting } from "@/types";

export type AddMeeting = (input: Omit<Meeting, "id" | "durationMin" | "recurrence"> & {
  durationMin?: number;
  recurrence?: Meeting["recurrence"];
}) => void;

export interface DrainResult {
  imported: number;
  /** Title of the first imported invite — lets the caller show a specific toast. */
  firstTitle?: string;
}

/**
 * Imports every pending invite into local Meetings and drains the inbox row-by-row.
 *
 * Deleting each row right after its import is what makes this idempotent: re-running it (a
 * second poll, a manual "sync now", a refresh mid-drain) has nothing left to re-import, and a
 * meeting the user later deletes locally can't come back. A failed delete stops that item only —
 * the invite stays queued for the next run rather than being silently lost.
 *
 * Shared by MeetingSyncEngine (every 60s) and the "Синхронизировать сейчас" button, so both
 * paths behave identically — including sharing the SAME in-flight run below, since without it a
 * poll tick racing a manual click could both fetch the same pending row before either deletes it,
 * importing it twice.
 */
let inFlight: Promise<DrainResult> | null = null;

export function drainIncomingMeetings(addMeeting: AddMeeting): Promise<DrainResult> {
  if (inFlight) return inFlight;
  const run = (async () => {
    const pending = await fetchIncomingMeetings();
    let imported = 0;
    let firstTitle: string | undefined;
    for (const item of pending) {
      addMeeting(item.meeting);
      await deleteIncomingMeeting(item.id);
      if (imported === 0) firstTitle = item.meeting.title;
      imported++;
    }
    return { imported, firstTitle };
  })().finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

/** How many invites are waiting. Used by Settings to show the integration is actually alive. */
export async function countIncomingMeetings(): Promise<number> {
  return (await fetchIncomingMeetings()).length;
}
