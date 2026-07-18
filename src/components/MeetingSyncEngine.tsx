import { useEffect, useRef } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { isSupabaseEnvSet } from "@/lib/supabaseEnv";

const POLL_MS = 60_000;

/**
 * Pulls calendar invites out of the Supabase inbox into local Meetings.
 *
 * The pipeline is the same one the Knowledge base already uses: Hermes parses the invite
 * (forwarded to the Telegram bot, or read over IMAP), writes a row with the service_role key,
 * and the browser only ever reads. No OAuth, no backend of ours.
 *
 * The import itself lives in lib/meetingSync.ts so this poller and the manual
 * "Синхронизировать сейчас" button in Settings can't drift apart.
 *
 * lib/meetingSync.ts (and the @supabase/supabase-js client it pulls in) is loaded via dynamic
 * import() instead of a static one — this component is always mounted (AppLayout.tsx), so a
 * static import would put the Supabase client in every user's main bundle even when the feature
 * is off. isSupabaseEnvSet() is a dependency-free check that avoids that entirely.
 */
export function MeetingSyncEngine() {
  const { addMeeting } = useData();
  const { toast } = useToast();
  // Guards against two polls overlapping (slow network) and importing the same invite twice.
  const busy = useRef(false);

  useEffect(() => {
    if (!isSupabaseEnvSet()) return;

    async function tick() {
      if (busy.current) return;
      busy.current = true;
      try {
        const { drainIncomingMeetings } = await import("@/lib/meetingSync");
        const { imported, firstTitle } = await drainIncomingMeetings(addMeeting);
        if (imported === 1) toast(`Встреча из приглашения: ${firstTitle}`);
        else if (imported > 1) toast(`Импортировано встреч: ${imported}`);
      } catch {
        // Offline, or the SQL/RLS isn't applied yet — stay quiet and retry on the next tick.
        // Settings surfaces the real error when the user syncs by hand.
      } finally {
        busy.current = false;
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
