import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { fireBrowserNotification } from "@/lib/reminders";

export type Phase = "idle" | "work" | "short" | "long";

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
  /** Return to idle, dropping the current phase. */
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

  const [phase, setPhase] = useState<Phase>("idle");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(cfg.workMin * 60);
  const [total, setTotal] = useState(cfg.workMin * 60);
  const [round, setRound] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const startedAtRef = useRef<string>(new Date().toISOString());

  const durationFor = (p: Phase): number => {
    if (p === "short") return cfg.shortBreakMin * 60;
    if (p === "long") return cfg.longBreakMin * 60;
    return cfg.workMin * 60;
  };

  function enter(p: Phase, autorun: boolean) {
    const secs = durationFor(p);
    setPhase(p);
    setTotal(secs);
    setRemaining(secs);
    setRunning(autorun && p !== "idle");
    if (p === "work") startedAtRef.current = new Date().toISOString();
  }

  /** Credit a work interval (whole minutes) to focus stats + the active task. */
  function creditWork(elapsedSec: number) {
    const minutes = Math.round(elapsedSec / 60);
    if (minutes < 1) return;
    addPomodoroSession({
      kind: "work",
      minutes,
      taskId: activeTaskId,
      startedAt: startedAtRef.current,
    });
  }

  function advanceAfterWork() {
    const nextRound = round + 1;
    setRound(nextRound);
    const long = nextRound % cfg.roundsBeforeLong === 0;
    const next: Phase = long ? "long" : "short";
    toast(long ? "Помодоро готово — большой перерыв 🎉" : "Помодоро готово — перерыв ☕");
    fireBrowserNotification("Фокус завершён", long ? "Большой перерыв" : "Короткий перерыв");
    enter(next, cfg.autostart);
  }

  // Tick once per second while running; complete the phase at zero.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Fire phase completion when the countdown hits zero.
  useEffect(() => {
    if (running && remaining === 0) {
      if (phase === "work") {
        creditWork(total);
        advanceAfterWork();
      } else {
        toast("Перерыв окончен — снова в фокус");
        enter("work", cfg.autostart);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running]);

  const value = useMemo<PomodoroValue>(
    () => ({
      phase,
      running,
      remaining,
      total,
      round,
      activeTaskId,
      start: (taskId) => {
        if (taskId !== undefined) setActiveTaskId(taskId);
        if (phase === "idle") enter("work", true);
        else setRunning(true);
      },
      pause: () => setRunning(false),
      resume: () => setRunning(true),
      // Only reachable from the active PomodoroBar (phase !== "idle"), so no idle branch needed.
      skip: () => {
        if (phase === "work") {
          creditWork(total - remaining);
          advanceAfterWork();
        } else {
          enter("work", cfg.autostart);
        }
      },
      reset: () => {
        // Ending a work phase early still credits the elapsed minutes — same as skip(),
        // so "Завершить" can't silently erase focus time that was already put in.
        if (phase === "work") creditWork(total - remaining);
        setRound(0);
        setActiveTaskId(undefined);
        enter("idle", false);
        setRemaining(cfg.workMin * 60);
        setTotal(cfg.workMin * 60);
      },
      setActiveTask: (taskId) => setActiveTaskId(taskId),
    }),
    // enter/creditWork/advanceAfterWork close over current state; deps cover the reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, running, remaining, total, round, activeTaskId, cfg]
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
