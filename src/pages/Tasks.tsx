import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Reorder, AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  GripVertical,
  CheckSquare,
  Search,
  Repeat,
  CalendarClock,
  X,
  Moon,
  Bell,
  Bookmark,
  BookmarkPlus,
  Link2,
  MessageSquare,
  Archive,
  List,
  LayoutGrid,
  Plus,
  Lock,
  Tag,
  AlignLeft,
  Timer,
  Settings2,
  FolderKanban,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { FilterChip } from "@/components/ui/filter-chip";
import { IconAction } from "@/components/ui/icon-action";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TaskTag } from "@/components/TaskTag";
import { EmptyState } from "@/components/EmptyState";
import { TaskEditDialog } from "@/components/TaskEditDialog";
import { PromptDialog } from "@/components/PromptDialog";
import { PriorityFlag } from "@/components/PriorityFlag";
import { PriorityPicker } from "@/components/PriorityPicker";
import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { dueLabel, isOverdue, isToday, isUpcoming, todayStr, formatDate, addDays } from "@/lib/format";
import { tagColor, FIXED_TAGS } from "@/lib/tags";
import { loadKanbanColumns, saveKanbanColumns, newKanbanColumn, COLUMN_COLORS, COLUMN_COLOR_ORDER, type KanbanColumn, type ColumnColor } from "@/lib/kanban";
import { pushUndo } from "@/lib/undoStack";
import { pushRecent } from "@/lib/recent";
import { blockingTasks, isBlocked } from "@/lib/dependencies";
import { isSnoozed } from "@/lib/taskGrouping";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { PRIORITY_META, type Task, type Meeting } from "@/types";

type SmartList = "all" | "today" | "overdue" | "upcoming" | "snoozed" | "done";

const LISTS: { key: SmartList; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "today", label: "Сегодня" },
  { key: "overdue", label: "Просрочено" },
  { key: "upcoming", label: "Предстоящие" },
  // "Отложенные" stays: dropping it would strand snoozed tasks with no way back into view,
  // since isSnoozed() below hides them from every other list.
  { key: "snoozed", label: "Отложенные" },
  { key: "done", label: "Завершённые" },
];

function matchesList(t: Task, list: SmartList): boolean {
  if (list === "snoozed") return !t.done && isSnoozed(t);
  if (isSnoozed(t)) return false; // snoozed tasks hide from every other list
  switch (list) {
    case "all": return true;
    case "today": return !t.done && !!t.dueDate && isToday(t.dueDate);
    case "overdue": return !t.done && isOverdue(t.dueDate);
    case "upcoming": return !t.done && isUpcoming(t.dueDate);
    case "done": return t.done;
  }
}

/** A meeting shown in the task list. Wraps the real record — never a copy of it. */
interface MeetingItem {
  meeting: Meeting;
  dueDate: string;
  priority: number;
  done: boolean;
  title: string;
  tags: string[];
}

/** Same smart-list rules as tasks, minus the ones meetings can't have (no date, snooze, important). */
function matchesMeetingList(m: MeetingItem, list: SmartList): boolean {
  switch (list) {
    case "all": return true;
    case "today": return !m.done && isToday(m.dueDate);
    case "overdue": return !m.done && isOverdue(m.dueDate);
    case "upcoming": return !m.done && isUpcoming(m.dueDate);
    case "done": return m.done;
    case "snoozed":
      return false;
  }
}

function offsetDate(days: number): string {
  return addDays(new Date(), days);
}

/** Next Monday as YYYY-MM-DD. */
function nextMonday(): string {
  const d = new Date();
  const diff = (8 - d.getDay()) % 7 || 7;
  return addDays(d, diff);
}

export default function Tasks() {
  const {
    tasks,
    allTasks,
    projects,
    allProjects,
    settings,
    meetings,
    toggleMeeting,
    updateMeeting,
    deleteMeeting,
    restoreMeeting,
    toggleTask,
    toggleSubtask,
    deleteTask,
    restoreTask,
    reorderTasks,
    updateTask,
    addSavedView,
    deleteSavedView,
    archiveTask,
    unarchiveTask,
    archiveDoneTasks,
  } = useData();
  const { setQuickAddOpen } = useUI();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [list, setList] = useState<SmartList>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);

  function openTask(task: Task) {
    setEditing(task);
    pushRecent({ id: task.id, label: task.title, to: "/tasks", state: { openTaskId: task.id } });
  }

  // Deep-link: WikiLink/CommandPalette send { openTaskId } instead of dumping the user on the
  // general list — open that task's card once, then clear the state so back/forward doesn't re-fire it.
  useEffect(() => {
    const openId = (location.state as { openTaskId?: string } | null)?.openTaskId;
    if (!openId) return;
    const target = allTasks.find((t) => t.id === openId);
    if (target) openTask(target);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [kanbanMode, setKanbanMode] = useState<"priority" | "project" | "status" | "board">("priority");
  // Date-ascending by default (earliest due date on top) — manual drag-order stays one click away.
  const [sortBy, setSortBy] = useState<"manual" | "date" | "priority">("date");
  const [columns, setColumns] = useState<KanbanColumn[]>(() => loadKanbanColumns());
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [colRenameDraft, setColRenameDraft] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  useEffect(() => saveKanbanColumns(columns), [columns]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onEsc); };
  }, [menu]);

  function startRename(t: Task) {
    setRenamingId(t.id);
    setRenameDraft(t.title);
  }
  function commitRename() {
    if (renamingId && renameDraft.trim()) updateTask(renamingId, { title: renameDraft.trim() });
    setRenamingId(null);
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // j/k roving cursor — a row key ("t-<id>" / "m-<id>") from `flatRows`, or null when nothing's focused.
  const [cursorKey, setCursorKey] = useState<string | null>(null);

  const byOrder = useMemo(() => [...tasks].sort((a, b) => a.order - b.order), [tasks]);
  const [items, setItems] = useState<Task[]>(byOrder);
  const signature = byOrder.map((t) => t.id).join("|");
  useEffect(() => {
    setItems([...tasks].sort((a, b) => a.order - b.order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, tasks]);

  // Number keys 1–8 switch smart lists; Esc clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName) || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= LISTS.length) {
        setList(LISTS[n - 1].key);
      } else if (e.key === "Escape") {
        setSelected(new Set());
        setCursorKey(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function bulkComplete() {
    // Complete via toggleTask (not updateTask) so bulk-completing awards XP, logs the
    // completion for streak/heatmap, and fires the checkbox burst — same reward as a
    // single click. Only flip tasks that are still open (toggleTask would un-check done ones).
    const toComplete = [...selected].filter((id) => {
      const t = tasks.find((x) => x.id === id);
      return t && !t.done;
    });
    toComplete.forEach((id) => toggleTask(id));
    toast(`Завершено: ${toComplete.length}`);
    setSelected(new Set());
  }
  function bulkToday() {
    selected.forEach((id) => reschedule(id, 0));
    setSelected(new Set());
  }
  function bulkDelete() {
    const snapshot = tasks.filter((t) => selected.has(t.id));
    snapshot.forEach((t) => deleteTask(t.id));
    const run = pushUndo(`Удалено задач: ${snapshot.length}`, () => snapshot.forEach((t) => restoreTask(t)));
    toast(`Удалено: ${snapshot.length}`, { actionLabel: "Вернуть", onAction: run });
    setSelected(new Set());
  }

  /**
   * Meetings live in the task list too — but NOT as a copied "task version" of themselves.
   * There is one Meeting record; this only wraps it for display/grouping. That's what makes
   * "close it anywhere and it's closed everywhere" true by construction rather than by syncing.
   */
  const meetingItems = useMemo(
    () =>
      meetings.map((m) => ({
        meeting: m,
        // Shape the grouper/sorter understands. Date-only: the time is shown on the row.
        dueDate: m.date,
        priority: m.priority ?? 0,
        done: !!m.done,
        title: m.title,
        tags: m.tags ?? [],
      })),
    [meetings]
  );

  const counts = useMemo(() => {
    const c = {} as Record<SmartList, number>;
    LISTS.forEach(({ key }) => {
      c[key] =
        tasks.filter((t) => matchesList(t, key)).length +
        meetingItems.filter((m) => matchesMeetingList(m, key)).length;
    });
    return c;
  }, [tasks, meetingItems]);

  const q = query.trim().toLowerCase();
  let visible = items.filter(
    (t) =>
      matchesList(t, list) &&
      (!activeTag || t.tags.includes(activeTag)) &&
      (!q || t.title.toLowerCase().includes(q))
  );
  // Logbook: completed list newest-first by completion time.
  if (list === "done") {
    visible = [...visible].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  } else if (sortBy === "date") {
    visible = [...visible].sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
  } else if (sortBy === "priority") {
    const rank: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
    visible = [...visible].sort((a, b) => rank[a.priority] - rank[b.priority]);
  }

  const visibleMeetings = meetingItems.filter(
    (m) =>
      matchesMeetingList(m, list) &&
      (!activeTag || m.tags.includes(activeTag)) &&
      (!q || m.title.toLowerCase().includes(q))
  );

  // Tasks and meetings bucket TOGETHER, so a 15:00 call sits next to what's due today.
  type Row = { key: string; dueDate?: string; priority: number; done: boolean; node: ReactNode };
  const rows: Row[] = [
    ...visible.map((t) => ({
      key: `t-${t.id}`, dueDate: t.dueDate, priority: t.priority, done: t.done,
      node: renderRow(t, false),
    })),
    ...visibleMeetings.map((m) => ({
      key: `m-${m.meeting.id}`, dueDate: m.dueDate, priority: m.priority, done: m.done,
      node: renderMeetingRow(m.meeting),
    })),
  ];

  // Drag reorder only makes sense in the unfiltered, flat "all" view, sorted manually.
  const canReorder = list === "all" && !activeTag && !q && sortBy === "manual";

  // Same order the flat (non-reorder) list view renders in — shared by the JSX below and the
  // j/k roving-cursor handler so "next visible row" always means the same thing to both.
  const flatRows = [...rows].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    return (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿");
  });

  // j/k roving cursor + single-key verbs — only in the flat browsing list (not kanban, not
  // drag-reorder mode, which have their own interaction models already).
  useEffect(() => {
    if (view !== "list" || canReorder) return;
    const taskByKey = new Map(visible.map((t) => [`t-${t.id}`, t]));
    const meetingByKey = new Map(visibleMeetings.map((m) => [`m-${m.meeting.id}`, m]));
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName) || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey || flatRows.length === 0) return;
      const idx = cursorKey ? flatRows.findIndex((r) => r.key === cursorKey) : -1;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursorKey(flatRows[idx < 0 ? 0 : Math.min(idx + 1, flatRows.length - 1)].key);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursorKey(flatRows[idx < 0 ? 0 : Math.max(idx - 1, 0)].key);
      } else if (e.key === "x" && cursorKey) {
        e.preventDefault();
        const task = taskByKey.get(cursorKey);
        if (task) handleToggleTask(task);
        else { const m = meetingByKey.get(cursorKey); if (m) toggleMeeting(m.meeting.id); }
      } else if ((e.key === "Enter" || e.key === "e") && cursorKey) {
        const task = taskByKey.get(cursorKey);
        if (task) { e.preventDefault(); openTask(task); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, canReorder, flatRows, cursorKey, visible, visibleMeetings]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleReorder(next: Task[]) {
    setItems(next);
    reorderTasks(next.map((t) => t.id));
  }

  function saveCurrentView(name: string) {
    addSavedView({ name, list, tag: activeTag, query: query.trim() });
    toast("Вид сохранён");
  }

  function applyView(v: { list: string; tag: string | null; query: string }) {
    setList(v.list as SmartList);
    setActiveTag(v.tag);
    setQuery(v.query);
  }

  function handleDelete(task: Task) {
    deleteTask(task.id);
    const run = pushUndo("Задача удалена", () => restoreTask(task));
    toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
  }

  function handleArchive(task: Task) {
    archiveTask(task.id);
    const run = pushUndo("Задача в архиве", () => unarchiveTask(task.id));
    toast("В архиве", { actionLabel: "Вернуть", onAction: run });
  }

  function bulkArchive() {
    const ids = [...selected];
    ids.forEach((id) => archiveTask(id));
    const run = pushUndo(`В архив: ${ids.length}`, () => ids.forEach((id) => unarchiveTask(id)));
    toast(`В архив: ${ids.length}`, { actionLabel: "Вернуть", onAction: run });
    setSelected(new Set());
  }

  function reschedule(taskId: string, offset: number | null) {
    if (offset === null) {
      updateTask(taskId, { dueDate: undefined });
      return;
    }
    updateTask(taskId, { dueDate: addDays(new Date(), offset) });
  }

  function snooze(taskId: string, until: string | null) {
    updateTask(taskId, { snoozedUntil: until ?? undefined });
    if (until) toast("Задача отложена");
  }

  function handleToggleTask(task: Task) {
    if (!task.done) {
      const blockers = blockingTasks(task, tasks);
      if (blockers.length > 0) {
        toast(`Заблокировано — сначала закройте «${blockers[0].title}»${blockers.length > 1 ? ` (+${blockers.length - 1})` : ""}`);
        return;
      }
    }
    toggleTask(task.id);
  }

  function renderRow(task: Task, draggable: boolean) {
    const project = allProjects.find((p) => p.id === task.projectId);
    const doneSub = task.subtasks.filter((s) => s.done).length;
    const progress = task.subtasks.length ? (doneSub / task.subtasks.length) * 100 : 0;
    const isOpen = expanded.has(task.id);
    const overdue = !task.done && isOverdue(task.dueDate);

    return (
      <Card
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, task }); }}
        className={cn(
          "p-3 transition-shadow",
          selected.has(task.id) && "ring-2 ring-brand ring-offset-1 ring-offset-background"
        )}
      >
        <div className="flex items-center gap-2">
          {draggable ? (
            <span className="cursor-grab touch-none text-muted-foreground/50 active:cursor-grabbing">
              <GripVertical className="h-4 w-4" />
            </span>
          ) : (
            <span className="w-4" />
          )}
          {task.subtasks.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={isOpen ? "Свернуть подзадачи" : "Развернуть подзадачи"}
              aria-expanded={isOpen}
              onClick={() => toggleExpanded(task.id)}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          ) : (
            <span className="w-6" />
          )}
          <AnimatedCheckbox checked={task.done} onChange={() => handleToggleTask(task)} label={task.title} priority={task.priority} />
          {isBlocked(task, tasks) && (
            <span className="shrink-0 text-muted-foreground" title="Заблокировано незавершёнными зависимостями">
              <Lock className="h-3.5 w-3.5" />
            </span>
          )}
          <div
            className="min-w-0 flex-1"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) toggleSelect(task.id);
            }}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {renamingId === task.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="rounded border border-brand bg-transparent px-1 py-0.5 text-sm outline-none"
                />
              ) : (
                <span
                  className={cn("cursor-pointer text-sm hover:underline", task.done && "text-muted-foreground line-through")}
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; openTask(task); }}
                  title="Открыть карточку · переименовать — в меню по правому клику"
                >
                  {task.title}
                </span>
              )}
              <PriorityPicker p={task.priority} onChange={(p) => updateTask(task.id, { priority: p })} />
              {task.done && task.completedAt && (
                <span className="text-xs text-muted-foreground">✓ {formatDate(task.completedAt)}</span>
              )}
              {task.tags.map((t) => (
                <TaskTag key={t} tag={t} onRemove={() => updateTask(task.id, { tags: task.tags.filter((x) => x !== t) })} />
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-foreground"
                    title="Теги"
                  >
                    <Tag className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="flex flex-wrap gap-1.5 p-2" style={{ width: "12rem" }}>
                  {FIXED_TAGS.map((tag) => {
                    const active = task.tags.includes(tag);
                    return (
                      <FilterChip
                        key={tag}
                        active={active}
                        activeClassName={tagColor(tag)}
                        onClick={() => {
                          const next = active ? task.tags.filter((t) => t !== tag) : [...task.tags, tag];
                          updateTask(task.id, { tags: next });
                        }}
                        className="py-1"
                      >
                        #{tag}
                      </FilterChip>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {task.subtasks.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <Progress value={progress} className="max-w-[8rem]" />
                <span className="text-xs text-muted-foreground">
                  {doneSub}/{task.subtasks.length}
                </span>
              </div>
            )}
          </div>
          {task.description && (
            <span className="hidden text-muted-foreground sm:inline" title="Есть описание"><AlignLeft className="h-3.5 w-3.5" /></span>
          )}
          {task.links.length > 0 && (
            <span className="hidden text-muted-foreground sm:inline" title={`${task.links.length} ссылок`}><Link2 className="h-3.5 w-3.5" /></span>
          )}
          {task.comments.length > 0 && (
            <span className="hidden items-center gap-0.5 text-xs text-muted-foreground sm:inline-flex" title={`${task.comments.length} комментариев`}>
              <MessageSquare className="h-3.5 w-3.5" />{task.comments.length}
            </span>
          )}
          {task.spentMin > 0 && (
            <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline" title="Потрачено времени">
              {formatDuration(task.spentMin)}
            </span>
          )}
          {task.timerStartedAt && (
            <span className="animate-pulse text-brand" title="Таймер запущен">
              <Timer className="h-3.5 w-3.5" />
            </span>
          )}
          {task.remindAt && (
            <span className="hidden text-brand sm:inline" title={`Напоминание: ${task.remindAt.replace("T", " ")}`}>
              <Bell className="h-3.5 w-3.5" />
            </span>
          )}
          {task.recurrence !== "none" && (
            <span className="hidden text-muted-foreground sm:inline" title="Повторяющаяся">
              <Repeat className="h-3.5 w-3.5" />
            </span>
          )}
          {isSnoozed(task) && (
            <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-muted-foreground sm:inline-flex" title="Отложена">
              <Moon className="h-3.5 w-3.5" /> до {dueLabel(task.snoozedUntil!)}
            </span>
          )}
          {project && (
            <Badge variant="secondary" className="gap-1">
              <FolderKanban className="h-3 w-3" /> {project.name}
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "hidden items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors hover:bg-secondary sm:inline-flex",
                  task.dueDate
                    ? overdue
                      ? "font-medium text-risk"
                      : "text-muted-foreground"
                    : "text-muted-foreground/60"
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {task.dueDate ? dueLabel(task.dueDate) : "Срок"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => reschedule(task.id, 0)}>Срок: сегодня</DropdownMenuItem>
              <DropdownMenuItem onClick={() => reschedule(task.id, 1)}>Срок: завтра</DropdownMenuItem>
              <DropdownMenuItem onClick={() => reschedule(task.id, 7)}>Срок: через неделю</DropdownMenuItem>
              {task.dueDate && (
                <DropdownMenuItem onClick={() => reschedule(task.id, null)}>
                  <X /> Убрать срок
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <div className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                <p className="mb-1 px-1 text-xs text-muted-foreground">Или выбрать дату</p>
                <Calendar selected={task.dueDate} onSelect={(d) => updateTask(task.id, { dueDate: d })} />
              </div>
              <DropdownMenuSeparator />
              {isSnoozed(task) ? (
                <DropdownMenuItem onClick={() => snooze(task.id, null)}>
                  <Moon /> Вернуть из отложенных
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => snooze(task.id, offsetDate(1))}>
                    <Moon /> Отложить до завтра
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => snooze(task.id, nextMonday())}>
                    <Moon /> Отложить до понедельника
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => snooze(task.id, offsetDate(7))}>
                    <Moon /> Отложить на неделю
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="text-muted-foreground/50 hover:text-risk" onClick={() => handleDelete(task)} title="Удалить" aria-label={`Удалить задачу: ${task.title}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {isOpen && task.subtasks.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="ml-16 mt-2 flex flex-col gap-1.5 border-l border-border pl-4">
                {task.subtasks.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <AnimatedCheckbox
                      checked={s.done}
                      onChange={() => toggleSubtask(task.id, s.id)}
                      size="sm"
                      label={s.title}
                    />
                    <span className={s.done ? "text-sm text-muted-foreground line-through" : "text-sm"}>
                      {s.title}
                    </span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    );
  }

  /** Move a task to the column `dir` steps away — the keyboard equivalent of dragging it. */
  function moveTaskByKeyboard(task: Task, dir: -1 | 1) {
    const cols = kanbanColumns();
    const from = cols.findIndex((c) => c.match(task));
    const to = from + dir;
    if (from === -1 || to < 0 || to >= cols.length) return;
    cols[to].onDrop(task.id);
    toast(`«${task.title}» → ${cols[to].label}`);
  }

  /**
   * A meeting rendered as a task row. Every action here hits the ONE Meeting record via the
   * store, so closing it in this list, on the dashboard or in the calendar is the same event —
   * nothing to keep in sync, nothing to drift.
   */
  function renderMeetingRow(m: Meeting) {
    const overdue = !m.done && isOverdue(m.date);
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <span className="w-4" />
          <span className="w-6" />
          <AnimatedCheckbox
            checked={!!m.done}
            onChange={() => toggleMeeting(m.id)}
            label={`Встреча: ${m.title}`}
            priority={m.priority}
          />
          <span className="shrink-0 text-muted-foreground" title="Встреча">
            <CalendarClock className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {m.url && !m.done ? (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-brand underline-offset-2 hover:underline"
                >
                  {m.title}
                </a>
              ) : (
                <span className={cn("text-sm", m.done && "text-muted-foreground line-through")}>{m.title}</span>
              )}
              <PriorityPicker p={(m.priority ?? 0) as Task["priority"]} onChange={(p) => updateMeeting(m.id, { priority: p })} />
              {(m.tags ?? []).map((t) => (
                <TaskTag key={t} tag={t} onRemove={() => updateMeeting(m.id, { tags: (m.tags ?? []).filter((x) => x !== t) })} />
              ))}
              {m.done && m.completedAt && (
                <span className="text-xs text-muted-foreground">✓ {formatDate(m.completedAt)}</span>
              )}
            </div>
          </div>
          <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:inline">
            {m.durationMin} мин
          </span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs",
              overdue ? "font-medium text-risk" : "text-muted-foreground"
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {isToday(m.date) ? "Сегодня" : dueLabel(m.date)} · {m.time}
          </span>
          <IconAction
            icon={Trash2}
            label={`Удалить встречу: ${m.title}`}
            tone="danger"
            onClick={() => {
              deleteMeeting(m.id);
              const run = pushUndo(`Встреча удалена: ${m.title}`, () => restoreMeeting(m));
              toast("Встреча удалена", { actionLabel: "Вернуть", onAction: run });
            }}
            className="p-1"
            iconClassName="h-4 w-4"
          />
        </div>
      </Card>
    );
  }

  function kanbanCard(task: Task) {
    const project = allProjects.find((p) => p.id === task.projectId);
    const overdue = !task.done && isOverdue(task.dueDate);
    return (
      <div
        key={task.id}
        draggable
        tabIndex={0}
        role="listitem"
        aria-label={`${task.title}. Стрелки влево/вправо — перенести в соседнюю колонку`}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, task }); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); moveTaskByKeyboard(task, -1); }
          if (e.key === "ArrowRight") { e.preventDefault(); moveTaskByKeyboard(task, 1); }
          if (e.key === "Enter") { e.preventDefault(); openTask(task); }
        }}
        className="group cursor-grab rounded-lg border border-border bg-card p-2.5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:cursor-grabbing"
      >
        <div className="flex items-start gap-2">
          <AnimatedCheckbox checked={task.done} onChange={() => handleToggleTask(task)} size="sm" label={task.title} priority={task.priority} />
          <span className={cn("min-w-0 flex-1 cursor-pointer text-sm", task.done && "text-muted-foreground line-through")} onClick={() => openTask(task)}>{task.title}</span>
          {isBlocked(task, tasks) && (
            <span className="shrink-0 text-muted-foreground" title="Заблокировано незавершёнными зависимостями">
              <Lock className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6 text-xs">
          <PriorityPicker p={task.priority} onChange={(p) => updateTask(task.id, { priority: p })} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "rounded px-1 py-0.5 transition-colors hover:bg-secondary",
                  task.dueDate ? (overdue ? "font-medium text-risk" : "text-muted-foreground") : "text-muted-foreground/50"
                )}
              >
                {task.dueDate ? dueLabel(task.dueDate) : "Срок"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => reschedule(task.id, 0)}>Срок: сегодня</DropdownMenuItem>
              <DropdownMenuItem onClick={() => reschedule(task.id, 1)}>Срок: завтра</DropdownMenuItem>
              <DropdownMenuItem onClick={() => reschedule(task.id, 7)}>Срок: через неделю</DropdownMenuItem>
              {task.dueDate && (
                <DropdownMenuItem onClick={() => reschedule(task.id, null)}>
                  <X /> Убрать срок
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <div className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                <p className="mb-1 px-1 text-xs text-muted-foreground">Или выбрать дату</p>
                <Calendar selected={task.dueDate} onSelect={(d) => updateTask(task.id, { dueDate: d })} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          {task.spentMin > 0 && <span className="text-muted-foreground">{formatDuration(task.spentMin)}</span>}
          {task.tags.map((t) => (
            <TaskTag key={t} tag={t} onRemove={() => updateTask(task.id, { tags: task.tags.filter((x) => x !== t) })} />
          ))}
          {project && (
            <Badge variant="secondary" className="gap-1">
              <FolderKanban className="h-3 w-3" /> {project.name}
            </Badge>
          )}
        </div>
      </div>
    );
  }

  type KanbanCol = {
    key: string; label: string; dot?: string; match: (t: Task) => boolean;
    onDrop: (id: string) => void; editable?: boolean;
    /** Custom-board only: DS colour token + WIP cap. */
    colorClass?: string; wipLimit?: number;
  };

  function addColumn(title: string) {
    setColumns((cols) => [...cols, newKanbanColumn(title)]);
  }

  function renameColumn(id: string, title: string) {
    if (!title.trim()) return;
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, title: title.trim() } : c)));
  }

  function setColumnColor(id: string, color: ColumnColor) {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, color } : c)));
  }

  function setColumnWip(id: string, wipLimit: number | undefined) {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, wipLimit } : c)));
  }

  function deleteColumn(id: string) {
    if (columns.length <= 1) return;
    const removed = columns.find((c) => c.id === id);
    const fallback = columns.find((c) => c.id !== id)!.id;
    const movedTasks = tasks.filter((t) => t.kanbanColumnId === id);
    const prevColumns = columns;
    movedTasks.forEach((t) => updateTask(t.id, { kanbanColumnId: fallback }));
    setColumns((cols) => cols.filter((c) => c.id !== id));
    const run = pushUndo(`Колонка удалена: ${removed?.title ?? ""}`, () => {
      setColumns(prevColumns);
      movedTasks.forEach((t) => updateTask(t.id, { kanbanColumnId: id }));
    });
    toast(`Колонка удалена: ${removed?.title ?? ""}`, { actionLabel: "Вернуть", onAction: run });
  }

  function moveColumn(fromId: string, toId: string) {
    if (fromId === toId) return;
    setColumns((cols) => {
      const from = cols.findIndex((c) => c.id === fromId);
      const to = cols.findIndex((c) => c.id === toId);
      if (from === -1 || to === -1) return cols;
      const next = [...cols];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function kanbanColumns(): KanbanCol[] {
    if (kanbanMode === "board") {
      return columns.map((col) => ({
        key: col.id,
        label: col.title,
        editable: true,
        colorClass: col.color && col.color !== "none" ? COLUMN_COLORS[col.color].dot : undefined,
        wipLimit: col.wipLimit,
        match: (t) => !t.done && (t.kanbanColumnId ?? columns[0]?.id) === col.id,
        onDrop: (id) => updateTask(id, { kanbanColumnId: col.id }),
      }));
    }
    if (kanbanMode === "project") {
      const cols: KanbanCol[] = projects.map((pr) => ({
        key: pr.id,
        label: pr.name,
        match: (t) => !t.done && t.projectId === pr.id,
        onDrop: (id) => updateTask(id, { projectId: pr.id }),
      }));
      cols.push({ key: "none", label: "Без проекта", match: (t) => !t.done && !t.projectId, onDrop: (id) => updateTask(id, { projectId: undefined }) });
      return cols;
    }
    if (kanbanMode === "status") {
      return [
        { key: "nodate", label: "Без срока", match: (t) => !t.done && !t.dueDate, onDrop: (id) => updateTask(id, { dueDate: undefined, done: false }) },
        { key: "today", label: "Сегодня", match: (t) => !t.done && !!t.dueDate && (isToday(t.dueDate) || isOverdue(t.dueDate)), onDrop: (id) => updateTask(id, { dueDate: todayStr(), done: false }) },
        { key: "soon", label: "Скоро", match: (t) => !t.done && isUpcoming(t.dueDate), onDrop: (id) => updateTask(id, { dueDate: offsetDate(7), done: false }) },
        { key: "done", label: "Готово", dot: "hsl(var(--success))", match: (t) => t.done, onDrop: (id) => { const t = tasks.find((x) => x.id === id); if (t && !t.done) handleToggleTask(t); } },
      ];
    }
    return ([1, 2, 3, 0] as Task["priority"][]).map((p) => ({
      key: `p${p}`,
      label: PRIORITY_META[p].label,
      dot: PRIORITY_META[p].dot,
      match: (t) => !t.done && t.priority === p,
      onDrop: (id) => updateTask(id, { priority: p }),
    }));
  }

  function renderKanban() {
    const base = items.filter(
      (t) => !isSnoozed(t) && (!activeTag || t.tags.includes(activeTag)) && (!q || t.title.toLowerCase().includes(q))
    );
    const cols = kanbanColumns();
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Segmented
            ariaLabel="Группировка канбана"
            className="self-start"
            value={kanbanMode}
            onChange={setKanbanMode}
            options={[
              { value: "priority", label: "Приоритет" },
              { value: "project", label: "Проект" },
              { value: "status", label: "Статус" },
              { value: "board", label: "Доска" },
            ]}
          />
          {kanbanMode === "board" && (
            <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => setAddingColumn(true)}>
              <Plus className="h-3.5 w-3.5" /> Колонка
            </Button>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {cols.map((col) => {
            const colTasks = base.filter(col.match).sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
            const overWip = !!col.wipLimit && colTasks.length > col.wipLimit;
            return (
              <div
                key={col.key}
                draggable={col.editable}
                onDragStart={(e) => { if (col.editable) e.dataTransfer.setData("application/x-kanban-col", col.key); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const colId = e.dataTransfer.getData("application/x-kanban-col");
                  if (colId) { moveColumn(colId, col.key); return; }
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) col.onDrop(id);
                }}
                className={cn(
                  "flex min-h-[8rem] w-72 shrink-0 flex-col gap-2 rounded-xl border bg-secondary/20 p-2",
                  overWip ? "border-risk/40 bg-risk/5" : "border-border",
                  col.editable && "cursor-grab active:cursor-grabbing"
                )}
              >
                <div className="group flex items-center justify-between px-1 py-0.5 text-sm font-medium">
                  {renamingColId === col.key ? (
                    <input
                      autoFocus
                      value={colRenameDraft}
                      onChange={(e) => setColRenameDraft(e.target.value)}
                      onBlur={() => { renameColumn(col.key, colRenameDraft); setRenamingColId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { renameColumn(col.key, colRenameDraft); setRenamingColId(null); }
                        if (e.key === "Escape") setRenamingColId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-brand bg-transparent px-1 py-0.5 text-sm outline-none"
                    />
                  ) : (
                    <span
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onDoubleClick={() => { if (col.editable) { setRenamingColId(col.key); setColRenameDraft(col.label); } }}
                      title={col.editable ? "Двойной клик — переименовать" : undefined}
                    >
                      {col.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.dot }} />}
                      {col.colorClass && <span className={cn("h-2 w-2 shrink-0 rounded-full", col.colorClass)} />}
                      <span className="truncate">{col.label}</span>
                    </span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      overWip ? "font-semibold text-risk" : "text-muted-foreground"
                    )}
                    title={col.wipLimit ? `Лимит WIP: ${col.wipLimit}` : undefined}
                  >
                    {colTasks.length}{col.wipLimit ? `/${col.wipLimit}` : ""}
                  </span>
                  {col.editable && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Настроить колонку: ${col.label}`}
                          title="Цвет и лимит WIP"
                          className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <p className="px-2 py-1 text-xs text-muted-foreground">Цвет</p>
                        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                          {COLUMN_COLOR_ORDER.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={COLUMN_COLORS[c].label}
                              title={COLUMN_COLORS[c].label}
                              onClick={() => setColumnColor(col.key, c)}
                              className={cn(
                                "h-5 w-5 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                COLUMN_COLORS[c].dot,
                                columns.find((x) => x.id === col.key)?.color === c && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                              )}
                            />
                          ))}
                        </div>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5">
                          <p className="mb-1 text-xs text-muted-foreground">Лимит WIP (0 — без лимита)</p>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-xs"
                            value={col.wipLimit ?? 0}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const n = Number(e.target.value) || 0;
                              setColumnWip(col.key, n > 0 ? n : undefined);
                            }}
                          />
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {col.editable && columns.length > 1 && (
                    <IconAction
                      icon={X}
                      label={`Удалить колонку: ${col.label}`}
                      tone="danger"
                      onClick={() => deleteColumn(col.key)}
                      reveal
                      className="ml-1 p-0.5"
                    />
                  )}
                </div>
                <div role="list" className="flex flex-col gap-2">
                  {colTasks.map(kanbanCard)}
                  {colTasks.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-1 py-6 text-center text-xs text-muted-foreground">
                      Перетащите сюда
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="Задачи"
      description={`Клик по задаче — открыть · Ctrl+клик — выделить несколько · цифры 1–${LISTS.length} переключают списки`}
    >
      {/* Smart lists (list view only) */}
      {view === "list" && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {LISTS.map(({ key, label }) => (
            <FilterChip
              key={key}
              active={list === key}
              onClick={() => setList(key)}
              count={counts[key]}
              className="px-3 py-1"
            >
              {label}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Saved views */}
      {(settings.savedViews.length > 0 || list !== "all" || activeTag || query) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {settings.savedViews.map((v) => (
            <span
              key={v.id}
              className="group inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <button className="flex items-center gap-1" onClick={() => applyView(v)}>
                <Bookmark className="h-3 w-3" /> {v.name}
              </button>
              <IconAction
                icon={X}
                label={`Удалить вид: ${v.name}`}
                tone="danger"
                onClick={() => deleteSavedView(v.id)}
                reveal
                className="p-0"
                iconClassName="h-3 w-3"
              />
            </span>
          ))}
          {(list !== "all" || activeTag || query) && (
            <button
              onClick={() => setSavingView(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <BookmarkPlus className="h-3 w-3" /> Сохранить вид
            </button>
          )}
        </div>
      )}

      {/* Search + filters (right-aligned) */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по задачам…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="flex flex-wrap items-center gap-1.5">
            {FIXED_TAGS.map((tag) => (
              <FilterChip
                key={tag}
                active={tag === activeTag}
                activeClassName={tagColor(tag)}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              >
                #{tag}
              </FilterChip>
            ))}
          </div>
          <Segmented
            ariaLabel="Вид задач"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: <><List className="h-3.5 w-3.5" /> Список</> },
              { value: "kanban", label: <><LayoutGrid className="h-3.5 w-3.5" /> Канбан</> },
            ]}
          />
          {view === "list" && list !== "done" && (
            <Segmented
              ariaLabel="Сортировка задач"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "manual", label: "Вручную", title: "Свой порядок — тяните за ручку" },
                { value: "date", label: "По дате" },
                { value: "priority", label: "По приоритету" },
              ]}
            />
          )}
        </div>
      </div>

      {view === "list" && list === "done" && visible.length > 0 && (
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const n = archiveDoneTasks();
              toast(n ? `В архив: ${n}` : "Нечего архивировать");
            }}
          >
            <Archive className="h-4 w-4" /> Архивировать завершённые
          </Button>
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Задач пока нет"
          description="Добавьте первую задачу. Пишите срок словами — «завтра», «в пятницу» — и он распознается сам."
          actionLabel="Добавить задачу"
          onAction={() => setQuickAddOpen(true)}
          shortcut="N"
        />
      ) : view === "kanban" ? (
        renderKanban()
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          В этом списке пусто.
        </div>
      ) : canReorder ? (
        <Reorder.Group axis="y" values={items} onReorder={handleReorder} className="flex flex-col gap-2">
          {items.map((task) => (
            <Reorder.Item key={task.id} value={task} className="list-none">
              {renderRow(task, true)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Flat mode: meetings interleave by date so the day still reads in order. */}
          {flatRows.map((r) => (
            <div
              key={r.key}
              className={cn("rounded-md transition-shadow", r.key === cursorKey && "ring-1 ring-brand/60")}
            >
              {r.node}
            </div>
          ))}
        </div>
      )}

      <TaskEditDialog task={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />

      <PromptDialog
        open={savingView}
        onOpenChange={setSavingView}
        title="Название вида"
        placeholder="Напр.: Клиентские на неделю"
        onSubmit={saveCurrentView}
      />
      <PromptDialog
        open={addingColumn}
        onOpenChange={setAddingColumn}
        title="Название колонки"
        placeholder="Напр.: На проверке"
        onSubmit={addColumn}
      />

      {/* Right-click context menu */}
      {menu && (
        <div
          className="fixed z-[100] w-56 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.max(8, Math.min(menu.y, window.innerHeight - 380)) }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: "Редактировать", fn: () => openTask(menu.task) },
            { label: menu.task.done ? "Вернуть в работу" : "Завершить", fn: () => handleToggleTask(menu.task) },
            { label: "Срок: сегодня", fn: () => reschedule(menu.task.id, 0) },
            { label: "Срок: завтра", fn: () => reschedule(menu.task.id, 1) },
            { label: "Срок: через неделю", fn: () => reschedule(menu.task.id, 7) },
            // Only offered when there's actually a due date to clear — matches the list-row/kanban
            // menus' conditional rendering, which this copy previously drifted from (AUDIT.md finding).
            ...(menu.task.dueDate ? [{ label: "Убрать срок", fn: () => reschedule(menu.task.id, null) }] : []),
            { label: "Сменить приоритет", fn: () => updateTask(menu.task.id, { priority: (((menu.task.priority + 1) % 4) as Task["priority"]) }) },
            { label: "Переименовать", fn: () => startRename(menu.task) },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => { a.fn(); setMenu(null); }}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent"
            >
              {a.label}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          {/* Tagging without opening the card — toggle right here, menu stays open for multiple tags. */}
          <p className="px-2 py-1 text-xs text-muted-foreground">Теги</p>
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {FIXED_TAGS.map((tag) => {
              const on = menu.task.tags.includes(tag);
              return (
                <FilterChip
                  key={tag}
                  active={on}
                  activeClassName={tagColor(tag)}
                  onClick={() => {
                    const next = on ? menu.task.tags.filter((t) => t !== tag) : [...menu.task.tags, tag];
                    updateTask(menu.task.id, { tags: next });
                    setMenu({ ...menu, task: { ...menu.task, tags: next } });
                  }}
                >
                  #{tag}
                </FilterChip>
              );
            })}
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => { handleArchive(menu.task); setMenu(null); }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent"
          >
            <Archive className="h-4 w-4" /> В архив
          </button>
          <button
            onClick={() => { handleDelete(menu.task); setMenu(null); }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-risk outline-none transition-colors hover:bg-accent"
          >
            <Trash2 className="h-4 w-4" /> Удалить
          </button>
        </div>
      )}

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-3 py-2 shadow-lg"
          >
            <span className="px-2 text-sm text-muted-foreground">Выбрано {selected.size}</span>
            <Button variant="ghost" size="sm" className="h-8" onClick={bulkComplete}>
              Завершить
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={bulkToday}>
              На сегодня
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={bulkArchive}>
              <Archive className="h-4 w-4" /> В архив
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-risk hover:text-risk" onClick={bulkDelete}>
              <Trash2 className="h-4 w-4" /> Удалить
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Снять выделение" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
