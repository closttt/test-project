import { useMemo, useState } from "react";
import { Trash2, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IconAction } from "@/components/ui/icon-action";
import { Segmented } from "@/components/ui/segmented";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { EmptyState } from "@/components/EmptyState";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { PriorityFlag } from "@/components/PriorityFlag";
import { TaskEditDialog } from "@/components/TaskEditDialog";
import { isToday } from "@/lib/format";
import { WEEKDAYS, WEEKDAYS_LONG, MONTHS, ymd, buildMonthGrid } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { Meeting, Task } from "@/types";

/** Monday-based week containing `ref`. */
function weekDays(ref: Date): Date[] {
  const start = new Date(ref);
  start.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const { meetings, tasks, addMeeting, deleteMeeting, restoreMeeting, toggleMeeting, toggleTask, updateTask } = useData();
  const { toast } = useToast();
  const now = new Date();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [anchor, setAnchor] = useState(ymd(now)); // week anchor date
  const [selected, setSelected] = useState<string>(ymd(now));
  const [editing, setEditing] = useState<Task | null>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(ymd(now));
  const [time, setTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState("30");
  const [recurrence, setRecurrence] = useState<Meeting["recurrence"]>("none");

  const grid = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  const week = useMemo(() => weekDays(new Date(anchor)), [anchor]);

  const meetingsByDay = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    meetings.forEach((m) => (map[m.date] ??= []).push(m));
    return map;
  }, [meetings]);
  const tasksByDay = useMemo(() => {
    const map: Record<string, typeof tasks> = {};
    tasks.forEach((t) => {
      if (t.dueDate) (map[t.dueDate] ??= []).push(t);
    });
    return map;
  }, [tasks]);
  // Undated open tasks — draggable into a day (time-blocking).
  const undated = useMemo(() => tasks.filter((t) => !t.done && !t.dueDate), [tasks]);

  function scheduleTaskOn(dayKey: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverDay(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) {
      updateTask(id, { dueDate: dayKey });
      toast(`Запланировано на ${isToday(dayKey) ? "сегодня" : dayKey}`);
    }
  }

  function handleDeleteMeeting(m: Meeting) {
    deleteMeeting(m.id);
    toast("Встреча удалена", { actionLabel: "Вернуть", onAction: () => restoreMeeting(m) });
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  function shiftWeek(delta: number) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + delta * 7);
    setAnchor(ymd(d));
  }

  function openCreate(forDate?: string) {
    setDate(forDate ?? selected);
    setTitle("");
    setTime("10:00");
    setDurationMin("30");
    setRecurrence("none");
    setOpen(true);
  }
  function submit() {
    if (!title.trim() || !date) return;
    addMeeting({ title: title.trim(), date, time, durationMin: Number(durationMin) || 30, recurrence });
    setOpen(false);
  }

  const dayMeetings = (meetingsByDay[selected] ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const dayTasks = tasksByDay[selected] ?? [];
  // Open tasks first, then done (recognition-over-recall); within each, higher priority up.
  const priRank: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
  const dayTasksSorted = [...dayTasks].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    return priRank[a.priority] - priRank[b.priority];
  });
  const dayDone = dayTasks.filter((t) => t.done).length;

  const weekLabel = `${week[0].getDate()} ${MONTHS[week[0].getMonth()].slice(0, 3)} — ${week[6].getDate()} ${MONTHS[week[6].getMonth()].slice(0, 3)}`;

  return (
    <AppShell
      title="Календарь"
      description="Встречи и задачи по дням"
      actions={
        <>
          <Segmented
            ariaLabel="Вид календаря"
            className="hidden sm:flex"
            value={mode}
            onChange={setMode}
            options={[
              { value: "month", label: "Месяц" },
              { value: "week", label: "Неделя" },
            ]}
          />
          <Button variant="secondary" size="sm" onClick={() => openCreate()}>
            Новая встреча
          </Button>
        </>
      }
    >
      {meetings.length === 0 && Object.keys(tasksByDay).length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Календарь пуст"
          description="Запланируйте встречу или поставьте задаче срок — всё появится здесь по дням."
          actionLabel="Добавить встречу"
          onAction={() => openCreate()}
        />
      ) : mode === "week" ? (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{weekLabel}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Предыдущая неделя" onClick={() => shiftWeek(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setAnchor(ymd(new Date()))}>
                Сегодня
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Следующая неделя" onClick={() => shiftWeek(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {undated.length > 0 && (
            <Card className="mb-3 flex flex-col gap-2 p-3">
              <span className="text-xs font-medium text-muted-foreground">Без срока — перетащите в день ({undated.length})</span>
              <div className="flex flex-wrap gap-1.5">
                {undated.slice(0, 30).map((t) => (
                  <span
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    className="cursor-grab rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs transition-colors hover:border-brand/50 active:cursor-grabbing"
                    title="Перетащите в день недели"
                  >
                    {t.title}
                  </span>
                ))}
              </div>
            </Card>
          )}
          <StaggerList className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {week.map((d, i) => {
              const key = ymd(d);
              const dm = (meetingsByDay[key] ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));
              const dt = [...(tasksByDay[key] ?? [])].sort((a, b) => Number(a.done) - Number(b.done));
              const today = isToday(key);
              return (
                <StaggerItem key={key}>
                  <Card
                    onDragOver={(e) => { e.preventDefault(); setDragOverDay(key); }}
                    onDragLeave={() => setDragOverDay((k) => (k === key ? null : k))}
                    onDrop={(e) => scheduleTaskOn(key, e)}
                    className={cn(
                      "flex h-full min-h-[8rem] flex-col p-3 transition-colors",
                      today && "border-brand/40",
                      dragOverDay === key && "border-brand bg-brand/5"
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={cn("text-sm font-medium", today && "text-brand")}>
                        {WEEKDAYS_LONG[i]}, {d.getDate()}
                      </span>
                      <button
                        onClick={() => openCreate(key)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        + встреча
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {dm.length === 0 && dt.length === 0 && (
                        <span className="text-xs text-muted-foreground/60">Перетащите задачу сюда</span>
                      )}
                      {dm.map((m) => (
                        <div key={m.id} className={cn("flex items-center gap-2 text-sm", m.done && "opacity-60")}>
                          <AnimatedCheckbox
                            checked={!!m.done}
                            onChange={() => toggleMeeting(m.id)}
                            size="sm"
                            label={`Встреча: ${m.title}`}
                          />
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">{m.time}</span>
                          <span className={cn("truncate", m.done && "text-muted-foreground line-through")}>{m.title}</span>
                        </div>
                      ))}
                      {dt.map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                          className="flex cursor-grab items-center gap-2 active:cursor-grabbing"
                        >
                          <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} size="sm" label={t.title} priority={t.priority} />
                          <span
                            className={cn("min-w-0 flex-1 truncate text-sm hover:underline", t.done && "text-muted-foreground line-through")}
                            onClick={() => setEditing(t)}
                          >
                            {t.title}
                          </span>
                          <PriorityFlag p={t.priority} />
                        </div>
                      ))}
                    </div>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerList>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {MONTHS[view.month]} {view.year}
              </h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Следующий месяц" onClick={() => shiftMonth(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-xs text-muted-foreground">
                  {w}
                </div>
              ))}
              {grid.map((d) => {
                const key = ymd(d);
                const inMonth = d.getMonth() === view.month;
                const mCount = (meetingsByDay[key] ?? []).length;
                const dTasks = [...(tasksByDay[key] ?? [])].sort((a, b) => Number(a.done) - Number(b.done));
                const isSel = key === selected;
                const shown = dTasks.slice(0, 2);
                const overflow = dTasks.length - shown.length;
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col gap-1 rounded-md p-1 text-sm transition-colors",
                      !inMonth && "text-muted-foreground/40",
                      isSel ? "bg-foreground text-background" : "hover:bg-secondary/60"
                    )}
                  >
                    <button
                      onClick={() => setSelected(key)}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-full text-xs",
                        isToday(key) && !isSel && "bg-brand/15 font-semibold text-brand"
                      )}
                    >
                      {d.getDate()}
                    </button>
                    {mCount > 0 && (
                      <span className={cn("h-1 w-1 shrink-0 rounded-full", isSel ? "bg-background" : "bg-brand")} />
                    )}
                    {shown.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {shown.map((t) => (
                          <div key={t.id} className="flex items-center gap-1">
                            <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} size="sm" label={t.title} />
                            <span className={cn("truncate text-[0.65rem]", t.done && "line-through opacity-60")}>
                              {t.title}
                            </span>
                          </div>
                        ))}
                        {overflow > 0 && (
                          <button
                            onClick={() => setSelected(key)}
                            className="text-left text-[0.65rem] text-muted-foreground underline-offset-2 hover:underline"
                          >
                            +{overflow} ещё
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> встречи</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" /> задачи</span>
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  {isToday(selected) ? "Сегодня" : selected}
                </p>
                {dayTasks.length > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {dayDone}/{dayTasks.length} выполнено
                  </span>
                )}
              </div>
              {dayTasks.length > 1 && (
                <Progress value={(dayDone / dayTasks.length) * 100} className="h-1" />
              )}
            </div>
            {dayMeetings.length === 0 && dayTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">На этот день ничего нет.</p>
            )}
            {dayMeetings.map((m) => (
              <Card key={m.id} className={cn("flex items-center justify-between gap-2 p-3", m.done && "opacity-60")}>
                <div className="flex min-w-0 items-center gap-3">
                  <AnimatedCheckbox
                    checked={!!m.done}
                    onChange={() => toggleMeeting(m.id)}
                    size="sm"
                    label={`Встреча: ${m.title}`}
                  />
                  <span className="shrink-0 text-sm font-medium text-muted-foreground">{m.time}</span>
                  <div className="min-w-0">
                    {m.url && !m.done ? (
                      <a href={m.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-brand underline-offset-2 hover:underline">
                        {m.title}
                      </a>
                    ) : (
                      <p className={cn("truncate text-sm", m.done && "text-muted-foreground line-through")}>{m.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {m.durationMin} мин{m.recurrence !== "none" ? (m.recurrence === "weekly" ? " · еженедельно" : " · ежемесячно") : ""}
                    </p>
                  </div>
                </div>
                <IconAction
                  icon={Trash2}
                  label={`Удалить встречу: ${m.title}`}
                  tone="danger"
                  onClick={() => handleDeleteMeeting(m)}
                  className="p-1"
                  iconClassName="h-4 w-4"
                />
              </Card>
            ))}
            {dayTasksSorted.map((t) => (
              <Card key={t.id} className="flex items-center gap-3 p-3">
                <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} size="sm" label={t.title} priority={t.priority} />
                <span
                  className={cn("min-w-0 flex-1 truncate text-sm hover:underline", t.done && "text-muted-foreground line-through")}
                  onClick={() => setEditing(t)}
                >
                  {t.title}
                </span>
                <PriorityFlag p={t.priority} />
              </Card>
            ))}
            <Button variant="outline" size="sm" className="mt-1" onClick={() => openCreate()}>
              + Встреча на {isToday(selected) ? "сегодня" : "этот день"}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая встреча</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="m-title">Название *</Label>
              <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="m-dur">Длительность, мин</Label>
                <Input id="m-dur" type="number" min={5} step={5} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Повтор</Label>
                <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Meeting["recurrence"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не повторять</SelectItem>
                    <SelectItem value="weekly">Еженедельно</SelectItem>
                    <SelectItem value="monthly">Ежемесячно</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="m-date">Дата *</Label>
                <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-time">Время</Label>
                <Input id="m-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={submit}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskEditDialog task={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />
    </AppShell>
  );
}
