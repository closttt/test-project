import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Pin, Plus, Minus, Search, Trash2, X, ListTodo, ExternalLink, LayoutGrid } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconAction } from "@/components/ui/icon-action";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskEditDialog } from "@/components/TaskEditDialog";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { PRIORITY_RANK, sortByPriority } from "@/lib/taskOrder";
import { weekDays, weekRangeLabel, weekColumnOf } from "@/lib/weekBoard";
import { localDayStr } from "@/lib/format";
import {
  DAY_MIN,
  SLOT_MIN,
  PLAN_COLORS,
  PLAN_COLOR_ORDER,
  startFromOffset,
  resizeDuration,
  durationForTask,
  formatClock,
  formatRange,
  formatDuration,
  totalMinutes,
  layoutDay,
  dayShort,
  autoPlaceDay,
  isAutoBlock,
} from "@/lib/planner";
import { cn } from "@/lib/utils";
import { PRIORITY_META, type PlanBlock, type PlanColor, type Task } from "@/types";

/** One hour of the grid, in px. Half an hour (the smallest block) is 28px — enough for a title. */
const HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
/** Where the grid opens: the morning, not midnight. */
const OPEN_AT_HOUR = 7;
/** Pointer travel before a press becomes a drag — below it, a press on a block is a click. */
const DRAG_THRESHOLD = 4;
/** «Задачи с канбана» on/off — a view preference of this browser, on by default. */
const KANBAN_MIRROR_KEY = "crm-planner-kanban-v1";

/** What is being carried onto the grid. */
interface Source {
  title: string;
  durationMin: number;
  color: PlanColor;
  taskId?: string;
  templateId?: string;
}

type Drag =
  | { kind: "new"; source: Source }
  /** `grabMin` — how far below the block's top edge it was picked up, so it doesn't jump. */
  | { kind: "move"; block: PlanBlock; grabMin: number };

interface DragLive {
  x: number;
  y: number;
  target: { date: string; startMin: number } | null;
}

/**
 * «Планер» — the week as a time grid. Pinned routines and open tasks sit in the right-hand panel;
 * dragging one onto a day drops a block at that time, dragging a block moves it, pulling its bottom
 * edge stretches it in half-hour steps. Pointer events rather than HTML5 drag-and-drop, so the
 * same gestures work with a mouse, a pen and a finger, and the drop slot follows the pointer live.
 */
export default function Planner() {
  const {
    tasks, planBlocks, planTemplates, planDismissed, settings,
    addPlanBlock, updatePlanBlock, deletePlanBlock, restorePlanBlock, setPlanDismissed,
    addPlanTemplate, deletePlanTemplate, updateTask, toggleTask,
  } = useData();
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => weekDays(weekOffset, settings.weekStartsMonday), [weekOffset, settings.weekStartsMonday]);
  const dates = useMemo(() => new Set(days.map((d) => d.date)), [days]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<DragLive | null>(null);
  const [resizing, setResizing] = useState<{ id: string; durationMin: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState("");
  const [tplMin, setTplMin] = useState(60);
  const [tplColor, setTplColor] = useState<PlanColor>("blue");
  const [nowMin, setNowMin] = useState(() => minutesNow());
  const [mirrorKanban, setMirrorKanban] = useState(() => {
    try { return localStorage.getItem(KANBAN_MIRROR_KEY) !== "off"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(KANBAN_MIRROR_KEY, mirrorKanban ? "on" : "off"); } catch { /* private mode */ }
  }, [mirrorKanban]);

  // Open on the morning; the night hours are a scroll away, not the first thing you see.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = OPEN_AT_HOUR * HOUR_PX - 12;
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNowMin(minutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);
  const storedWeek = useMemo(() => planBlocks.filter((b) => dates.has(b.date)), [planBlocks, dates]);

  /**
   * The kanban, mirrored: every open task of the week board shows on its day as a draft block
   * (dashed, coloured by priority), stacked from 09:00 around what is already planned. Moving,
   * stretching or opening one turns it into a real block; until then it simply follows the task —
   * move the card to another day on the kanban and the draft moves with it.
   */
  const autoBlocks = useMemo(() => {
    if (!mirrorKanban) return [];
    const placed = new Set(planBlocks.map((b) => b.taskId).filter(Boolean));
    const hidden = new Set(planDismissed);
    const today = localDayStr();
    const open = tasks.filter((t) => !t.done && !placed.has(t.id) && !(t.snoozedUntil && t.snoozedUntil > today));
    return days.flatMap((d) => {
      const dayTasks = sortByPriority(open.filter((t) => weekColumnOf(t, days) === d.date && !hidden.has(`${t.id}@${d.date}`)));
      return autoPlaceDay(
        d.date,
        dayTasks.map((t) => ({ taskId: t.id, title: t.title, durationMin: durationForTask(t.estimateMin), priority: t.priority })),
        storedWeek.filter((b) => b.date === d.date)
      );
    });
  }, [mirrorKanban, planBlocks, planDismissed, tasks, days, storedWeek]);

  const weekBlocks = useMemo(() => [...storedWeek, ...autoBlocks], [storedWeek, autoBlocks]);
  const plannedTaskIds = useMemo(() => new Set(weekBlocks.map((b) => b.taskId).filter(Boolean)), [weekBlocks]);
  const blockTitle = (b: PlanBlock) => (b.taskId && taskById.get(b.taskId)?.title) || b.title;
  const blockDone = (b: PlanBlock) => (b.taskId ? taskById.get(b.taskId)?.done ?? !!b.done : !!b.done);

  const openTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    return tasks
      .filter((t) => !t.done && (!q || t.title.toLowerCase().includes(q)))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.order - b.order);
  }, [tasks, taskQuery]);

  // ── Drag: one pointer pipeline for «new from the panel» and «move an existing block» ──────

  /** Day column + snapped start under the pointer, or null when it's off the grid. */
  function hitTest(x: number, y: number, d: Drag): DragLive["target"] {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-plan-day]");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const duration = d.kind === "new" ? d.source.durationMin : d.block.durationMin;
    const grab = d.kind === "move" ? d.grabMin : 0;
    return { date: el.dataset.planDay!, startMin: startFromOffset((y - rect.top) / PX_PER_MIN - grab, duration) };
  }

  /** Nudges the grid while a drag hovers near its top or bottom edge. */
  function autoScroll(x: number, y: number) {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Only while the pointer is over the grid — not when it passes the panel at the same height.
    if (x < r.left || x > r.right) return;
    if (y < r.top + 48) el.scrollTop -= 12;
    else if (y > r.bottom - 48) el.scrollTop += 12;
  }

  function beginDrag(e: ReactPointerEvent, d: Drag) {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    let last: DragLive | null = null;

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return;
        started = true;
        setDrag(d);
      }
      autoScroll(ev.clientX, ev.clientY);
      last = { x: ev.clientX, y: ev.clientY, target: hitTest(ev.clientX, ev.clientY, d) };
      setLive(last);
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
      setLive(null);
      if (!started) {
        // A press without travel is a click: a block opens its card.
        if (d.kind === "move" && ev.type === "pointerup") setEditingId(isAutoBlock(d.block) ? materialize(d.block) : d.block.id);
        return;
      }
      if (ev.type === "pointerup" && last?.target) drop(d, last.target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function drop(d: Drag, target: { date: string; startMin: number }) {
    if (d.kind === "new") {
      const { source } = d;
      addPlanBlock({ date: target.date, startMin: target.startMin, durationMin: source.durationMin, title: source.title, color: source.color, taskId: source.taskId, templateId: source.templateId });
      // A task placed on a day is due that day — the rest of the app (Сегодня, канбан) follows.
      if (source.taskId && taskById.get(source.taskId)?.dueDate !== target.date) updateTask(source.taskId, { dueDate: target.date });
      toast(`${source.title} · ${dayShort(target.date)} ${formatRange(target.startMin, source.durationMin)}`);
      return;
    }
    const { block } = d;
    if (block.date === target.date && block.startMin === target.startMin) return;
    if (isAutoBlock(block)) materialize(block, { date: target.date, startMin: target.startMin });
    else updatePlanBlock(block.id, { date: target.date, startMin: target.startMin });
    if (block.taskId && taskById.has(block.taskId) && block.date !== target.date) updateTask(block.taskId, { dueDate: target.date });
  }

  /** Bottom-edge handle: stretch or shrink in half-hour steps, saved on release. */
  function beginResize(e: ReactPointerEvent, block: PlanBlock) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sy = e.clientY;
    let current = block.durationMin;
    setResizing({ id: block.id, durationMin: current });
    const move = (ev: PointerEvent) => {
      current = resizeDuration(block.startMin, block.durationMin, (ev.clientY - sy) / PX_PER_MIN);
      setResizing({ id: block.id, durationMin: current });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setResizing(null);
      if (current === block.durationMin) return;
      if (isAutoBlock(block)) materialize(block, { durationMin: current });
      else updatePlanBlock(block.id, { durationMin: current });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  /** Turns a kanban draft into a stored block (with the change that triggered it). Returns its id. */
  function materialize(block: PlanBlock, patch: Partial<PlanBlock> = {}): string {
    const { id: _draftId, ...rest } = block;
    return addPlanBlock({ ...rest, ...patch });
  }

  function removeBlock(block: PlanBlock) {
    deletePlanBlock(block.id);
    setEditingId(null);
    // A task taken off the grid stays off that day — otherwise its kanban draft would pop right back.
    const key = block.taskId ? `${block.taskId}@${block.date}` : null;
    if (key) setPlanDismissed(key, true);
    const run = pushUndo(`Убрано из планера: ${blockTitle(block)}`, () => {
      restorePlanBlock(block);
      if (key) setPlanDismissed(key, false);
    });
    toast(`Убрано: ${blockTitle(block)}`, { actionLabel: "Вернуть", onAction: run });
  }

  function toggleBlockDone(block: PlanBlock) {
    if (block.taskId && taskById.has(block.taskId)) toggleTask(block.taskId);
    else updatePlanBlock(block.id, { done: !block.done });
  }

  function submitTemplate() {
    const title = tplTitle.trim();
    if (!title) return;
    addPlanTemplate({ title, durationMin: tplMin, color: tplColor });
    setTplTitle("");
    setTplOpen(false);
  }

  const editing = editingId ? planBlocks.find((b) => b.id === editingId) ?? null : null;
  const today = days.find((d) => d.isToday)?.date;
  const dragging = drag !== null;

  // ── Render ──────────────────────────────────────────────────────────────────────────────

  return (
    <AppShell title="Планер" description="Неделя по часам: перетащите задачу или ритуал на день и растяните на нужное время">
      <div className={cn("flex flex-col gap-4 lg:flex-row", dragging && "cursor-grabbing select-none")}>
        {/* Week grid */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <IconAction icon={ChevronLeft} label="Предыдущая неделя" onClick={() => setWeekOffset((n) => n - 1)} className="p-1" iconClassName="h-4 w-4" />
            <span className="min-w-28 text-center text-sm font-medium tabular-nums">{weekRangeLabel(days)}</span>
            <IconAction icon={ChevronRight} label="Следующая неделя" onClick={() => setWeekOffset((n) => n + 1)} className="p-1" iconClassName="h-4 w-4" />
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setWeekOffset(0)}>Эта неделя</Button>
            )}
            <Button
              variant={mirrorKanban ? "secondary" : "ghost"}
              size="sm"
              className="ml-2 h-7 gap-1.5 text-xs"
              aria-pressed={mirrorKanban}
              title="Показывать все задачи недели с канбана — потом расставьте их сами"
              onClick={() => setMirrorKanban((v) => !v)}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Задачи с канбана
              {mirrorKanban && autoBlocks.length > 0 && <span className="tabular-nums text-muted-foreground">{autoBlocks.length}</span>}
            </Button>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              за неделю: {formatDuration(totalMinutes(weekBlocks)) }
            </span>
          </div>

          <div ref={scrollRef} className="h-[calc(100vh-12rem)] min-h-[24rem] overflow-auto rounded-xl border border-border bg-card/30">
            <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: "3.25rem repeat(7, minmax(0, 1fr))" }}>
              {/* Sticky day header row */}
              <div className="sticky top-0 z-20 border-b border-border bg-background" />
              {days.map((d) => {
                const total = totalMinutes(weekBlocks.filter((b) => b.date === d.date));
                return (
                  <div key={d.date} className={cn("sticky top-0 z-20 flex flex-col items-center border-b border-l border-border bg-background px-1 py-1.5", d.isToday && "text-brand")}>
                    <span className="text-xs font-semibold">{dayShort(d.date)} <span className="font-normal text-muted-foreground">{d.short}</span></span>
                    <span className="h-4 text-[0.65rem] tabular-nums text-muted-foreground">{total > 0 ? formatDuration(total) : ""}</span>
                  </div>
                );
              })}

              {/* Time scale */}
              <div className="relative" style={{ height: 24 * HOUR_PX }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[0.65rem] tabular-nums text-muted-foreground" style={{ top: h * HOUR_PX }}>
                    {h === 0 ? "" : formatClock(h * 60)}
                  </span>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d) => {
                const placed = layoutDay(weekBlocks.filter((b) => b.date === d.date));
                const ghost = live?.target?.date === d.date && drag ? live.target : null;
                const ghostMin = drag?.kind === "new" ? drag.source.durationMin : drag?.kind === "move" ? drag.block.durationMin : 0;
                return (
                  <div
                    key={d.date}
                    data-plan-day={d.date}
                    className={cn("relative border-l border-border", d.isToday && "bg-brand/[0.03]")}
                    style={{
                      height: 24 * HOUR_PX,
                      // Hour lines solid, half-hour lines faint — drawn, not 48 DOM rows per day.
                      backgroundImage: `linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.4) 1px, transparent 1px)`,
                      backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX / 2}px`,
                    }}
                  >
                    {placed.map(({ block, lane, lanes }) => {
                      const isMoving = drag?.kind === "move" && drag.block.id === block.id;
                      const duration = resizing?.id === block.id ? resizing.durationMin : block.durationMin;
                      const done = blockDone(block);
                      const title = blockTitle(block);
                      const tall = duration * PX_PER_MIN >= 44;
                      const draft = isAutoBlock(block);
                      return (
                        <div
                          key={block.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${title}, ${formatRange(block.startMin, duration)}${draft ? ", с канбана" : ""}`}
                          title={draft ? "С канбана — перетащите или растяните, чтобы закрепить" : undefined}
                          onPointerDown={(e) => beginDrag(e, { kind: "move", block, grabMin: (e.clientY - e.currentTarget.getBoundingClientRect().top) / PX_PER_MIN })}
                          onKeyDown={(e) => { if (e.key === "Enter") setEditingId(block.id); if (e.key === "Delete") removeBlock(block); }}
                          className={cn(
                            "group absolute touch-none overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-xs shadow-sm transition-opacity",
                            "cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            PLAN_COLORS[block.color].block,
                            done && "opacity-50",
                            // A kanban draft: dashed outline until it is moved, stretched or opened.
                            draft && "outline-dashed outline-1 -outline-offset-1 outline-foreground/30",
                            isMoving && "opacity-30"
                          )}
                          style={{
                            top: block.startMin * PX_PER_MIN + 1,
                            height: duration * PX_PER_MIN - 2,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                          }}
                        >
                          <p className={cn("truncate font-medium leading-tight", done && "line-through")}>{title}</p>
                          {tall && (
                            <p className="truncate text-[0.65rem] tabular-nums text-muted-foreground">
                              {formatRange(block.startMin, duration)} · {formatDuration(duration)}
                            </p>
                          )}
                          {/* Stretch handle — the whole bottom edge. */}
                          <div
                            onPointerDown={(e) => beginResize(e, block)}
                            className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize justify-center"
                            aria-hidden
                          >
                            <span className="mt-0.5 h-0.5 w-6 rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/40" />
                          </div>
                        </div>
                      );
                    })}

                    {ghost && (
                      <div
                        className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md border-2 border-dashed border-brand bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums text-brand"
                        style={{ top: ghost.startMin * PX_PER_MIN, height: ghostMin * PX_PER_MIN }}
                      >
                        {formatRange(ghost.startMin, ghostMin)}
                      </div>
                    )}

                    {d.date === today && (
                      <div className="pointer-events-none absolute inset-x-0 z-[5] flex items-center" style={{ top: nowMin * PX_PER_MIN }}>
                        <span className="-ml-1 h-2 w-2 rounded-full bg-risk" />
                        <span className="h-px flex-1 bg-risk" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side panel: pinned routines on top, open tasks below */}
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
          <section className="flex flex-col gap-2 rounded-xl border border-border bg-card/30 p-3">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-semibold">Закреплённые</h2>
              <span className="text-xs text-muted-foreground">повторяющиеся</span>
              <IconAction icon={tplOpen ? X : Plus} label={tplOpen ? "Закрыть" : "Добавить ритуал"} onClick={() => setTplOpen((v) => !v)} className="ml-auto p-1" iconClassName="h-4 w-4" />
            </div>

            {tplOpen && (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
                <Input autoFocus value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitTemplate()} placeholder="Тренировка, английский, созвон…" className="h-8 text-sm" />
                <div className="flex items-center gap-1.5">
                  <IconAction icon={Minus} label="Короче" onClick={() => setTplMin((m) => Math.max(SLOT_MIN, m - SLOT_MIN))} className="rounded border border-border p-1" iconClassName="h-3.5 w-3.5" />
                  <span className="min-w-14 text-center text-sm tabular-nums">{formatDuration(tplMin)}</span>
                  <IconAction icon={Plus} label="Длиннее" onClick={() => setTplMin((m) => Math.min(DAY_MIN, m + SLOT_MIN))} className="rounded border border-border p-1" iconClassName="h-3.5 w-3.5" />
                  <div className="ml-auto flex gap-1">
                    {PLAN_COLOR_ORDER.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={PLAN_COLORS[c].label}
                        title={PLAN_COLORS[c].label}
                        onClick={() => setTplColor(c)}
                        className={cn("h-4 w-4 rounded-full", PLAN_COLORS[c].dot, tplColor === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : "opacity-60")}
                      />
                    ))}
                  </div>
                </div>
                <Button size="sm" className="h-8" onClick={submitTemplate} disabled={!tplTitle.trim()}>Закрепить</Button>
              </div>
            )}

            {planTemplates.length === 0 && !tplOpen ? (
              <p className="text-xs text-muted-foreground">Добавьте то, что повторяется каждую неделю, — и перетаскивайте на дни.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {planTemplates.map((t) => (
                  <div
                    key={t.id}
                    onPointerDown={(e) => beginDrag(e, { kind: "new", source: { title: t.title, durationMin: t.durationMin, color: t.color, templateId: t.id } })}
                    className={cn("group flex cursor-grab touch-none items-center gap-2 rounded-md border-l-[3px] px-2 py-1.5 text-sm", PLAN_COLORS[t.color].block)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(t.durationMin)}</span>
                    <IconAction icon={Trash2} label={`Открепить: ${t.title}`} tone="danger" onClick={() => deletePlanTemplate(t.id)} reveal className="p-0.5" iconClassName="h-3.5 w-3.5" />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-border bg-card/30 p-3 lg:max-h-[calc(100vh-24rem)]">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-semibold">Задачи</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{openTasks.length}</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)} placeholder="Найти задачу…" className="h-8 pl-8 text-sm" />
            </div>
            <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
              {openTasks.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">{taskQuery ? "Ничего не найдено" : "Открытых задач нет"}</p>
              ) : (
                openTasks.map((t) => (
                  <div
                    key={t.id}
                    onPointerDown={(e) => beginDrag(e, { kind: "new", source: { title: t.title, durationMin: durationForTask(t.estimateMin), color: "blue", taskId: t.id } })}
                    className="flex cursor-grab touch-none items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm transition-colors hover:border-brand/50"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY_META[t.priority].dot }} title={PRIORITY_META[t.priority].label} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {plannedTaskIds.has(t.id) && <span className="shrink-0 rounded-full bg-brand/15 px-1.5 text-[0.6rem] font-medium text-brand">в плане</span>}
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(durationForTask(t.estimateMin))}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* The thing in flight, under the pointer (the slot itself is previewed in the column). */}
      {drag && live && (
        <div className="pointer-events-none fixed z-50 max-w-56 -translate-x-1/2 -translate-y-full truncate rounded-md border border-brand/50 bg-background px-2 py-1 text-xs font-medium shadow-lg" style={{ left: live.x, top: live.y - 8 }}>
          {drag.kind === "new" ? drag.source.title : blockTitle(drag.block)}
          {live.target && <span className="ml-1.5 text-muted-foreground tabular-nums">{dayShort(live.target.date)} {formatClock(live.target.startMin)}</span>}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent className="max-w-sm">
          {editing && (
            <BlockEditor
              block={editing}
              title={blockTitle(editing)}
              done={blockDone(editing)}
              task={editing.taskId ? taskById.get(editing.taskId) : undefined}
              onRename={(title) => (editing.taskId && taskById.has(editing.taskId) ? updateTask(editing.taskId, { title }) : updatePlanBlock(editing.id, { title }))}
              onPatch={(patch) => updatePlanBlock(editing.id, patch)}
              onToggleDone={() => toggleBlockDone(editing)}
              onDelete={() => removeBlock(editing)}
              onOpenTask={(t) => { setEditingId(null); setOpenTask(t); }}
            />
          )}
        </DialogContent>
      </Dialog>
      <TaskEditDialog task={openTask} open={!!openTask} onOpenChange={(v) => !v && setOpenTask(null)} />
    </AppShell>
  );
}

function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** The block's card: name, time, length, colour, done, remove. Every change saves immediately. */
function BlockEditor({
  block, title, done, task, onRename, onPatch, onToggleDone, onDelete, onOpenTask,
}: {
  block: PlanBlock;
  title: string;
  done: boolean;
  task?: Task;
  onRename: (title: string) => void;
  onPatch: (patch: Partial<PlanBlock>) => void;
  onToggleDone: () => void;
  onDelete: () => void;
  onOpenTask: (t: Task) => void;
}) {
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);
  const commit = () => { const t = draft.trim(); if (t && t !== title) onRename(t); };
  const setDuration = (min: number) => onPatch({ durationMin: Math.max(SLOT_MIN, Math.min(DAY_MIN - block.startMin, min)) });
  const setStart = (min: number) => onPatch({ startMin: startFromOffset(min, block.durationMin) });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="sr-only">Блок планера</DialogTitle>
        <div className="flex items-center gap-2 pr-6">
          <AnimatedCheckbox checked={done} onChange={onToggleDone} label={title} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
          />
        </div>
      </DialogHeader>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{dayShort(block.date)}, {block.date.split("-").reverse().slice(0, 2).join(".")}</p>
        <Stepper label="Начало" value={formatClock(block.startMin)} onMinus={() => setStart(block.startMin - SLOT_MIN)} onPlus={() => setStart(block.startMin + SLOT_MIN)} />
        <Stepper label="Длительность" value={`${formatDuration(block.durationMin)} · до ${formatRange(block.startMin, block.durationMin).split("–")[1]}`} onMinus={() => setDuration(block.durationMin - SLOT_MIN)} onPlus={() => setDuration(block.durationMin + SLOT_MIN)} />
        <div className="flex items-center gap-2">
          <span className="w-28 text-muted-foreground">Цвет</span>
          <div className="flex gap-1.5">
            {PLAN_COLOR_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={PLAN_COLORS[c].label}
                title={PLAN_COLORS[c].label}
                onClick={() => onPatch({ color: c })}
                className={cn("h-5 w-5 rounded-full", PLAN_COLORS[c].dot, block.color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-60 hover:opacity-100")}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-3">
          {task && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenTask(task)}>
              <ExternalLink className="h-3.5 w-3.5" /> Открыть задачу
            </Button>
          )}
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-risk hover:text-risk" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Убрать
          </Button>
        </div>
      </div>
    </>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-muted-foreground">{label}</span>
      <IconAction icon={Minus} label={`${label}: меньше`} onClick={onMinus} className="rounded border border-border p-1" iconClassName="h-3.5 w-3.5" />
      <span className="min-w-24 text-center tabular-nums">{value}</span>
      <IconAction icon={Plus} label={`${label}: больше`} onClick={onPlus} className="rounded border border-border p-1" iconClassName="h-3.5 w-3.5" />
    </div>
  );
}
