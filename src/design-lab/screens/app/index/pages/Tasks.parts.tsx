/**
 * «Индекс» · Задачи — local parts: floating menus, list rows, the board, the task «case» panel.
 * Everything acts through the same store calls as src/pages/Tasks.tsx + TaskEditDialog.
 */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";

import { useData } from "@/store/DataProvider";
import { parseNaturalInput } from "@/lib/nlp";
import { addDays, dueLabel, formatDate, formatDuration, isOverdue, isToday, localDayStr } from "@/lib/format";
import { FIXED_TAGS } from "@/lib/tags";
import { isSnoozed } from "@/lib/taskGrouping";
import { blockingTasks } from "@/lib/dependencies";
import { PRIORITY_META, type Meeting, type Priority, type Project, type Recurrence, type Task } from "@/types";
import {
  B,
  T,
  tab,
  pad2,
  Check,
  CtaBar,
  Hook,
  Signal,
  Sparkle,
  ThinCheck,
  DockPlate,
  Tag,
  PRIORITY_BARS,
  hatch,
  plural,
} from "@/design-lab/screens/_kit/index";

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export const inDays = (n: number) => addDays(new Date(), n);

/** Next Monday as YYYY-MM-DD (same rule as the real page's snooze). */
export function nextMonday(): string {
  const d = new Date();
  const diff = (8 - d.getDay()) % 7 || 7;
  return addDays(d, diff);
}

/** Midnight-local Date for YYYY-MM-DD (never `new Date(str)`, which is UTC). */
function fromDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
const dayHint = (s: string) => fromDay(s).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });

export const PRIORITY_ORDER: Priority[] = [1, 2, 3, 0];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Не повторять",
  daily: "Каждый день",
  weekdays: "По будням",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
  "monthly-first-monday": "Первый пн месяца",
};

/** The store calls a row / card / panel can make. Built once in the page. */
export interface TaskActions {
  open: (t: Task) => void;
  toggle: (t: Task) => void;
  setDue: (id: string, date?: string) => void;
  snooze: (id: string, until: string | null) => void;
  setPriority: (id: string, p: Priority) => void;
  setProject: (id: string, projectId?: string) => void;
  toggleTag: (t: Task, tag: string) => void;
  archive: (t: Task) => void;
  remove: (t: Task) => void;
}

/** NLP parse + an «@проект» token resolved against the project list (prefix match, spaces ignored). */
export function parseQuick(raw: string, projects: Project[]) {
  let projectId: string | undefined;
  let projectName: string | undefined;
  const cleaned = raw.replace(/(^|\s)@([\p{L}\p{N}_.-]+)/gu, (m, pre: string, tok: string) => {
    if (projectId) return m;
    const key = tok.toLowerCase();
    const hit = projects.find((p) => p.name.toLowerCase().replace(/\s+/g, "").startsWith(key));
    if (!hit) return m;
    projectId = hit.id;
    projectName = hit.name;
    return pre;
  });
  return { ...parseNaturalInput(cleaned), projectId, projectName };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Floating menu — fixed, flips above its trigger near the bottom edge, one open at a time
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export type Anchor = { x: number; y: number; top: number; align: "left" | "right" };

export function anchorOf(el: HTMLElement, align: "left" | "right" = "right"): Anchor {
  const r = el.getBoundingClientRect();
  return { x: align === "right" ? r.right : r.left, y: r.bottom + 6, top: r.top - 6, align };
}
export function anchorAt(e: { clientX: number; clientY: number }): Anchor {
  return { x: e.clientX, y: e.clientY, top: e.clientY, align: "left" };
}

export function useFloat() {
  const [at, setAt] = useState<Anchor | null>(null);
  return {
    at,
    openAt: (a: Anchor) => setAt(a),
    close: () => setAt(null),
    toggle: (el: HTMLElement, align: "left" | "right" = "right") => setAt((a) => (a ? null : anchorOf(el, align))),
  };
}

let closeCurrent: (() => void) | null = null;
const MenuCtx = createContext<() => void>(() => {});

export function FloatMenu({ at, onClose, width = 248, children }: { at: Anchor; onClose: () => void; width?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const mine = () => closeRef.current();
    if (closeCurrent && closeCurrent !== mine) closeCurrent();
    closeCurrent = mine;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest?.("[data-float-trigger]")) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      if (closeCurrent === mine) closeCurrent = null;
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    let left = at.align === "right" ? at.x - width : at.x;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = at.y;
    if (top + h > window.innerHeight - 8) top = Math.max(8, at.top - h);
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  });

  return (
    <MenuCtx.Provider value={onClose}>
      <div
        ref={ref}
        data-float-menu
        role="menu"
        className="fixed z-[70] max-h-[70vh] overflow-y-auto py-1.5"
        style={{
          width,
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          background: B.bg,
          boxShadow: B.shadowFloat,
          fontFamily: B.font,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </MenuCtx.Provider>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  checked,
  hint,
  keepOpen,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  checked?: boolean;
  hint?: ReactNode;
  keepOpen?: boolean;
}) {
  const close = useContext(MenuCtx);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        if (!keepOpen) close();
      }}
      className="flex h-9 w-full items-center gap-3 px-4 text-left outline-none transition-colors duration-150 hover:bg-[#101010] hover:!text-white focus-visible:bg-[#101010]"
      style={{ ...T.body, color: danger ? B.danger : checked ? B.text : B.text2 }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3 truncate">{children}</span>
      {hint !== undefined && <span style={{ ...T.meta, color: B.text3, ...tab }}>{hint}</span>}
      {checked && <ThinCheck size={12} color={B.text} />}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-1.5 pt-3" style={{ ...T.caps, color: B.off }}>
      {children}
    </div>
  );
}
export const MenuSep = () => <div className="my-1.5 h-px" style={{ background: B.l10 }} />;

const fieldStyle: CSSProperties = {
  ...T.body,
  color: B.text,
  colorScheme: "dark",
  background: "rgba(255,255,255,0.02)",
  boxShadow: `inset 0 0 0 1px ${B.l20}`,
};

/** Срок: quick picks + any date, optional snooze block. */
export function DueMenuBody({
  value,
  onPick,
  snooze,
  remind,
}: {
  value?: string;
  onPick: (d?: string) => void;
  snooze?: { snoozed: boolean; onSnooze: (until: string | null) => void };
  /** Optional reminder field (datetime-local) under the date — same block as the real date menu. */
  remind?: { value?: string; onChange: (v?: string) => void };
}) {
  const picks: [string, string][] = [
    ["Сегодня", inDays(0)],
    ["Завтра", inDays(1)],
    ["Понедельник", nextMonday()],
    ["Через неделю", inDays(7)],
  ];
  return (
    <>
      <MenuLabel>Срок</MenuLabel>
      {picks.map(([label, d]) => (
        <MenuItem key={label} onSelect={() => onPick(d)} hint={dayHint(d)} checked={value === d}>
          {label}
        </MenuItem>
      ))}
      <div className="px-4 py-2">
        <input
          type="date"
          aria-label="Выбрать дату"
          value={value ?? ""}
          onChange={(e) => onPick(e.target.value || undefined)}
          className="h-9 w-full px-3 outline-none focus:!shadow-[inset_0_0_0_1px_#ADFB0C]"
          style={fieldStyle}
        />
      </div>
      {value && <MenuItem onSelect={() => onPick(undefined)}>Убрать срок</MenuItem>}
      {remind && (
        <>
          <MenuSep />
          <MenuLabel>Напоминание</MenuLabel>
          <div className="px-4 pb-2">
            <input
              type="datetime-local"
              aria-label="Напоминание"
              value={remind.value ?? ""}
              onChange={(e) => remind.onChange(e.target.value || undefined)}
              className="h-9 w-full px-3 outline-none focus:!shadow-[inset_0_0_0_1px_#ADFB0C]"
              style={fieldStyle}
            />
          </div>
          {remind.value && <MenuItem onSelect={() => remind.onChange(undefined)}>Убрать напоминание</MenuItem>}
        </>
      )}
      {snooze && (
        <>
          <MenuSep />
          <MenuLabel>Отложить</MenuLabel>
          {snooze.snoozed ? (
            <MenuItem onSelect={() => snooze.onSnooze(null)}>Вернуть из отложенных</MenuItem>
          ) : (
            <>
              <MenuItem onSelect={() => snooze.onSnooze(inDays(1))}>До завтра</MenuItem>
              <MenuItem onSelect={() => snooze.onSnooze(nextMonday())}>До понедельника</MenuItem>
              <MenuItem onSelect={() => snooze.onSnooze(inDays(7))}>На неделю</MenuItem>
            </>
          )}
        </>
      )}
    </>
  );
}

export function PriorityMenuBody({ value, onPick }: { value: Priority; onPick: (p: Priority) => void }) {
  return (
    <>
      <MenuLabel>Приоритет</MenuLabel>
      {PRIORITY_ORDER.map((p) => (
        <MenuItem key={p} onSelect={() => onPick(p)} checked={value === p}>
          <Signal value={PRIORITY_BARS[p]} on={B.text2} off={B.l15} w={4} h={10} />
          {PRIORITY_META[p].label}
        </MenuItem>
      ))}
    </>
  );
}

export function ProjectMenuBody({ value, projects, onPick }: { value?: string; projects: Project[]; onPick: (id?: string) => void }) {
  return (
    <>
      <MenuLabel>Проект</MenuLabel>
      <MenuItem onSelect={() => onPick(undefined)} checked={!value}>
        Без проекта
      </MenuItem>
      {projects.map((p) => (
        <MenuItem key={p.id} onSelect={() => onPick(p.id)} checked={value === p.id}>
          {p.name}
        </MenuItem>
      ))}
    </>
  );
}

/** «⋯» / right-click menu of a task: everything secondary lives here. */
function RowMenuBody({ task, projects, act }: { task: Task; projects: Project[]; act: TaskActions }) {
  const [sub, setSub] = useState<null | "project" | "due">(null);
  if (sub === "project") return <ProjectMenuBody value={task.projectId} projects={projects} onPick={(id) => act.setProject(task.id, id)} />;
  if (sub === "due")
    return (
      <DueMenuBody
        value={task.dueDate}
        onPick={(d) => act.setDue(task.id, d)}
        snooze={{ snoozed: isSnoozed(task), onSnooze: (u) => act.snooze(task.id, u) }}
      />
    );
  return (
    <>
      <MenuItem onSelect={() => act.open(task)}>Открыть</MenuItem>
      <MenuItem onSelect={() => act.toggle(task)}>{task.done ? "Вернуть в работу" : "Готово"}</MenuItem>
      <MenuSep />
      <MenuItem onSelect={() => act.setDue(task.id, inDays(0))} hint={dayHint(inDays(0))}>
        На сегодня
      </MenuItem>
      <MenuItem onSelect={() => act.setDue(task.id, inDays(1))} hint={dayHint(inDays(1))}>
        На завтра
      </MenuItem>
      <MenuItem onSelect={() => setSub("due")} keepOpen hint="↳">
        Срок и отложить…
      </MenuItem>
      <MenuItem onSelect={() => setSub("project")} keepOpen hint="↳">
        Проект…
      </MenuItem>
      <MenuSep />
      <MenuLabel>Теги</MenuLabel>
      {FIXED_TAGS.map((tag) => (
        <MenuItem key={tag} keepOpen checked={task.tags.includes(tag)} onSelect={() => act.toggleTag(task, tag)}>
          #{tag}
        </MenuItem>
      ))}
      <MenuSep />
      <MenuItem onSelect={() => act.archive(task)}>В архив</MenuItem>
      <MenuItem danger onSelect={() => act.remove(task)}>
        Удалить
      </MenuItem>
    </>
  );
}

/** Small square icon button (32px, no border, hover surface-1). */
export function IconBtn({
  label,
  onClick,
  children,
  reveal,
  className = "",
}: {
  label: string;
  onClick: (el: HTMLElement) => void;
  children: ReactNode;
  reveal?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-float-trigger
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center outline-none transition-[color,background,opacity] duration-200 hover:bg-[#101010] hover:text-white focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[#ADFB0C] ${
        reveal ? "opacity-0 group-hover:opacity-100" : ""
      } ${className}`}
      style={{ color: B.text3 }}
    >
      {children}
    </button>
  );
}
export const Dots = () => <MoreHorizontal size={16} strokeWidth={1.25} />;

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * List rows
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** num · check · title+meta · priority · due · ⋯ */
export const ROW_COLS = "28px 16px minmax(0,1fr) 40px 92px 32px";

const sep = <span style={{ color: B.off }}> · </span>;
function joinMeta(parts: ReactNode[]) {
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && sep}
      {p}
    </span>
  ));
}

export function TaskRow({
  task,
  n,
  projectName,
  blockedBy,
  active,
  picked,
  projects,
  act,
  onPick,
}: {
  task: Task;
  n: number;
  projectName?: string;
  blockedBy?: string;
  active: boolean;
  picked: boolean;
  projects: Project[];
  act: TaskActions;
  onPick: () => void;
}) {
  const due = useFloat();
  const prio = useFloat();
  const more = useFloat();
  const overdue = !task.done && isOverdue(task.dueDate);
  const subDone = task.subtasks.filter((s) => s.done).length;

  const meta: ReactNode[] = [];
  if (projectName) meta.push(projectName);
  if (task.subtasks.length) meta.push(<span style={tab}>{`${subDone}/${task.subtasks.length}`}</span>);
  task.tags.forEach((t) => meta.push(`#${t}`));
  if (task.recurrence !== "none") meta.push(RECURRENCE_LABEL[task.recurrence].toLowerCase());
  if (task.spentMin > 0) meta.push(formatDuration(task.spentMin));
  if (task.timerStartedAt) meta.push(<span style={{ color: B.text }}>таймер идёт</span>);
  if (isSnoozed(task) && task.snoozedUntil) meta.push(`отложена до ${dueLabel(task.snoozedUntil)}`);
  if (blockedBy) meta.push(`ждёт «${blockedBy}»`);

  const dueText = task.done
    ? task.completedAt
      ? formatDate(task.completedAt)
      : "—"
    : task.dueDate
      ? dueLabel(task.dueDate)
      : "Срок";

  return (
    <li
      onContextMenu={(e) => {
        e.preventDefault();
        more.openAt(anchorAt(e));
      }}
      className="group relative grid min-h-[60px] items-center gap-4 transition-colors duration-200 hover:bg-white/[0.02]"
      style={{
        gridTemplateColumns: ROW_COLS,
        borderBottom: `1px solid ${B.l7}`,
        background: active ? "rgba(255,255,255,0.04)" : picked ? B.s2 : undefined,
      }}
    >
      {(active || picked) && <span className="absolute inset-y-0 -left-4 w-[2px]" style={{ background: B.text }} />}
      <span style={{ ...T.num, color: B.off }}>{pad2(n)}</span>
      <Check done={task.done} onClick={() => act.toggle(task)} label={task.title} />
      <button
        type="button"
        className="min-w-0 py-3 text-left outline-none focus-visible:underline"
        onClick={(e) => (e.metaKey || e.ctrlKey || e.shiftKey ? onPick() : act.open(task))}
        title="Клик — открыть · Ctrl+клик — выделить"
      >
        <span
          className="block truncate transition-colors group-hover:text-white"
          style={{ ...T.bodyL, color: task.done ? B.text4 : B.text, textDecoration: task.done ? "line-through" : undefined }}
        >
          {task.title}
        </span>
        {meta.length > 0 && (
          <span className="mt-0.5 block truncate" style={{ ...T.meta, color: B.text3 }}>
            {joinMeta(meta)}
          </span>
        )}
      </button>
      <button
        type="button"
        data-float-trigger
        aria-label={`Приоритет: ${PRIORITY_META[task.priority].label}`}
        title={`Приоритет: ${PRIORITY_META[task.priority].label}`}
        onClick={(e) => prio.toggle(e.currentTarget, "right")}
        className="flex h-8 items-center justify-center outline-none focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
      >
        <Signal value={PRIORITY_BARS[task.priority]} on={B.text2} off={task.priority ? B.off : B.l10} />
      </button>
      <button
        type="button"
        data-float-trigger
        onClick={(e) => due.toggle(e.currentTarget, "right")}
        className="h-8 truncate text-right outline-none transition-colors hover:!text-white focus-visible:underline"
        style={{ ...T.meta, ...tab, color: overdue ? B.danger : task.dueDate || task.done ? B.text3 : B.off }}
      >
        {dueText}
      </button>
      <IconBtn label={`Ещё: ${task.title}`} reveal onClick={(el) => more.toggle(el, "right")}>
        <Dots />
      </IconBtn>

      {due.at && (
        <FloatMenu at={due.at} onClose={due.close}>
          <DueMenuBody
            value={task.dueDate}
            onPick={(d) => act.setDue(task.id, d)}
            snooze={{ snoozed: isSnoozed(task), onSnooze: (u) => act.snooze(task.id, u) }}
          />
        </FloatMenu>
      )}
      {prio.at && (
        <FloatMenu at={prio.at} onClose={prio.close} width={220}>
          <PriorityMenuBody value={task.priority} onPick={(p) => act.setPriority(task.id, p)} />
        </FloatMenu>
      )}
      {more.at && (
        <FloatMenu at={more.at} onClose={more.close}>
          <RowMenuBody task={task} projects={projects} act={act} />
        </FloatMenu>
      )}
    </li>
  );
}

/** A meeting in the list — the ONE Meeting record, acted on through the store. */
export function MeetingRow({ m, n }: { m: Meeting; n: number }) {
  const { toggleMeeting, updateMeeting, deleteMeeting } = useData();
  const prio = useFloat();
  const more = useFloat();
  const overdue = !m.done && isOverdue(m.date);
  const p = (m.priority ?? 0) as Priority;
  return (
    <li
      className="group relative grid min-h-[60px] items-center gap-4 transition-colors duration-200 hover:bg-white/[0.02]"
      style={{ gridTemplateColumns: ROW_COLS, borderBottom: `1px solid ${B.l7}` }}
    >
      <span style={{ ...T.num, color: B.off }}>{pad2(n)}</span>
      <Check done={!!m.done} onClick={() => toggleMeeting(m.id)} label={`Встреча: ${m.title}`} />
      <span className="min-w-0 py-3">
        {m.url && !m.done ? (
          <a href={m.url} target="_blank" rel="noreferrer" className="block truncate underline-offset-4 hover:underline" style={{ ...T.bodyL, color: B.text }}>
            {m.title}
          </a>
        ) : (
          <span className="block truncate" style={{ ...T.bodyL, color: m.done ? B.text4 : B.text, textDecoration: m.done ? "line-through" : undefined }}>
            {m.title}
          </span>
        )}
        <span className="mt-0.5 block truncate" style={{ ...T.meta, color: B.text3 }}>
          {joinMeta(["Встреча", `${m.durationMin} мин`, ...(m.tags ?? []).map((t) => `#${t}`), ...(m.url ? ["есть ссылка"] : [])])}
        </span>
      </span>
      <button
        type="button"
        data-float-trigger
        aria-label={`Приоритет: ${PRIORITY_META[p].label}`}
        onClick={(e) => prio.toggle(e.currentTarget, "right")}
        className="flex h-8 items-center justify-center outline-none"
      >
        <Signal value={PRIORITY_BARS[p]} on={B.text2} off={p ? B.off : B.l10} />
      </button>
      <span className="truncate text-right" style={{ ...T.meta, ...tab, color: overdue ? B.danger : B.text3 }}>
        {isToday(m.date) ? "Сегодня" : dueLabel(m.date)} · {m.time}
      </span>
      <IconBtn label={`Ещё: ${m.title}`} reveal onClick={(el) => more.toggle(el, "right")}>
        <Dots />
      </IconBtn>
      {prio.at && (
        <FloatMenu at={prio.at} onClose={prio.close} width={220}>
          <PriorityMenuBody value={p} onPick={(v) => updateMeeting(m.id, { priority: v })} />
        </FloatMenu>
      )}
      {more.at && (
        <FloatMenu at={more.at} onClose={more.close}>
          <MenuItem onSelect={() => toggleMeeting(m.id)}>{m.done ? "Вернуть" : "Встреча прошла"}</MenuItem>
          {m.url && <MenuItem onSelect={() => window.open(m.url, "_blank", "noreferrer")}>Открыть ссылку</MenuItem>}
          <MenuSep />
          <MenuItem danger onSelect={() => deleteMeeting(m.id)}>
            Удалить встречу
          </MenuItem>
        </FloatMenu>
      )}
    </li>
  );
}

/** Group header in «По проектам»: name · done/total · open project ↳ · fold. */
export function GroupHead({
  title,
  count,
  to,
  open,
  onToggle,
}: {
  title: string;
  count: ReactNode;
  to?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-3 pt-10" style={{ borderBottom: `1px solid ${B.l10}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="group flex min-w-0 items-baseline gap-3 text-left outline-none">
        <span style={{ ...T.title, color: open ? B.text : B.text2 }} className="truncate transition-colors group-hover:text-white">
          {title}
        </span>
        <span style={{ ...T.meta, ...tab, color: B.text3 }}>{count}</span>
      </button>
      <span className="flex shrink-0 items-center gap-5">
        {to && (
          <Link to={to} className="flex items-center gap-1.5 transition-colors hover:text-white" style={{ ...T.meta, color: B.text3 }}>
            Проект <Hook size={12} />
          </Link>
        )}
        <button type="button" onClick={onToggle} aria-label={open ? "Свернуть" : "Развернуть"} className="flex h-6 w-6 items-center justify-center" style={{ color: B.text3 }}>
          <Sparkle size={12} open={open} />
        </button>
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Quick add — the NLP line
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function AddBar({
  inputRef,
  projects,
  onAdd,
  placeholder = "Новая задача — «созвон завтра 15:00 #работа !важно @проект»",
}: {
  inputRef: RefObject<HTMLInputElement>;
  projects: Project[];
  onAdd: (raw: string) => void;
  placeholder?: string;
}) {
  const [v, setV] = useState("");
  const parsed = useMemo(() => parseQuick(v, projects), [v, projects]);
  const hints: string[] = [];
  if (v.trim()) {
    if (parsed.dueDate) hints.push(dueLabel(parsed.dueDate));
    if (parsed.remindAt) hints.push(parsed.remindAt.slice(11, 16));
    if (parsed.important) hints.push("важно");
    if (parsed.estimateMin) hints.push(`≈ ${formatDuration(parsed.estimateMin)}`);
    if (parsed.recurrence) hints.push(RECURRENCE_LABEL[parsed.recurrence].toLowerCase());
    parsed.tags.forEach((t) => hints.push(`#${t}`));
    if (parsed.projectName) hints.push(parsed.projectName);
  }
  return (
    <form
      className="grid min-h-[60px] items-center gap-4 focus-within:bg-white/[0.02]"
      style={{ gridTemplateColumns: ROW_COLS, borderBottom: `1px solid ${B.l10}` }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
    >
      <span style={{ color: B.text3 }}>
        <Hook size={14} />
      </span>
      <span />
      <span className="flex min-w-0 items-center gap-3" style={{ gridColumn: "3 / -1" }}>
        <input
          ref={inputRef}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          aria-label="Новая задача"
          className="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-[#454545]"
          style={{ ...T.bodyL, color: B.text }}
        />
        {hints.length > 0 && (
          <span className="flex shrink-0 items-center gap-1.5">
            {hints.map((h) => (
              <Tag key={h} color={B.text2}>
                {h}
              </Tag>
            ))}
          </span>
        )}
        {v.trim() && (
          <span className="shrink-0" style={{ ...T.meta, color: B.off }}>
            Enter
          </span>
        )}
      </span>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Board (kanban) — native drag & drop, 4-column page grid
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export type BoardCol = {
  key: string;
  label: string;
  sub?: string;
  today?: boolean;
  bars?: number;
  match: (t: Task) => boolean;
  onDrop: (id: string) => void;
};

export function Board({
  cols,
  itemsByColumn,
  projectName,
  activeId,
  showSignal,
  act,
  onMove,
  onMoveDir,
  onAdd,
}: {
  cols: BoardCol[];
  itemsByColumn: Record<string, Task[]>;
  projectName: (id?: string) => string | undefined;
  activeId: string | null;
  showSignal: boolean;
  act: TaskActions;
  onMove: (id: string, toKey: string, beforeId: string | null) => void;
  onMoveDir: (t: Task, dir: -1 | 1) => void;
  onAdd: (col: BoardCol, raw: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; before: string | null } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const end = () => {
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="grid grid-cols-4 gap-x-5 gap-y-14">
      {cols.map((col) => {
        const items = itemsByColumn[col.key] ?? [];
        const hot = over?.col === col.key && drag;
        return (
          <section
            key={col.key}
            role="list"
            aria-label={col.label}
            className="flex min-w-0 flex-col"
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over?.col !== col.key || over.before !== null) setOver({ col: col.key, before: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) onMove(drag, col.key, over?.col === col.key ? over.before : null);
              end();
            }}
          >
            <header className="flex items-baseline justify-between gap-3 pb-3" style={{ borderBottom: `2px solid ${col.today ? B.text : hot ? B.l40 : B.l20}`, transition: `border-color .2s ${B.ease}` }}>
              <span className="flex min-w-0 items-baseline gap-2">
                {col.bars !== undefined && (
                  <span className="self-center">
                    <Signal value={col.bars} on={B.text2} off={B.l15} w={4} h={10} />
                  </span>
                )}
                <span className="truncate" style={{ ...T.bodyStrong, color: col.today ? B.text : B.text2 }}>
                  {col.label}
                </span>
                {col.sub && <span style={{ ...T.meta, color: B.text3 }}>{col.sub}</span>}
              </span>
              <span style={{ ...T.num, color: B.text3 }}>{items.length}</span>
            </header>

            <div className="mt-3 flex flex-col gap-2">
              {items.map((t) => {
                const overdue = !t.done && isOverdue(t.dueDate);
                const pName = projectName(t.projectId);
                const isActive = t.id === activeId;
                return (
                  <div key={t.id} className="relative">
                    {hot && over?.before === t.id && <span className="absolute -top-[5px] left-0 right-0 h-[2px]" style={{ background: B.text }} />}
                    <div
                      role="listitem"
                      tabIndex={0}
                      draggable
                      aria-label={`${t.title}. Enter — открыть, стрелки — в соседнюю колонку`}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDrag(t.id);
                      }}
                      onDragEnd={end}
                      onDragOver={(e) => {
                        if (!drag) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const upper = e.clientY < r.top + r.height / 2;
                        const idx = items.findIndex((x) => x.id === t.id);
                        const before = upper ? t.id : items[idx + 1]?.id ?? null;
                        if (over?.col !== col.key || over.before !== before) setOver({ col: col.key, before });
                      }}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter") {
                          e.preventDefault();
                          act.open(t);
                        }
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          onMoveDir(t, -1);
                        }
                        if (e.key === "ArrowRight") {
                          e.preventDefault();
                          onMoveDir(t, 1);
                        }
                      }}
                      onClick={() => act.open(t)}
                      className="group cursor-grab px-4 pb-3.5 pt-4 outline-none transition-[box-shadow,opacity,background] duration-200 hover:bg-white/[0.02] focus-visible:shadow-[inset_0_0_0_1px_#ADFB0C] active:cursor-grabbing"
                      style={{
                        boxShadow: `inset 0 0 0 1px ${isActive ? B.l40 : B.l10}`,
                        opacity: drag === t.id ? 0.35 : 1,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="pt-[2px]" onClick={(e) => e.stopPropagation()}>
                          <Check done={t.done} onClick={() => act.toggle(t)} label={t.title} size={14} />
                        </span>
                        <span className="line-clamp-3 min-w-0 flex-1" style={{ ...T.body, color: B.text }}>
                          {t.title}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 pl-[26px]">
                        <span className="min-w-0 truncate" style={{ ...T.meta, color: B.text3, ...tab }}>
                          <span style={{ color: overdue ? B.danger : t.dueDate ? B.text3 : B.off }}>{t.dueDate ? dueLabel(t.dueDate) : "без срока"}</span>
                          {pName && (
                            <>
                              {sep}
                              {pName}
                            </>
                          )}
                          {t.subtasks.length > 0 && (
                            <>
                              {sep}
                              {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
                            </>
                          )}
                        </span>
                        {showSignal && t.priority > 0 && <Signal value={PRIORITY_BARS[t.priority]} on={B.text3} off={B.l15} w={4} h={8} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {hot && over?.before === null && <span className="h-[2px]" style={{ background: B.text }} />}
              {items.length === 0 && (
                <div className="flex h-[72px] items-center justify-center" style={{ ...hatch("#141414"), ...T.meta, color: B.off }}>
                  {hot ? "Отпустите" : "Пусто"}
                </div>
              )}
            </div>

            <form
              className="mt-2 flex h-10 items-center gap-3"
              style={{ borderBottom: `1px solid ${B.l7}` }}
              onSubmit={(e) => {
                e.preventDefault();
                const raw = drafts[col.key] ?? "";
                if (!raw.trim()) return;
                onAdd(col, raw);
                setDrafts((d) => ({ ...d, [col.key]: "" }));
              }}
            >
              <span style={{ color: B.off }}>
                <Hook size={12} />
              </span>
              <input
                value={drafts[col.key] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [col.key]: e.target.value }))}
                placeholder="Карточка…"
                aria-label={`Новая карточка: ${col.label}`}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
                style={{ ...T.body, color: B.text }}
              />
            </form>
          </section>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Task «case» panel — right, full height
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const PANEL_CSS = `
@keyframes ixPanelIn { from { transform: translateX(28px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes ixFadeIn { from { opacity: 0 } to { opacity: 1 } }
`;

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Bulk dock — appears only after Ctrl/Shift+click selection
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function BulkDock({
  count,
  onDone,
  onToday,
  onArchive,
  onDelete,
  onClear,
}: {
  count: number;
  onDone: () => void;
  onToday: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const b = (label: string, fn: () => void, danger?: boolean) => (
    <button
      type="button"
      onClick={fn}
      className="h-10 px-4 outline-none transition-colors hover:bg-white/[0.06] hover:!text-white focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#ADFB0C]"
      style={{ ...T.btn, color: danger ? B.danger : B.text2 }}
    >
      {label}
    </button>
  );
  return (
    <DockPlate className="fixed bottom-6 left-[calc(50%+110px)] z-30 flex -translate-x-1/2 items-center" style={{ animation: `ixFadeIn .2s ${B.easeOut}` }}>
      <style>{PANEL_CSS}</style>
      <span className="px-5" style={{ ...T.meta, color: B.text3, ...tab }}>
        Выбрано {count}
      </span>
      <span className="h-10 w-px" style={{ background: B.l10 }} />
      {b("Готово", onDone)}
      {b("На сегодня", onToday)}
      {b("В архив", onArchive)}
      {b("Удалить", onDelete, true)}
      <span className="h-10 w-px" style={{ background: B.l10 }} />
      <button type="button" aria-label="Снять выделение" onClick={onClear} className="flex h-10 w-10 items-center justify-center hover:text-white" style={{ color: B.text3 }}>
        <Sparkle size={12} open />
      </button>
    </DockPlate>
  );
}

/** Today's local date key — re-exported so the page doesn't import format twice. */
export const todayKey = () => localDayStr();
