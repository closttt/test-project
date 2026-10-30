/**
 * Задачи · Craft Dark · v1 «По срокам» — the week board (owner, 2026-10-31: «Список» and «Канбан»
 * removed). The app's 7-day system: one column per day, ‹ › between weeks, overdue collected in
 * today's column, drag a card onto a day, add straight into a day. Under the days, «Бэклог» —
 * tasks without a date, grouped by priority or project; dropping a card there clears its date.
 * Every card opens the task editor on click; the date chip on a card picks a date in place.
 *
 *   ┌ title ─────────────────────────────────────────────────────────────────┐
 *   │ Задачи                                                    [Все проекты ▾]│
 *   │ ┌ Неделя  ‹ 5–11 окт. ›                              n задач на неделе ┐ │
 *   │ │ Пн │ Вт │ Ср │ Чт │ Пт │ Сб │ Вс(today)   — cards, «+ Задача»          │ │
 *   │ │ ▾ Бэклог n   ● Высокий 4 ● Средний 9 …   [По приоритету | По проекту]  │ │
 *   │ │   ● Высокий 4 — cards … «Ещё N», «+ Задача · Высокий»                  │ │
 *   │ └───────────────────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleCheckBig, FolderKanban, Plus, Trash2, Video } from "lucide-react";

import { Btn, C, Empty, IconBtn, R, Ring, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { Select, TagChips, metaChip } from "@/design-lab/screens/_kit/controls";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { addDays, formatDate, localDayStr, todayStr } from "@/lib/format";
import { groupByTime } from "@/lib/taskGrouping";
import { BACKLOG_KEY, weekColumnOf, weekDays, weekRangeLabel } from "@/lib/weekBoard";
import { meetingStart } from "@/lib/meetingAlerts";
import { useData } from "@/store/DataProvider";
import type { Meeting, Priority, Task } from "@/types";
import {
  DatePop,
  LISTS,
  ListTabs,
  MeetingEditor,
  NewMeetingBtn,
  NewTaskBtn,
  PRIO_DOT,
  PRIO_LABEL,
  PRIO_RANK,
  PrioChip,
  ProjectChip,
  QuickAdd,
  RoundCheckBtn,
  SubCount,
  TaskEditor,
  TaskLine,
  TimeMeta,
  dueText,
  tint,
  useTasksModel,
  type SmartList,
  type TaskDraft,
  type TasksModel,
} from "./_parts";

const GROUP_CAP = 8;
const BACKLOG_CAP = 8;
const KANBAN_CAP = 8;
const DOT: Record<string, string> = { overdue: C.amber, today: C.accent, tomorrow: C.accent };
const DROP_BG = "rgba(10,132,255,0.16)";
const COL_BG = "rgba(0,0,0,0.22)";

interface Group {
  key: string;
  label: string;
  items: Task[];
}

const DRAG = "text/plain";
const byPrio = (a: Task, b: Task) =>
  Number(a.done) - Number(b.done) || PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿");

/** Drop-target props for a column: highlight while a card hovers, hand the task id to `onDrop`. */
function useDrop(onDrop: (id: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DRAG);
        if (id) onDrop(id);
      },
    },
  };
}

// ── Card — week days, backlog, kanban ─────────────────────────────────────────────────────────

/**
 * The task card — the old production card's structure (check + title up to three lines; a wrapping
 * meta line under the title: priority, project, tags, subtasks, time … due date on the right) in
 * Craft Dark: raised fill, radius 12, 12 padding, tinted chips (priority in its hue, project muted
 * with the folder glyph, tags violet). Click opens the editor; hover shows the trash; the date chip picks a date in place; the
 * card drags onto another column. `showDate` prints the due date (kanban); in a day column the
 * column already says it, so only an overdue date shows. `compact` = the done list under a day.
 */
function TaskCard({ t, m, onOpen, mark, showDate, compact }: { t: Task; m: TasksModel; onOpen: () => void; mark?: boolean; showDate?: boolean; compact?: boolean }) {
  const { text, late } = dueText(t);
  const pname = t.projectId ? m.projectName.get(t.projectId) : undefined;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const closePop = useCallback(() => setAnchor(null), []);
  const chipText = !t.done && (late || (showDate && t.dueDate)) ? text : "";
  return (
    <article
      data-lab-block={mark ? "card" : undefined}
      role="button"
      tabIndex={0}
      draggable={!compact}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()}
      className="group relative flex cursor-pointer flex-col gap-2 outline-none transition-colors duration-150 hover:bg-[#202025] focus-visible:bg-[#202025] active:cursor-grabbing"
      style={{
        padding: compact ? "8px 10px" : 12,
        background: compact ? "transparent" : C.raise,
        borderRadius: R.small,
        opacity: compact ? 0.7 : 1,
      }}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="pt-px">
          <RoundCheckBtn size={compact ? 16 : 18} done={t.done} onChange={() => m.actions.toggle(t)} />
        </span>
        <span
          lang="ru"
          className="min-w-0 flex-1 pr-6"
          style={{
            fontSize: compact ? 13 : 15,
            lineHeight: compact ? 1.35 : 1.4,
            color: t.done ? C.text3 : C.text,
            textDecorationLine: t.done ? "line-through" : "none",
            textDecorationColor: C.text3,
            display: "-webkit-box",
            WebkitLineClamp: compact ? 1 : 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "break-word",
            hyphens: "auto",
          }}
        >
          {t.title}
        </span>
      </div>
      <button
        type="button"
        title="Удалить задачу"
        aria-label="Удалить задачу"
        onClick={(e) => {
          e.stopPropagation();
          m.actions.remove(t);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="absolute grid place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF6B63] focus-visible:opacity-100 group-hover:opacity-100"
        style={{ top: compact ? 4 : 8, right: compact ? 4 : 8, width: 26, height: 26, color: C.text3 }}
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
      {!compact && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" style={{ paddingLeft: 28 }}>
          <PrioChip p={t.priority} />
          {pname && t.projectId && <ProjectChip id={t.projectId} name={pname} on="raise" />}
          <TagChips tags={t.tags} />
          <SubCount t={t} />
          <TimeMeta t={t} />
          <button
            type="button"
            title="Срок"
            aria-label={t.dueDate ? `Срок: ${text}. Изменить` : "Назначить срок"}
            onClick={(e) => {
              e.stopPropagation();
              setAnchor((a) => (a ? null : e.currentTarget));
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className={`ml-auto inline-flex shrink-0 items-center justify-center gap-1 transition-[opacity,background,color] duration-150 hover:brightness-125 focus-visible:opacity-100 ${
              chipText || anchor ? "" : "opacity-0 group-hover:opacity-100"
            }`}
            style={{
              ...metaChip,
              padding: chipText ? "0 8px" : 0,
              width: chipText ? undefined : 22,
              background: late ? TONE.amber.bg : chipText ? C.line2 : "transparent",
              color: late ? TONE.amber.fg : C.text2,
            }}
          >
            {chipText || <CalendarDays size={14} strokeWidth={1.75} />}
          </button>
        </div>
      )}
      {anchor && (
        <DatePop
          anchor={anchor}
          value={t.dueDate}
          weekStartsMonday={m.weekStartsMonday}
          onPick={(d) => m.actions.update(t.id, { dueDate: d })}
          onClose={closePop}
        />
      )}
    </article>
  );
}

/** «Завершено · N» under a day — collapsed by default; the open/closed state is remembered per board. */
const DONE_KEY = "crm-tasks-craft-week-done-v1";
function loadDoneOpen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}
function saveDoneOpen(v: boolean) {
  try {
    localStorage.setItem(DONE_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable — the toggle still works for this visit */
  }
}

function DoneList({ items, m, open, onToggle, onOpen }: { items: Task[]; m: TasksModel; open: boolean; onToggle: () => void; onOpen: (t: Task) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-0.5 pt-1" style={{ ...dashed, backgroundPosition: "left top" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 text-left transition-colors hover:text-[#F4F5F7]"
        style={{ height: 34, fontSize: 13, color: C.text3 }}
      >
        <ChevronDown size={14} strokeWidth={1.75} style={{ transform: open ? undefined : "rotate(-90deg)", transition: "transform .15s" }} />
        Завершено
        <span style={{ ...T.num, fontWeight: 400 }}>· {items.length}</span>
      </button>
      {open && items.map((t) => <TaskCard key={t.id} t={t} m={m} onOpen={() => onOpen(t)} compact />)}
    </div>
  );
}

function DayAdd({ onAdd, placeholder = "Задача" }: { onAdd: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
      className="flex items-center gap-2 px-2.5"
      style={{ height: 40, borderRadius: R.small }}
    >
      <Plus size={16} strokeWidth={1.75} color={C.text3} className="shrink-0" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
    </form>
  );
}

function MoreBtn({ expanded, hidden, onClick }: { expanded: boolean; hidden: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="px-2.5 text-left transition-colors hover:text-[#F4F5F7]" style={{ height: 32, fontSize: 13, color: C.text2 }}>
      {expanded ? "Свернуть" : `Ещё ${hidden}`}
    </button>
  );
}

// ── Meetings on the week — calendar calls stand on their day above the tasks ─────────────────

const MIN = 60 * 1000;
const hhmm = (t: number) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Re-render every 30s so «идёт» / «через 12 мин» stay true while the board is open. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * A meeting on its day: time range, title, live state and the call link. Meetings come from the
 * same store as the dashboard (Google Calendar sync + ones added by hand); the round check closes
 * it like a task (toggleMeeting), the button opens the call.
 */
function MeetingCard({ mt, now, onToggle }: { mt: Meeting; now: number; onToggle: () => void }) {
  const start = meetingStart(mt);
  const end = start + (mt.durationMin || 30) * MIN;
  const live = !mt.done && now >= start && now < end;
  const soon = !mt.done && !live && start > now && start - now <= 15 * MIN;
  const past = mt.done || now >= end;
  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{
        borderRadius: R.small,
        background: live ? "rgba(10,132,255,0.14)" : C.raise,
        opacity: past && !live ? 0.55 : 1,
      }}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" title={mt.done ? "Вернуть встречу" : "Закрыть встречу"}>
          <RoundCheckBtn size={18} done={!!mt.done} onChange={onToggle} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5" style={{ fontSize: 13, color: live ? "#5AA9FF" : C.text2 }}>
            <Video size={13} strokeWidth={1.75} className="shrink-0" />
            <span style={T.num}>
              {mt.time ? `${hhmm(start)}–${hhmm(end)}` : "весь день"}
            </span>
            {live && <span>· идёт</span>}
            {soon && <span style={{ color: C.amber }}>· через {Math.max(1, Math.ceil((start - now) / MIN))} мин</span>}
          </div>
          <div className="mt-1" style={{ fontSize: 15, lineHeight: 1.35, color: C.text, textDecoration: mt.done ? "line-through" : undefined }}>
            {mt.title}
          </div>
        </div>
      </div>
      {mt.url && !past && (
        <a
          href={mt.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 transition-[filter] hover:brightness-110"
          style={{ height: 32, borderRadius: 999, fontSize: 13, background: live || soon ? C.accent : "rgba(10,132,255,0.14)", color: live || soon ? "#fff" : "#5AA9FF" }}
        >
          <Video size={14} strokeWidth={1.75} /> Подключиться
        </a>
      )}
    </div>
  );
}

// ── Week board — the app's «По неделям» in Craft Dark, with the backlog ───────────────────────

function DayColumn({
  d,
  items,
  m,
  pid,
  onOpen,
  markFirst,
  done,
  doneOpen,
  onDoneToggle,
  meetings,
  now,
  onMeetingToggle,
}: {
  d: { date: string; label: string; short: string; isToday: boolean };
  items: Task[];
  m: TasksModel;
  pid: string | null | undefined;
  onOpen: (t: Task) => void;
  markFirst: boolean;
  done: Task[];
  doneOpen: boolean;
  onDoneToggle: () => void;
  meetings: Meeting[];
  now: number;
  onMeetingToggle: (id: string) => void;
}) {
  const { over, props } = useDrop((id) => m.actions.update(id, { dueDate: d.date }));
  // Every task of the day is shown — no «Ещё N» (owner, 2026-10-12).
  const shown = items;
  const accent = d.isToday ? "#5AA9FF" : undefined;
  return (
    <div
      {...props}
      className="flex min-w-0 snap-start flex-col gap-2 p-2 transition-colors duration-150"
      style={{ minHeight: 280, borderRadius: R.inner, background: over ? DROP_BG : COL_BG }}
    >
      <div className="flex items-start justify-between gap-2 px-2 pb-1 pt-2">
        <div className="min-w-0">
          <div className="truncate" style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 500, color: accent ?? C.text }}>
            {d.label}
          </div>
          <div className="mt-0.5 truncate" style={{ fontSize: 13, lineHeight: 1.3, color: accent ?? C.text3 }}>
            {d.isToday ? `сегодня · ${d.short}` : d.short}
          </div>
        </div>
        {items.length > 0 && <span style={{ ...T.body, ...T.num, fontWeight: 400, color: accent ?? C.text3 }}>{items.length}</span>}
      </div>
      {meetings.map((mt) => (
        <MeetingCard key={mt.id} mt={mt} now={now} onToggle={() => onMeetingToggle(mt.id)} />
      ))}
      {shown.map((t, i) => (
        <TaskCard key={t.id} t={t} m={m} onOpen={() => onOpen(t)} mark={markFirst && i === 0} />
      ))}
      <div className="mt-auto flex flex-col gap-1">
        <DayAdd onAdd={(v) => m.actions.add(v, { dueDate: d.date, projectId: pid ?? undefined })} />
        <DoneList items={done} m={m} open={doneOpen} onToggle={onDoneToggle} onOpen={onOpen} />
      </div>
    </div>
  );
}

type BacklogGroupBy = "prio" | "project";
type BacklogUi = { by: BacklogGroupBy; collapsed: boolean };
const BACKLOG_UI_KEY = "crm-tasks-backlog-ui-v1";
const PRIO_ORDER: Priority[] = [1, 2, 3, 0];

function loadBacklogUi(): BacklogUi {
  try {
    const v = JSON.parse(localStorage.getItem(BACKLOG_UI_KEY) ?? "{}") as Partial<BacklogUi>;
    return { by: v.by === "project" ? "project" : "prio", collapsed: v.collapsed === true };
  } catch {
    return { by: "prio", collapsed: false };
  }
}
function saveBacklogUi(v: BacklogUi) {
  try {
    localStorage.setItem(BACKLOG_UI_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — the choice just isn't remembered */
  }
}

interface BacklogGroup {
  key: string;
  label: string;
  dot?: string;
  items: Task[];
  /** What a card dropped on this group (or added in it) gets, besides losing its date. */
  patch: Partial<Task>;
}

function backlogGroups(items: Task[], by: BacklogGroupBy, m: TasksModel): BacklogGroup[] {
  if (by === "prio")
    return PRIO_ORDER.map((p) => ({ key: `p${p}`, label: PRIO_LABEL[p], dot: PRIO_DOT[p], items: items.filter((t) => t.priority === p), patch: { priority: p } }));
  return [
    ...m.projects.map((p) => ({ key: p.id, label: p.name, items: items.filter((t) => t.projectId === p.id), patch: { projectId: p.id } as Partial<Task> })),
    { key: "none", label: "Без проекта", items: items.filter((t) => !t.projectId || !m.projectName.has(t.projectId)), patch: { projectId: undefined } },
  ];
}

/** One group of the backlog: its own drop target, at most a row or two of cards until «Ещё». */
function BacklogSection({ g, m, pid, onOpen }: { g: BacklogGroup; m: TasksModel; pid: string | null | undefined; onOpen: (t: Task) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { over, props } = useDrop((id) => m.actions.update(id, { dueDate: undefined, ...g.patch }));
  const shown = expanded ? g.items : g.items.slice(0, BACKLOG_CAP);
  const open = g.items.filter((t) => !t.done).length;
  return (
    <div {...props} className="flex min-w-0 flex-col gap-2 p-2 transition-colors duration-150" style={{ borderRadius: R.small, background: over ? DROP_BG : "transparent" }}>
      <div className="flex items-center gap-2 px-2" style={{ height: 28 }}>
        {g.dot ? (
          <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 9, background: g.dot }} />
        ) : (
          <FolderKanban size={14} strokeWidth={1.75} color={C.text3} className="shrink-0" />
        )}
        <span className="truncate" style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
          {g.label}
        </span>
        <span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>{open}</span>
      </div>
      {shown.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 216px), 1fr))" }}>
          {shown.map((t) => (
            <TaskCard key={t.id} t={t} m={m} onOpen={() => onOpen(t)} />
          ))}
        </div>
      )}
      {g.items.length > BACKLOG_CAP && <MoreBtn expanded={expanded} hidden={g.items.length - shown.length} onClick={() => setExpanded((x) => !x)} />}
      <DayAdd placeholder={`Задача · ${g.label}`} onAdd={(v) => m.actions.add(v, { projectId: pid ?? undefined, ...g.patch })} />
    </div>
  );
}

/**
 * «Бэклог» — tasks without a date, under the week. Built for a hundred tasks: grouped by priority or
 * by project (each group its own drop target: a card dropped there loses its date and takes the
 * group's priority / project), a priority filter, and the whole block folds away. The grouping and
 * the fold are remembered per browser.
 */
function Backlog({ items, m, pid, onOpen }: { items: Task[]; m: TasksModel; pid: string | null | undefined; onOpen: (t: Task) => void }) {
  const [ui, setUi] = useState<BacklogUi>(loadBacklogUi);
  const [prio, setPrio] = useState<Priority | null>(null);
  const change = (p: Partial<BacklogUi>) => {
    const next = { ...ui, ...p };
    setUi(next);
    saveBacklogUi(next);
  };
  const { over, props } = useDrop((id) => m.actions.update(id, { dueDate: undefined }));
  const openN = items.filter((t) => !t.done).length;
  const list = prio === null ? items : items.filter((t) => t.priority === prio);
  const groups = backlogGroups(list, ui.by, m).filter((g) => g.items.length > 0);
  return (
    <div
      {...props}
      data-lab-block="backlog"
      className="flex min-w-0 flex-col gap-2 p-2 transition-colors duration-150"
      style={{ borderRadius: R.inner, background: over && ui.collapsed ? DROP_BG : COL_BG }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-2 pb-1 pt-2" style={{ minHeight: 36 }}>
        <button type="button" onClick={() => change({ collapsed: !ui.collapsed })} className="flex min-w-0 items-center gap-2 text-left">
          <ChevronDown size={16} strokeWidth={1.75} color={C.text3} className="shrink-0" style={{ transform: ui.collapsed ? "rotate(-90deg)" : undefined, transition: "transform .15s" }} />
          <span className="truncate" style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 500, color: C.text }}>
            Бэклог<span style={{ fontWeight: 400, color: C.text3 }}> · без срока</span>
          </span>
          {openN > 0 && <span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>{openN}</span>}
        </button>
        {!ui.collapsed && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {PRIO_ORDER.map((p) => {
                const n = items.filter((t) => t.priority === p && !t.done).length;
                if (!n && prio !== p) return null;
                const on = prio === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrio(on ? null : p)}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 transition-colors ${on ? "" : "hover:bg-[#19191C]"}`}
                    style={{ height: 32, borderRadius: 999, fontSize: 13, background: on ? tint : "transparent", color: on ? C.text : C.text2 }}
                  >
                    <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[p] }} />
                    {PRIO_LABEL[p]}
                    <span style={{ ...T.num, fontWeight: 400, color: on ? "#5AA9FF" : C.text3 }}>{n}</span>
                  </button>
                );
              })}
            </div>
            <ListTabs
              size={32}
              items={[
                { key: "prio" as const, label: "По приоритету" },
                { key: "project" as const, label: "По проекту" },
              ]}
              value={ui.by}
              onChange={(by) => change({ by })}
            />
          </div>
        )}
      </div>
      {!ui.collapsed && (
        <>
          {groups.map((g) => (
            <BacklogSection key={`${ui.by}-${g.key}`} g={g} m={m} pid={pid} onOpen={onOpen} />
          ))}
          {groups.length === 0 && <DayAdd placeholder="Задача без срока" onAdd={(v) => m.actions.add(v, { projectId: pid ?? undefined })} />}
        </>
      )}
    </div>
  );
}

function WeekBoard({ m, query, pid, onOpen }: { m: TasksModel; query: string; pid: string | null | undefined; onOpen: (t: Task) => void }) {
  const [offset, setOffset] = useState(0);
  const days = useMemo(() => weekDays(offset, m.weekStartsMonday), [offset, m.weekStartsMonday]);
  const pool = m.filter({ list: "all", query, projectId: pid });
  const cols = days.map((d) => ({ d, items: m.freshFirst(pool.filter((t) => weekColumnOf(t, days) === d.date).sort(byPrio)) }));
  const backlog = m.freshFirst(pool.filter((t) => weekColumnOf(t, days) === BACKLOG_KEY).sort(byPrio));
  const inWeek = cols.reduce((s, c) => s + c.items.filter((t) => !t.done).length, 0);
  // Closed tasks per day: the day they were completed (else their due day); ones still showing
  // struck in the column (ticked this visit) are not repeated.
  const shownIds = new Set(cols.flatMap((c) => c.items.map((t) => t.id)));
  const doneAll = m.filter({ list: "done", query, projectId: pid });
  const doneBy = (date: string) => doneAll.filter((t) => !shownIds.has(t.id) && (t.completedAt ? localDayStr(new Date(t.completedAt)) : t.dueDate) === date);
  const [doneOpen, setDoneOpen] = useState(loadDoneOpen);
  const toggleDone = () => {
    const next = !doneOpen;
    setDoneOpen(next);
    saveDoneOpen(next);
  };
  const firstCol = cols.findIndex((c) => c.items.length > 0);
  // Meetings by day (calendar sync + manual), earliest first. Hidden while a project filter is on —
  // meetings don't belong to projects.
  const { meetings, toggleMeeting } = useData();
  const now = useNow();
  const meetingsBy = (date: string) =>
    pid ? [] : meetings.filter((mt) => mt.date === date && (!query || mt.title.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return (
    <section data-lab-block="week" className="mt-6 flex min-w-0 flex-col gap-4 p-4 sm:p-6" style={{ background: C.card, borderRadius: R.card }}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <h2 style={T.title}>Неделя</h2>
          <div className="flex items-center gap-2">
            <IconBtn size={32} title="Предыдущая неделя" onClick={() => setOffset((n) => n - 1)}>
              <ChevronLeft size={16} strokeWidth={1.75} />
            </IconBtn>
            <span className="whitespace-nowrap" style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text2 }}>
              {weekRangeLabel(days)}
            </span>
            <IconBtn size={32} title="Следующая неделя" onClick={() => setOffset((n) => n + 1)}>
              <ChevronRight size={16} strokeWidth={1.75} />
            </IconBtn>
          </div>
          {offset !== 0 && (
            <Btn kind="ghost" size={36} onClick={() => setOffset(0)}>
              Эта неделя
            </Btn>
          )}
        </div>
        <span className="whitespace-nowrap" style={{ ...T.body, color: C.text3 }}>
          {inWeek} {plural(inWeek, "задача", "задачи", "задач")} на неделе
        </span>
      </header>

      {/* The previous page's proportions: a day is at least 13.5rem wide; when seven don't fit,
          the days scroll sideways inside the board — never the page. */}
      <div className="-mx-1 snap-x overflow-x-auto px-1 pb-1">
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(7, minmax(216px,1fr))" }}>
          {cols.map(({ d, items }, ci) => (
            <DayColumn
              key={d.date}
              d={d}
              items={items}
              m={m}
              pid={pid}
              onOpen={onOpen}
              markFirst={ci === firstCol}
              done={doneBy(d.date)}
              doneOpen={doneOpen}
              onDoneToggle={toggleDone}
              meetings={meetingsBy(d.date)}
              now={now}
              onMeetingToggle={toggleMeeting}
            />
          ))}
        </div>
      </div>

      <Backlog items={backlog} m={m} pid={pid} onOpen={onOpen} />
    </section>
  );
}

function projectRows(m: TasksModel) {
  const open = m.tasks.filter((t) => !t.done);
  return [
    { id: "", name: "Все проекты", n: open.length },
    ...m.projects.map((p) => ({ id: p.id, name: p.name, n: open.filter((t) => t.projectId === p.id).length })),
    { id: "none", name: "Без проекта", n: open.filter((t) => !t.projectId).length },
  ];
}

/** Project filter for the week — a quiet pill select. */
function ProjectPick({ m, value, onChange }: { m: TasksModel; value: string; onChange: (id: string) => void }) {
  return (
    <Select
      ariaLabel="Проект"
      round
      height={40}
      maxWidth={260}
      active={!!value}
      value={value}
      onChange={onChange}
      icon={<FolderKanban size={16} strokeWidth={1.75} color={value ? "#5AA9FF" : C.text2} className="shrink-0" />}
      options={projectRows(m).map((r) => ({ value: r.id, label: r.name, hint: r.n }))}
    />
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────────

export default function TasksByTime() {
  const m = useTasksModel();
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const closeMeeting = useCallback(() => setMeetingOpen(false), []);
  const closeEditor = useCallback(() => {
    setEditId(null);
    setDraft(null);
  }, []);

  const pid = project === "" ? undefined : project === "none" ? null : project;
  const projectId = project && project !== "none" ? project : undefined;
  const open = (t: Task) => setEditId(t.id);

  const openCount = m.counts.all;
  const overdue = m.counts.overdue;
  const newTask = () => setDraft({ projectId });

  return (
    <CraftShell
      active="tasks"
      crumb="Задачи"
      icon={CircleCheckBig}
      subtitle={`${openCount} ${plural(openCount, "открытая", "открытые", "открытых")}${overdue ? ` · ${overdue} просрочено` : ""}`}
      search={{ value: query, onChange: setQuery, placeholder: "Поиск задач" }}
      titleRight={<ProjectPick m={m} value={project} onChange={setProject} />}
      actions={
        <>
          <NewMeetingBtn onClick={() => setMeetingOpen(true)} />
          <NewTaskBtn onClick={newTask} />
        </>
      }
    >
      <WeekBoard m={m} query={query} pid={pid} onOpen={open} />

      {(editId || draft) && <TaskEditor taskId={editId} draft={draft ?? undefined} m={m} onClose={closeEditor} />}
      {meetingOpen && <MeetingEditor onClose={closeMeeting} />}
    </CraftShell>
  );
}
