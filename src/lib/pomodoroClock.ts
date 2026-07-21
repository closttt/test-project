export type Phase = "idle" | "work" | "short" | "long";

/**
 * The pomodoro's whole state, kept as a deadline rather than a countdown.
 *
 * A counter decremented by `setInterval` is wrong the moment the tab stops being visible: browsers
 * throttle background timers to about once a minute (and freeze them entirely in some cases), so a
 * minimised window used to leave the clock standing still. Storing WHEN the phase ends and deriving
 * what's left from `Date.now()` makes the tick purely cosmetic — it only decides how often the
 * number is repainted, never how much time has actually passed. Same reason the snapshot is
 * persisted: closing the tab and coming back must resume at the right second, not where it froze.
 */
export interface PomodoroSnapshot {
  phase: Phase;
  running: boolean;
  /** Epoch ms when the running phase ends. Null while paused or idle. */
  endsAt: number | null;
  /** Seconds left, frozen at the moment of pausing. */
  pausedRemaining: number;
  /** Length of the current phase in seconds (drives the progress ring). */
  total: number;
  /** Completed work rounds in the current cycle. */
  round: number;
  activeTaskId?: string;
  /** ISO time the current work phase began — stamped onto the credited session. */
  startedAt: string;
}

/** Seconds left in the current phase, never below zero. */
export function remainingSec(s: PomodoroSnapshot, now: number): number {
  if (!s.running || s.endsAt === null) return Math.max(0, s.pausedRemaining);
  return Math.max(0, Math.ceil((s.endsAt - now) / 1000));
}

/** Seconds already spent in the current phase, capped at its length. */
export function elapsedSec(s: PomodoroSnapshot, now: number): number {
  return Math.min(s.total, Math.max(0, s.total - remainingSec(s, now)));
}

/**
 * Whole minutes credited for a stretch of focus. Rounds to the nearest minute but never rounds a
 * real stretch of work down to nothing: anything from a single second up counts as at least 1 min,
 * so finishing early always records something.
 */
export function creditedMinutes(elapsed: number): number {
  if (elapsed <= 0) return 0;
  return Math.max(1, Math.round(elapsed / 60));
}

const KEY = "crm-pomodoro-v1";

/** Snapshot survives reloads and tab closes — the phase keeps running against the wall clock. */
export function savePomodoro(s: PomodoroSnapshot): void {
  try {
    if (s.phase === "idle") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Best-effort: a full/blocked localStorage shouldn't break a running timer.
  }
}

export function clearPomodoro(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore — see savePomodoro
  }
}

/** Restore a persisted snapshot, or null when there's nothing usable to restore. */
export function loadPomodoro(): PomodoroSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PomodoroSnapshot;
    // Anything malformed is dropped rather than trusted — a bad snapshot would show a nonsense
    // clock or credit nonsense minutes.
    if (!s || typeof s !== "object") return null;
    if (!["idle", "work", "short", "long"].includes(s.phase)) return null;
    if (s.phase === "idle") return null;
    if (typeof s.total !== "number" || s.total <= 0) return null;
    if (typeof s.pausedRemaining !== "number" || Number.isNaN(s.pausedRemaining)) return null;
    if (s.running && typeof s.endsAt !== "number") return null;
    if (typeof s.round !== "number") return null;
    if (typeof s.startedAt !== "string") return null;
    return s;
  } catch {
    return null;
  }
}
