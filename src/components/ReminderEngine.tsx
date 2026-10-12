import { useEffect } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { hasFired, markFired, fireBrowserNotification } from "@/lib/reminders";
import { dueMeetingAlerts } from "@/lib/meetingAlerts";
import { playChime } from "@/lib/sound";
import { dueSubtaskReminders } from "@/lib/subtasks";
import { isPushEnvSet } from "@/lib/pushEnv";
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

      // Subtask reminders — a subtask carries its own remindAt, so a single piece of a big task
      // can buzz on its own without dragging the whole parent into the notification.
      dueSubtaskReminders(tasks, now, 6 * HOUR).forEach(({ parent, sub }) => {
        const key = `sub:${parent.id}:${sub.id}:${sub.remindAt}`;
        if (hasFired(key)) return;
        markFired(key);
        toast(`Напоминание: ${sub.title}`);
        fireBrowserNotification("Напоминание", `${sub.title} · ${parent.title}`);
      });

      // Meetings — a bell 5 minutes before the start, then again at the start (within 30 min).
      // Closed ones stay quiet. The sound follows the app's «Звук» setting.
      dueMeetingAlerts(meetings, now).forEach(({ meeting: m, kind, key, minutesLeft }) => {
        if (hasFired(key)) return;
        markFired(key);
        if (kind === "soon") {
          toast(`Через ${minutesLeft} мин: ${m.title} в ${m.time}`);
          fireBrowserNotification(`Встреча через ${minutesLeft} мин`, `${m.title} · ${m.time}`);
        } else {
          toast(`Встреча: ${m.title} в ${m.time}`);
          fireBrowserNotification("Встреча сейчас", `${m.title} · ${m.time}`);
        }
        if (settings.soundEnabled) playChime();
      });
    }

    check();
    // 20s polling keeps the 5-minute alert within ~20s of its moment.
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, [tasks, meetings, toast, settings.quietEnabled, settings.quietFrom, settings.quietTo, settings.soundEnabled]);

  /**
   * Keeps the push queue in step with local reminders, so a reminder that's cleared or a task
   * that's closed can't still buzz the phone later. No-ops entirely unless push is set up.
   *
   * lib/push.ts (and @supabase/supabase-js underneath it) is loaded via dynamic import() rather
   * than a static one — this component is always mounted, so a static import would ship the
   * Supabase client in every user's main bundle even with push off. isPushEnvSet() is the
   * dependency-free version of the same check (see lib/pushEnv.ts).
   */
  useEffect(() => {
    if (!isPushEnvSet()) return;
    let cancelled = false;
    import("@/lib/push").then(({ currentSubscription, syncReminders }) =>
      currentSubscription().then((sub) => {
        if (sub && !cancelled) syncReminders(tasks).catch(() => { /* offline — next change retries */ });
      })
    );
    return () => { cancelled = true; };
  }, [tasks]);

  return null;
}
