import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { fireBrowserNotification } from "@/lib/reminders";
import {
  remainingSec,
  elapsedSec,
  creditedMinutes,
  loadPomodoro,
  savePomodoro,
  clearPomodoro,
  type Phase,
  type PomodoroSnapshot,
} from "@/lib/pomodoroClock";

export type { Phase };

interface PomodoroValue {
  phase: Phase;
  running: boolean;
  /** Seconds left in the current phase. */
  remaining: number;
  /** Total seconds of the current phase (for the progress ring). */
  total: number;
  /** Completed work rounds in the current cycle. */
  round: number;
  activeTaskId?: string;
  /** Begin a work phase (optionally bound to a task). Resumes if already in a phase. */
  start: (taskId?: string) => void;
  pause: () => void;
  resume: () => void;
  /** End the current phase immediately and move to the next. */
  skip: () => void;
  /** Finish now: credit the focus time put in so far, then return to idle. */
  finishEarly: () => void;
  /** Return to idle, dropping the current phase (still credits work time — see finishEarly). */
  reset: () => void;
  setActiveTask: (taskId?: string) => void;
}

const PomodoroContext = createContext<PomodoroValue | null>(null);

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Помодоро",
  work: "Фокус",
  short: "Перерыв",
  long: "Большой перерыв",
};

export function phaseLabel(p: Phase): string {
  return PHASE_LABEL[p];
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { settings, addPomodoroSession } = useData();
  const { toast } = useToast();
  const cfg = settings.pomodoro;

  const idleSnapshot = (): PomodoroSnapshot => ({
    phase: "idle",
    running: false,
    endsAt: null,
    pausedRemaining: cfg.workMin * 60,
    total: cfg.workMin * 60,
    round: 0,
    activeTaskId: undefined,
    startedAt: new Date().toISOString(),
  });

  // Restore a session left running in a closed/reloaded tab — it kept running on the wall clock.
  const [snap, setSnap] = useState<PomodoroSnapshot>(() => loadPomodoro() ?? idleSnapshot());
  /** Bumped by the tick so the derived clock repaints; the value itself is just "now". */
  const [now, setNow] = useState(() => Date.now());

  const remaining = remainingSec(snap, now);

  useEffect(() => {
    savePomodoro(snap);
  }, [snap]);

  const durationFor = (p: Phase): number => {
    if (p === "short") return cfg.shortBreakMin * 60;
    if (p === "long") return cfg.longBreakMin * 60;
    return cfg.workMin * 60;
  };

  /** Move into a phase, starting its countdown from full length. */
  function enter(p: Phase, autorun: boolean, patch: Partial<PomodoroSnapshot> = {}) {
    const secs = durationFor(p);
    const run = autorun && p !== "idle";
    setSnap((s) => ({
      ...s,
      phase: p,
      total: secs,
      running: run,
      endsAt: run ? Date.now() + secs * 1000 : null,
      pausedRemaining: secs,
      startedAt: p === "work" ? new Date().toISOString() : s.startedAt,
      ...patch,
    }));
    if (p === "idle") clearPomodoro();
  }

  /** Credit a work interval (whole minutes) to focus stats + the active task. */
  function creditWork(s: PomodoroSnapshot, elapsed: number) {
    const minutes = creditedMinutes(elapsed);
    if (minutes < 1) return 0;
    addPomodoroSession({
      kind: "work",
      minutes,
      taskId: s.activeTaskId,
      startedAt: s.startedAt,
    });
    return minutes;
  }

  function advanceAfterWork(s: PomodoroSnapshot) {
    const nextRound = s.round + 1;
    const long = nextRound % cfg.roundsBeforeLong === 0;
    const next: Phase = long ? "long" : "short";
    toast(long ? "Помодоро готово — большой перерыв 🎉" : "Помодоро готово — перерыв ☕");
    fireBrowserNotification("Фокус завершён", long ? "Большой перерыв" : "Короткий перерыв");
    enter(next, cfg.autostart, { round: nextRound });
  }

  /**
   * Stop now and bank what was earned. Ending a work phase early still credits the minutes put in —
   * «Завершить» must never silently erase focus time already spent on the task.
   */
  function finishAndCredit() {
    const minutes = snap.phase === "work" ? creditWork(snap, elapsedSec(snap, Date.now())) : 0;
    toast(minutes > 0 ? `Записано ${minutes} мин фокуса` : "Помодоро остановлен");
    setSnap(idleSnapshot());
    clearPomodoro();
  }

  /**
   * The phase ran out. Guarded by a ref because the deadline can be crossed by several sources at
   * once (tick, visibility change, focus) — without it a single completion could be credited twice.
   */
  const completingRef = useRef(false);
  useEffect(() => {
    if (!snap.running || remaining > 0 || completingRef.current) return;
    completingRef.current = true;
    if (snap.phase === "work") {
      creditWork(snap, snap.total);
      advanceAfterWork(snap);
    } else {
      toast("Перерыв окончен — снова в фокус");
      enter("work", cfg.autostart);
    }
    // Released on the next frame, once the new phase is in state.
    setTimeout(() => { completingRef.current = false; }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, snap.running, snap.phase]);

  /**
   * Repaint the derived clock. This interval carries no state — if the browser throttles it to once
   * a minute in a background tab (or skips it entirely while the window is minimised), the time
   * still elapses correctly; only the on-screen number lags until the next tick. Coming back to the
   * tab recomputes immediately via the visibility/focus listeners below.
   */
  useEffect(() => {
    if (!snap.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [snap.running]);

  useEffect(() => {
    const sync = () => setNow(Date.now());
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const value = useMemo<PomodoroValue>(
    () => ({
      phase: snap.phase,
      running: snap.running,
      remaining,
      total: snap.total,
      round: snap.round,
      activeTaskId: snap.activeTaskId,
      start: (taskId) => {
        if (snap.phase === "idle") {
          enter("work", true, taskId !== undefined ? { activeTaskId: taskId } : {});
        } else {
          setSnap((s) => ({
            ...s,
            running: true,
            endsAt: Date.now() + s.pausedRemaining * 1000,
            activeTaskId: taskId !== undefined ? taskId : s.activeTaskId,
          }));
        }
      },
      // Pausing freezes what's left; the deadline is rebuilt from it on resume.
      pause: () =>
        setSnap((s) => ({ ...s, running: false, endsAt: null, pausedRemaining: remainingSec(s, Date.now()) })),
      resume: () =>
        setSnap((s) => ({ ...s, running: true, endsAt: Date.now() + s.pausedRemaining * 1000 })),
      // Only reachable from the active PomodoroBar (phase !== "idle"), so no idle branch needed.
      skip: () => {
        if (snap.phase === "work") {
          creditWork(snap, elapsedSec(snap, Date.now()));
          advanceAfterWork(snap);
        } else {
          enter("work", cfg.autostart);
        }
      },
      finishEarly: finishAndCredit,
      reset: finishAndCredit,
      setActiveTask: (taskId) => setSnap((s) => ({ ...s, activeTaskId: taskId })),
    }),
    // enter/creditWork/advanceAfterWork close over the current snapshot; deps cover the reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, remaining, cfg]
  );

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
}

export function usePomodoro(): PomodoroValue {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoro must be used within PomodoroProvider");
  return ctx;
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
