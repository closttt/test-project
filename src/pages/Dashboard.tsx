import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import {
  CalendarClock,
  ListChecks,
  Clock3,
  PartyPopper,
  Timer,
  Plus,
  FolderKanban,
  StickyNote,
  TrendingUp,
  CircleDashed,
  CheckCircle2,
  GripVertical,
  X,
  LayoutGrid,
  Check,
  RotateCcw,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Calendar } from "@/components/ui/calendar";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CountUp } from "@/components/CountUp";
import { todaySubtaskRows, subPriority } from "@/lib/subtasks";
import { Celebration } from "@/components/Celebration";
import { PriorityFlag } from "@/components/PriorityFlag";
import { PriorityPicker } from "@/components/PriorityPicker";
import { StreakFlame } from "@/components/StreakFlame";
import { ProjectHealthBadge } from "@/components/ProjectHealthBadge";
import { projectHealth, type HealthLevel } from "@/lib/projectHealth";
import { isSnoozed } from "@/lib/taskGrouping";
import { TaskEditDialog } from "@/components/TaskEditDialog";
import { SubtaskEditDialog } from "@/components/SubtaskEditDialog";
import { AreaChart } from "@/components/charts/AreaChart";
import { DonutGauge } from "@/components/charts/DonutGauge";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { isToday, isOverdue, dueLabel, formatDuration, todayStr, localDayStr, addDays } from "@/lib/format";
import { computeStreak } from "@/lib/gameStats";
import { parseNaturalInput } from "@/lib/nlp";
import { pushUndo } from "@/lib/undoStack";
import { cn } from "@/lib/utils";
import { PRIORITY_META, type Priority, type Task } from "@/types";
import {
  WIDGETS,
  loadLayout,
  saveLayout,
  loadHidden,
  saveHidden,
  resetDashboard,
} from "@/lib/dashboardLayout";

const GridLayout = WidthProvider(RGL);

const FOCUS_MODE_KEY = "crm-dashboard-focus-v1";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function Stat({ icon: Icon, label, value, accent, onClick }: { icon: typeof Clock3; label: string; value: React.ReactNode; accent?: string; onClick?: () => void }) {
  return (
    <Card
      onClick={onClick}
      className={cn("flex h-full flex-col justify-center p-4", onClick && "cursor-pointer transition-colors hover:border-muted-foreground/25")}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", accent ?? "bg-secondary text-muted-foreground")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
    </Card>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const {
    tasks, meetings, projects, completionLog, gamification, settings,
    toggleTask, toggleSubtask, updateSubtask, updateTask, addTask, addMeeting, addNote, toggleMeeting,
  } = useData();
  const { toast } = useToast();
  const [celebrated, setCelebrated] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>(0);
  const [newTaskDate, setNewTaskDate] = useState(todayStr());
  const [dateTouched, setDateTouched] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [openPopup, setOpenPopup] = useState(false);
  const [weekPopup, setWeekPopup] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  /** Dated subtask opened from «Задачи на сегодня» — it gets its own card, like a small task. */
  const [editingSub, setEditingSub] = useState<{ taskId: string; subId: string } | null>(null);
  const [meetingDialog, setMeetingDialog] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(todayStr());
  const [meetingTime, setMeetingTime] = useState("12:00");
  const [meetingUrl, setMeetingUrl] = useState("");

  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<Layout[]>(() => loadLayout());
  const [hidden, setHidden] = useState<string[]>(() => loadHidden());
  useEffect(() => saveLayout(layout), [layout]);
  useEffect(() => saveHidden(hidden), [hidden]);

  // On phones the 12-col drag-grid squishes into an unusable mess — render a plain
  // vertical stack instead (KPIs in a 2-up row, the rest full-width, no drag/resize).
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const streak = computeStreak(completionLog);

  const todayTasks = tasks
    // A snoozed task is an explicit "don't bother me with this yet" — respect it here the same
    // way the Tasks page's own smart lists already do, even if the due date is today/overdue.
    .filter((t) => t.dueDate && !isSnoozed(t) && (isToday(t.dueDate) || (isOverdue(t.dueDate) && !t.done)))
    .sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);
      if (a.priority !== b.priority) return (a.priority || 9) - (b.priority || 9);
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  // Ivy Lee cap: the first N open tasks are "the plan"; the rest stay visible but dimmed, with a
  // one-click move to tomorrow. Never auto-reschedules — the user stays in control of their data.
  const focusLimit = settings.dailyFocusLimit ?? 0;
  const overLimitIds = new Set<string>(
    focusLimit > 0 ? todayTasks.filter((t) => !t.done).slice(focusLimit).map((t) => t.id) : []
  );
  const firstOverLimitId = todayTasks.find((t) => overLimitIds.has(t.id))?.id;
  function pushOverLimitToTomorrow() {
    const tomorrow = addDays(new Date(), 1);
    overLimitIds.forEach((id) => updateTask(id, { dueDate: tomorrow }));
    toast(`Перенесено на завтра: ${overLimitIds.size}`);
  }

  // Subtasks with their own date land here individually, so a parent with 20 subtasks doesn't
  // dump the whole thing into today — only the pieces actually scheduled for today (see lib/subtasks).
  const todaySubs = todaySubtaskRows(tasks);
  const todayOpen = todayTasks.filter((t) => !t.done).length;
  const todayDone = todayTasks.length - todayOpen;
  /** Today's plan = dated tasks + dated subtasks. Subtask rows here are always open (done ones are
   * filtered out), so they only add to the denominator. */
  const todayTotal = todayTasks.length + todaySubs.length;
  const overdueCount = todayTasks.filter((t) => !t.done && isOverdue(t.dueDate)).length;

  const upcomingMeetings = meetings
    .filter((m) => new Date(m.date) >= new Date(new Date().toDateString()))
    // Closed meetings sink to the bottom instead of vanishing — the record stays, the noise doesn't.
    .sort((a, b) => {
      if (!!a.done !== !!b.done) return Number(!!a.done) - Number(!!b.done);
      return (a.date + a.time).localeCompare(b.date + b.time);
    })
    .slice(0, 6);

  const minutesToday = todayTasks.reduce((s, t) => s + t.spentMin, 0);
  const closedToday = completionLog[todayStr()] ?? 0;

  const dynamics = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const key = localDayStr(d);
    return { label: `${d.getDate()}.${d.getMonth() + 1}`, value: completionLog[key] ?? 0 };
  });

  const openAll = tasks.filter((t) => !t.done);
  const overdueAll = openAll.filter((t) => isOverdue(t.dueDate)).length;
  const doneAll = tasks.filter((t) => t.done).length;
  const inProgress = openAll.length - overdueAll;

  function handleToggle(id: string, wasOpen: boolean) {
    toggleTask(id);
    if (wasOpen && todayOpen === 1) { setCelebrated(true); setTimeout(() => setCelebrated(false), 1400); }
  }
  function addTodayTask() {
    if (!newTask.trim()) return;
    // Same live parsing as the global quick-add dialog: #tags / !важно / date words. An explicit
    // date-picker pick wins over the NLP guess, same precedence as QuickAddDialog.
    const parsed = parseNaturalInput(newTask);
    const finalTitle = parsed.title.trim() || newTask.trim();
    const dueDate = dateTouched ? newTaskDate : parsed.dueDate || newTaskDate;
    addTask({
      title: finalTitle,
      done: false,
      dueDate: dueDate || undefined,
      priority: newTaskPriority,
      tags: parsed.tags,
      important: parsed.important,
      remindAt: parsed.remindAt,
      estimateMin: parsed.estimateMin,
      recurrence: parsed.recurrence,
    });
    setNewTask("");
    setNewTaskPriority(0);
    setNewTaskDate(todayStr());
    setDateTouched(false);
  }
  function saveNote() {
    if (!noteDraft.trim()) return;
    addNote({ title: noteDraft.trim().split("\n")[0].slice(0, 60), body: noteDraft.trim(), pinned: false });
    setNoteDraft(""); toast("Заметка сохранена");
  }
  function submitMeeting() {
    if (!meetingTitle.trim()) return;
    addMeeting({ title: meetingTitle.trim(), date: meetingDate, time: meetingTime, url: meetingUrl.trim() || undefined });
    toast("Встреча добавлена");
    setMeetingDialog(false);
    setMeetingTitle("");
    setMeetingDate(todayStr());
    setMeetingTime("12:00");
    setMeetingUrl("");
  }

  // Monday-Sunday of the current calendar week — «неделя» reads the same way as the calendar page.
  const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const weekByDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
    const key = localDayStr(d);
    return {
      key,
      label: WEEKDAY_LABELS[i],
      tasks: tasks.filter((t) => t.done && t.completedAt && localDayStr(new Date(t.completedAt)) === key),
    };
  });
  const weekDoneTasks = weekByDay.flatMap((d) => d.tasks);
  const weekDone = weekDoneTasks.length;

  function renderWidget(id: string): React.ReactNode {
    switch (id) {
      case "kpi-today":
        return <Stat icon={ListChecks} label="Задачи сегодня" accent="bg-brand/15 text-brand" value={<span><CountUp value={todayDone} />/<CountUp value={todayTotal} /></span>} />;
      case "kpi-time":
        return <Stat icon={Timer} label="Время сегодня" value={formatDuration(minutesToday)} />;
      case "kpi-open":
        return <Stat icon={CircleDashed} label="Открыто задач" value={<CountUp value={openAll.length} />} onClick={() => setOpenPopup(true)} />;
      case "kpi-week":
        return <Stat icon={CheckCircle2} label="Закрыто за неделю" accent="bg-success/15 text-success" value={<CountUp value={weekDone} />} onClick={() => setWeekPopup(true)} />;
      case "dynamics": {
        const total14 = dynamics.reduce((s, d) => s + d.value, 0);
        const peak = Math.max(...dynamics.map((d) => d.value));
        return (
          <Card className="flex h-full flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4" /> Динамика · 14 дней</CardTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span><span className="font-semibold text-foreground">{total14}</span> закрыто</span>
                <span>пик <span className="font-semibold text-foreground">{peak}</span>/день</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 pb-4"><AreaChart data={dynamics} fill className="h-full w-full" formatValue={(v) => `${v} задач`} /></CardContent>
          </Card>
        );
      }
      case "status":
        return (
          <Card className="flex h-full flex-col">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Статус задач</CardTitle></CardHeader>
            <CardContent className="flex flex-1 flex-col items-center gap-4 overflow-y-auto">
              <DonutGauge size={132} segments={[
                { label: "Выполнено", value: doneAll, color: "hsl(var(--success))" },
                { label: "В работе", value: inProgress, color: "hsl(var(--brand))" },
                { label: "Просрочено", value: overdueAll, color: "hsl(var(--risk))" },
              ]} centerTop={String(openAll.length)} centerBottom="открыто" />
              <div className="flex w-full flex-col gap-1.5 text-sm">
                <Row color="hsl(var(--success))" label="Выполнено" value={doneAll} />
                <Row color="hsl(var(--brand))" label="В работе" value={inProgress} />
                <Row color="hsl(var(--risk))" label="Просрочено" value={overdueAll} />
              </div>
              <div className="w-full border-t border-border pt-3">
                <p className="mb-1.5 text-xs text-muted-foreground">Открытые по приоритету</p>
                <div className="flex flex-col gap-1.5 text-sm">
                  {([1, 2, 3, 0] as Priority[]).map((p) => (
                    <Row key={p} color={PRIORITY_META[p].dot} label={PRIORITY_META[p].label} value={openAll.filter((t) => t.priority === p).length} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "today":
        return (
          <Card className="flex h-full flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><ListChecks className="h-4 w-4" /> Задачи на сегодня</CardTitle>
              <div className="flex items-center gap-3">
                {gamification.enabled && (
                  <Link to="/achievements" className="flex items-center gap-2" title="Цель дня">
                    <DonutGauge size={24} thickness={3} segments={[
                      { label: "Закрыто", value: Math.min(closedToday, gamification.dailyGoal), color: "hsl(var(--success))" },
                      { label: "Осталось", value: Math.max(0, gamification.dailyGoal - closedToday), color: "hsl(var(--secondary))" },
                    ]} />
                    <span className="text-xs text-muted-foreground">{closedToday}/{gamification.dailyGoal}</span>
                  </Link>
                )}
                {overdueCount > 0 && <Badge variant="risk">{overdueCount} просроч.</Badge>}
                <Link to="/focus"><Button variant="outline" size="sm" className="h-7">Фокус</Button></Link>
              </div>
            </CardHeader>
            {todayTotal > 0 && (
              <div className="mb-1 px-6">
                <Progress value={(todayDone / todayTotal) * 100} className="h-1" />
              </div>
            )}
            <CardContent className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
              {todayTotal === 0 && <p className="text-sm text-muted-foreground">На сегодня задач нет.</p>}

              {/* Подзадачи со своим сроком — отдельными строками, с названием родительской задачи.
                  Клик по названию открывает карточку самой подзадачи, а не родителя. */}
              {todaySubs.map(({ parent, sub }) => (
                <div key={`${parent.id}:${sub.id}`} className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-secondary/40">
                  <AnimatedCheckbox
                    checked={sub.done}
                    onChange={() => toggleSubtask(parent.id, sub.id)}
                    size="sm"
                    label={sub.title}
                    priority={subPriority(sub)}
                  />
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                    title="Открыть карточку подзадачи"
                    onClick={() => setEditingSub({ taskId: parent.id, subId: sub.id })}
                  >
                    {sub.title}
                    <span className="ml-2 text-xs text-muted-foreground">· {parent.title}</span>
                  </button>
                  {/* Приоритет прямо в строке — как у подзадач в проекте, менять можно не открывая карточку. */}
                  <PriorityPicker p={subPriority(sub)} onChange={(p) => updateSubtask(parent.id, sub.id, { priority: p })} />
                  {isOverdue(sub.dueDate) && <span className="shrink-0 text-xs font-medium text-risk">{dueLabel(sub.dueDate!)}</span>}
                </div>
              ))}

              {todayTasks.map((t) => (
                <Fragment key={t.id}>
                {overLimitIds.size > 0 && t.id === firstOverLimitId && (
                  <div className="mt-2 flex items-center gap-2 border-t border-dashed border-border pt-2">
                    <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground/60">
                      Сверх плана дня · {overLimitIds.size}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-6 gap-1 text-xs text-muted-foreground"
                      onClick={pushOverLimitToTomorrow}
                    >
                      <CalendarClock className="h-3 w-3" /> Перенести на завтра
                    </Button>
                  </div>
                )}
                <div className={cn("group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-secondary/40", overLimitIds.has(t.id) && "opacity-50")}>
                  <AnimatedCheckbox checked={t.done} onChange={() => handleToggle(t.id, !t.done)} size="sm" label={t.title} priority={t.priority} />
                  <span
                    className={cn("min-w-0 flex-1 truncate text-sm hover:underline", t.done && "text-muted-foreground line-through")}
                    onClick={() => setEditingTask(t)}
                  >
                    {t.title}
                  </span>
                  <PriorityPicker p={t.priority} onChange={(p) => updateTask(t.id, { priority: p })} />
                  {!t.done && isOverdue(t.dueDate) && <span className="text-xs font-medium text-risk">{dueLabel(t.dueDate!)}</span>}
                </div>
                </Fragment>
              ))}
              {todayTasks.length > 0 && todayOpen === 0 && (
                <p className="flex items-center gap-2 text-sm text-success"><PartyPopper className="h-4 w-4" /> Все задачи дня закрыты!</p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTodayTask()} placeholder="Добавить задачу на сегодня…" className="h-9" />
                <PriorityPicker p={newTaskPriority} onChange={setNewTaskPriority} />
                <DropdownMenu open={dateOpen} onOpenChange={setDateOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 font-normal">
                      <CalendarClock className="h-3.5 w-3.5" /> {dueLabel(newTaskDate)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <Calendar
                      selected={newTaskDate}
                      onSelect={(d) => { setNewTaskDate(d); setDateTouched(true); setDateOpen(false); }}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="icon" className="h-9 w-9 shrink-0" aria-label="Добавить задачу" onClick={addTodayTask}><Plus className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        );
      case "meetings":
        return (
          <Card className="flex h-full flex-col">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" /> Встречи</CardTitle></CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
              {upcomingMeetings.length === 0 && <p className="text-sm text-muted-foreground">Встреч не запланировано.</p>}
              {upcomingMeetings.map((m) => (
                <div key={m.id} className={cn("flex items-center justify-between gap-2 rounded-md px-1 py-1 transition-colors hover:bg-secondary/40", m.done && "opacity-60")}>
                  <AnimatedCheckbox
                    checked={!!m.done}
                    onChange={() => toggleMeeting(m.id)}
                    size="sm"
                    label={`Встреча: ${m.title}`}
                  />
                  {m.url && !m.done ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm font-medium text-brand underline-offset-2 hover:underline"
                    >
                      {m.title}
                    </a>
                  ) : (
                    <p className={cn("min-w-0 flex-1 truncate text-sm font-medium", m.done && "text-muted-foreground line-through")}>{m.title}</p>
                  )}
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-foreground">
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" /> {isToday(m.date) ? "Сегодня" : m.date} · {m.time}
                  </span>
                </div>
              ))}
              <Button variant="outline" size="sm" className="mt-auto" onClick={() => setMeetingDialog(true)}>
                <Plus className="h-4 w-4" /> Встреча
              </Button>
            </CardContent>
          </Card>
        );
      case "note":
        return (
          <Card className="flex h-full flex-col">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><StickyNote className="h-4 w-4" /> Быстрая заметка</CardTitle></CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && saveNote()}
                placeholder="Записать мысль… · ⌘/Ctrl+Enter — сохранить"
                className="flex-1 resize-none"
              />
              <Button variant="outline" size="sm" className="self-end" onClick={saveNote} disabled={!noteDraft.trim()}>Сохранить</Button>
            </CardContent>
          </Card>
        );
      case "projects":
        return (
          <Card className="flex h-full flex-col">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><FolderKanban className="h-4 w-4" /> Проекты</CardTitle></CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto">
              {projects.length === 0 && <p className="text-sm text-muted-foreground">Проектов нет.</p>}
              {[...projects]
                .sort((a, b) => {
                  const rank: Record<HealthLevel, number> = { "off-track": 0, "at-risk": 1, "on-track": 2, "done": 3, "empty": 4 };
                  return rank[projectHealth(tasks.filter((t) => t.projectId === a.id))]
                    - rank[projectHealth(tasks.filter((t) => t.projectId === b.id))];
                })
                .map((p) => {
                const pt = tasks.filter((t) => t.projectId === p.id);
                const done = pt.filter((t) => t.done).length;
                const pct = pt.length ? (done / pt.length) * 100 : 0;
                const overdueP = pt.filter((t) => !t.done && isOverdue(t.dueDate)).length;
                const spent = pt.reduce((s, t) => s + t.spentMin, 0);
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className="flex flex-col gap-1 rounded-md px-1 py-1 transition-colors hover:bg-secondary/40">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <ProjectHealthBadge level={projectHealth(pt)} />
                        <span className="text-xs text-muted-foreground">{done}/{pt.length}</span>
                      </span>
                    </div>
                    <Progress value={pct} />
                    <div className="flex items-center gap-2 text-[0.7rem] text-muted-foreground">
                      <span>{Math.round(pct)}%</span>
                      {spent > 0 && <span>· {formatDuration(spent)}</span>}
                      {overdueP > 0 && <span className="text-risk">· {overdueP} просроч.</span>}
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  }

  const visibleLayout = layout.filter((l) => !hidden.includes(l.i));
  const hiddenWidgets = WIDGETS.filter((w) => hidden.includes(w.id));

  // Mobile stack order + per-widget heights (KPIs are short, big widgets need room).
  const KPI_IDS = ["kpi-money", "kpi-expected", "kpi-today", "kpi-time", "kpi-open", "kpi-week"];
  const MOBILE_H: Record<string, string> = {
    dynamics: "h-60", status: "h-[26rem]", today: "h-[26rem]", "crm-risk": "h-80", meetings: "h-64", note: "h-48", projects: "h-64",
  };
  const mobileOrder = WIDGETS.map((w) => w.id).filter((id) => !hidden.includes(id));
  const mobileKpis = mobileOrder.filter((id) => KPI_IDS.includes(id));
  const mobileLarge = mobileOrder.filter((id) => !KPI_IDS.includes(id));

  /**
   * "Фокус" mode — one ranked list instead of competing widgets (research §1.3: squint at the
   * dashboard and you should see the ONE thing to do, not ten). Kept as a switch rather than a
   * replacement: the widget grid is genuinely useful when reviewing, the ranked list when doing.
   */
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem(FOCUS_MODE_KEY) === "1");
  useEffect(() => localStorage.setItem(FOCUS_MODE_KEY, focusMode ? "1" : "0"), [focusMode]);
  // Ranking = what to do next: overdue first, then priority, then the soonest due.
  const rankedToday = [...todayTasks].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    const ao = !a.done && isOverdue(a.dueDate) ? 0 : 1;
    const bo = !b.done && isOverdue(b.dueDate) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (a.priority !== b.priority) return (a.priority || 9) - (b.priority || 9);
    return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  });

  return (
    <AppShell
      title={greeting()}
      description={editing ? "Перетаскивайте и растягивайте виджеты" : new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}
      actions={
        editing ? (
          <>
            {hiddenWidgets.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><Plus className="h-4 w-4" /> Виджет</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {hiddenWidgets.map((w) => (
                    <DropdownMenuItem key={w.id} onClick={() => setHidden((h) => h.filter((x) => x !== w.id))}>{w.title}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="sm" onClick={() => { resetDashboard(); setLayout(loadLayout()); setHidden([]); toast("Сетка сброшена"); }}>
              <RotateCcw className="h-4 w-4" /> Сброс
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}><Check className="h-4 w-4" /> Готово</Button>
          </>
        ) : (
          <>
            <StreakFlame streak={streak} atRisk={streak >= 2 && closedToday === 0} className="hidden sm:inline-flex" />
            <Segmented
              ariaLabel="Вид дашборда"
              value={focusMode ? "focus" : "widgets"}
              onChange={(v) => setFocusMode(v === "focus")}
              options={[
                { value: "focus", label: <><ListChecks className="h-3.5 w-3.5" /> Фокус</>, title: "Один список: что делать сейчас, по порядку" },
                { value: "widgets", label: <><LayoutGrid className="h-3.5 w-3.5" /> Виджеты</>, title: "Настраиваемая сетка виджетов" },
              ]}
            />
            {!isMobile && !focusMode && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><LayoutGrid className="h-4 w-4" /> Настроить</Button>
            )}
          </>
        )
      }
    >
      <Celebration show={celebrated} />

      {focusMode ? (
        // One ranked list instead of competing widgets (research §1.3): what to do, in order.
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <ListChecks className="h-4 w-4" /> Сегодня · по порядку
              </CardTitle>
              <span className="text-xs text-muted-foreground">{todayDone}/{todayTotal}</span>
            </CardHeader>
            {todayTotal > 0 && (
              <div className="mb-1 px-6">
                <Progress value={(todayDone / todayTotal) * 100} className="h-1" />
              </div>
            )}
            <CardContent className="flex flex-col gap-1.5">
              {rankedToday.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  На сегодня ничего не горит. Хороший день, чтобы взять что-то из «Позже».
                </p>
              )}
              {rankedToday.map((t, i) => (
                <div key={t.id} className={cn("group flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-secondary/40", overLimitIds.has(t.id) && "opacity-50")}>
                  <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground/50">{i + 1}</span>
                  <AnimatedCheckbox checked={t.done} onChange={() => handleToggle(t.id, !t.done)} size="sm" label={t.title} priority={t.priority} />
                  <span
                    className={cn("min-w-0 flex-1 truncate text-sm hover:underline", t.done && "text-muted-foreground line-through")}
                    onClick={() => setEditingTask(t)}
                  >
                    {t.title}
                  </span>
                  <PriorityFlag p={t.priority} />
                  {!t.done && isOverdue(t.dueDate) && <span className="shrink-0 text-xs font-medium text-risk">{dueLabel(t.dueDate!)}</span>}
                </div>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTodayTask()} placeholder="Добавить задачу на сегодня…" className="h-9" />
                <PriorityPicker p={newTaskPriority} onChange={setNewTaskPriority} />
                <Button size="icon" className="h-9 w-9 shrink-0" aria-label="Добавить задачу" onClick={addTodayTask}><Plus className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          {upcomingMeetings.filter((m) => !m.done).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarClock className="h-4 w-4" /> Ближайшие встречи
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {upcomingMeetings.filter((m) => !m.done).slice(0, 3).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <AnimatedCheckbox checked={!!m.done} onChange={() => toggleMeeting(m.id)} size="sm" label={`Встреча: ${m.title}`} />
                    {m.url ? (
                      <a href={m.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-brand hover:underline">{m.title}</a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                    )}
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {isToday(m.date) ? "Сегодня" : m.date} · {m.time}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : isMobile ? (
        <div className="flex flex-col gap-3">
          {mobileKpis.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {mobileKpis.map((id) => (
                <div key={id} className="h-24">{renderWidget(id)}</div>
              ))}
            </div>
          )}
          {mobileLarge.map((id) => (
            <div key={id} className={MOBILE_H[id] ?? "h-64"}>{renderWidget(id)}</div>
          ))}
        </div>
      ) : (
      <GridLayout
        className="layout -mx-1"
        layout={visibleLayout}
        cols={12}
        rowHeight={40}
        margin={[16, 16]}
        isDraggable={editing}
        isResizable={editing}
        draggableHandle=".rgl-handle"
        draggableCancel=".no-drag"
        compactType="vertical"
        preventCollision={false}
        resizeHandles={["se"]}
        onLayoutChange={(l) => {
          const byId = new Map(l.map((x) => [x.i, x]));
          setLayout((prev) => prev.map((p) => ({ ...p, ...(byId.get(p.i) ?? {}) })));
        }}
      >
        {visibleLayout.map((l) => {
          const title = WIDGETS.find((w) => w.id === l.i)?.title ?? "";
          return (
            <div key={l.i} className={cn("h-full", !editing && "overflow-hidden", editing && "rounded-lg ring-1 ring-brand/50")}>
              {editing && (
                <div className="rgl-handle flex cursor-move items-center gap-2 rounded-t-lg border-b border-brand/20 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand">
                  <GripVertical className="h-4 w-4" />
                  <span className="flex-1 truncate">{title}</span>
                  <button
                    className="no-drag rounded p-0.5 hover:text-risk"
                    onClick={() => {
                      setHidden((h) => [...h, l.i]);
                      const run = pushUndo(`Виджет скрыт: ${title}`, () => setHidden((h) => h.filter((x) => x !== l.i)));
                      toast(`Виджет скрыт: ${title}`, { actionLabel: "Вернуть", onAction: run });
                    }}
                    title="Скрыть виджет"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className={cn("overflow-hidden", editing ? "h-[calc(100%-2.25rem)]" : "h-full")}>
                {renderWidget(l.i)}
              </div>
            </div>
          );
        })}
      </GridLayout>
      )}

      <Dialog open={openPopup} onOpenChange={setOpenPopup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Открытые задачи · {openAll.length}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {openAll.length === 0 && <p className="text-sm text-muted-foreground">Открытых задач нет.</p>}
            {[...openAll]
              .sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"))
              .map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-secondary/40">
                  <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} size="sm" label={t.title} priority={t.priority} />
                  <span className="min-w-0 flex-1 truncate text-sm hover:underline" onClick={() => setEditingTask(t)}>{t.title}</span>
                  <PriorityFlag p={t.priority} />
                  <span className={cn("shrink-0 text-xs", isOverdue(t.dueDate) ? "font-medium text-risk" : "text-muted-foreground")}>
                    {t.dueDate ? dueLabel(t.dueDate) : "без срока"}
                  </span>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={weekPopup} onOpenChange={setWeekPopup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Закрыто за неделю · {weekDone}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {weekByDay.map((d) => (
              <div key={d.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className={cn("font-medium", isToday(d.key) && "text-brand")}>{d.label}</span>
                  <span className="text-xs text-muted-foreground">{d.tasks.length}</span>
                </div>
                {d.tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50">—</p>
                ) : (
                  <div className="flex flex-col gap-0.5 pl-1">
                    {d.tasks.map((t) => (
                      <p key={t.id} className="truncate text-xs text-muted-foreground">{t.title}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {weekDoneTasks.length === 0 && <p className="text-sm text-muted-foreground">На этой неделе пока ничего не закрыто.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={meetingDialog} onOpenChange={setMeetingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая встреча</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="m-title">Название</Label>
              <Input id="m-title" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitMeeting()} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Дата</Label>
                <DatePicker value={meetingDate} onChange={(d) => setMeetingDate(d ?? todayStr())} allowClear={false} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-time">Время</Label>
                <Input id="m-time" type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-url">Ссылка на созвон</Label>
              <Input id="m-url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitMeeting()} placeholder="https://meet.google.com/…" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setMeetingDialog(false)}>Отмена</Button>
            <Button onClick={submitMeeting}>Добавить</Button>
          </div>
        </DialogContent>
      </Dialog>

      <TaskEditDialog task={editingTask} open={!!editingTask} onOpenChange={(v) => !v && setEditingTask(null)} />

      <SubtaskEditDialog
        taskId={editingSub?.taskId ?? null}
        subtaskId={editingSub?.subId ?? null}
        open={!!editingSub}
        onOpenChange={(v) => !v && setEditingSub(null)}
        onOpenParent={(p) => setEditingTask(p)}
      />
    </AppShell>
  );
}
