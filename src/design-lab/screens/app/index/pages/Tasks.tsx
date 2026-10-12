/**
 * «Индекс» · Задачи — the most-used screen, made quiet.
 * Header + one strip of smart lists (Все · Сегодня · Просрочено · Предстоящие as big index numerals),
 * then 01/02 «Список ⇄ Канбан», one NLP add line and hairline rows. Everything secondary
 * (filters, sorting, grouping, saved views, archive, snooze, tags, project move) sits in «⋯» menus;
 * a task opens as a right-hand «case» panel with a KV table and a «Готово» CTA bar.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { isOverdue, isToday, isUpcoming, todayStr } from "@/lib/format";
import { FIXED_TAGS } from "@/lib/tags";
import { weekDays, weekRangeLabel, weekColumnOf, BACKLOG_KEY } from "@/lib/weekBoard";
import { placeInColumn, sortByPriority, PRIORITY_RANK } from "@/lib/taskOrder";
import { pushUndo } from "@/lib/undoStack";
import { useTaskPanel } from "@/design-lab/screens/_kit/index-ui";
import { blockingTasks } from "@/lib/dependencies";
import { isSnoozed } from "@/lib/taskGrouping";
import { PRIORITY_META, type Meeting, type Task } from "@/types";
import {
  B,
  T,
  tab,
  Page,
  PageHeader,
  SectionHead,
  Button,
  NumTabs,
  Empty,
  Bullet,
  Sparkle,
  plural,
} from "@/design-lab/screens/_kit/index";

import {
  AddBar,
  Board,
  BulkDock,
  Dots,
  FloatMenu,
  GroupHead,
  MeetingRow,
  MenuItem,
  MenuLabel,
  MenuSep,
  TaskRow,
  inDays,
  parseQuick,
  useFloat,
  type BoardCol,
  type TaskActions,
} from "./Tasks.parts";

type SmartList = "all" | "today" | "overdue" | "upcoming" | "snoozed" | "done";

/** Same lists, same order (= keys 1–6) as the real page. */
const LISTS: { key: SmartList; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "today", label: "Сегодня" },
  { key: "overdue", label: "Просрочено" },
  { key: "upcoming", label: "Предстоящие" },
  { key: "snoozed", label: "Отложенные" },
  { key: "done", label: "Завершённые" },
];
const LABEL = Object.fromEntries(LISTS.map((l) => [l.key, l.label])) as Record<SmartList, string>;

function matchesList(t: Task, list: SmartList): boolean {
  if (list === "snoozed") return !t.done && isSnoozed(t);
  if (isSnoozed(t)) return false;
  switch (list) {
    case "all":
      return !t.done;
    case "today":
      return !t.done && !!t.dueDate && isToday(t.dueDate);
    case "overdue":
      return !t.done && isOverdue(t.dueDate);
    case "upcoming":
      return !t.done && isUpcoming(t.dueDate);
    case "done":
      return t.done;
  }
}
function matchesMeeting(m: Meeting, list: SmartList): boolean {
  const done = !!m.done;
  switch (list) {
    case "all":
      return !done;
    case "today":
      return !done && isToday(m.date);
    case "overdue":
      return !done && isOverdue(m.date);
    case "upcoming":
      return !done && isUpcoming(m.date);
    case "done":
      return done;
    case "snoozed":
      return false;
  }
}

const VIEW_KEY = "crm-tasks-view-v1";
const MODE_KEY = "crm-kanban-mode-v1";
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

type Item = { key: string; due?: string; priority: number; done: boolean; completedAt?: string; task?: Task; meeting?: Meeting };

export default function Tasks() {
  const {
    tasks,
    allTasks,
    projects,
    allProjects,
    meetings,
    settings,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    restoreTask,
    archiveTask,
    unarchiveTask,
    archiveDoneTasks,
    reorderTasks,
    addSavedView,
    deleteSavedView,
  } = useData();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [list, setList] = useState<SmartList>("all");
  const [view, setView] = useState<"list" | "kanban">(() => (read(VIEW_KEY) === "kanban" ? "kanban" : "list"));
  const [mode, setMode] = useState<"priority" | "week">(() => (read(MODE_KEY) === "week" ? "week" : "priority"));
  const [weekOffset, setWeekOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [noProject, setNoProject] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "priority">("date");
  const [byProject, setByProject] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const panel = useTaskPanel();
  const openId = panel.openId;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const addRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pageMenu = useFloat();

  useEffect(() => write(VIEW_KEY, view), [view]);
  useEffect(() => write(MODE_KEY, mode), [mode]);

  const projectName = (id?: string) => (id ? allProjects.find((p) => p.id === id)?.name : undefined);

  /* ── actions (same store calls as the real page) ─────────────────────────────────────────── */
  const act: TaskActions = {
    // One card for the whole app — the host pushes «recent» itself.
    open: (t) => panel.open(t.id),
    toggle: (t) => {
      if (!t.done) {
        const blockers = blockingTasks(t, tasks);
        if (blockers.length) {
          toast(`Заблокировано — сначала закройте «${blockers[0].title}»${blockers.length > 1 ? ` (+${blockers.length - 1})` : ""}`);
          return;
        }
      }
      toggleTask(t.id);
    },
    setDue: (id, date) => updateTask(id, { dueDate: date }),
    snooze: (id, until) => {
      updateTask(id, { snoozedUntil: until ?? undefined });
      if (until) toast("Задача отложена");
    },
    setPriority: (id, p) => updateTask(id, { priority: p }),
    setProject: (id, projectId) => updateTask(id, { projectId, section: undefined }),
    toggleTag: (t, tg) => updateTask(t.id, { tags: t.tags.includes(tg) ? t.tags.filter((x) => x !== tg) : [...t.tags, tg] }),
    archive: (t) => {
      archiveTask(t.id);
      const run = pushUndo("Задача в архиве", () => unarchiveTask(t.id));
      toast("В архиве", { actionLabel: "Вернуть", onAction: run });
    },
    remove: (t) => {
      deleteTask(t.id);
      const run = pushUndo("Задача удалена", () => restoreTask(t));
      toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
    },
  };

  function add(raw: string, extra: Partial<Task> = {}): string | null {
    const p = parseQuick(raw, projects);
    const title = p.title.trim() || raw.trim();
    if (!title) return null;
    const dueDate = p.dueDate ?? (view === "list" && list === "today" ? todayStr() : undefined);
    const id = addTask({
      title,
      done: false,
      dueDate,
      projectId: p.projectId,
      tags: tag && !p.tags.includes(tag) ? [...p.tags, tag] : p.tags,
      important: p.important,
      priority: p.important ? 1 : 0,
      remindAt: p.remindAt,
      estimateMin: p.estimateMin,
      recurrence: p.recurrence,
      ...extra,
    });
    if (view === "list" && list !== "all" && list !== "today") {
      const lands = dueDate ? (isOverdue(dueDate) ? "overdue" : isUpcoming(dueDate) ? "upcoming" : "today") : "all";
      if (lands !== list) toast(`Добавлено — задача в «${LABEL[lands as SmartList]}»`);
    }
    return id;
  }

  /* ── deep link { openTaskId } from palette / wiki links ─────────────────────────────────── */
  useEffect(() => {
    const id = (location.state as { openTaskId?: string } | null)?.openTaskId;
    if (!id) return;
    const t = allTasks.find((x) => x.id === id);
    if (t) act.open(t);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  /* ── keys: 1–6 lists · n add · / search · Esc clears selection ──────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName) || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey || openId) return;
      const n = Number(e.key);
      if (n >= 1 && n <= LISTS.length) {
        setList(LISTS[n - 1].key);
        setView("list");
      } else if (e.key === "n" || e.key === "т") {
        e.preventDefault();
        setView("list");
        setTimeout(() => addRef.current?.focus(), 0);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") setPicked(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  /* ── data ────────────────────────────────────────────────────────────────────────────────── */
  const counts = useMemo(() => {
    const c = {} as Record<SmartList, number>;
    LISTS.forEach(({ key }) => {
      c[key] = tasks.filter((t) => matchesList(t, key)).length + meetings.filter((m) => matchesMeeting(m, key)).length;
    });
    return c;
  }, [tasks, meetings]);

  const q = query.trim().toLowerCase();
  const passes = (t: Task) => (!tag || t.tags.includes(tag)) && (!noProject || !t.projectId) && (!q || t.title.toLowerCase().includes(q));

  const items: Item[] = useMemo(() => {
    const ts: Item[] = tasks
      .filter((t) => matchesList(t, list) && passes(t))
      .map((t) => ({ key: `t-${t.id}`, due: t.dueDate, priority: t.priority, done: t.done, completedAt: t.completedAt, task: t }));
    const ms: Item[] = meetings
      .filter((m) => matchesMeeting(m, list) && (!tag || (m.tags ?? []).includes(tag)) && (!q || m.title.toLowerCase().includes(q)))
      .map((m) => ({ key: `m-${m.id}`, due: m.date, priority: m.priority ?? 0, done: !!m.done, completedAt: m.completedAt, meeting: m }));
    const all = [...ts, ...ms];
    const byDate = (a: Item, b: Item) => (a.due ?? "￿").localeCompare(b.due ?? "￿");
    const byPrio = (a: Item, b: Item) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
    if (list === "done") return all.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return all.sort(sortBy === "date" ? (a, b) => byDate(a, b) || byPrio(a, b) : (a, b) => byPrio(a, b) || byDate(a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, meetings, list, tag, noProject, q, sortBy]);

  const blockedTitle = (t: Task) => {
    if (t.done) return undefined;
    const b = blockingTasks(t, tasks);
    return b.length ? b[0].title : undefined;
  };

  /* ── kanban ──────────────────────────────────────────────────────────────────────────────── */
  const days = useMemo(() => weekDays(weekOffset, settings.weekStartsMonday), [weekOffset, settings.weekStartsMonday]);
  const cols: BoardCol[] =
    mode === "week"
      ? [
          ...days.map((d) => ({
            key: d.date,
            label: d.label,
            sub: d.short,
            today: d.isToday,
            match: (t: Task) => !t.done && weekColumnOf(t, days) === d.date,
            onDrop: (id: string) => updateTask(id, { dueDate: d.date, done: false }),
          })),
          {
            key: BACKLOG_KEY,
            label: "Бэклог",
            sub: "без срока",
            match: (t: Task) => !t.done && !t.dueDate,
            onDrop: (id: string) => updateTask(id, { dueDate: undefined, done: false }),
          },
        ]
      : ([1, 2, 3, 0] as Task["priority"][]).map((p) => ({
          key: `p${p}`,
          label: p === 0 ? "Бэклог" : PRIORITY_META[p].label,
          bars: p === 0 ? undefined : ({ 1: 3, 2: 2, 3: 1 } as Record<number, number>)[p],
          match: (t: Task) => !t.done && t.priority === p,
          onDrop: (id: string) => updateTask(id, { priority: p }),
        }));
  const boardBase = tasks.filter((t) => !isSnoozed(t) && passes(t));
  const itemsByColumn: Record<string, Task[]> = {};
  cols.forEach((c) => (itemsByColumn[c.key] = sortByPriority(boardBase.filter(c.match))));

  function moveTo(id: string, toKey: string, beforeId: string | null) {
    const col = cols.find((c) => c.key === toKey);
    const task = tasks.find((t) => t.id === id);
    if (!col || !task) return;
    if (!col.match(task)) col.onDrop(id);
    reorderTasks(placeInColumn(tasks, id, (itemsByColumn[toKey] ?? []).map((t) => t.id), beforeId));
  }
  function moveDir(task: Task, dir: -1 | 1) {
    const from = cols.findIndex((c) => c.match(task));
    const to = from + dir;
    if (from === -1 || to < 0 || to >= cols.length) return;
    cols[to].onDrop(task.id);
    toast(`«${task.title}» → ${cols[to].label}`);
  }

  /* ── bulk ────────────────────────────────────────────────────────────────────────────────── */
  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const bulk = {
    done: () => {
      const ids = [...picked].filter((id) => tasks.find((t) => t.id === id && !t.done));
      ids.forEach((id) => toggleTask(id));
      toast(`Завершено: ${ids.length}`);
      setPicked(new Set());
    },
    today: () => {
      picked.forEach((id) => updateTask(id, { dueDate: inDays(0) }));
      setPicked(new Set());
    },
    archive: () => {
      const ids = [...picked];
      ids.forEach((id) => archiveTask(id));
      const run = pushUndo(`В архив: ${ids.length}`, () => ids.forEach((id) => unarchiveTask(id)));
      toast(`В архив: ${ids.length}`, { actionLabel: "Вернуть", onAction: run });
      setPicked(new Set());
    },
    remove: () => {
      const snap = tasks.filter((t) => picked.has(t.id));
      snap.forEach((t) => deleteTask(t.id));
      const run = pushUndo(`Удалено задач: ${snap.length}`, () => snap.forEach((t) => restoreTask(t)));
      toast(`Удалено: ${snap.length}`, { actionLabel: "Вернуть", onAction: run });
      setPicked(new Set());
    },
  };

  /* ── render helpers ──────────────────────────────────────────────────────────────────────── */
  let n = 0;
  const row = (it: Item) => {
    n += 1;
    if (it.meeting) return <MeetingRow key={it.key} m={it.meeting} n={n} />;
    const t = it.task!;
    return (
      <TaskRow
        key={it.key}
        task={t}
        n={n}
        projectName={byProject ? undefined : projectName(t.projectId)}
        blockedBy={blockedTitle(t)}
        active={t.id === openId}
        picked={picked.has(t.id)}
        projects={projects}
        act={act}
        onPick={() => togglePick(t.id)}
      />
    );
  };

  function renderList() {
    if (tasks.length === 0 && meetings.length === 0)
      return (
        <div className="mt-10 max-w-[360px]">
          <Empty title="Задач пока нет" text="Пишите срок словами — «завтра», «в пятницу» — он распознается сам." seed={9} />
        </div>
      );
    if (items.length === 0)
      return (
        <div className="mt-10 max-w-[360px]">
          <Empty
            title={q || tag || noProject ? "Ничего не нашлось" : `«${LABEL[list]}» — пусто`}
            text={q || tag || noProject ? "Снимите фильтр или поиск." : list === "overdue" ? "Ни одной просрочки. Так держать." : "Добавьте задачу строкой выше."}
            seed={list === "overdue" ? 3 : 9}
          />
        </div>
      );
    if (!byProject) return <ol>{items.map(row)}</ol>;

    const loose = items.filter((it) => it.meeting || !it.task!.projectId);
    const groups = projects
      .map((p) => ({ p, rows: items.filter((it) => it.task?.projectId === p.id) }))
      .filter((g) => g.rows.length > 0);
    const fold = (k: string) =>
      setFolded((s) => {
        const x = new Set(s);
        x.has(k) ? x.delete(k) : x.add(k);
        return x;
      });
    return (
      <div>
        {loose.length > 0 && (
          <>
            <GroupHead title="Без проекта" count={loose.length} open={!folded.has("_")} onToggle={() => fold("_")} />
            {!folded.has("_") && <ol>{loose.map(row)}</ol>}
          </>
        )}
        {groups.map(({ p, rows }) => {
          const done = rows.filter((r) => r.done).length;
          return (
            <div key={p.id}>
              <GroupHead
                title={p.name}
                count={list === "done" ? rows.length : `${rows.length} ${plural(rows.length, "задача", "задачи", "задач")}${done ? ` · ${done} готово` : ""}`}
                to={`/projects/${p.id}`}
                open={!folded.has(p.id)}
                onToggle={() => fold(p.id)}
              />
              {!folded.has(p.id) && <ol>{rows.map(row)}</ol>}
            </div>
          );
        })}
      </div>
    );
  }

  const open = counts.all;
  const filtersOn = !!tag || noProject;

  return (
    <Page>
      <PageHeader
        title="Задачи"
        deck={
          <>
            {open} {plural(open, "открытая", "открытые", "открытых")}
            {counts.overdue ? <>, {counts.overdue} с просрочкой</> : null}
            {counts.today ? <>, {counts.today} на сегодня</> : <>, на сегодня — пусто</>}.
          </>
        }
        graphic="topo"
        seed={6}
        size={80}
        actions={
          <Button
            size="lg"
            onClick={() => {
              setView("list");
              setTimeout(() => addRef.current?.focus(), 0);
            }}
          >
            Новая задача
          </Button>
        }
      />

      {/* ── Smart lists as an index strip ───────────────────────────────────────────────────── */}
      <section
        className="grid grid-cols-4"
        style={{ borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l10}` }}
        aria-label="Списки"
      >
        {LISTS.slice(0, 4).map((l, i) => {
          const on = view === "list" && list === l.key;
          const hot = l.key === "overdue" && counts.overdue > 0;
          return (
            <button
              key={l.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setList(l.key);
                setView("list");
              }}
              className="group min-w-0 pb-6 pt-5 text-left outline-none transition-colors duration-200 hover:bg-white/[0.015] focus-visible:bg-white/[0.03]"
              style={{ borderLeft: i ? `1px solid ${B.l7}` : undefined, paddingLeft: i ? 20 : 0, paddingRight: 20 }}
            >
              <span className="flex items-center justify-between" style={{ ...T.meta, color: on ? B.text : B.text3 }}>
                <span className="flex items-center gap-2">
                  {on && <Bullet size={6} color={B.text} />}
                  {l.label}
                </span>
                <span style={{ ...T.num, color: B.off }}>{i + 1}</span>
              </span>
              <span
                className="mt-6 block transition-colors duration-200 group-hover:text-white"
                style={{ ...T.displayL, ...tab, color: on ? B.text : hot ? B.danger : B.text3 }}
              >
                {counts[l.key]}
              </span>
            </button>
          );
        })}
      </section>

      {/* ── View + tools ────────────────────────────────────────────────────────────────────── */}
      <div className="mt-14 grid grid-cols-4 items-end gap-x-5">
        <div className="min-w-0">
          <NumTabs
            items={[
              { id: "list", label: "Список" },
              { id: "kanban", label: "Канбан" },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        <div className="col-span-3 flex min-w-0 items-center justify-end gap-6">
          {LISTS.slice(4).map((l, i) => {
            const on = view === "list" && list === l.key;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setList(l.key);
                  setView("list");
                }}
                className="flex items-center gap-2 outline-none transition-colors hover:!text-white focus-visible:underline"
                style={{ ...T.body, color: on ? B.text : B.text3 }}
              >
                {on && <Bullet size={6} color={B.text} />}
                {l.label}
                <span style={{ ...T.num, color: on ? B.text2 : B.off }}>{counts[l.key]}</span>
                <span className="sr-only">клавиша {i + 5}</span>
              </button>
            );
          })}
          <label className="flex h-9 w-[240px] items-center gap-2.5" style={{ borderBottom: `1px solid ${query ? B.l40 : B.l20}` }}>
            <Search size={14} strokeWidth={1.25} color={B.text3} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setQuery(""), (e.target as HTMLInputElement).blur())}
              placeholder="Поиск"
              aria-label="Поиск по задачам"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7F7F7F]"
              style={{ ...T.body, color: B.text }}
            />
            {query ? (
              <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")} style={{ color: B.text3 }}>
                <Sparkle size={10} open />
              </button>
            ) : (
              <span className="px-1.5 py-0.5" style={{ ...T.caps, color: B.text3, background: B.s4 }}>
                /
              </span>
            )}
          </label>
          <button
            type="button"
            data-float-trigger
            aria-label="Фильтры, сортировка, виды"
            title="Фильтры, сортировка, виды"
            onClick={(e) => pageMenu.toggle(e.currentTarget, "right")}
            className="relative flex h-9 w-9 items-center justify-center outline-none transition-colors hover:bg-[#101010] hover:text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
            style={{ color: filtersOn ? B.text : B.text3 }}
          >
            <Dots />
            {filtersOn && <span className="absolute right-1.5 top-1.5 h-[5px] w-[5px]" style={{ background: B.text }} />}
          </button>
        </div>
      </div>

      {/* ── Section ─────────────────────────────────────────────────────────────────────────── */}
      <section className="mt-14">
        <SectionHead
          n={view === "list" ? "01" : "02"}
          title={view === "list" ? LABEL[list] : mode === "week" ? `Неделя · ${weekRangeLabel(days)}` : "Доска · приоритеты"}
          meta={
            view === "list" ? (
              <span className="flex items-center gap-4">
                <ActiveFilters tag={tag} noProject={noProject} onTag={() => setTag(null)} onNoProject={() => setNoProject(false)} />
                <span>
                  {items.length} {plural(items.length, "запись", "записи", "записей")}
                  {list !== "done" && ` · ${sortBy === "date" ? "по сроку" : "по приоритету"}`}
                  {byProject && " · по проектам"}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-5">
                <ActiveFilters tag={tag} noProject={noProject} onTag={() => setTag(null)} onNoProject={() => setNoProject(false)} />
                {mode === "week" && (
                  <span className="flex items-center gap-3">
                    <TextBtn onClick={() => setWeekOffset((w) => w - 1)} label="Предыдущая неделя">
                      ←
                    </TextBtn>
                    {weekOffset !== 0 && <TextBtn onClick={() => setWeekOffset(0)}>Эта неделя</TextBtn>}
                    <TextBtn onClick={() => setWeekOffset((w) => w + 1)} label="Следующая неделя">
                      →
                    </TextBtn>
                    <span className="h-3 w-px" style={{ background: B.l20 }} />
                  </span>
                )}
                <span className="flex items-center gap-3">
                  <TextBtn on={mode === "priority"} onClick={() => setMode("priority")}>
                    Приоритет
                  </TextBtn>
                  <TextBtn on={mode === "week"} onClick={() => setMode("week")}>
                    Неделя
                  </TextBtn>
                </span>
              </span>
            )
          }
        />

        {view === "list" ? (
          <div className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
            {list !== "done" && list !== "snoozed" && <AddBar inputRef={addRef} projects={projects} onAdd={(raw) => add(raw)} />}
            {renderList()}
          </div>
        ) : (
          <div className="mt-8">
            <Board
              cols={cols}
              itemsByColumn={itemsByColumn}
              projectName={projectName}
              activeId={openId}
              showSignal={mode === "week"}
              act={act}
              onMove={moveTo}
              onMoveDir={moveDir}
              onAdd={(col, raw) => {
                const id = add(raw);
                if (id) col.onDrop(id);
              }}
            />
          </div>
        )}
      </section>

      {/* ── «⋯» page menu: filters · sort · grouping · saved views · archive ─────────────────── */}
      {pageMenu.at && (
        <FloatMenu at={pageMenu.at} onClose={pageMenu.close} width={272}>
          <MenuLabel>Фильтр</MenuLabel>
          {FIXED_TAGS.map((tg) => (
            <MenuItem key={tg} keepOpen checked={tag === tg} onSelect={() => setTag(tag === tg ? null : tg)}>
              #{tg}
            </MenuItem>
          ))}
          <MenuItem keepOpen checked={noProject} onSelect={() => setNoProject((v) => !v)}>
            Только без проекта
          </MenuItem>
          {view === "list" && (
            <>
              <MenuSep />
              <MenuLabel>Список</MenuLabel>
              <MenuItem keepOpen checked={sortBy === "date"} onSelect={() => setSortBy("date")}>
                По сроку
              </MenuItem>
              <MenuItem keepOpen checked={sortBy === "priority"} onSelect={() => setSortBy("priority")}>
                По приоритету
              </MenuItem>
              <MenuItem keepOpen checked={byProject} onSelect={() => setByProject((v) => !v)}>
                Группировать по проектам
              </MenuItem>
            </>
          )}
          <MenuSep />
          <MenuLabel>Виды</MenuLabel>
          {settings.savedViews.map((v) => (
            <SavedViewItem
              key={v.id}
              name={v.name}
              onApply={() => {
                setList(v.list as SmartList);
                setTag(v.tag);
                setQuery(v.query);
                setView("list");
              }}
              onDelete={() => deleteSavedView(v.id)}
            />
          ))}
          {savingView ? (
            <form
              className="px-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!viewName.trim()) return;
                addSavedView({ name: viewName.trim(), list, tag, query: query.trim() });
                toast("Вид сохранён");
                setViewName("");
                setSavingView(false);
              }}
            >
              <input
                autoFocus
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="Название — Enter"
                className="h-9 w-full bg-transparent px-3 outline-none focus:shadow-[inset_0_0_0_1px_#ADFB0C]"
                style={{ ...T.body, color: B.text, boxShadow: `inset 0 0 0 1px ${B.l20}` }}
              />
            </form>
          ) : (
            <MenuItem keepOpen onSelect={() => setSavingView(true)}>
              Сохранить текущий вид…
            </MenuItem>
          )}
          <MenuSep />
          <MenuItem
            onSelect={() => {
              const k = archiveDoneTasks();
              toast(k ? `В архив: ${k}` : "Нечего архивировать");
            }}
            hint={counts.done || undefined}
          >
            Архивировать завершённые
          </MenuItem>
        </FloatMenu>
      )}

      {picked.size > 0 && (
        <BulkDock count={picked.size} onDone={bulk.done} onToday={bulk.today} onArchive={bulk.archive} onDelete={bulk.remove} onClear={() => setPicked(new Set())} />
      )}
    </Page>
  );
}

/* ── small local bits ──────────────────────────────────────────────────────────────────────── */

function TextBtn({ children, onClick, on, label }: { children: ReactNode; onClick: () => void; on?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className="outline-none transition-colors hover:!text-white focus-visible:underline"
      style={{ ...T.meta, color: on ? B.text : B.text3 }}
    >
      {children}
    </button>
  );
}

function ActiveFilters({ tag, noProject, onTag, onNoProject }: { tag: string | null; noProject: boolean; onTag: () => void; onNoProject: () => void }) {
  const chip = (label: string, fn: () => void) => (
    <button
      type="button"
      onClick={fn}
      aria-label={`Снять фильтр ${label}`}
      className="inline-flex h-[22px] items-center gap-2 px-2 transition-colors hover:text-white"
      style={{ ...T.meta, color: B.text2, boxShadow: `inset 0 0 0 1px ${B.l20}` }}
    >
      {label}
      <Sparkle size={8} open />
    </button>
  );
  if (!tag && !noProject) return null;
  return (
    <span className="flex items-center gap-1.5">
      {tag && chip(`#${tag}`, onTag)}
      {noProject && chip("без проекта", onNoProject)}
    </span>
  );
}

function SavedViewItem({ name, onApply, onDelete }: { name: string; onApply: () => void; onDelete: () => void }) {
  return (
    <div className="group flex items-center">
      <div className="min-w-0 flex-1">
        <MenuItem onSelect={onApply}>{name}</MenuItem>
      </div>
      <button
        type="button"
        aria-label={`Удалить вид: ${name}`}
        onClick={onDelete}
        className="mr-2 flex h-7 w-7 items-center justify-center opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
        style={{ color: B.text3 }}
      >
        <Sparkle size={10} open />
      </button>
    </div>
  );
}
