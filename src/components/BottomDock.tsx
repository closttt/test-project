import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Timer, Play, Pause } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useUI } from "@/store/UIProvider";
import { useData } from "@/store/DataProvider";
import { usePomodoro } from "@/store/PomodoroProvider";
import { PomodoroSettingsMenu } from "@/components/PomodoroSettingsMenu";
import { cn } from "@/lib/utils";

/** Persistent bottom-center dock: search, quick-add, pomodoro — the 3 actions used from anywhere. */
export function BottomDock() {
  const { setCommandOpen, setQuickAddOpen } = useUI();
  const { allTasks, stopTimer } = useData();
  const { phase, running, start, pause, resume } = usePomodoro();
  const navigate = useNavigate();
  const active = phase !== "idle";
  const openTasks = allTasks.filter((t) => !t.done && !t.archivedAt).slice(0, 30);

  // A task timer (Task.timerStartedAt) runs independently of Pomodoro and, until now, was
  // only visible on the task's own row/card — leaving the page made it invisible entirely.
  const timerTask = allTasks.find((t) => t.timerStartedAt);
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!timerTask?.timerStartedAt) return;
    const started = new Date(timerTask.timerStartedAt).getTime();
    const tick = () => setElapsedSec(Math.max(0, Math.round((Date.now() - started) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerTask?.id, timerTask?.timerStartedAt]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center md:bottom-6">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-lg shadow-black/20 backdrop-blur">
        {timerTask && (
          <>
            <button
              onClick={() => navigate("/tasks")}
              className="flex h-10 max-w-40 items-center gap-1.5 rounded-full pl-3 pr-1 text-xs font-medium text-brand hover:bg-secondary"
              title={`Таймер: ${timerTask.title}`}
              aria-label={`Таймер запущен для задачи «${timerTask.title}», открыть задачи`}
            >
              <Timer className="h-3.5 w-3.5 shrink-0 animate-pulse" />
              <span className="tabular-nums">
                {String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:{String(elapsedSec % 60).padStart(2, "0")}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-brand"
              onClick={() => stopTimer(timerTask.id)}
              title="Остановить таймер"
              aria-label="Остановить таймер"
            >
              <Pause className="h-4 w-4" />
            </Button>
            <div className="mx-0.5 h-5 w-px bg-border" />
          </>
        )}
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => setCommandOpen(true)} title="Поиск (⌘K)" aria-label="Поиск и команды">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => setQuickAddOpen(true)} title="Добавить задачу (N)" aria-label="Добавить задачу">
          <Plus className="h-4 w-4" />
        </Button>
        {active ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-10 w-10 rounded-full", running && "text-brand")}
            onClick={() => (running ? pause() : resume())}
            title={running ? "Пауза" : "Продолжить"}
            aria-label={running ? "Поставить помодоро на паузу" : "Продолжить помодоро"}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" title="Запустить помодоро — выбрать задачу" aria-label="Запустить помодоро — выбрать задачу">
                <Timer className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem onClick={() => start()}>Без задачи</DropdownMenuItem>
              {openTasks.length > 0 && <DropdownMenuSeparator />}
              {openTasks.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => start(t.id)}>
                  {t.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <PomodoroSettingsMenu />
      </div>
    </div>
  );
}
