import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Task } from "@/types";

/**
 * Web Push — reminders that fire with the tab closed.
 *
 * The honest trade-off, stated once here: a page cannot run while it's closed, so SOMETHING
 * server-side has to know a reminder is due. This ships the minimum off-device — the task's
 * TITLE and TIME, nothing else — into a queue that deletes itself once sent. It is not the
 * full cloud-sync (explicitly not wanted); it is the smallest slice that makes push possible.
 *
 * Without this, `remindAt` only works while the tab is open (see ReminderEngine).
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushConfigured(): boolean {
  return !!VAPID_PUBLIC_KEY && isSupabaseConfigured() && "serviceWorker" in navigator && "PushManager" in window;
}

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

/** Current push subscription, if this browser already has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Subscribes this browser and stores the endpoint so the sender can reach it. */
export async function subscribeToPush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new Error("VITE_VAPID_PUBLIC_KEY не задан — см. .env.example");
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase не настроен.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано.");

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
  if (error) throw new Error(error.message);
}

/** Unsubscribes this browser and forgets the endpoint. */
export async function unsubscribeFromPush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const supabase = getSupabaseClient();
  if (supabase) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/**
 * Mirrors the reminder queue for tasks that have `remindAt` in the future and aren't done.
 * Anything else is removed, so clearing a reminder or closing a task cancels its push.
 */
export async function syncReminders(tasks: Task[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !VAPID_PUBLIC_KEY) return;

  const now = Date.now();
  const due = tasks.filter(
    (t) => !t.done && !t.archivedAt && t.remindAt && new Date(t.remindAt).getTime() > now
  );

  if (due.length > 0) {
    const { error } = await supabase.from("push_reminders").upsert(
      due.map((t) => ({
        id: t.id,
        title: t.title,
        remind_at: new Date(t.remindAt!).toISOString(),
        url: "/tasks",
        sent_at: null,
      }))
    );
    if (error) throw new Error(error.message);
  }

  // Drop everything that no longer has a live reminder (cleared, completed, archived, deleted).
  const keep = due.map((t) => t.id);
  const { data: existing } = await supabase.from("push_reminders").select("id");
  const stale = ((existing as { id: string }[] | null) ?? [])
    .map((r) => r.id)
    .filter((id) => !keep.includes(id));
  if (stale.length > 0) await supabase.from("push_reminders").delete().in("id", stale);
}
