import { useEffect } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { hasFired, markFired, fireBrowserNotification } from "@/lib/reminders";
import { isPushConfigured, currentSubscription, syncReminders } from "@/lib/push";
import { isQuietHour } from "@/types";

const HOUR = 60 * 60 * 1000;

/** Polls tasks/meetings and fires local reminders when their time arrives. */
export function ReminderEngine() {
  const { tasks, meetings, settings } = useData();
  const { toast } = useToast();

  useEffect(() => {
    function check() {
      const now = Date.now();
      // Quiet hours: hold reminders — they'll fire once the window ends (within staleness).
      if (settings.quietEnabled && isQuietHour(settings.quietFrom, settings.quietTo, new Date().getHours())) return;

      // Task reminders — fire once, only if not stale beyond 6h.
      tasks.forEach((t) => {
        if (t.done || !t.remindAt) return;
        const at = new Date(t.remindAt).getTime();
        const key = `task:${t.id}:${t.remindAt}`;
        if (at <= now && now - at < 6 * HOUR && !hasFired(key)) {
          markFired(key);
          toast(`Напоминание: ${t.title}`);
          fireBrowserNotification("Напоминание", t.title);
        }
      });

      // Meetings — remind at start time, within 30 min window. Closed ones stay quiet.
      meetings.forEach((m) => {
        if (m.done) return;
        const at = new Date(`${m.date}T${m.time}`).getTime();
        const key = `meet:${m.id}:${m.date}${m.time}`;
        if (at <= now && now - at < 30 * 60 * 1000 && !hasFired(key)) {
          markFired(key);
          toast(`Встреча: ${m.title} в ${m.time}`);
          fireBrowserNotification("Встреча сейчас", `${m.title} · ${m.time}`);
        }
      });
    }

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [tasks, meetings, toast, settings.quietEnabled, settings.quietFrom, settings.quietTo]);

  /**
   * Keeps the push queue in step with local reminders, so a reminder that's cleared or a task
   * that's closed can't still buzz the phone later. No-ops entirely unless push is set up.
   */
  useEffect(() => {
    if (!isPushConfigured()) return;
    let cancelled = false;
    currentSubscription().then((sub) => {
      if (sub && !cancelled) syncReminders(tasks).catch(() => { /* offline — next change retries */ });
    });
    return () => { cancelled = true; };
  }, [tasks]);

  return null;
}
