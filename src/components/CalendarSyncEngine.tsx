import { useEffect, useRef } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { getIcsUrl, runCalendarSync } from "@/lib/gcal";

const POLL_MS = 5 * 60_000;

/**
 * Keeps «Встречи» in step with Google Calendar: syncs on start, every 5 minutes, when the tab
 * comes back into view (the Settings card runs its own sync right after the address is saved).
 * Silent unless something new arrived — a background sync that toasts every 5 minutes would be noise.
 */
export function CalendarSyncEngine() {
  const { applyCalendarSync } = useData();
  const { toast } = useToast();
  // The latest store action without re-arming the timers on every render.
  const apply = useRef(applyCalendarSync);
  apply.current = applyCalendarSync;

  useEffect(() => {
    let lastRun = 0;
    const tick = async (force = false) => {
      if (!getIcsUrl()) return;
      if (!force && Date.now() - lastRun < 60_000) return;
      lastRun = Date.now();
      try {
        const r = await runCalendarSync((occ, from) => apply.current(occ, from));
        if (r && r.added > 0) toast(r.added === 1 ? "Новая встреча из Google Календаря" : `Из Google Календаря: ${r.added} новых встреч`);
      } catch {
        /* recorded in the Settings card's status */
      }
    };
    void tick(true);
    const id = setInterval(() => void tick(true), POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [toast]);

  return null;
}
