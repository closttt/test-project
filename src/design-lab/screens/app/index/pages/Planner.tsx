/**
 * «Индекс» · Планер — the week as an hour ruler: seven day columns on hairlines, blocks as quiet
 * grey slabs (routines), white-edged slabs (tasks), dashed drafts (the kanban mirror) and hatched
 * meetings. Routines and open tasks wait in the right column and are dragged onto a day; blocks
 * move and stretch with the same pointer gestures as production. The one lime element is «сейчас»:
 * today's column marker and the now-line.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { PRIORITY_RANK, sortByPriority } from "@/lib/taskOrder";
import { weekDays, weekRangeLabel, weekColumnOf } from "@/lib/weekBoard";
import { localDayStr } from "@/lib/format";
import {
  DAY_MIN,
  SLOT_MIN,
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
import type { PlanBlock, PlanColor, Task } from "@/types";
import { B, T, tab, pad2, Page, PageHeader, SectionHead, Button, Signal, PRIORITY_BARS, hatch, plural } from "@/design-lab/screens/_kit/index";

import { FieldInput } from "./Clients.parts";
import { Switch, Stepper, BlockCase } from "./Planner.parts";

const HOUR_PX = 52;
const PX_PER_MIN = HOUR_PX / 60;
const OPEN_AT_HOUR = 7;
const DRAG_THRESHOLD = 4;
const MEET_PREFIX = "meet:";
const isMeetingBlock = (b: Pick<PlanBlock, "id">) => b.id.startsWith(MEET_PREFIX);
const KANBAN_MIRROR_KEY = "crm-planner-kanban-v1";

interface Source {
  title: string;
  durationMin: number;
  color: PlanColor;
  taskId?: string;
  templateId?: string;
}
type Drag = { kind: "new"; source: Source } | { kind: "move"; block: PlanBlock; grabMin: number };
interface DragLive {
  x: number;
  y: number;
  target: { date: string; startMin: number } | null;
}

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export default function Planner() {
  const {
    tasks, projects, meetings, planBlocks, planTemplates, planDismissed, settings,
    addPlanBlock, updatePlanBlock, deletePlanBlock, restorePlanBlock, setPlanDismissed,
    addPlanTemplate, deletePlanTemplate, updateTask, toggleTask,
  } = useData();
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => weekDays(weekOffset, settings.weekStartsMonday), [weekOffset, settings.weekStartsMonday]);
  const dates = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const todayStr = localDayStr();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<DragLive | null>(null);
  const [resizing, setResizing] = useState<{ id: string; durationMin: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState("");
  const [tplMin, setTplMin] = useState(60);
  const [nowMin, setNowMin] = useState(minutesNow);
  const [mirrorKanban, setMirrorKanban] = useState(() => {
    try {
      return localStorage.getItem(KANBAN_MIRROR_KEY) !== "off";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KANBAN_MIRROR_KEY, mirrorKanban ? "on" : "off");
    } catch {
      /* private mode */
    }
  }, [mirrorKanban]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = OPEN_AT_HOUR * HOUR_PX - 8;
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNowMin(minutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);
  const storedWeek = useMemo(() => planBlocks.filter((b) => dates.has(b.date)), [planBlocks, dates]);

  const meetingBlocks = useMemo<PlanBlock[]>(
    () =>
      meetings
        .filter((m) => dates.has(m.date) && /^\d{1,2}:\d{2}$/.test(m.time ?? ""))
        .map((m) => {
          const [h, mi] = m.time.split(":").map(Number);
          const startMin = Math.min(DAY_MIN - 15, h * 60 + mi);
          return {
            id: `${MEET_PREFIX}${m.id}`,
            date: m.date,
            startMin,
            durationMin: Math.max(15, Math.min(m.durationMin || 30, DAY_MIN - startMin)),
            title: m.title,
            color: "slate" as PlanColor,
            done: m.done,
          };
        }),
    [meetings, dates]
  );
  const meetingUrl = useMemo(() => new Map<string, string | undefined>(meetings.map((m) => [`${MEET_PREFIX}${m.id}`, m.url])), [meetings]);

  /** The kanban mirrored as dashed drafts, stacked from 09:00 around what is planned. */
  const autoBlocks = useMemo(() => {
    if (!mirrorKanban) return [];
    const placed = new Set(planBlocks.map((b) => b.taskId).filter(Boolean));
    const hidden = new Set(planDismissed);
    const open = tasks.filter((t) => !t.done && !placed.has(t.id) && !(t.snoozedUntil && t.snoozedUntil > todayStr));
    return days.flatMap((d) => {
      const dayTasks = sortByPriority(open.filter((t) => weekColumnOf(t, days) === d.date && !hidden.has(`${t.id}@${d.date}`)));
      return autoPlaceDay(
        d.date,
        dayTasks.map((t) => ({ taskId: t.id, title: t.title, durationMin: durationForTask(t.estimateMin), priority: t.priority })),
        [...storedWeek, ...meetingBlocks].filter((b) => b.date === d.date)
      );
    });
  }, [mirrorKanban, planBlocks, planDismissed, tasks, days, storedWeek, meetingBlocks, todayStr]);

  const weekBlocks = useMemo(() => [...meetingBlocks, ...storedWeek, ...autoBlocks], [meetingBlocks, storedWeek, autoBlocks]);
  const plannedTaskIds = useMemo(() => new Set(weekBlocks.map((b) => b.taskId).filter(Boolean)), [weekBlocks]);
  const blockTitle = (b: PlanBlock) => (b.taskId && taskById.get(b.taskId)?.title) || b.title;
  const blockDone = (b: PlanBlock) => (b.taskId ? taskById.get(b.taskId)?.done ?? !!b.done : !!b.done);

  const openTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    return tasks
      .filter((t) => !t.done && (!q || t.title.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.order - b.order
      );
  }, [tasks, taskQuery]);

  function openMeeting(block: PlanBlock) {
    const url = meetingUrl.get(block.id);
    if (url) window.open(url, "_blank", "noopener");
    else toast(`${block.title} · ${formatRange(block.startMin, block.durationMin)} — встреча, время меняется в календаре`);
  }

  // ── Drag: one pointer pipeline for «new from the column» and «move an existing block» ─────

  function hitTest(x: number, y: number, d: Drag): DragLive["target"] {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-plan-day]");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const duration = d.kind === "new" ? d.source.durationMin : d.block.durationMin;
    const grab = d.kind === "move" ? d.grabMin : 0;
    return { date: el.dataset.planDay!, startMin: startFromOffset((y - rect.top) / PX_PER_MIN - grab, duration) };
  }

  function autoScroll(x: number, y: number) {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right) return;
    if (y < r.top + 72) el.scrollTop -= 12;
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
      addPlanBlock({
        date: target.date,
        startMin: target.startMin,
        durationMin: source.durationMin,
        title: source.title,
        color: source.color,
        taskId: source.taskId,
        templateId: source.templateId,
      });
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

  function materialize(block: PlanBlock, patch: Partial<PlanBlock> = {}): string {
    const { id: _draftId, ...rest } = block;
    return addPlanBlock({ ...rest, ...patch });
  }

  function removeBlock(block: PlanBlock) {
    deletePlanBlock(block.id);
    setEditingId(null);
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
    addPlanTemplate({ title, durationMin: tplMin, color: "slate" });
    setTplTitle("");
    setTplOpen(false);
  }

  const editing = editingId ? planBlocks.find((b) => b.id === editingId) ?? null : null;
  const editingTask = editing?.taskId ? taskById.get(editing.taskId) : undefined;
  const today = days.find((d) => d.isToday)?.date;
  const weekTotal = totalMinutes(weekBlocks);
  const ghostMin = drag?.kind === "new" ? drag.source.durationMin : drag?.kind === "move" ? drag.block.durationMin : 0;

  return (
    <Page>
      <PageHeader
        title="Планер"
        deck={
          <>
            Неделя {weekRangeLabel(days)}: в сетке {formatDuration(weekTotal)}
            {mirrorKanban && autoBlocks.length ? <>, из них {autoBlocks.length} {plural(autoBlocks.length, "задача", "задачи", "задач")} с канбана — пунктиром</> : null}.
            Перетащите ритуал или задачу на день и растяните до нужной длины.
          </>
        }
        graphic="ridge"
        seed={5}
        size={80}
        actions={
          <>
            <Button variant="outline" size="md" hook={false} onClick={() => setWeekOffset((n) => n - 1)} title="Предыдущая неделя">
              ←
            </Button>
            {weekOffset !== 0 && (
              <Button variant="outline" size="md" hook={false} onClick={() => setWeekOffset(0)}>
                Эта неделя
              </Button>
            )}
            <Button variant="outline" size="md" hook={false} onClick={() => setWeekOffset((n) => n + 1)} title="Следующая неделя">
              →
            </Button>
          </>
        }
      />

      <div className={`grid gap-10 ${drag ? "cursor-grabbing select-none" : ""}`} style={{ gridTemplateColumns: "minmax(0,1fr) 248px" }}>
        {/* ── 01 The week ─────────────────────────────────────────────────────────── */}
        <section className="min-w-0">
          <SectionHead
            n="01"
            title={weekRangeLabel(days)}
            meta={
              <Switch on={mirrorKanban} onChange={setMirrorKanban} label="Показывать все задачи недели с канбана">
                <span style={T.meta}>
                  Задачи с канбана{mirrorKanban && autoBlocks.length ? <span style={{ ...tab, color: B.text3 }}> · {autoBlocks.length}</span> : null}
                </span>
              </Switch>
            }
          />

          <div
            ref={scrollRef}
            className="mt-6 overflow-auto"
            style={{ height: "calc(100vh - 300px)", minHeight: 520, borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l10}` }}
          >
            <div className="grid" style={{ gridTemplateColumns: "52px repeat(7, minmax(0,1fr))", minWidth: 600 }}>
              {/* Sticky day header */}
              <div className="sticky top-0 z-20" style={{ background: B.bg, borderBottom: `1px solid ${B.l10}` }} />
              {days.map((d) => {
                const isToday = d.date === today;
                const past = d.date < todayStr;
                const total = totalMinutes(weekBlocks.filter((b) => b.date === d.date));
                return (
                  <div
                    key={d.date}
                    className="sticky top-0 z-20 flex h-[72px] flex-col justify-between px-3 pb-2.5 pt-3"
                    style={{ background: B.bg, borderBottom: `1px solid ${B.l10}`, borderLeft: `1px solid ${B.l7}` }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ ...T.displayS, ...tab, color: isToday ? B.text : past ? B.off : B.text2 }}>{pad2(Number(d.date.slice(8)))}</span>
                      <span style={{ ...T.meta, color: isToday ? B.text : B.text3 }}>{dayShort(d.date)}</span>
                    </div>
                    <span className="truncate" style={{ ...T.meta, ...tab, color: isToday ? B.text2 : B.off }}>
                      {isToday ? "сегодня" : ""}
                      {isToday && total ? " · " : ""}
                      {total ? formatDuration(total) : isToday ? "" : "—"}
                    </span>
                    {isToday && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px]" style={{ background: B.lime }} />}
                  </div>
                );
              })}

              {/* Hour ruler */}
              <div className="relative" style={{ height: 24 * HOUR_PX }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="absolute right-3 -translate-y-1/2" style={{ top: h * HOUR_PX, ...T.num, fontSize: 11, color: h % 3 === 0 ? B.text3 : B.off }}>
                    {h === 0 ? "" : formatClock(h * 60)}
                  </span>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d) => {
                const placed = layoutDay(weekBlocks.filter((b) => b.date === d.date));
                const ghost = live?.target?.date === d.date && drag ? live.target : null;
                const isToday = d.date === today;
                return (
                  <div
                    key={d.date}
                    data-plan-day={d.date}
                    className="relative"
                    style={{
                      height: 24 * HOUR_PX,
                      borderLeft: `1px solid ${B.l7}`,
                      backgroundColor: isToday ? "rgba(255,255,255,0.018)" : undefined,
                      backgroundImage: `linear-gradient(to bottom, ${B.l7} 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.028) 1px, transparent 1px)`,
                      backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX / 2}px`,
                    }}
                  >
                    {placed.map(({ block, lane, lanes }) => {
                      const isMoving = drag?.kind === "move" && drag.block.id === block.id;
                      const duration = resizing?.id === block.id ? resizing.durationMin : block.durationMin;
                      const done = blockDone(block);
                      const title = blockTitle(block);
                      const h = duration * PX_PER_MIN;
                      const tall = h >= 44;
                      const draft = isAutoBlock(block);
                      const meeting = isMeetingBlock(block);
                      const task = block.taskId ? taskById.get(block.taskId) : undefined;
                      const look = meeting
                        ? { ...hatch("#161616"), boxShadow: `inset 0 0 0 1px ${B.l10}` }
                        : draft
                          ? { background: B.bg, outline: `1px dashed ${B.l25}`, outlineOffset: -1 }
                          : task
                            ? { background: "rgba(255,255,255,0.09)", boxShadow: `inset 2px 0 0 ${B.text}` }
                            : { background: "rgba(255,255,255,0.06)", boxShadow: `inset 2px 0 0 ${B.text3}` };
                      return (
                        <div
                          key={block.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${meeting ? "Встреча: " : ""}${title}, ${formatRange(block.startMin, duration)}${draft ? ", с канбана" : ""}`}
                          title={
                            draft
                              ? "С канбана — перетащите или растяните, чтобы закрепить"
                              : meeting
                                ? meetingUrl.get(block.id)
                                  ? "Встреча — клик откроет ссылку на созвон"
                                  : "Встреча"
                                : undefined
                          }
                          onPointerDown={
                            meeting
                              ? undefined
                              : (e) => beginDrag(e, { kind: "move", block, grabMin: (e.clientY - e.currentTarget.getBoundingClientRect().top) / PX_PER_MIN })
                          }
                          onClick={meeting ? () => openMeeting(block) : undefined}
                          onKeyDown={(e) => {
                            if (meeting) {
                              if (e.key === "Enter") openMeeting(block);
                              return;
                            }
                            if (e.key === "Enter") setEditingId(isAutoBlock(block) ? materialize(block) : block.id);
                            if (e.key === "Delete" && !draft) removeBlock(block);
                          }}
                          className={`group absolute touch-none overflow-hidden px-2 py-1 outline-none transition-opacity duration-200 focus-visible:ring-1 focus-visible:ring-[#ADFB0C] ${
                            meeting ? "cursor-pointer" : "cursor-grab"
                          } hover:brightness-125`}
                          style={{
                            top: block.startMin * PX_PER_MIN + 1,
                            height: Math.max(duration, 20) * PX_PER_MIN - 2,
                            left: `calc(${(lane / lanes) * 100}% + 3px)`,
                            width: `calc(${100 / lanes}% - 6px)`,
                            opacity: isMoving ? 0.3 : done ? 0.45 : 1,
                            ...look,
                          }}
                        >
                          <p
                            className="truncate"
                            style={{
                              ...T.meta,
                              fontWeight: 500,
                              color: draft || meeting ? B.text2 : B.text,
                              textDecoration: done ? "line-through" : undefined,
                            }}
                          >
                            {title}
                          </p>
                          {tall && (
                            <p className="mt-0.5 flex items-center gap-2 truncate" style={{ ...T.num, fontSize: 11, fontWeight: 400, color: B.text3 }}>
                              {formatRange(block.startMin, duration)}
                              {meeting && <span>· встреча</span>}
                            </p>
                          )}
                          {!meeting && (
                            <div onPointerDown={(e) => beginResize(e, block)} className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize justify-center" aria-hidden>
                              <span className="mt-1 h-px w-6 bg-white/0 transition-colors group-hover:bg-white/50" />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {ghost && (
                      <div
                        className="pointer-events-none absolute inset-x-[3px] z-10 px-2 py-1"
                        style={{ top: ghost.startMin * PX_PER_MIN, height: ghostMin * PX_PER_MIN, outline: `1px dashed ${B.l40}`, outlineOffset: -1, background: "rgba(255,255,255,0.05)", ...T.num, fontSize: 11, color: B.text }}
                      >
                        {formatRange(ghost.startMin, ghostMin)}
                      </div>
                    )}

                    {isToday && (
                      <div className="pointer-events-none absolute inset-x-0 z-[5] flex items-center" style={{ top: nowMin * PX_PER_MIN }}>
                        <span className="h-[5px] w-[5px] -translate-x-[3px]" style={{ background: B.lime }} />
                        <span className="h-px flex-1" style={{ background: B.lime }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ ...T.meta, color: B.text3 }}>
            <Legend look={{ background: "rgba(255,255,255,0.09)", boxShadow: `inset 2px 0 0 ${B.text}` }}>задача</Legend>
            <Legend look={{ background: "rgba(255,255,255,0.06)", boxShadow: `inset 2px 0 0 ${B.text3}` }}>ритуал</Legend>
            <Legend look={{ outline: `1px dashed ${B.l25}`, outlineOffset: -1 }}>с канбана</Legend>
            <Legend look={{ ...hatch("#262626"), boxShadow: `inset 0 0 0 1px ${B.l10}` }}>встреча</Legend>
            <span className="ml-auto" style={tab}>
              Enter — открыть блок · Delete — убрать
            </span>
          </div>
        </section>

        {/* ── Right column: routines + tasks ─────────────────────────────────────── */}
        <aside className="min-w-0 space-y-14">
          <section>
            <SectionHead
              n="02"
              title="Ритуалы"
              size="s"
              meta={
                <button type="button" onClick={() => setTplOpen((v) => !v)} className="hover:text-white" aria-expanded={tplOpen}>
                  {tplOpen ? "закрыть" : "добавить ↳"}
                </button>
              }
            />
            {tplOpen && (
              <div className="mt-5" style={{ borderTop: `1px solid ${B.l10}` }}>
                <div style={{ borderBottom: `1px solid ${B.l7}` }}>
                  <FieldInput autoFocus value={tplTitle} onChange={setTplTitle} placeholder="Тренировка, английский, созвон…" align="left" onEnter={submitTemplate} />
                </div>
                <div className="flex h-12 items-center justify-between" style={{ borderBottom: `1px solid ${B.l7}` }}>
                  <span style={{ ...T.meta, color: B.text3 }}>Длина</span>
                  <Stepper
                    label="Длина ритуала"
                    value={formatDuration(tplMin)}
                    onMinus={() => setTplMin((m) => Math.max(SLOT_MIN, m - SLOT_MIN))}
                    onPlus={() => setTplMin((m) => Math.min(DAY_MIN, m + SLOT_MIN))}
                  />
                </div>
                <div className="mt-3">
                  <Button variant="outline" size="sm" full onClick={submitTemplate} disabled={!tplTitle.trim()}>
                    Закрепить
                  </Button>
                </div>
              </div>
            )}
            {planTemplates.length === 0 && !tplOpen ? (
              <p className="mt-5" style={{ ...T.meta, color: B.text3 }}>
                Добавьте то, что повторяется каждую неделю, — и перетаскивайте на дни.
              </p>
            ) : (
              <ul className="mt-5" style={{ borderTop: `1px solid ${B.l10}` }}>
                {planTemplates.map((t) => (
                  <li
                    key={t.id}
                    onPointerDown={(e) => beginDrag(e, { kind: "new", source: { title: t.title, durationMin: t.durationMin, color: t.color, templateId: t.id } })}
                    className="group flex h-11 cursor-grab touch-none items-center gap-3 transition-colors duration-200 hover:bg-white/[0.03]"
                    style={{ borderBottom: `1px solid ${B.l7}` }}
                  >
                    <span aria-hidden className="h-3 w-[2px] shrink-0" style={{ background: B.text3 }} />
                    <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: B.text }}>
                      {t.title}
                    </span>
                    <span style={{ ...T.meta, ...tab, color: B.text3 }}>{formatDuration(t.durationMin)}</span>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => deletePlanTemplate(t.id)}
                      aria-label={`Открепить: ${t.title}`}
                      title="Открепить"
                      className="w-0 overflow-hidden opacity-0 outline-none transition-opacity duration-200 hover:text-[#FF5A36] focus-visible:w-auto focus-visible:opacity-100 group-hover:w-auto group-hover:opacity-100"
                      style={{ ...T.meta, color: B.text3 }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHead n="03" title="Задачи" size="s" meta={openTasks.length} />
            <div className="mt-5" style={{ borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l7}` }}>
              <FieldInput value={taskQuery} onChange={setTaskQuery} placeholder="Найти задачу…" align="left" />
            </div>
            <ul className="max-h-[440px] overflow-y-auto">
              {openTasks.length === 0 ? (
                <li className="py-5" style={{ ...T.meta, color: B.text3 }}>
                  {taskQuery ? "Ничего не найдено" : "Открытых задач нет"}
                </li>
              ) : (
                openTasks.map((t: Task) => (
                  <li
                    key={t.id}
                    onPointerDown={(e) =>
                      beginDrag(e, { kind: "new", source: { title: t.title, durationMin: durationForTask(t.estimateMin), color: "blue", taskId: t.id } })
                    }
                    className="flex h-11 cursor-grab touch-none items-center gap-3 transition-colors duration-200 hover:bg-white/[0.03]"
                    style={{ borderBottom: `1px solid ${B.l7}` }}
                  >
                    <span className="flex w-[22px] shrink-0">
                      {t.priority ? <Signal value={PRIORITY_BARS[t.priority]} w={4} h={9} on={B.text2} /> : <span style={{ ...T.meta, color: B.off }}>—</span>}
                    </span>
                    <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: plannedTaskIds.has(t.id) ? B.text3 : B.text }}>
                      {t.title}
                    </span>
                    <span className="shrink-0" style={{ ...T.meta, ...tab, color: B.text3 }}>
                      {plannedTaskIds.has(t.id) ? "в плане" : formatDuration(durationForTask(t.estimateMin))}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </aside>
      </div>

      {/* The thing in flight, under the pointer. */}
      {drag && live && (
        <div
          className="pointer-events-none fixed z-50 max-w-56 -translate-x-1/2 -translate-y-full truncate px-2.5 py-1.5"
          style={{ left: live.x, top: live.y - 10, background: B.bg, boxShadow: B.shadowFloat, ...T.meta, color: B.text }}
        >
          {drag.kind === "new" ? drag.source.title : blockTitle(drag.block)}
          {live.target && (
            <span className="ml-2" style={{ ...tab, color: B.text3 }}>
              {dayShort(live.target.date)} {formatClock(live.target.startMin)}
            </span>
          )}
        </div>
      )}

      <BlockCase
        block={editing}
        title={editing ? blockTitle(editing) : ""}
        done={editing ? blockDone(editing) : false}
        task={editingTask}
        project={editingTask?.projectId ? projects.find((p) => p.id === editingTask.projectId) : undefined}
        template={editing?.templateId ? planTemplates.find((t) => t.id === editing.templateId) : undefined}
        onClose={() => setEditingId(null)}
        onRename={(title) => {
          if (!editing) return;
          if (editing.taskId && taskById.has(editing.taskId)) updateTask(editing.taskId, { title });
          else updatePlanBlock(editing.id, { title });
        }}
        onPatch={(patch) => editing && updatePlanBlock(editing.id, patch)}
        onToggleDone={() => editing && toggleBlockDone(editing)}
        onDelete={() => editing && removeBlock(editing)}
      />
    </Page>
  );
}

function Legend({ look, children }: { look: CSSProperties; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-3 w-5" style={look} />
      {children}
    </span>
  );
}
