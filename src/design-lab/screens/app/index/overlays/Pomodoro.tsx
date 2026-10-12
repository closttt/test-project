/**
 * «Индекс» · Помодоро — the floating session plate (parity with components/PomodoroBar.tsx).
 * Appears only while a phase is running/paused; idle starts from the dock. Monochrome: the only
 * lime is the progress line while the clock is actually running.
 *
 * Hidden on /focus — the Focus screen IS the session there.
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { usePomodoro, phaseLabel, formatClock } from "@/store/PomodoroProvider";
import { creditedMinutes } from "@/lib/pomodoroClock";
import { easeOut } from "@/lib/motion";
import { B, T, tab, display, DockPlate, Line } from "@/design-lab/screens/_kit/index";
import { useTaskPanel } from "@/design-lab/screens/_kit/index-ui";
import { PomodoroSettingsButton } from "./PomodoroMenu";

/** Derived view of the pomodoro session — shared by the plate, the dock and the Focus page. */
export function usePomodoroView() {
  const pomo = usePomodoro();
  const { allTasks, settings } = useData();
  const task = pomo.activeTaskId ? allTasks.find((t) => t.id === pomo.activeTaskId) : undefined;
  const pct = pomo.total > 0 ? 1 - pomo.remaining / pomo.total : 0;
  /** What «Завершить» would bank right now — shown so the number is never a surprise. */
  const elapsedMin = pomo.phase === "work" ? creditedMinutes(pomo.total - pomo.remaining) : 0;
  const rounds = settings.pomodoro.roundsBeforeLong;
  const doneInCycle = pomo.round > 0 && pomo.round % rounds === 0 ? rounds : pomo.round % rounds;
  const finishTitle =
    pomo.phase === "work" ? `Завершить досрочно — записать ${elapsedMin} мин в «${task ? task.title : "фокус"}»` : "Завершить";
  return { ...pomo, task, pct, elapsedMin, rounds, doneInCycle, finishTitle, active: pomo.phase !== "idle" };
}

/** Completed rounds of the cycle as 6px squares (filled = done). */
export function RoundMarks({ rounds, done, size = 6 }: { rounds: number; done: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Раунд ${done} из ${rounds}`}>
      {Array.from({ length: rounds }, (_, i) => (
        <span key={i} style={{ width: size, height: size, background: i < done ? B.text2 : B.l15 }} />
      ))}
    </span>
  );
}

/** One control cell of the plate's foot: text action, hairline separated. */
function Cell({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title?: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-11 flex-1 items-center justify-center outline-none transition-colors duration-150 hover:bg-[#101010] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#ADFB0C] ${danger ? "hover:!text-[#FF5A36]" : "hover:!text-white"}`}
      style={{ ...T.meta, color: B.text2 }}
    >
      {children}
    </button>
  );
}

export default function Pomodoro() {
  const v = usePomodoroView();
  const { open } = useTaskPanel();
  const { pathname } = useLocation();
  const show = v.active && pathname !== "/focus";

  return (
    <div className="pointer-events-none fixed bottom-[96px] right-6 z-40" style={{ fontFamily: B.font, color: B.text }}>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            key="pomo"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: easeOut }}
            className="pointer-events-auto"
          >
            <DockPlate className="w-[320px]" style={{ boxShadow: B.shadowFloat }}>
              <div className="flex items-start justify-between pl-5">
                <div className="flex min-w-0 flex-1 flex-col pt-4">
                  <div className="flex items-center gap-3">
                    <span style={{ ...T.caps, color: v.phase === "work" ? B.text : B.text2 }}>{phaseLabel(v.phase)}</span>
                    <RoundMarks rounds={v.rounds} done={v.doneInCycle} />
                    {!v.running && <span style={{ ...T.meta, color: B.text3 }}>пауза</span>}
                  </div>
                  <div className="mt-3" style={{ ...display(48), ...tab, color: v.running ? B.text : B.text2 }}>
                    {formatClock(v.remaining)}
                  </div>
                </div>
                <PomodoroSettingsButton size={44} />
              </div>
              <div className="flex min-w-0 items-baseline gap-1.5 px-5 pb-4 pt-3" style={{ ...T.meta, color: B.text3 }}>
                {v.task ? (
                  <button type="button" onClick={() => open(v.task!.id)} className="min-w-0 truncate text-left outline-none hover:text-white" style={{ ...T.body, color: B.text2 }} title={v.task.title}>
                    {v.task.title}
                  </button>
                ) : (
                  <span className="truncate" style={{ ...T.body, color: B.text3 }}>
                    {v.phase === "work" ? "Без задачи" : "Отдохни"}
                  </span>
                )}
                {v.elapsedMin > 0 && <span className="shrink-0" style={tab}>· {v.elapsedMin} мин</span>}
              </div>
              <Line pct={v.pct * 100} color={v.running && v.phase === "work" ? B.lime : B.text2} />
              <div className="flex" style={{ borderTop: `1px solid ${B.l7}` }}>
                <Cell onClick={() => (v.running ? v.pause() : v.resume())} title={v.running ? "Пауза" : "Продолжить"}>
                  {v.running ? "Пауза" : "Продолжить"}
                </Cell>
                <span className="w-px" style={{ background: B.l7 }} />
                <Cell onClick={v.skip} title="Пропустить фазу">
                  Пропустить
                </Cell>
                <span className="w-px" style={{ background: B.l7 }} />
                <Cell onClick={v.finishEarly} title={v.finishTitle} danger>
                  Завершить
                </Cell>
              </div>
            </DockPlate>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
