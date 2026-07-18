import type { AppData } from "@/types";
import { DEFAULT_SETTINGS, DEFAULT_GAMIFICATION, DEFAULT_POMODORO } from "@/types";

const STORAGE_KEY = "crm-taskmanager-data-v1";

/** Backfill fields added after a user's data was first persisted. */
export function migrate(data: AppData): AppData {
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
  // Nested settings added in v2.0 — backfill sub-objects so partial saves stay valid.
  data.settings.pomodoro = { ...DEFAULT_POMODORO, ...(data.settings.pomodoro ?? {}) };
  data.pomodoroSessions = data.pomodoroSessions ?? [];

  // Trash auto-purge: permanently drop archived items older than trashPurgeDays.
  const purgeDays = data.settings.trashPurgeDays ?? 0;
  if (purgeDays > 0) {
    const cutoff = Date.now() - purgeDays * 86400000;
    // A malformed/unparseable archivedAt must NOT be treated as "definitely expired" — NaN >= cutoff
    // is false, which used to silently purge the record. Unparseable → keep, same as no date at all.
    const kept = (at?: string) => {
      if (!at) return true;
      const t = new Date(at).getTime();
      return Number.isNaN(t) || t >= cutoff;
    };
    data.tasks = (data.tasks ?? []).filter((t) => kept(t.archivedAt));
    data.projects = (data.projects ?? []).filter((p) => kept(p.archivedAt));
    data.notes = (data.notes ?? []).filter((n) => kept(n.archivedAt));
  }
  data.tasks = (data.tasks ?? []).map((t, i) => ({
    ...t,
    tags: t.tags ?? [],
    important: t.important ?? false,
    priority: t.priority ?? 0,
    spentMin: t.spentMin ?? 0,
    links: t.links ?? [],
    comments: t.comments ?? [],
    attachments: t.attachments ?? [],
    recurrence: t.recurrence ?? "none",
    order: typeof t.order === "number" ? t.order : i,
  }));
  data.clients = (data.clients ?? []).map((c) => ({
    ...c,
    payments: c.payments ?? [],
    tags: c.tags ?? [],
    contacts: c.contacts ?? [],
    customFields: c.customFields ?? [],
    touches: c.touches ?? [],
  }));
  // Students subsystem added when the CRM section was resurfaced — backfill for older saves.
  data.students = (data.students ?? []).map((s) => ({
    ...s,
    payments: s.payments ?? [],
    tags: s.tags ?? [],
    active: s.active ?? true,
    paymentsPerMonth: s.paymentsPerMonth === 2 ? 2 : 1,
  }));
  data.notes = (data.notes ?? []).map((n) => ({ ...n, pinned: n.pinned ?? false, tags: n.tags ?? [] }));
  data.meetings = (data.meetings ?? []).map((m) => ({
    ...m,
    durationMin: m.durationMin ?? 30,
    recurrence: m.recurrence ?? "none",
  }));
  if (!data.completionLog) {
    // Backfill from an older string[] of active days, if present.
    const legacy = (data as unknown as { completionDays?: string[] }).completionDays ?? [];
    data.completionLog = Object.fromEntries(legacy.map((d) => [d, 1]));
  }
  if (!data.gamification) {
    // Seed XP from historical completions so existing users start with a level.
    const past = Object.values(data.completionLog).reduce((s, n) => s + n, 0);
    data.gamification = { ...DEFAULT_GAMIFICATION, xp: past * 10 };
  } else {
    data.gamification = { ...DEFAULT_GAMIFICATION, ...data.gamification };
  }
  return data;
}

/** Where a raw record is backed up if it fails to parse/migrate, so a malformed save never just
 * vanishes — the caller falls back to seed data, and the very next save would otherwise overwrite
 * this raw blob for good. */
const CORRUPT_BACKUP_KEY = "crm-taskmanager-data-v1-corrupt-backup";

export function loadData(): AppData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw) as AppData);
  } catch (e) {
    try {
      localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
    } catch {
      // best-effort — if this write also fails (e.g. quota), there's nothing more to do here.
    }
    console.error("Failed to load/migrate saved data — backed up the raw copy and starting fresh.", e);
    return null;
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    // Thrown from a commit-phase useEffect this would otherwise crash the whole app to the error
    // boundary (e.g. on QuotaExceededError) — better to drop this one write and keep the app alive.
    console.error("Failed to save data (localStorage write failed).", e);
    return false;
  }
}

/**
 * Coalesces rapid-fire `saveData` calls (e.g. `Reorder.Group onReorder` firing on every pixel of
 * a drag) into one write `delayMs` after the last change, instead of writing to localStorage on
 * every intermediate state. `flush()` bypasses the delay for a synchronous, immediate write —
 * callers MUST wire it to `visibilitychange`/`pagehide` (see DataProvider.tsx), or a debounced
 * write in flight when the tab closes would silently drop the user's last edit. `flush()` is
 * idempotent: calling it with nothing pending (already flushed, or never scheduled) is a no-op.
 */
export function createDebouncedSaver(delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: AppData | null = null;

  function writePending() {
    if (pending !== null) {
      saveData(pending);
      pending = null;
    }
  }

  function schedule(data: AppData) {
    pending = data;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      writePending();
    }, delayMs);
  }

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    writePending();
  }

  return { schedule, flush };
}
