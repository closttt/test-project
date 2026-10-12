/**
 * «Индекс» · нижний док — the site's «МЕНЮ» plate (black, inset #262626, float shadow) turned into
 * the app's three always-there actions. Parity with components/BottomDock.tsx:
 *  · running task timer (Task.timerStartedAt) — elapsed clock + stop, opens the task card;
 *  · Поиск → command palette, Задача → quick add (useUI);
 *  · Помодоро — idle: pick a task to start on; running: clock + pause / resume;
 *  · quick pomodoro settings.
 * Text cells on hairlines instead of round icon buttons; the only lime is a running timer.
 * Hidden on /focus (full-screen, like the real app where the dock lives inside the shell).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Pause, Play } from "lucide-react";

import { useUI } from "@/store/UIProvider";
import { useData } from "@/store/DataProvider";
import { formatClock } from "@/store/PomodoroProvider";
import { B, T, tab, DockPlate } from "@/design-lab/screens/_kit/index";
import { FloatMenu, useFloat, useTaskPanel } from "@/design-lab/screens/_kit/index-ui";
import { PomodoroSettingsButton, PomodoroStartBody } from "./PomodoroMenu";
import { usePomodoroView } from "./Pomodoro";

const cellCls =
  "flex h-14 shrink-0 items-center gap-2.5 px-5 outline-none transition-colors duration-150 hover:bg-[#101010] hover:!text-white focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#ADFB0C]";

const Sep = () => <span aria-hidden className="h-14 w-px shrink-0" style={{ background: B.l10 }} />;

/** Lime when running, grey when paused — the dock's single «now» marker. */
const Live = ({ on }: { on: boolean }) => (
  <span aria-hidden className={`h-[6px] w-[6px] shrink-0 ${on ? "animate-pulse" : ""}`} style={{ background: on ? B.lime : B.text3 }} />
);

function Kbd({ children }: { children: ReactNode }) {
  return <span style={{ ...T.meta, color: B.off, ...tab }}>{children}</span>;
}

export default function Dock() {
  const { setCommandOpen, setQuickAddOpen } = useUI();
  const { allTasks, settings, stopTimer } = useData();
  const pomo = usePomodoroView();
  const { open } = useTaskPanel();
  const { pathname } = useLocation();
  const startMenu = useFloat();

  // A task timer runs independently of Pomodoro — the dock keeps it visible from every screen.
  const timerTask = allTasks.find((t) => t.timerStartedAt);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!timerTask?.timerStartedAt) return;
    const started = new Date(timerTask.timerStartedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerTask?.id, timerTask?.timerStartedAt]);

  if (pathname === "/focus") return null;

  return (
    <>
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center" style={{ fontFamily: B.font }}>
      <DockPlate className="pointer-events-auto flex items-stretch" style={{ color: B.text2 }}>
        <div data-ui="dock" className="flex items-stretch" role="toolbar" aria-label="Док">
          {timerTask && (
            <>
              <button
                type="button"
                onClick={() => open(timerTask.id)}
                className={`${cellCls} max-w-[260px]`}
                title={`Таймер: ${timerTask.title}`}
                aria-label={`Таймер запущен для задачи «${timerTask.title}», открыть задачу`}
              >
                <Live on />
                <span style={{ ...T.bodyStrong, ...tab, color: B.text }}>{formatClock(elapsed)}</span>
                <span className="min-w-0 truncate" style={{ ...T.meta, color: B.text3 }}>
                  {timerTask.title}
                </span>
              </button>
              <button
                type="button"
                onClick={() => stopTimer(timerTask.id)}
                className={`${cellCls} !pl-1`}
                title="Остановить таймер"
                aria-label="Остановить таймер"
                style={T.body}
              >
                Стоп
              </button>
              <Sep />
            </>
          )}

          <button type="button" onClick={() => setCommandOpen(true)} className={cellCls} title="Поиск (⌘K)" aria-label="Поиск и команды" style={T.body}>
            Поиск <Kbd>⌘K</Kbd>
          </button>
          <Sep />
          <button type="button" onClick={() => setQuickAddOpen(true)} className={cellCls} title="Добавить задачу (N)" aria-label="Добавить задачу" style={T.body}>
            Задача <Kbd>N</Kbd>
          </button>
          <Sep />

          {pomo.active ? (
            <button
              type="button"
              onClick={() => (pomo.running ? pomo.pause() : pomo.resume())}
              className={`${cellCls} min-w-[148px]`}
              title={pomo.running ? "Пауза" : "Продолжить"}
              aria-label={pomo.running ? "Поставить помодоро на паузу" : "Продолжить помодоро"}
              style={T.body}
            >
              <Live on={pomo.running} />
              <span style={{ ...T.bodyStrong, ...tab, color: B.text }}>{formatClock(pomo.remaining)}</span>
              <span className="ml-1" style={{ color: B.text3 }}>
                {pomo.running ? <Pause size={13} strokeWidth={1.25} /> : <Play size={13} strokeWidth={1.25} />}
              </span>
            </button>
          ) : (
            <button
              type="button"
              data-float-trigger
              onClick={(e) => startMenu.toggle(e.currentTarget, "left")}
              className={cellCls}
              title="Запустить помодоро — выбрать задачу"
              aria-label="Запустить помодоро — выбрать задачу"
              aria-expanded={!!startMenu.at}
              style={{ ...T.body, color: startMenu.at ? B.text : undefined }}
            >
              Помодоро <Kbd>{formatClock(settings.pomodoro.workMin * 60)}</Kbd>
            </button>
          )}
          <Sep />
          <PomodoroSettingsButton />
        </div>
      </DockPlate>
    </div>
    {/* Outside the pointer-events-none strip, or the menu would not take clicks. */}
    {startMenu.at && (
      <FloatMenu at={startMenu.at} onClose={startMenu.close} width={320}>
        <PomodoroStartBody />
      </FloatMenu>
    )}
    </>
  );
}
