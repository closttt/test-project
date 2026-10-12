/**
 * «Индекс» · command palette (⌘K / Ctrl+K, «/»). Parity with src/components/CommandPalette.tsx:
 * recent items, a natural-language «create task» line, actions, navigation (incl. the Index-only
 * routes), projects / clients / tasks / notes / library / meetings search, «выполнить» actions and
 * the nested per-task action list (priority, due date, open card).
 *
 * Editorial take: one big input, numbered groups, hairline rows, a lime bar marks the row Enter will
 * run, key hints in the foot. No icons — numbers and a few glyphs do the work.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { usePomodoro } from "@/store/PomodoroProvider";
import { getRecent, type RecentItem } from "@/lib/recent";
import { addDays, dueLabel, formatDuration, isOverdue, isToday, todayStr } from "@/lib/format";
import { blockingTasks } from "@/lib/dependencies";
import { fetchLibrary, LIBRARY_TYPES, type LibraryItem } from "@/lib/library";
import { PRIORITY_META, type Priority, type Task } from "@/types";
import { B, T, tab, pad2, Signal, ThinCheck, PRIORITY_BARS, Pixel, PIX } from "@/design-lab/screens/_kit/index";
import { Modal, parseQuick, useTaskPanel } from "@/design-lab/screens/_kit/index-ui";
import { DESTS } from "./routes";
import { Kbd, Keys, MOD, GroupHead, openShortcuts } from "./ui";

interface Item {
  key: string;
  label: ReactNode;
  /** Lower-cased search haystack. */
  hay: string;
  lead?: ReactNode;
  meta?: ReactNode;
  hint?: ReactNode;
  struck?: boolean;
  run: () => void;
  /** Present on task rows — enables «→ действия». */
  task?: Task;
}
interface Group {
  id: string;
  label: string;
  items: Item[];
  /** Matches before the cap (shown as «12 из 40»). */
  total?: number;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const tokensOf = (q: string) => norm(q).split(/\s+/).filter(Boolean);
const hits = (hay: string, tokens: string[]) => tokens.every((t) => hay.includes(t));

/** Cap a group: everything when searching (up to `max`), a short head when idle. */
function capped(items: Item[], tokens: string[], idle: number, max = 24): { items: Item[]; total: number } {
  const list = tokens.length ? items.filter((i) => hits(i.hay, tokens)) : items;
  const n = tokens.length ? max : idle;
  return { items: list.slice(0, n), total: list.length };
}

function TaskLead({ done }: { done: boolean }) {
  return (
    <span className="flex h-3 w-3 items-center justify-center" style={{ boxShadow: `inset 0 0 0 1px ${done ? B.text3 : B.l25}` }}>
      {done && <ThinCheck size={8} color={B.text2} />}
    </span>
  );
}

export function CommandPalette() {
  const navigate = useNavigate();
  const { projects, tasks, notes, clients, meetings, toggleTask, updateTask, addTask } = useData();
  const { commandOpen, setCommandOpen, setQuickAddOpen, setQuickNoteOpen, setAssistantOpen } = useUI();
  const { toast } = useToast();
  const pomodoro = usePomodoro();
  const panel = useTaskPanel();

  const [q, setQ] = useState("");
  const [taskMode, setTaskMode] = useState<Task | null>(null);
  const [active, setActive] = useState(0);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // «Библиотека» lives outside AppData — one cheap read whenever the palette opens (same as the real one).
  useEffect(() => {
    if (!commandOpen) return;
    fetchLibrary()
      .then(setLibrary)
      .catch(() => fetchLibrary().then(setLibrary).catch(() => {}));
  }, [commandOpen]);

  // A closed-then-reopened palette always starts at plain search.
  useEffect(() => {
    if (!commandOpen) {
      setTaskMode(null);
      setQ("");
    }
  }, [commandOpen]);

  const recent: RecentItem[] = useMemo(() => (commandOpen ? getRecent() : []), [commandOpen]);

  const close = () => setCommandOpen(false);
  const go = (to: string, state?: Record<string, unknown>) => {
    close();
    navigate(to, state ? { state } : undefined);
  };
  const openTask = (id: string) => {
    close();
    panel.open(id);
  };
  const drill = (t: Task) => {
    setQ("");
    setTaskMode(t);
    inputRef.current?.focus();
  };

  const projectName = (id?: string) => (id ? projects.find((p) => p.id === id)?.name : undefined);

  /* ── NL «create» line (parsed live, @проект resolves like the Tasks add bar) ─────────────────── */
  const nl = q.trim() && !taskMode ? parseQuick(q, projects) : null;
  const nlTitle = nl?.title.trim() ?? "";
  function createFromQuery() {
    if (!nl || !nlTitle) return;
    addTask({
      title: nlTitle,
      done: false,
      projectId: nl.projectId,
      dueDate: nl.dueDate,
      tags: nl.tags,
      important: nl.important,
      remindAt: nl.remindAt,
      estimateMin: nl.estimateMin,
      recurrence: nl.recurrence,
    });
    toast(`Задача создана: ${nlTitle}`);
    close();
  }

  /* ── groups ─────────────────────────────────────────────────────────────────────────────── */
  const tokens = tokensOf(q);
  const groups: Group[] = useMemo(() => {
    if (taskMode) {
      const t = taskMode;
      const apply = (patch: Partial<Task>, note: string) => {
        updateTask(t.id, patch);
        toast(note);
        close();
      };
      const g: Group[] = [
        {
          id: "task",
          label: t.title,
          items: [
            { key: "back", label: "Назад к поиску", hay: "назад back", hint: <Kbd>⌫</Kbd>, run: () => setTaskMode(null) },
            { key: "open", label: "Открыть карточку", hay: "открыть карточка open", hint: <Kbd>↵</Kbd>, run: () => openTask(t.id) },
          ],
        },
        {
          id: "prio",
          label: "Приоритет",
          items: ([1, 2, 3, 0] as Priority[]).map((p) => ({
            key: `p${p}`,
            label: PRIORITY_META[p].label,
            hay: norm(`приоритет ${PRIORITY_META[p].label}`),
            lead: <Signal value={PRIORITY_BARS[p]} on={B.text2} off={B.l15} w={3} h={9} />,
            meta: t.priority === p ? "сейчас" : undefined,
            run: () => apply({ priority: p }, `Приоритет: ${PRIORITY_META[p].label}`),
          })),
        },
        {
          id: "due",
          label: "Срок",
          items: [
            { key: "d0", label: "Сегодня", hay: "срок сегодня", run: () => apply({ dueDate: todayStr() }, "Срок: сегодня") },
            { key: "d1", label: "Завтра", hay: "срок завтра", run: () => apply({ dueDate: addDays(new Date(), 1) }, "Срок: завтра") },
            { key: "d7", label: "Через неделю", hay: "срок неделя через неделю", run: () => apply({ dueDate: addDays(new Date(), 7) }, "Срок: через неделю") },
            { key: "dx", label: "Без срока", hay: "без срока снять", run: () => apply({ dueDate: undefined }, "Срок снят") },
          ].map((i) => ({ ...i, meta: i.key === "dx" ? (t.dueDate ? `сейчас ${dueLabel(t.dueDate)}` : undefined) : undefined })),
        },
      ];
      return g.map((gr) => ({ ...gr, items: tokens.length ? gr.items.filter((i) => hits(i.hay, tokens)) : gr.items })).filter((gr) => gr.items.length);
    }

    const out: Group[] = [];

    if (nlTitle) {
      const bits = [
        nl?.dueDate && dueLabel(nl.dueDate),
        nl?.remindAt && `в ${nl.remindAt.slice(11, 16)}`,
        nl?.estimateMin && `≈ ${formatDuration(nl.estimateMin)}`,
        nl?.important && "!важно",
        nl?.projectName && `@${nl.projectName}`,
        ...(nl?.tags ?? []).map((x) => `#${x}`),
      ].filter(Boolean);
      out.push({
        id: "create",
        label: "Создать",
        items: [
          {
            key: "create",
            label: (
              <>
                Новая задача <span style={{ color: B.text }}>«{nlTitle}»</span>
              </>
            ),
            hay: "",
            meta: bits.join(" · ") || undefined,
            hint: <Keys keys={[MOD, "↵"]} />,
            run: createFromQuery,
          },
        ],
      });
    }

    const rec = recent.map<Item>((r) => ({
      key: `r-${r.id}`,
      label: r.label,
      hay: norm(`недавнее recent ${r.label}`),
      run: () => {
        const tid = (r.state as { openTaskId?: string } | undefined)?.openTaskId;
        if (tid) openTask(tid);
        else go(r.to, r.state);
      },
    }));
    const recG = capped(rec, tokens, 6, 6);
    if (recG.items.length) out.push({ id: "recent", label: "Недавнее", ...recG });

    const actions: Item[] = [
      { key: "a-task", label: "Новая задача", hay: "новая задача добавить task", hint: <Kbd>N</Kbd>, run: () => (close(), setQuickAddOpen(true)) },
      { key: "a-note", label: "Быстрая заметка", hay: "быстрая заметка note", hint: <Kbd>Q</Kbd>, run: () => (close(), setQuickNoteOpen(true)) },
      { key: "a-focus", label: "Фокус на сегодня", hay: "фокус сегодня focus", hint: <Keys keys={["G", "F"]} then />, run: () => go("/focus") },
      { key: "a-ai", label: "AI-ассистент", hay: "ai ассистент чат ии assistant", hint: <Kbd>A</Kbd>, run: () => (close(), setAssistantOpen(true)) },
      {
        key: "a-pomo",
        label: pomodoro.phase === "idle" ? "Запустить помодоро" : "Остановить помодоро",
        hay: "помодоро pomodoro таймер фокус",
        run: () => {
          close();
          if (pomodoro.phase === "idle") pomodoro.start();
          else pomodoro.reset();
        },
      },
      { key: "a-keys", label: "Горячие клавиши", hay: "горячие клавиши shortcuts хоткеи", hint: <Kbd>?</Kbd>, run: () => (close(), openShortcuts()) },
    ];
    const actG = capped(actions, tokens, 99);
    if (actG.items.length) out.push({ id: "actions", label: "Действия", ...actG });

    const nav = DESTS.filter((d) => d.to !== "/focus").map<Item>((d) => ({
      key: `n-${d.to}`,
      label: d.label,
      hay: norm(`перейти nav ${d.label}`),
      hint: d.g ? <Keys keys={["G", d.g.toUpperCase()]} then /> : undefined,
      run: () => go(d.to),
    }));
    const navG = capped(nav, tokens, 99);
    if (navG.items.length) out.push({ id: "nav", label: "Навигация", ...navG });

    const proj = projects.map<Item>((p) => ({
      key: `p-${p.id}`,
      label: p.name,
      hay: norm(`проект project ${p.name}`),
      meta: tasks.filter((t) => t.projectId === p.id && !t.done).length || undefined,
      run: () => go(`/projects/${p.id}`),
    }));
    const projG = capped(proj, tokens, 6);
    if (projG.items.length) out.push({ id: "projects", label: "Проекты", ...projG });

    const cl = clients.map<Item>((c) => ({
      key: `c-${c.id}`,
      label: c.name,
      hay: norm(`клиент client ${c.name} ${c.company ?? ""} ${c.tags.join(" ")}`),
      meta: c.company,
      run: () => go("/clients", { openClientId: c.id }),
    }));
    const clG = capped(cl, tokens, 6);
    if (clG.items.length) out.push({ id: "clients", label: "Клиенты", ...clG });

    const tk = tasks.map<Item>((t) => ({
      key: `t-${t.id}`,
      label: t.title,
      hay: norm(`задача task ${t.title} ${t.description ?? ""} ${t.tags.join(" ")}`),
      lead: <TaskLead done={t.done} />,
      struck: t.done,
      meta: (
        <>
          {projectName(t.projectId)}
          {projectName(t.projectId) && t.dueDate ? " · " : ""}
          {t.dueDate && <span style={{ color: !t.done && isOverdue(t.dueDate) ? B.danger : undefined }}>{dueLabel(t.dueDate)}</span>}
        </>
      ),
      task: t,
      run: () => openTask(t.id),
    }));
    const tkG = capped(tk, tokens, 8);
    if (tkG.items.length) out.push({ id: "tasks", label: "Задачи", ...tkG });

    if (tokens.length) {
      const doable = tasks
        .filter((t) => !t.done)
        .map<Item>((t) => ({
          key: `x-${t.id}`,
          label: (
            <>
              <span style={{ color: B.text3 }}>Выполнить:</span> {t.title}
            </>
          ),
          hay: norm(`выполнить сделать закрыть done ${t.title} ${t.tags.join(" ")}`),
          lead: <ThinCheck size={10} color={B.text3} />,
          run: () => {
            const blockers = blockingTasks(t, tasks);
            if (blockers.length) toast(`Заблокировано — сначала закройте «${blockers[0].title}»`);
            else {
              toggleTask(t.id);
              toast(`Выполнено: ${t.title}`);
            }
            close();
          },
        }));
      const dG = capped(doable, tokens, 0, 8);
      if (dG.items.length) out.push({ id: "done", label: "Действия над задачей", ...dG });
    }

    const nt = notes.map<Item>((n) => ({
      key: `no-${n.id}`,
      label: n.title || "Без названия",
      hay: norm(`заметка note ${n.title} ${n.body.slice(0, 140)} ${n.tags.join(" ")}`),
      run: () => go("/notes", { openNoteId: n.id }),
    }));
    const ntG = capped(nt, tokens, 6);
    if (ntG.items.length) out.push({ id: "notes", label: "Заметки", ...ntG });

    const lib = library.map<Item>((i) => ({
      key: `l-${i.id}`,
      label: i.title,
      hay: norm(`библиотека library ${i.title} ${i.author ?? ""} ${i.tags.join(" ")} ${i.notes.slice(0, 120)}`),
      meta: LIBRARY_TYPES[i.type]?.label,
      run: () => go("/knowledge", { tab: "library", openLibraryId: i.id }),
    }));
    const libG = capped(lib, tokens, 6);
    if (libG.items.length) out.push({ id: "library", label: "Библиотека", ...libG });

    const mt = (tokens.length ? meetings : meetings.filter((m) => !m.done)).map<Item>((m) => ({
      key: `m-${m.id}`,
      label: m.title,
      hay: norm(`встреча meeting ${m.title}`),
      struck: m.done,
      meta: `${isToday(m.date) ? "сегодня" : m.date}${m.time ? ` · ${m.time}` : ""}`,
      run: () => go("/"),
    }));
    const mtG = capped(mt, tokens, 6);
    if (mtG.items.length) out.push({ id: "meetings", label: "Встречи", ...mtG });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskMode, q, recent, projects, clients, tasks, notes, library, meetings, pomodoro.phase, nlTitle]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  // Enter runs the best real hit; the «create» line is only the default when nothing else matched.
  const firstReal = groups[0]?.id === "create" && flat.length > 1 ? 1 : 0;

  useEffect(() => setActive(firstReal), [q, taskMode, firstReal]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const current = flat[active];

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && nlTitle) createFromQuery();
      else current?.run();
    } else if ((e.key === "Tab" || e.key === "ArrowRight") && current?.task) {
      const el = e.currentTarget;
      if (e.key === "ArrowRight" && el.selectionStart !== el.value.length) return;
      e.preventDefault();
      drill(current.task);
    } else if (e.key === "Tab") {
      e.preventDefault();
    } else if (e.key === "Backspace" && taskMode && !q) {
      e.preventDefault();
      setTaskMode(null);
    }
  }

  let idx = -1;
  return (
    <Modal
      open={commandOpen}
      onClose={close}
      width={760}
      top="11vh"
      footer={
        <div className="flex h-11 items-center gap-5 px-5" style={{ ...T.meta, color: B.text3 }}>
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> выбрать
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> {taskMode ? "применить" : "открыть"}
          </span>
          {!taskMode && (
            <span className="flex items-center gap-1.5">
              <Kbd>→</Kbd> действия с задачей
            </span>
          )}
          {taskMode && (
            <span className="flex items-center gap-1.5">
              <Kbd>⌫</Kbd> назад
            </span>
          )}
          {!taskMode && (
            <span className="flex items-center gap-1.5">
              <Keys keys={[MOD, "↵"]} /> создать задачу
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd> закрыть
          </span>
        </div>
      }
    >
      {/* Input */}
      <div className="flex h-[72px] items-center gap-4 px-5" style={{ borderBottom: `1px solid ${B.l10}` }}>
        {taskMode ? (
          <button type="button" onClick={() => setTaskMode(null)} className="shrink-0 hover:text-white" style={{ ...T.meta, color: B.text3 }} title="Назад к поиску">
            ←
          </button>
        ) : (
          <span className="shrink-0" style={{ color: B.text3 }}>
            <Pixel map={PIX.search} px={2} />
          </span>
        )}
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={taskMode ? `Действие для «${taskMode.title}»…` : "Поиск, команда или новая задача…"}
          aria-label="Командная палитра"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
          style={{ ...T.displayS, fontSize: 26, color: B.text, fontFamily: B.font }}
        />
        <Kbd>{MOD} K</Kbd>
      </div>

      {/* Results */}
      <div ref={listRef} className="overflow-y-auto pb-3" style={{ maxHeight: "calc(70vh - 118px)" }} role="listbox">
        {flat.length === 0 && (
          <div className="px-5 py-10" style={{ ...T.body, color: B.text3 }}>
            Ничего не найдено. <span style={{ color: B.off }}>Наберите задачу целиком — «созвон завтра в 15:00 !важно».</span>
          </div>
        )}
        {groups.map((g, gi) => (
          <div key={g.id}>
            <GroupHead
              n={pad2(gi + 1)}
              label={g.id === "task" ? "Задача" : g.label}
              meta={g.total !== undefined && g.total > g.items.length ? `${g.items.length} из ${g.total}` : g.id === "task" ? undefined : g.items.length}
            />
            {g.id === "task" && (
              <div className="truncate px-5 pb-3" style={{ ...T.title, color: B.text }}>
                {g.label}
              </div>
            )}
            <div style={{ borderTop: `1px solid ${B.l7}` }}>
              {g.items.map((it, i) => {
                idx += 1;
                const my = idx;
                const on = my === active;
                return (
                  <div
                    key={it.key}
                    data-idx={my}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => active !== my && setActive(my)}
                    onClick={() => it.run()}
                    className="group relative grid h-10 cursor-pointer items-center gap-3 px-5"
                    style={{
                      gridTemplateColumns: "20px 14px minmax(0,1fr) auto auto",
                      background: on ? B.s1 : "transparent",
                      borderBottom: `1px solid ${B.l5}`,
                    }}
                  >
                    {on && <span className="absolute inset-y-[9px] left-0 w-[2px]" style={{ background: B.lime }} />}
                    <span style={{ ...T.num, fontSize: 11, color: B.off }}>{pad2(i + 1)}</span>
                    <span className="flex items-center justify-center">{it.lead}</span>
                    <span
                      className="truncate"
                      style={{
                        ...T.body,
                        color: it.struck ? B.text4 : on ? B.text : B.text2,
                        textDecoration: it.struck ? "line-through" : undefined,
                        textDecorationColor: B.text3,
                      }}
                    >
                      {it.label}
                    </span>
                    <span className="max-w-[220px] truncate text-right" style={{ ...T.meta, color: B.text3, ...tab }}>
                      {it.meta}
                    </span>
                    <span className="flex items-center justify-end gap-1">
                      {it.task ? (
                        <button
                          type="button"
                          aria-label={`Действия: ${it.task.title}`}
                          title="Приоритет, срок…  (→)"
                          onClick={(e) => {
                            e.stopPropagation();
                            drill(it.task!);
                          }}
                          className={`flex h-6 w-6 items-center justify-center transition-colors duration-150 hover:text-white ${on ? "" : "opacity-0 group-hover:opacity-100"}`}
                          style={{ ...T.body, color: B.text3, boxShadow: `inset 0 0 0 1px ${B.l15}` }}
                        >
                          →
                        </button>
                      ) : (
                        <span className={on ? "" : "opacity-60"}>{it.hint}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
