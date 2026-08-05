import type { AppData } from "@/types";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Cloud sync for the whole app state (tasks, projects, notes, clients, students, meetings,
 * settings, gamification, pomodoro history) — see supabase/app_state.sql.
 *
 * The app stays LOCAL-FIRST: every change is still written to localStorage exactly as before, and
 * the cloud is a mirror layered on top. That ordering is deliberate — if Supabase is down, slow,
 * misconfigured or the tables don't exist, the user loses nothing and notices nothing. The cloud
 * can only ever ADD safety, never take it away.
 *
 * Caveat worth knowing: file attachments are blobs in IndexedDB, not part of AppData, so they stay
 * on the device that added them. Everything else in AppData travels.
 */

const ROW_ID = "main";
const META_KEY = "crm-cloud-sync-v1";

export interface SyncMeta {
  /** `updated_at` of the last cloud row this device has seen (pushed or pulled). */
  lastSeenRemoteAt?: string;
}

export function loadSyncMeta(): SyncMeta {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) ?? "{}");
    return raw && typeof raw === "object" ? (raw as SyncMeta) : {};
  } catch {
    return {};
  }
}

export function saveSyncMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Best-effort: a full localStorage must not break syncing.
  }
}

/** How much real content a state holds — the yardstick for "would adopting this lose data?". */
export function countEntries(d: AppData | null | undefined): number {
  if (!d) return 0;
  return (
    (d.tasks?.length ?? 0) +
    (d.projects?.length ?? 0) +
    (d.notes?.length ?? 0) +
    (d.clients?.length ?? 0) +
    (d.students?.length ?? 0) +
    (d.meetings?.length ?? 0)
  );
}

/** Rejects anything that isn't a plausible AppData, so a corrupt row can never replace real data. */
export function isPlausibleAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<AppData>;
  return (
    Array.isArray(d.tasks) &&
    Array.isArray(d.projects) &&
    Array.isArray(d.notes) &&
    Array.isArray(d.meetings) &&
    !!d.settings &&
    typeof d.settings === "object"
  );
}

export type SyncDecision =
  /** Cloud has nothing yet — this device seeds it. */
  | { action: "push"; reason: "empty-remote" }
  /** Local is the newest thing we know of. */
  | { action: "push"; reason: "local-current" }
  /** Another device wrote something newer — take it. */
  | { action: "pull"; reason: "remote-newer" }
  /** Remote is newer but adopting it would drop local content — never silently destroy data. */
  | { action: "conflict"; reason: "remote-would-lose-data"; localCount: number; remoteCount: number }
  /** Remote row is corrupt/not AppData. */
  | { action: "skip"; reason: "remote-invalid" };

/**
 * Decides what to do with a fetched cloud row. Pure, so the rules that guard the user's data are
 * testable without a network.
 *
 * The one rule that matters most: a remote state may only replace local when it does NOT lose
 * content. Two devices editing offline is a genuine conflict, and the safe resolution for a
 * single-owner tool is to keep whichever side actually has the data and tell the user — never to
 * let a stale/emptier cloud copy silently wipe a full local one.
 */
export function decideSync(args: {
  local: AppData;
  remote: unknown;
  remoteUpdatedAt: string | null;
  lastSeenRemoteAt?: string;
}): SyncDecision {
  const { local, remote, remoteUpdatedAt, lastSeenRemoteAt } = args;

  if (remote === null || remote === undefined || remoteUpdatedAt === null) {
    return { action: "push", reason: "empty-remote" };
  }
  if (!isPlausibleAppData(remote)) return { action: "skip", reason: "remote-invalid" };

  // Nothing new upstream since this device last synced → our copy is the current one.
  const seen = lastSeenRemoteAt ?? "";
  if (remoteUpdatedAt <= seen) return { action: "push", reason: "local-current" };

  const localCount = countEntries(local);
  const remoteCount = countEntries(remote);
  // Remote is newer, but emptier — that's the shape of "another device started fresh" or a bad
  // write. Refuse to adopt it automatically.
  if (remoteCount < localCount) {
    return { action: "conflict", reason: "remote-would-lose-data", localCount, remoteCount };
  }
  return { action: "pull", reason: "remote-newer" };
}

export interface RemoteState {
  data: unknown;
  updatedAt: string | null;
}

/** Reads the cloud row. Returns an empty state when the table has no row yet. */
export async function fetchRemote(): Promise<RemoteState> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Supabase не настроен.");
  const { data, error } = await db.from("app_state").select("data, updated_at").eq("id", ROW_ID).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { data: null, updatedAt: null };
  return { data: (data as { data: unknown }).data, updatedAt: (data as { updated_at: string }).updated_at };
}

/**
 * Just the row's `updated_at` — cheap enough to ask before every push, which is how a device with
 * a stale tab finds out that another one has written since, instead of overwriting its work.
 */
export async function fetchRemoteStamp(): Promise<string | null> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Supabase не настроен.");
  const { data, error } = await db.from("app_state").select("updated_at").eq("id", ROW_ID).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

/** True when the cloud has moved on since this device last synced. */
export function remoteMovedOn(stamp: string | null, lastSeenRemoteAt?: string): boolean {
  return !!stamp && !!lastSeenRemoteAt && stamp > lastSeenRemoteAt;
}

/** Writes the whole state up, returning the row's new `updated_at`. */
export async function pushRemote(state: AppData): Promise<string | null> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Supabase не настроен.");
  const { data, error } = await db
    .from("app_state")
    .upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() })
    .select("updated_at")
    .single();
  if (error) throw new Error(error.message);
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

/** True when cloud sync is switched on (Supabase keys present). */
export function cloudSyncEnabled(): boolean {
  return getSupabaseClient() !== null;
}

/** What the UI shows about the mirror's health. */
export type CloudSyncStatus =
  | { state: "off" }
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "ok"; at: string; direction: "pushed" | "pulled" }
  | { state: "conflict"; localCount: number; remoteCount: number }
  | { state: "error"; message: string };

/**
 * Turns a Supabase failure into something actionable. The common one by far is "the migration
 * hasn't been run yet", which otherwise surfaces as an opaque schema-cache message.
 */
export function describeSyncError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/schema cache|does not exist|relation .* does not exist/i.test(raw)) {
    return "Таблица app_state ещё не создана — выполните supabase/app_state.sql. Данные пока хранятся только в этом браузере.";
  }
  return raw;
}
