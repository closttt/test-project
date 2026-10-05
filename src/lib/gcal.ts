import { AUTH_REQUIRED_EVENT, UnauthenticatedError } from "@/lib/auth";
import { addDays, localDayStr } from "@/lib/format";
import { occurrences, parseIcs, type CalOccurrence } from "@/lib/ical";

/**
 * Google Calendar sync, client side: where the secret iCal address is kept, one shared sync run
 * (the 5-minute poller and «Синхронизировать сейчас» never overlap), and the last result for the
 * Settings card.
 *
 * The address lives in THIS browser's localStorage, deliberately not in the synced app state: it
 * is a read key to the whole calendar, and the app state is mirrored to the cloud. The meetings it
 * produces do sync, so other devices see them anyway.
 */

const URL_KEY = "crm-gcal-ics-url-v1";
const STATUS_KEY = "crm-gcal-status-v1";
export const GCAL_EVENT = "crm-gcal-changed";

/** Import window: yesterday … five weeks ahead. Older imported meetings stay as history. */
export const WINDOW_BACK_DAYS = 1;
export const WINDOW_AHEAD_DAYS = 35;

export interface GcalStatus {
  at: string; // ISO
  ok: boolean;
  message: string;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function notify() {
  window.dispatchEvent(new Event(GCAL_EVENT));
}

export function getIcsUrl(): string {
  return read(URL_KEY) ?? "";
}

export function setIcsUrl(url: string) {
  try {
    if (url.trim()) localStorage.setItem(URL_KEY, url.trim());
    else { localStorage.removeItem(URL_KEY); localStorage.removeItem(STATUS_KEY); }
  } catch { /* private mode: the sync just won't persist */ }
  notify();
}

export function getGcalStatus(): GcalStatus | null {
  try { return JSON.parse(read(STATUS_KEY) ?? "null") as GcalStatus | null; } catch { return null; }
}

function setStatus(s: GcalStatus) {
  try { localStorage.setItem(STATUS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  notify();
}

/** Only the start of the address, for display — the rest is the secret. */
export function maskIcsUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^webcals?:/i, "https:"));
    return `${u.host}/…${u.pathname.slice(-12)}`;
  } catch {
    return "…";
  }
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch("/api/google/ical", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => { throw new Error("Нет связи с сервером приложения."); });
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 401) {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    throw new UnauthenticatedError();
  }
  if (!res.ok) {
    const body = type.includes("json") ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    throw new Error(body.error ?? `Сервер ответил ${res.status}.`);
  }
  if (!type.includes("calendar")) throw new Error("Сервер вернул не календарь — функция /api/google/ical недоступна.");
  return res.text();
}

export interface SyncSummary {
  added: number;
  updated: number;
  removed: number;
}

export type ApplyCalendar = (occ: CalOccurrence[], windowFrom: string) => SyncSummary;

let inFlight: Promise<SyncSummary | null> | null = null;

/**
 * One full sync: fetch the feed, expand the window, hand the occurrences to the store. Returns
 * null when no address is set. Errors are recorded in the status (and rethrown for the button).
 */
export function runCalendarSync(apply: ApplyCalendar): Promise<SyncSummary | null> {
  if (inFlight) return inFlight;
  const url = getIcsUrl();
  if (!url) return Promise.resolve(null);
  inFlight = (async () => {
    try {
      const text = await fetchFeed(url);
      const from = addDays(new Date(), -WINDOW_BACK_DAYS);
      const to = addDays(new Date(), WINDOW_AHEAD_DAYS);
      const [fy, fm, fd] = from.split("-").map(Number);
      const [ty, tm, td] = to.split("-").map(Number);
      const occ = occurrences(parseIcs(text), new Date(fy, fm - 1, fd).getTime(), new Date(ty, tm - 1, td, 23, 59).getTime());
      const r = apply(occ, from);
      const changes = [r.added && `+${r.added}`, r.updated && `изменено ${r.updated}`, r.removed && `убрано ${r.removed}`].filter(Boolean).join(", ");
      setStatus({ at: new Date().toISOString(), ok: true, message: `${occ.length} встреч до ${localDayStr(new Date(ty, tm - 1, td)).split("-").reverse().slice(0, 2).join(".")}${changes ? ` · ${changes}` : ""}` });
      return r;
    } catch (e) {
      if (!(e instanceof UnauthenticatedError)) {
        setStatus({ at: new Date().toISOString(), ok: false, message: e instanceof Error ? e.message : String(e) });
      }
      throw e;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
