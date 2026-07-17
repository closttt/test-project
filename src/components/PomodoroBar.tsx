import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, SkipForward, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PomodoroSettingsMenu } from "@/components/PomodoroSettingsMenu";
import { useData } from "@/store/DataProvider";
import { usePomodoro, phaseLabel, formatClock, type Phase } from "@/store/PomodoroProvider";
import { easeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";

const RING = 30;
const CIRC = 2 * Math.PI * RING;

const PHASE_COLOR: Record<Phase, string> = {
  idle: "hsl(var(--brand))",
  work: "hsl(var(--brand))",
  short: "hsl(var(--success))",
  long: "hsl(38 92% 55%)",
};

/** App-wide floating pomodoro session card. Idle state has no FAB — start it from the bottom dock instead. */
export function PomodoroBar() {
  const { phase, running, remaining, total, round, activeTaskId, pause, resume, skip, reset } =
    usePomodoro();
  const { allTasks, settings } = useData();

  const active = phase !== "idle";
  const task = activeTaskId ? allTasks.find((t) => t.id === activeTaskId) : undefined;
  const pct = total > 0 ? 1 - remaining / total : 0;
  const color = PHASE_COLOR[phase];
  const rounds = settings.pomodoro.roundsBeforeLong;

  return (
    <div className="pointer-events-none fixed bottom-36 right-4 z-40 md:right-6">
      <AnimatePresence mode="wait" initial={false}>
        {active && (
          <motion.div
            key="bar"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: easeOut }}
            className="pointer-events-auto flex w-[19rem] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-xl shadow-black/30 backdrop-blur"
          >
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
                <circle cx="36" cy="36" r={RING} fill="none" stroke="hsl(var(--secondary))" strokeWidth="6" />
                <circle
                  cx="36"
                  cy="36"
                  r={RING}
                  fill="none"
                  stroke={color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - pct)}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
                {formatClock(remaining)}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color }}>
                  {phaseLabel(phase)}
                </span>
                <span className="flex items-center gap-1">
                  {Array.from({ length: rounds }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        i < round % rounds || (round > 0 && round % rounds === 0)
                          ? "bg-brand"
                          : "bg-secondary"
                      )}
                    />
                  ))}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {task ? task.title : phase === "work" ? "Без задачи" : "Отдохни"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <PomodoroSettingsMenu className="h-8 w-8" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => (running ? pause() : resume())}
                title={running ? "Пауза" : "Продолжить"}
              >
                {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={skip} title="Пропустить фазу">
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-risk" onClick={reset} title="Завершить">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
