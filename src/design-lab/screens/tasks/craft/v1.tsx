/**
 * Задачи · Craft Dark · v1 «По срокам» — round 3 (owner's notes): the screen opens on view tabs
 * «Неделя · Список · Канбан» (remembered per browser) instead of stacking everything.
 *   · Неделя — the app's 7-day system (one column per day, ‹ › between weeks, overdue collected in
 *     today's column, drag a card onto a day, add straight into a day) plus «Бэклог» under the days:
 *     tasks without a date; dropping a card there clears its date.
 *   · Список — smart-list pills, quick add and the grouped list of all tasks, with the side rail
 *     (norm ring, sorting, projects as filters).
 *   · Канбан — the app's priority board: Высокий · Средний · Низкий · Без приоритета; dragging a
 *     card to another column changes its priority.
 * Every card and row opens the task editor on click; the date chip on a card picks a date in place.
 *
 *   ┌ title ─────────────────────────────────────────────────────────────────┐
 *   │ [Неделя] [Список] [Канбан]                                [Все проекты ▾]│
 *   │ ┌ Неделя  ‹ 5–11 окт. ›                              n задач на неделе ┐ │
 *   │ │ Пн │ Вт │ Ср │ Чт │ Пт │ Сб │ Вс(today)   — cards, «+ Задача»          │ │
 *   │ │ Бэклог n — cards without a date, «+ Задача»                           │ │
 *   │ └───────────────────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────────────────┘
 */
import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleCheckBig, FolderKanban, Plus, Trash2 } from "lucide-react";

import { Btn, C, Empty, IconBtn, R, Ring, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { addDays, formatDate, localDayStr, todayStr } from "@/lib/format";
import { groupByTime } from "@/lib/taskGrouping";
import { BACKLOG_KEY, weekColumnOf, weekDays, weekRangeLabel } from "@/lib/weekBoard";
import type { Priority, Task } from "@/types";
import {
  DatePop,
  LISTS,
  ListTabs,
  NewTaskBtn,
  PRIO_DOT,
  PRIO_LABEL,
  PRIO_RANK,
  QuickAdd,
  RoundCheckBtn,
  TaskEditor,
  TaskLine,
  dueText,
  tint,
  useTasksModel,
  type SmartList,
  type TaskDraft,
  type TasksModel,
} from "./_parts";

const GROUP_CAP = 8;
const DAY_CAP = 4;
const BACKLOG_CAP = 8;
const KANBAN_CAP = 8;
const DOT: Record<string, string> = { overdue: C.amber, today: C.accent, tomorrow: C.accent };
const DROP_BG = "rgba(10,132,255,0.16)";
const COL_BG = "rgba(0,0,0,0.22)";

type Sort = "due" | "prio" | "project" | "title";
const SORTS: { key: Sort; label: string }[] = [
  { key: "due", label: "По сроку" },
  { key: "prio", label: "По приоритету" },
  { key: "project", label: "По проекту" },
  { key: "title", label: "По названию" },
];

type View = "week" | "list" | "kanban";
const VIEWS: { key: View; label: string }[] = [
  { key: "week", label: "Неделя" },
  { key: "list", label: "Список" },
  { key: "kanban", label: "Канбан" },
];
const VIEW_KEY = "crm-tasks-craft-view-v1";

/** Remembered view — storage can be blocked (private window), so every access is guarded. */
function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "list" || v === "kanban" ? v : "week";
  } catch {
    return "week";
  }
}
function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* storage unavailable — the tab still switches, it just isn't remembered */
  }
}

interface Group {
  key: string;
  label: string;
  items: Task[];
}

const DRAG = "text/plain";
const SHORT: Record<string, string> = { Понедельник: "Пн", Вторник: "Вт", Среда: "Ср", Четверг: "Чт", Пятница: "Пт", Суббота: "Сб", Воскресенье: "Вс" };
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
 * A task card: title up to three lines; below — check, priority dot, project (or the overdue date),
 * and a date chip on the right that opens the date picker in place. Click anywhere else opens the
 * editor; hover shows a trash icon; the card drags onto another column.
 * `showDate` prints the due date in the chip (kanban); in day columns the column already says it.
 */
function TaskCard({ t, m, onOpen, mark, showDate }: { t: Task; m: TasksModel; onOpen: () => void; mark?: boolean; showDate?: boolean }) {
  const { text, late } = dueText(t);
  const pname = t.projectId ? m.projectName.get(t.projectId) : undefined;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const closePop = useCallback(() => setAnchor(null), []);
  const chipText = late || (showDate && t.dueDate) ? text : "";
  return (
    <article
      data-lab-block={mark ? "card" : undefined}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()}
      className="group relative flex cursor-pointer flex-col gap-2 p-2.5 outline-none transition-colors duration-150 hover:bg-[#26262C] focus-visible:bg-[#26262C] active:cursor-grabbing"
      style={{ background: C.raise, borderRadius: R.small }}
    >
      <span
        lang="ru"
        className="pr-5"
        style={{
          fontSize: 13,
          lineHeight: 1.35,
          color: t.done ? C.text3 : C.text,
          textDecorationLine: t.done ? "line-through" : "none",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          overflowWrap: "break-word",
          hyphens: "auto",
        }}
      >
        {t.title}
      </span>
      <button
        type="button"
        title="Удалить задачу"
        aria-label="Удалить задачу"
        onClick={(e) => {
          e.stopPropagation();
          m.actions.remove(t);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="absolute grid place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF7A73] focus-visible:opacity-100 group-hover:opacity-100"
        style={{ top: 6, right: 6, width: 24, height: 24, color: C.text3 }}
      >
        <Trash2 size={13} strokeWidth={1.75} />
      </button>
      <div className="flex min-w-0 items-center gap-2" style={{ fontSize: 11, lineHeight: 1.3 }}>
        <RoundCheckBtn size={16} done={t.done} onChange={() => m.actions.toggle(t)} />
        {t.priority > 0 && <span className="shrink-0" style={{ width: 5, height: 5, borderRadius: 9, background: PRIO_DOT[t.priority] }} />}
        <span className="min-w-0 flex-1 truncate" style={{ color: C.text3 }}>
          {pname ?? (t.priority && !chipText ? PRIO_LABEL[t.priority] : "")}
        </span>
        <button
          type="button"
          title="Срок"
          aria-label={t.dueDate ? `Срок: ${text}. Изменить` : "Назначить срок"}
          onClick={(e) => {
            e.stopPropagation();
            setAnchor((a) => (a ? null : e.currentTarget));
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full transition-[opacity,background,color] duration-150 hover:bg-[#2E2E34] hover:text-[#F4F5F7] focus-visible:opacity-100 ${
            chipText || anchor ? "" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ height: 22, padding: chipText ? "0 6px" : 0, width: chipText ? undefined : 22, justifyContent: "center", color: late ? TONE.amber.fg : C.text3 }}
        >
          {chipText || <CalendarDays size={13} strokeWidth={1.75} />}
        </button>
      </div>
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
      className="flex items-center gap-1.5 px-2"
      style={{ height: 34, borderRadius: R.small }}
    >
      <Plus size={14} strokeWidth={1.75} color={C.text3} className="shrink-0" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 13, color: C.text }}
      />
    </form>
  );
}

function MoreBtn({ expanded, hidden, onClick }: { expanded: boolean; hidden: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="px-2 text-left transition-colors hover:text-[#F4F5F7]" style={{ height: 28, fontSize: 12, color: C.text2 }}>
      {expanded ? "Свернуть" : `Ещё ${hidden}`}
    </button>
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
}: {
  d: { date: string; label: string; short: string; isToday: boolean };
  items: Task[];
  m: TasksModel;
  pid: string | null | undefined;
  onOpen: (t: Task) => void;
  markFirst: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { over, props } = useDrop((id) => m.actions.update(id, { dueDate: d.date }));
  const shown = expanded ? items : items.slice(0, DAY_CAP);
  const accent = d.isToday ? "#5AA9FF" : undefined;
  return (
    <div
      {...props}
      className="flex min-w-0 flex-col gap-1.5 p-1.5 transition-colors duration-150"
      style={{ minHeight: 200, borderRadius: R.inner, background: over ? DROP_BG : d.isToday ? "rgba(10,132,255,0.08)" : COL_BG }}
    >
      <div className="flex items-center justify-between gap-1 px-1.5 pb-1 pt-1.5" style={{ minHeight: 30 }}>
        <div className="min-w-0 truncate" style={{ ...T.body, fontWeight: 500, color: accent ?? C.text }}>
          {SHORT[d.label] ?? d.label}
          <span style={{ fontWeight: 400, color: accent ?? C.text3 }}> · {d.isToday ? "сегодня" : d.short}</span>
        </div>
        {items.length > 0 && <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: accent ?? C.text3 }}>{items.length}</span>}
      </div>
      {shown.map((t, i) => (
        <TaskCard key={t.id} t={t} m={m} onOpen={() => onOpen(t)} mark={markFirst && i === 0} />
      ))}
      {items.length > DAY_CAP && <MoreBtn expanded={expanded} hidden={items.length - shown.length} onClick={() => setExpanded((x) => !x)} />}
      <div className="mt-auto">
        <DayAdd onAdd={(v) => m.actions.add(v, { dueDate: d.date, projectId: pid ?? undefined })} />
      </div>
    </div>
  );
}

function Backlog({ items, m, pid, onOpen }: { items: Task[]; m: TasksModel; pid: string | null | undefined; onOpen: (t: Task) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { over, props } = useDrop((id) => m.actions.update(id, { dueDate: undefined }));
  const shown = expanded ? items : items.slice(0, BACKLOG_CAP);
  return (
    <div
      {...props}
      data-lab-block="backlog"
      className="flex min-w-0 flex-col gap-1.5 p-1.5 transition-colors duration-150"
      style={{ borderRadius: R.inner, background: over ? DROP_BG : COL_BG }}
    >
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-1.5" style={{ minHeight: 30 }}>
        <div className="truncate" style={{ ...T.body, fontWeight: 500, color: C.text }}>
          Бэклог<span style={{ fontWeight: 400, color: C.text3 }}> · без срока</span>
        </div>
        {items.length > 0 && <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: C.text3 }}>{items.length}</span>}
      </div>
      {shown.length > 0 && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {shown.map((t) => (
            <TaskCard key={t.id} t={t} m={m} onOpen={() => onOpen(t)} />
          ))}
        </div>
      )}
      {items.length > BACKLOG_CAP && <MoreBtn expanded={expanded} hidden={items.length - shown.length} onClick={() => setExpanded((x) => !x)} />}
      <DayAdd placeholder="Задача без срока" onAdd={(v) => m.actions.add(v, { projectId: pid ?? undefined })} />
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
  const firstCol = cols.findIndex((c) => c.items.length > 0);

  return (
    <section data-lab-block="week" className="mt-4 flex min-w-0 flex-col gap-4 p-5" style={{ background: C.card, borderRadius: R.card }}>
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

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
        {cols.map(({ d, items }, ci) => (
          <DayColumn key={d.date} d={d} items={items} m={m} pid={pid} onOpen={onOpen} markFirst={ci === firstCol} />
        ))}
      </div>

      <Backlog items={backlog} m={m} pid={pid} onOpen={onOpen} />
    </section>
  );
}

// ── Kanban — the app's priority board ─────────────────────────────────────────────────────────

const KANBAN: { p: Priority; label: string }[] = [
  { p: 1, label: "Высокий" },
  { p: 2, label: "Средний" },
  { p: 3, label: "Низкий" },
  { p: 0, label: "Без приоритета" },
];

function KanbanColumn({ p, label, items, m, pid, onOpen, markFirst }: { p: Priority; label: string; items: Task[]; m: TasksModel; pid: string | null | undefined; onOpen: (t: Task) => void; markFirst: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { over, props } = useDrop((id) => m.actions.update(id, { priority: p }));
  const shown = expanded ? items : items.slice(0, KANBAN_CAP);
  return (
    <div
      {...props}
      className="flex min-w-0 flex-col gap-1.5 p-1.5 transition-colors duration-150"
      style={{ minHeight: 320, borderRadius: R.inner, background: over ? DROP_BG : COL_BG }}
    >
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-1.5" style={{ minHeight: 30 }}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 9, background: PRIO_DOT[p] }} />
          <span className="truncate" style={{ ...T.body, fontWeight: 500 }}>
            {label}
          </span>
        </div>
        {items.length > 0 && <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: C.text3 }}>{items.length}</span>}
      </div>
      {shown.map((t, i) => (
        <TaskCard key={t.id} t={t} m={m} onOpen={() => onOpen(t)} mark={markFirst && i === 0} showDate />
      ))}
      {items.length > KANBAN_CAP && <MoreBtn expanded={expanded} hidden={items.length - shown.length} onClick={() => setExpanded((x) => !x)} />}
      <div className="mt-auto">
        <DayAdd onAdd={(v) => m.actions.add(v, { priority: p, projectId: pid ?? undefined })} />
      </div>
    </div>
  );
}

function Kanban({ m, query, pid, onOpen }: { m: TasksModel; query: string; pid: string | null | undefined; onOpen: (t: Task) => void }) {
  const pool = m.filter({ list: "all", query, projectId: pid });
  const cols = KANBAN.map((c) => ({ ...c, items: pool.filter((t) => t.priority === c.p) }));
  const firstCol = cols.findIndex((c) => c.items.length > 0);
  const openN = pool.filter((t) => !t.done).length;
  return (
    <section data-lab-block="kanban" className="mt-4 flex min-w-0 flex-col gap-4 p-5" style={{ background: C.card, borderRadius: R.card }}>
      <header className="flex items-center justify-between gap-4">
        <h2 style={T.title}>Канбан</h2>
        <span className="whitespace-nowrap" style={{ ...T.body, color: C.text3 }}>
          {openN} {plural(openN, "открытая", "открытые", "открытых")}
        </span>
      </header>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        {cols.map((c, ci) => (
          <KanbanColumn key={c.p} p={c.p} label={c.label} items={c.items} m={m} pid={pid} onOpen={onOpen} markFirst={ci === firstCol} />
        ))}
      </div>
    </section>
  );
}

// ── General list ──────────────────────────────────────────────────────────────────────────────

function doneGroups(items: Task[]): Group[] {
  const today = todayStr();
  const yesterday = addDays(new Date(), -1);
  const map = new Map<string, Task[]>();
  for (const t of items) {
    const k = t.completedAt ? localDayStr(new Date(t.completedAt)) : "—";
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return [...map.entries()].map(([k, xs]) => ({
    key: k,
    label: k === today ? "Сегодня" : k === yesterday ? "Вчера" : k === "—" ? "Без даты" : formatDate(k),
    items: xs,
  }));
}

function sortGroups(items: Task[], sort: Sort, m: TasksModel): Group[] {
  if (sort === "due") return groupByTime(items).map((g) => ({ key: g.key, label: g.label, items: m.freshFirst(g.items) }));
  if (sort === "prio")
    return ([1, 2, 3, 0] as const)
      .map((p) => ({ key: `p${p}`, label: PRIO_LABEL[p], items: m.freshFirst(items.filter((t) => t.priority === p)) }))
      .filter((g) => g.items.length);
  if (sort === "project")
    return [
      ...m.projects.map((p) => ({ key: p.id, label: p.name, items: m.freshFirst(items.filter((t) => t.projectId === p.id)) })),
      { key: "noproj", label: "Без проекта", items: m.freshFirst(items.filter((t) => !t.projectId)) },
    ].filter((g) => g.items.length);
  return [{ key: "abc", label: "", items: m.freshFirst([...items].sort((a, b) => a.title.localeCompare(b.title, "ru"))) }];
}

function GroupBlock({ g, m, onOpen, markRow, flat }: { g: Group; m: TasksModel; onOpen: (t: Task) => void; markRow?: boolean; flat?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [all, setAll] = useState(false);
  const cap = flat ? 30 : GROUP_CAP;
  const shown = all ? g.items : g.items.slice(0, cap);
  const hidden = g.items.length - shown.length;
  const openIds = g.items.filter((t) => !t.done).map((t) => t.id);
  const dot = DOT[g.key] ?? (g.key.startsWith("p") && g.key.length === 2 ? PRIO_DOT[Number(g.key[1])] : "#4A4C54");
  return (
    <div id={`group-${g.key}`} style={{ scrollMarginTop: 20 }}>
      {!flat && (
        <div className="flex items-center gap-3 px-6" style={{ height: 52, ...dashed }}>
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 9, background: dot }} />
            <span className="truncate" style={{ ...T.body, fontWeight: 500, color: g.key === "overdue" ? TONE.amber.fg : C.text }}>
              {g.label}
            </span>
            <span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>{g.items.length}</span>
          </button>
          {g.key === "overdue" && openIds.length > 0 && (
            <Btn kind="ghost" size={36} onClick={() => m.actions.bulkReschedule(openIds, 0)}>
              Всё на сегодня
            </Btn>
          )}
          <button
            type="button"
            aria-label={collapsed ? "Развернуть" : "Свернуть"}
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#1E1E22]"
            style={{ color: C.text3 }}
          >
            <ChevronDown size={16} strokeWidth={1.75} style={{ transform: collapsed ? "rotate(-90deg)" : undefined, transition: "transform .15s" }} />
          </button>
        </div>
      )}
      {!collapsed && (
        <>
          {shown.map((t, i) => (
            <div key={t.id} data-lab-block={markRow && i === 0 ? "row" : undefined}>
              <TaskLine t={t} m={m} onOpen={() => onOpen(t)} />
            </div>
          ))}
          {g.items.length > cap && (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className="flex w-full items-center px-6 text-left transition-colors hover:bg-[#1C1C20]"
              style={{ height: 48, ...dashed, ...T.body, color: C.text2 }}
            >
              {all ? "Свернуть" : `Ещё ${hidden} ${plural(hidden, "задача", "задачи", "задач")}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Rail — norm, sorting, projects ────────────────────────────────────────────────────────────

function RailList<K extends string>({ items, value, onChange }: { items: { id: K; name: string; n?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 pb-1">
      {items.map((r) => {
        const on = value === r.id;
        return (
          <button
            key={r.id || "all"}
            type="button"
            onClick={() => onChange(r.id)}
            className={`flex items-center gap-3 px-3 text-left transition-colors ${on ? "" : "hover:bg-[#1E1E22]"}`}
            style={{ height: 40, borderRadius: R.small, background: on ? tint : undefined }}
          >
            <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: on ? C.text : C.text2 }}>
              {r.name}
            </span>
            {r.n !== undefined && <span style={{ ...T.body, ...T.num, fontWeight: 400, color: on ? "#5AA9FF" : C.text3 }}>{r.n}</span>}
          </button>
        );
      })}
    </div>
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

function Rail({ m, project, onProject, sort, onSort }: { m: TasksModel; project: string; onProject: (id: string) => void; sort: Sort; onSort: (s: Sort) => void }) {
  const pct = Math.min(100, (m.closedToday / m.goal) * 100);
  return (
    <aside className="flex min-w-0 flex-col gap-3">
      <section data-lab-block="norm" className="flex items-center gap-4 p-5" style={{ background: C.card, borderRadius: R.card }}>
        <Ring pct={pct} size={64} stroke={5}>
          <span style={{ ...T.foot, ...T.num, color: C.text2 }}>{Math.round(pct)}%</span>
        </Ring>
        <div className="min-w-0">
          <div style={{ ...T.num, fontSize: 32, lineHeight: 1 }}>
            {m.closedToday}
            <span style={{ color: C.text3, fontWeight: 400 }}>/{m.goal}</span>
          </div>
          <div style={{ ...T.foot, color: C.text3, marginTop: 6 }}>закрыто сегодня из нормы</div>
        </div>
      </section>

      <section data-lab-block="sort" className="flex flex-col py-2" style={{ background: C.card, borderRadius: R.card }}>
        <h2 className="px-5 pb-2 pt-3" style={T.title}>
          Сортировка
        </h2>
        <RailList items={SORTS.map((s) => ({ id: s.key, name: s.label }))} value={sort} onChange={onSort} />
      </section>

      <section data-lab-block="projects" className="flex flex-col py-2" style={{ background: C.card, borderRadius: R.card }}>
        <div className="flex items-center gap-2.5 px-5 pb-2 pt-3">
          <FolderKanban size={16} strokeWidth={1.75} color={C.text2} />
          <h2 style={T.title}>Проекты</h2>
        </div>
        <RailList items={projectRows(m)} value={project} onChange={onProject} />
      </section>
    </aside>
  );
}

/** Project filter for the week and kanban views (the list keeps it in its rail) — a quiet pill select. */
function ProjectPick({ m, value, onChange }: { m: TasksModel; value: string; onChange: (id: string) => void }) {
  return (
    <select
      aria-label="Проект"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 max-w-[240px] cursor-pointer truncate outline-none [color-scheme:dark]"
      style={{ height: 40, borderRadius: 999, padding: "0 14px", fontSize: 14, background: value ? tint : C.card, color: value ? C.text : C.text2 }}
    >
      {projectRows(m).map((r) => (
        <option key={r.id || "all"} value={r.id}>
          {r.name} · {r.n}
        </option>
      ))}
    </select>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────────

export default function TasksByTime() {
  const m = useTasksModel();
  const [view, setViewState] = useState<View>(loadView);
  const [list, setList] = useState<SmartList>("all");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [sort, setSort] = useState<Sort>("due");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const closeEditor = useCallback(() => {
    setEditId(null);
    setDraft(null);
  }, []);

  const setView = (v: View) => {
    setViewState(v);
    saveView(v);
  };
  const pid = project === "" ? undefined : project === "none" ? null : project;
  const projectId = project && project !== "none" ? project : undefined;
  const open = (t: Task) => setEditId(t.id);

  const items = m.filter({ list, query, projectId: pid });
  const groups: Group[] =
    list === "done"
      ? doneGroups(items.slice(0, 120))
      : list === "snoozed"
        ? items.length
          ? [{ key: "snoozed", label: "Отложенные", items }]
          : []
        : sortGroups(items, sort, m);
  const flat = list !== "done" && list !== "snoozed" && sort === "title";

  const openCount = m.counts.all;
  const overdue = m.counts.overdue;
  const add = (v: string) => m.actions.add(v, { dueDate: list === "today" ? todayStr() : undefined, projectId });
  const newTask = () => setDraft({ projectId, dueDate: view === "list" && list === "today" ? todayStr() : undefined });

  return (
    <CraftShell
      active="tasks"
      crumb="Задачи"
      icon={CircleCheckBig}
      subtitle={`${openCount} ${plural(openCount, "открытая", "открытые", "открытых")}${overdue ? ` · ${overdue} просрочено` : ""}`}
      search={{ value: query, onChange: setQuery, placeholder: "Поиск задач" }}
      actions={<NewTaskBtn onClick={newTask} />}
    >
      <div data-lab-block="views" className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <ListTabs items={VIEWS} value={view} onChange={setView} />
        {view !== "list" && <ProjectPick m={m} value={project} onChange={setProject} />}
      </div>

      {view === "week" && <WeekBoard m={m} query={query} pid={pid} onOpen={open} />}

      {view === "kanban" && <Kanban m={m} query={query} pid={pid} onOpen={open} />}

      {view === "list" && (
        <div className="mt-4 grid items-start gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(240px,300px)" }}>
          <section data-lab-block="list" className="flex min-w-0 flex-col overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
            <div data-lab-block="tabs" className="flex items-center justify-between gap-3 px-4 pt-4">
              <ListTabs
                size={36}
                items={LISTS.map((l) => ({ key: l.key, label: l.label, count: l.key === "done" ? undefined : m.counts[l.key], warn: l.key === "overdue" }))}
                value={list}
                onChange={setList}
              />
            </div>
            {list !== "done" && (
              <div data-lab-block="add" className="px-5 pb-5 pt-4" style={dashed}>
                <QuickAdd onAdd={add} placeholder={list === "today" ? "Новая задача на сегодня — «15:00 #работа»" : "Новая задача — «завтра 15:00 #работа»"} />
              </div>
            )}
            {groups.length === 0 ? (
              <div className="p-5">
                <Empty>
                  {query
                    ? `Ничего не найдено по «${query}»`
                    : list === "today"
                      ? "На сегодня задач нет"
                      : list === "overdue"
                        ? "Просроченных задач нет"
                        : list === "done"
                          ? "Завершённых задач пока нет"
                          : "В этом списке пусто"}
                </Empty>
              </div>
            ) : (
              <div className="pb-2">
                {groups.map((g, gi) => (
                  <GroupBlock key={`${list}-${sort}-${g.key}`} g={g} m={m} onOpen={open} markRow={gi === 0} flat={flat} />
                ))}
              </div>
            )}
          </section>
          <Rail m={m} project={project} onProject={setProject} sort={sort} onSort={setSort} />
        </div>
      )}

      {(editId || draft) && <TaskEditor taskId={editId} draft={draft ?? undefined} m={m} onClose={closeEditor} />}
    </CraftShell>
  );
}
