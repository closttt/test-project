import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, PartyPopper, Timer } from "lucide-react";

import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Celebration } from "@/components/Celebration";
import { TaskEditDialog } from "@/components/TaskEditDialog";
import { useData } from "@/store/DataProvider";
import { usePomodoro } from "@/store/PomodoroProvider";
import { isToday, isOverdue, dueLabel } from "@/lib/format";
import { easeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

/** Distraction-free "Today" — overdue + due-today tasks, one clean column. */
export default function FocusPage() {
  const navigate = useNavigate();
  const { tasks, toggleTask } = useData();
  const pomodoro = usePomodoro();
  const [celebrated, setCelebrated] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const focusTasks = tasks
    .filter((t) => t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate)))
    .sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  const total = focusTasks.length;
  const done = focusTasks.filter((t) => t.done).length;
  const open = total - done;

  function handleToggle(id: string, wasOpen: boolean) {
    toggleTask(id);
    if (wasOpen && open === 1) {
      setCelebrated(true);
      setTimeout(() => setCelebrated(false), 1600);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Celebration show={celebrated} />
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Фокус на сегодня</h1>
            <p className="text-sm text-muted-foreground">
              {total === 0 ? "Задач на сегодня нет" : `${done} из ${total} · осталось ${open}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} title="Выйти из фокуса">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {total > 0 && <Progress value={(done / total) * 100} className="mb-8 h-1" />}

        {total === 0 || open === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: easeOut }}
            className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
              <PartyPopper className="h-7 w-7" />
            </div>
            <p className="text-lg font-medium">
              {total === 0 ? "На сегодня чисто" : "Все задачи дня закрыты!"}
            </p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {total === 0
                ? "Ничего не горит. Можно спланировать день или отдохнуть."
                : "Отличная работа. Наслаждайся ощущением пустого списка."}
            </p>
            <Button variant="outline" className="mt-2" onClick={() => navigate("/")}>
              На дашборд
            </Button>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {focusTasks.map((t) => {
                const overdue = !t.done && isOverdue(t.dueDate);
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: easeOut }}
                    className="flex items-center gap-4 rounded-lg border border-border p-4"
                  >
                    <AnimatedCheckbox
                      checked={t.done}
                      onChange={() => handleToggle(t.id, !t.done)}
                      label={t.title}
                    />
                    <span
                      className={cn("flex-1 cursor-pointer text-base hover:underline", t.done && "text-muted-foreground line-through")}
                      onClick={() => setEditing(t)}
                    >
                      {t.title}
                    </span>
                    {overdue && (
                      <span className="text-xs font-medium text-risk">{dueLabel(t.dueDate!)}</span>
                    )}
                    {!t.done && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-8 w-8 shrink-0", pomodoro.activeTaskId === t.id && pomodoro.phase === "work" && "text-brand")}
                        onClick={() => pomodoro.start(t.id)}
                        title="Помодоро на эту задачу"
                      >
                        <Timer className="h-4 w-4" />
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <TaskEditDialog task={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />
    </div>
  );
}
