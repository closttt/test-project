/** Persisted set of already-fired reminder keys, so we don't re-notify on reload. */
const KEY = "crm-fired-reminders-v1";

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

let fired = load();

export function hasFired(key: string): boolean {
  return fired.has(key);
}

export function markFired(key: string) {
  fired.add(key);
  // Keep it bounded — only the last 200 keys.
  if (fired.size > 200) fired = new Set(Array.from(fired).slice(-200));
  localStorage.setItem(KEY, JSON.stringify(Array.from(fired)));
}

/** Ask the browser for notification permission (call from a user gesture). */
export async function requestNotifications(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function notificationsEnabled(): boolean {
  return "Notification" in window && Notification.permission === "granted";
}

/** Raw permission state — lets the UI tell "not asked yet" apart from "explicitly denied"
 * (denied means the browser won't show the prompt again; asking has to happen in site settings). */
export function notificationPermission(): NotificationPermission {
  return "Notification" in window ? Notification.permission : "denied";
}

export function fireBrowserNotification(title: string, body?: string) {
  if (notificationsEnabled()) {
    try {
      new Notification(title, { body, icon: "/icon.svg" });
    } catch {
      /* some browsers require a service worker; toast still shows */
    }
  }
}
