/**
 * Аналитика · Craft Dark «Итоги» — shared model + pieces.
 *
 * The screen reviews one CALENDAR MONTH (default: the current month so far) and compares it with
 * the previous month. Numbers come from the same store fields as the real page
 * (src/pages/Analytics.tsx → lib/analytics): completionLog for closures, task.completedAt for what
 * was closed, pomodoroSessions for focus, estimate/spentMin for accuracy, gamification for level.
 * The current month is compared with the SAME days of the previous month (1…today), a past month
 * with the whole previous month. Nothing here is invented.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, R, RoundCheck, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { computeStreak } from "@/lib/gameStats";
import { levelProgress, xpForTaskCompletion } from "@/lib/gamification";
import { dueLabel, isOverdue, localDayStr } from "@/lib/format";
import { pushUndo } from "@/lib/undoStack";
import { levelTitle, type Priority, type Task } from "@/types";

export const ICON = { size: 18, strokeWidth: 1.75 } as const;
export const PRIO_DOT: Record<number, string> = { 0: "#4A4C54", 1: C.red, 2: C.amber, 3: C.accent };
export const PRIO_LABEL: Record<number, string> = { 1: "Высокий", 2: "Средний", 3: "Низкий", 0: "Без приоритета" };
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WEEKDAYS_LONG = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
/** «на …» form. */
const WEEKDAYS_ACC = ["понедельник", "вторник", "среду", "четверг", "пятницу", "субботу", "воскресенье"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
/** «в …» (prepositional). */
const MONTHS_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
/** «… октября» (genitive). */
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// ── Formatting ───────────────────────────────────────────────────────────────────────────────

export function dur(min: number): string {
  if (!min) return "0 мин";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

export const tasksWord = (n: number) => plural(n, "задача", "задачи", "задач");
export const daysWord = (n: number) => plural(n, "день", "дня", "дней");
export const fmtDay = (d: Date, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) => d.toLocaleDateString("ru-RU", o);
export const fmtShort = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
export const fmtAvg = (n: number) => (Math.round(n * 10) / 10).toLocaleString("ru-RU");
/** % change, null when there is nothing to compare with. */
export const pctDelta = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

// ── Month model ──────────────────────────────────────────────────────────────────────────────

export interface YM {
  y: number;
  /** 0-based month. */
  m: number;
}

export const ymKey = (v: YM) => v.y * 12 + v.m;
export const ymFromKey = (k: number): YM => ({ y: Math.floor(k / 12), m: k % 12 });
export const thisMonth = (): YM => {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
};
export const monthLabel = (v: YM) => `${MONTHS[v.m]} ${v.y}`;
export const monthName = (v: YM) => MONTHS[v.m];
export const monthIn = (v: YM) => MONTHS_IN[v.m];
export const monthGen = (v: YM) => MONTHS_GEN[v.m];
const daysIn = (v: YM) => new Date(v.y, v.m + 1, 0).getDate();

export interface MonthDay {
  key: string;
  date: Date;
  dom: number;
  closed: number;
  created: number;
  titles: string[];
  weekday: number;
  /** Day after today (current month only). */
  future: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  closed: number;
  prev: number;
  tasks: Task[];
}

export interface MonthStats {
  days: MonthDay[];
  closed: number;
  activeDays: number;
  goalDays: number;
  avgPerActive: number;
  /** Top days by closures, most first. */
  bestDays: MonthDay[];
  longestStreak: number;
  created: number;
  focusMin: number;
  focusSessions: number;
  xp: number;
  accuracy: number | null;
  accuracyCount: number;
  byWeekday: { label: string; long: string; acc: string; value: number }[];
  closedTasks: Task[];
}

export interface MonthModel {
  ym: YM;
  prevYm: YM;
  isCurrent: boolean;
  /** Days counted so far (= days in month for a past month). */
  elapsed: number;
  daysInMonth: number;
  /** Every day of the month, future ones flagged. */
  days: MonthDay[];
  cur: MonthStats;
  /** What the month is compared with: same days of the previous month, or all of it. */
  cmp: MonthStats;
  /** The whole previous month (for its total and the overlay). */
  prevFull: MonthStats;
  /** «за 1–11 сентября» / «за сентябрь». */
  cmpLabel: string;
  goal: number;
  streakNow: number;
  bestStreak: number;
  byProject: ProjectRow[];
  peakWeekday: { label: string; long: string; acc: string; value: number } | null;
  /** Fate of tasks created in this month. */
  carried: { created: number; sameMonth: number; later: number; open: number; openTasks: Task[] };
  openTasks: Task[];
  overdueOpen: number;
  priorityOpen: { p: Priority; label: string; value: number; color: string }[];
  level: { level: number; title: string; pct: number; toNext: number; xp: number };
  /** Earliest month with any data — the stepper's lower bound. */
  firstYm: YM;
  /** Closures per month key, for the picker. */
  monthTotals: Map<number, number>;
  closedTasks: Task[];
  closedTitle: string;
  projectName: (id?: string) => string | undefined;
}

function dayList(v: YM, upto: number, todayKey: string): MonthDay[] {
  const out: MonthDay[] = [];
  for (let d = 1; d <= upto; d++) {
    const date = new Date(v.y, v.m, d, 12);
    const key = localDayStr(date);
    out.push({ key, date, dom: d, closed: 0, created: 0, titles: [], weekday: (date.getDay() + 6) % 7, future: key > todayKey });
  }
  return out;
}

export function useMonthReview(ym: YM): MonthModel {
  const { allTasks, allProjects, completionLog, gamification, pomodoroSessions } = useData();

  return useMemo(() => {
    const todayKey = localDayStr();
    const now = thisMonth();
    const isCurrent = ymKey(ym) === ymKey(now);
    const dim = daysIn(ym);
    const elapsed = isCurrent ? new Date().getDate() : dim;
    const prevYm = ymFromKey(ymKey(ym) - 1);
    const prevDim = daysIn(prevYm);
    const goal = Math.max(1, gamification.dailyGoal || 5);
    const projName = new Map(allProjects.map((p) => [p.id, p.name]));

    const stats = (v: YM, upto: number): MonthStats => {
      const days = dayList(v, upto, todayKey);
      const idx = new Map(days.map((d, i) => [d.key, i]));
      const first = days[0]?.key ?? "";
      const last = days[days.length - 1]?.key ?? "";
      days.forEach((d) => (d.closed = d.future ? 0 : completionLog[d.key] ?? 0));
      const closedTasks: Task[] = [];
      let xp = 0;
      let accSum = 0;
      let accN = 0;
      for (const t of allTasks) {
        const ck = localDayStr(new Date(t.createdAt));
        if (ck >= first && ck <= last) days[idx.get(ck)!].created++;
        if (!t.done || !t.completedAt) continue;
        const k = localDayStr(new Date(t.completedAt));
        if (k < first || k > last) continue;
        closedTasks.push(t);
        days[idx.get(k)!].titles.push(t.title);
        xp += xpForTaskCompletion(t.priority);
        const est = t.estimateMin ?? 0;
        if (est > 0 && t.spentMin > 0) {
          accSum += Math.max(0, Math.min(100, 100 - (Math.abs(t.spentMin - est) / est) * 100));
          accN++;
        }
      }
      closedTasks.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
      const real = days.filter((d) => !d.future);
      const closed = real.reduce((s, d) => s + d.closed, 0);
      const activeDays = real.filter((d) => d.closed > 0).length;
      let run = 0;
      let longest = 0;
      real.forEach((d) => {
        run = d.closed > 0 ? run + 1 : 0;
        longest = Math.max(longest, run);
      });
      const wd = [0, 0, 0, 0, 0, 0, 0];
      real.forEach((d) => (wd[d.weekday] += d.closed));
      const sessions = pomodoroSessions.filter((s) => s.kind === "work" && s.date >= first && s.date <= last);
      return {
        days,
        closed,
        activeDays,
        goalDays: real.filter((d) => d.closed >= goal).length,
        avgPerActive: activeDays ? closed / activeDays : 0,
        bestDays: real.filter((d) => d.closed > 0).sort((a, b) => b.closed - a.closed || b.dom - a.dom).slice(0, 3),
        longestStreak: longest,
        created: real.reduce((s, d) => s + d.created, 0),
        focusMin: sessions.reduce((s, x) => s + x.minutes, 0),
        focusSessions: sessions.length,
        xp,
        accuracy: accN ? Math.round(accSum / accN) : null,
        accuracyCount: accN,
        byWeekday: WEEKDAYS.map((label, i) => ({ label, long: WEEKDAYS_LONG[i], acc: WEEKDAYS_ACC[i], value: wd[i] })),
        closedTasks,
      };
    };

    const cur = stats(ym, dim);
    const prevFull = stats(prevYm, prevDim);
    const cmp = isCurrent ? stats(prevYm, Math.min(elapsed, prevDim)) : prevFull;
    const cmpLabel = isCurrent ? (elapsed === 1 ? `за 1 ${monthGen(prevYm)}` : `за 1–${Math.min(elapsed, prevDim)} ${monthGen(prevYm)}`) : `за ${monthName(prevYm).toLowerCase()}`;

    // Projects: closures this month vs the comparison window.
    const rows = new Map<string, ProjectRow>();
    const row = (pid?: string) => {
      const id = pid && projName.has(pid) ? pid : "none";
      let r = rows.get(id);
      if (!r) {
        r = { id, name: id === "none" ? "Без проекта" : projName.get(id)!, closed: 0, prev: 0, tasks: [] };
        rows.set(id, r);
      }
      return r;
    };
    cur.closedTasks.forEach((t) => {
      const r = row(t.projectId);
      r.closed++;
      r.tasks.push(t);
    });
    cmp.closedTasks.forEach((t) => row(t.projectId).prev++);
    const byProject = Array.from(rows.values()).sort((a, b) => b.closed - a.closed || b.prev - a.prev);

    const maxWd = Math.max(...cur.byWeekday.map((w) => w.value));
    const peakWeekday = maxWd > 0 ? cur.byWeekday.find((w) => w.value === maxWd)! : null;

    // Tasks created this month: closed in it, closed later, still open.
    const first = cur.days[0].key;
    const last = cur.days[cur.days.length - 1].key;
    const createdHere = allTasks.filter((t) => {
      const k = localDayStr(new Date(t.createdAt));
      return k >= first && k <= last;
    });
    const doneKey = (t: Task) => (t.done && t.completedAt ? localDayStr(new Date(t.completedAt)) : null);
    const carriedOpen = createdHere.filter((t) => !t.done && !t.archivedAt);
    const carried = {
      created: createdHere.length,
      sameMonth: createdHere.filter((t) => {
        const k = doneKey(t);
        return k !== null && k <= last;
      }).length,
      later: createdHere.filter((t) => {
        const k = doneKey(t);
        return k !== null && k > last;
      }).length,
      open: carriedOpen.length,
      openTasks: carriedOpen,
    };

    const openTasks = allTasks.filter((t) => !t.done && !t.archivedAt).sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
    const priorityOpen = ([1, 2, 3, 0] as Priority[])
      .map((p) => ({ p, label: PRIO_LABEL[p], value: openTasks.filter((t) => t.priority === p).length, color: PRIO_DOT[p] }))
      .filter((x) => x.value > 0);

    // Stepper bounds + picker counts.
    const monthTotals = new Map<number, number>();
    let firstKey = ymKey(now);
    for (const [k, v] of Object.entries(completionLog)) {
      const [yy, mm] = k.split("-").map(Number);
      const key = yy * 12 + (mm - 1);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + v);
      if (v > 0) firstKey = Math.min(firstKey, key);
    }
    for (const t of allTasks) {
      const d = new Date(t.createdAt);
      firstKey = Math.min(firstKey, d.getFullYear() * 12 + d.getMonth());
    }

    const lvl = levelProgress(gamification.xp);
    const streakNow = computeStreak(completionLog);

    return {
      ym,
      prevYm,
      isCurrent,
      elapsed,
      daysInMonth: dim,
      days: cur.days,
      cur,
      cmp,
      prevFull,
      cmpLabel,
      goal,
      streakNow,
      bestStreak: Math.max(gamification.bestStreak ?? 0, streakNow),
      byProject,
      peakWeekday,
      carried,
      openTasks,
      overdueOpen: openTasks.filter((t) => isOverdue(t.dueDate)).length,
      priorityOpen,
      level: { level: lvl.level, title: levelTitle(lvl.level), pct: lvl.pct, toNext: lvl.toNext, xp: gamification.xp },
      firstYm: ymFromKey(firstKey),
      monthTotals,
      closedTasks: cur.closedTasks,
      closedTitle: `Закрыто в ${monthIn(ym)}`,
      projectName: (id?: string) => (id ? projName.get(id) : undefined),
    };
  }, [ym, allTasks, allProjects, completionLog, gamification, pomodoroSessions]);
}

// ── Hooks ────────────────────────────────────────────────────────────────────────────────────

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function useEsc(close: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [close]);
}

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, open, close]);
}

// ── Month stepper + picker ───────────────────────────────────────────────────────────────────

/** «‹ Октябрь 2026 ›»: arrows step a month, the label opens a year grid of months. */
export function MonthStepper({ value, onChange, min, totals }: { value: YM; onChange: (v: YM) => void; min: YM; totals: Map<number, number> }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value.y);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const k = ymKey(value);
  const maxK = ymKey(thisMonth());
  const minK = ymKey(min);
  const step = (d: number) => onChange(ymFromKey(Math.max(minK, Math.min(maxK, k + d))));
  const arrow = (dir: -1 | 1, disabled: boolean) => (
    <button
      type="button"
      aria-label={dir < 0 ? "Предыдущий месяц" : "Следующий месяц"}
      disabled={disabled}
      onClick={() => step(dir)}
      className="grid h-9 w-9 place-items-center rounded-full transition-colors duration-150 enabled:hover:bg-[#202025] disabled:opacity-30"
      style={{ color: C.text }}
    >
      {dir < 0 ? <ChevronLeft size={18} strokeWidth={1.75} /> : <ChevronRight size={18} strokeWidth={1.75} />}
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1 p-1" style={{ borderRadius: 999, background: C.card }}>
        {arrow(-1, k <= minK)}
        <button
          type="button"
          onClick={() => {
            setYear(value.y);
            setOpen((o) => !o);
          }}
          className="inline-flex items-center gap-2 whitespace-nowrap px-3 transition-colors duration-150 hover:bg-[#202025]"
          style={{ height: 36, minWidth: 168, justifyContent: "center", borderRadius: 999, fontSize: 15, color: C.text, background: open ? C.raise : undefined }}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {monthLabel(value)}
          <ChevronDown size={16} strokeWidth={1.75} color={C.text2} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
        </button>
        {arrow(1, k >= maxK)}
      </div>
      {open && (
        <div
          className="absolute right-0 z-40 p-4"
          style={{ top: 52, width: 320, background: C.panel, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
          role="dialog"
          aria-label="Выбор месяца"
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Предыдущий год" disabled={year <= min.y} onClick={() => setYear((y) => y - 1)} className="grid h-8 w-8 place-items-center rounded-full enabled:hover:bg-[#202025] disabled:opacity-30">
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <span style={{ ...T.cell, ...T.num }}>{year}</span>
            <button type="button" aria-label="Следующий год" disabled={year >= thisMonth().y} onClick={() => setYear((y) => y + 1)} className="grid h-8 w-8 place-items-center rounded-full enabled:hover:bg-[#202025] disabled:opacity-30">
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS_SHORT.map((label, i) => {
              const key = year * 12 + i;
              const on = key === k;
              const disabled = key < minK || key > maxK;
              const n = totals.get(key) ?? 0;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange({ y: year, m: i });
                    setOpen(false);
                  }}
                  className="flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 enabled:hover:bg-[#202025] disabled:opacity-25"
                  style={{ height: 52, borderRadius: R.small, background: on ? "rgba(10,132,255,0.16)" : C.card }}
                >
                  <span style={{ fontSize: 13, color: on ? C.text : C.text2 }}>{label}</span>
                  <span style={{ fontSize: 11, color: on ? "#5AA9FF" : C.text3, ...T.num, fontWeight: 400 }}>{disabled ? "" : n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────

/** Delta vs the previous month: green up, amber down, muted when unknown. */
export function Delta({ value, size = 28 }: { value: number | null; size?: 24 | 28 }) {
  if (value === null)
    return (
      <span className="inline-flex items-center whitespace-nowrap" style={{ height: size, padding: "0 10px", borderRadius: 999, background: C.raise, ...T.foot, color: C.text3 }}>
        —
      </span>
    );
  const t = value > 0 ? TONE.green : TONE.amber;
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{ height: size, padding: "0 10px", borderRadius: 999, background: value === 0 ? C.raise : t.bg, color: value === 0 ? C.text2 : t.fg, fontSize: 12, ...T.num, fontWeight: 400 }}
    >
      {value > 0 ? "+" : value < 0 ? "−" : "±"}
      {Math.abs(value)}%
    </span>
  );
}

export function Card({ children, className = "", style, block, onClick }: { children: ReactNode; className?: string; style?: React.CSSProperties; block?: string; onClick?: () => void }) {
  return (
    <section
      data-lab-block={block}
      onClick={onClick}
      className={`flex min-w-0 flex-col ${onClick ? "cursor-pointer transition-colors duration-150 hover:bg-[#161619]" : ""} ${className}`}
      style={{ background: C.card, borderRadius: R.card, ...style }}
    >
      {children}
    </section>
  );
}

export function TipCard({ head, value, items, empty, lines, style }: { head: ReactNode; value: ReactNode; items?: string[]; empty?: string; lines?: { dot: string; label: ReactNode; value: ReactNode }[]; style?: React.CSSProperties }) {
  return (
    <div
      className="pointer-events-none absolute z-20 p-3"
      style={{ width: 256, background: C.panel, borderRadius: R.small, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 16px 40px rgba(0,0,0,0.5)`, ...style }}
    >
      <div className="flex items-baseline justify-between gap-3" style={{ ...T.foot, color: C.text2 }}>
        <span className="truncate">{head}</span>
        <span className="shrink-0" style={{ color: C.text }}>{value}</span>
      </div>
      {lines && (
        <div className="mt-2 flex flex-col gap-1.5">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2" style={{ fontSize: 12, color: C.text2 }}>
              <span className="shrink-0" style={{ width: 8, height: 3, borderRadius: 9, background: l.dot }} />
              <span className="min-w-0 flex-1 truncate">{l.label}</span>
              <span className="shrink-0" style={{ color: C.text, ...T.num, fontWeight: 400 }}>{l.value}</span>
            </div>
          ))}
        </div>
      )}
      {items && items.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {items.slice(0, 6).map((t, i) => (
            <li key={i} className="flex items-center gap-2" style={{ fontSize: 12, color: C.text2 }}>
              <span className="shrink-0" style={{ width: 4, height: 4, borderRadius: 9, background: C.accent }} />
              <span className="truncate">{t}</span>
            </li>
          ))}
          {items.length > 6 && <li style={{ fontSize: 12, color: C.text3 }}>и ещё {items.length - 6}</li>}
        </ul>
      ) : empty ? (
        <div className="mt-2" style={{ fontSize: 12, color: C.text3 }}>{empty}</div>
      ) : null}
    </div>
  );
}

// ── Month-to-month chart ─────────────────────────────────────────────────────────────────────

const smooth = (pts: (readonly [number, number])[]) =>
  pts.reduce((acc, [px, py], i) => {
    if (i === 0) return `M${px},${py}`;
    const [qx, qy] = pts[i - 1];
    const cx = (qx + px) / 2;
    return `${acc} C${cx},${qy} ${cx},${py} ${px},${py}`;
  }, "");

/**
 * This month against the previous one by day of month.
 * «Накопительно»: two running totals — this month solid blue, the previous one a quiet dashed line.
 * «По дням»: pairs of capsules — previous month a hairline ghost, this month filled.
 * Hover shows both months for that day and what was closed on it.
 */
export function MonthCompareChart({ cur, prev, curLabel, prevLabel, mode, height = 260, goal }: { cur: MonthDay[]; prev: MonthDay[]; curLabel: string; prevLabel: string; mode: "cum" | "daily"; height?: number; goal: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(cur.length, prev.length);
  const realCur = cur.filter((d) => !d.future);
  const cumC: number[] = [];
  const cumP: number[] = [];
  cur.forEach((d, i) => cumC.push((cumC[i - 1] ?? 0) + d.closed));
  prev.forEach((d, i) => cumP.push((cumP[i - 1] ?? 0) + d.closed));
  const padT = 20;
  const H = height - 6;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);
  const hi = hover ?? Math.max(0, realCur.length - 1);
  const dC = cur[hi];
  const dP = prev[hi];
  const every = Math.ceil(n / 8);

  let body: ReactNode = null;
  if (w > 0 && mode === "cum") {
    const max = Math.max(1, cumC[realCur.length - 1] ?? 0, cumP[cumP.length - 1] ?? 0) * 1.1;
    const y = (v: number) => H - (v / max) * (H - padT);
    const pc = cumC.slice(0, realCur.length).map((v, i) => [x(i), y(v)] as const);
    const pp = cumP.map((v, i) => [x(i), y(v)] as const);
    const dc = smooth(pc);
    body = (
      <svg width={w} height={height} className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id="mcfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.accent} stopOpacity="0.24" />
            <stop offset="1" stopColor={C.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {pp.length > 1 && <path d={smooth(pp)} fill="none" stroke="#5E6068" strokeWidth={1.75} strokeDasharray="5 5" />}
        {pc.length > 1 && <path d={`${dc} L${pc[pc.length - 1][0]},${H} L0,${H} Z`} fill="url(#mcfill)" />}
        {pc.length > 0 && <path d={dc} fill="none" stroke={C.accent} strokeWidth={2.25} />}
        {hover !== null && <line x1={x(hi)} x2={x(hi)} y1={0} y2={H} stroke={C.text3} strokeDasharray="3 4" />}
        {pp[hi] && <circle cx={pp[hi][0]} cy={pp[hi][1]} r={4} fill={C.panel} stroke="#7A7C84" strokeWidth={1.75} />}
        {pc[hi] && <circle cx={pc[hi][0]} cy={pc[hi][1]} r={5} fill={C.panel} stroke={C.accent} strokeWidth={2} />}
      </svg>
    );
  } else if (w > 0) {
    const max = Math.max(1, goal, ...cur.map((d) => d.closed), ...prev.map((d) => d.closed));
    const slot = w / n;
    const bw = Math.max(3, Math.min(10, slot / 2 - 2));
    const h = (v: number) => (v > 0 ? Math.max(6, (v / max) * (H - padT)) : 4);
    const gy = H - (goal / max) * (H - padT);
    body = (
      <svg width={w} height={height} className="absolute inset-0 overflow-visible">
        <line x1={0} x2={w} y1={gy} y2={gy} stroke={C.line2} strokeDasharray="4 5" />
        {Array.from({ length: n }, (_, i) => {
          const cx = slot * i + slot / 2;
          const p = prev[i];
          const c = cur[i];
          const on = i === hi;
          return (
            <g key={i}>
              {p && <rect x={cx - bw - 1} y={H - h(p.closed)} width={bw} height={h(p.closed)} rx={bw / 2} fill="transparent" stroke={on ? "#7A7C84" : "#3A3A42"} strokeWidth={1} />}
              {c && !c.future && <rect x={cx + 1} y={H - h(c.closed)} width={bw} height={h(c.closed)} rx={bw / 2} fill={on ? C.accent : c.closed ? "#3D6FA8" : C.raise} />}
            </g>
          );
        })}
      </svg>
    );
  }

  const tipLeft = w ? Math.max(0, Math.min(w - 256, x(hi) - 128)) : 0;
  return (
    <div>
      <div
        ref={ref}
        className="relative cursor-crosshair"
        style={{ height }}
        onMouseMove={(e) => {
          if (!w) return;
          const rx = e.clientX - e.currentTarget.getBoundingClientRect().left;
          const i = mode === "cum" ? Math.round((rx / w) * (n - 1)) : Math.floor((rx / w) * n);
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {body}
        {mode === "daily" && w > 0 && (
          <span className="pointer-events-none absolute right-0" style={{ top: H - (goal / Math.max(1, goal, ...cur.map((d) => d.closed), ...prev.map((d) => d.closed))) * (H - padT) - 18, fontSize: 11, color: C.text3 }}>
            норма {goal}
          </span>
        )}
        {hover !== null && (
          <TipCard
            head={`${hi + 1}-е число`}
            value=""
            style={{ top: -8, left: tipLeft, transform: "translateY(-100%)" }}
            lines={[
              { dot: C.accent, label: curLabel, value: !dC ? "—" : dC.future ? "впереди" : mode === "cum" ? `${cumC[hi]} · +${dC.closed}` : dC.closed },
              { dot: "#7A7C84", label: prevLabel, value: !dP ? "—" : mode === "cum" ? `${cumP[hi]} · +${dP.closed}` : dP.closed },
            ]}
            items={dC && !dC.future ? dC.titles : undefined}
          />
        )}
      </div>
      <div className="relative mt-3" style={{ height: 14 }}>
        {Array.from({ length: n }, (_, i) =>
          (i % every === 0 && n - 1 - i >= every * 0.75) || i === n - 1 ? (
            <span
              key={i}
              className="absolute whitespace-nowrap"
              style={{ left: mode === "cum" ? x(i) : (w / n) * (i + 0.5), transform: `translateX(${mode === "cum" && i === 0 ? "0" : mode === "cum" && i === n - 1 ? "-100%" : "-50%"})`, fontSize: 11, color: i === hi ? C.text2 : C.text3 }}
            >
              {i + 1}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────────────────────

const heatStep = (v: number, max: number) => (v <= 0 ? C.raise : v / max < 0.34 ? "rgba(10,132,255,0.30)" : v / max < 0.67 ? "rgba(10,132,255,0.60)" : C.accent);

/** A real calendar month: weekday columns (Пн…Вс), cells tinted by closures; hover → that day. */
export function MonthHeat({ days, rowH = 28, gap = 6, goal }: { days: MonthDay[]; rowH?: number; gap?: number; goal?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.closed));
  const lead = days[0]?.weekday ?? 0;
  const cells: (MonthDay | null)[] = [...Array(lead).fill(null), ...days];
  const rows = Math.ceil(cells.length / 7);
  const h = hover !== null ? days[hover] : null;
  const hi = hover !== null ? hover + lead : -1;
  return (
    <div className="relative w-full" onMouseLeave={() => setHover(null)}>
      <div className="mb-2 grid grid-cols-7" style={{ gap }}>
        {WEEKDAYS.map((l) => (
          <span key={l} className="text-center" style={{ fontSize: 11, color: C.text3 }}>{l}</span>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gap, gridAutoRows: rowH }}>
        {cells.map((d, i) =>
          d ? (
            <span
              key={d.key}
              onMouseEnter={() => setHover(i - lead)}
              className="grid place-items-center"
              style={{
                borderRadius: 8,
                background: d.future ? "transparent" : heatStep(d.closed, max),
                boxShadow: d.future ? `inset 0 0 0 1px ${C.line}` : i === hi ? `inset 0 0 0 1px ${C.text2}` : undefined,
                fontSize: 10,
                color: d.future ? C.text3 : d.closed / max >= 0.67 ? "#fff" : d.closed ? "#CFE4FF" : C.text3,
              }}
            >
              {d.dom}
            </span>
          ) : (
            <span key={`x${i}`} />
          )
        )}
      </div>
      {h && !h.future && (
        <TipCard
          head={fmtDay(h.date, { day: "numeric", month: "long", weekday: "short" })}
          value={`${h.closed} ${tasksWord(h.closed)}${goal && h.closed >= goal ? " · норма" : ""}`}
          items={h.titles}
          empty={h.closed ? "Названия не сохранились" : "Ничего не закрыто"}
          style={{ bottom: rows * rowH + (rows - 1) * gap - Math.floor(hi / 7) * (rowH + gap) + 8, left: `clamp(0px, calc(${(((hi % 7) + 0.5) / 7) * 100}% - 128px), calc(100% - 256px))` }}
        />
      )}
    </div>
  );
}

// ── Task lists & editor ──────────────────────────────────────────────────────────────────────

export function useTaskActions() {
  const { deleteTask, restoreTask, toggleTask } = useData();
  const { toast } = useToast();
  return {
    toggle: (id: string) => toggleTask(id),
    remove: (t: Task) => {
      deleteTask(t.id);
      const run = pushUndo("Задача удалена", () => restoreTask(t));
      toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
    },
  };
}

/** One task row: check · title · project · date on the right · trash on hover. Click → editor. */
export function TaskRow({ t, projectName, onOpen, onToggle, onDelete, pad = 24, mode }: { t: Task; projectName?: string; onOpen: () => void; onToggle: () => void; onDelete?: () => void; pad?: number; mode: "closed" | "open" }) {
  const late = !t.done && isOverdue(t.dueDate);
  const date = mode === "closed" ? (t.completedAt ? fmtShort(new Date(t.completedAt)) : "") : t.dueDate ? (late ? `с ${dueLabel(t.dueDate)}` : dueLabel(t.dueDate)) : "без срока";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group grid cursor-pointer items-center gap-4 outline-none transition-colors duration-150 hover:bg-[#17171A] focus-visible:bg-[#17171A]"
      style={{ gridTemplateColumns: `22px minmax(0,1fr) auto${onDelete ? " 32px" : ""}`, minHeight: 52, padding: `0 ${pad}px`, ...dashed }}
    >
      <RoundCheck done={t.done} onChange={onToggle} />
      <div className="flex min-w-0 items-center gap-2">
        {t.priority > 0 && <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[t.priority] }} />}
        <span className="truncate" style={{ ...T.body, fontSize: 15, color: t.done && mode === "open" ? C.text3 : C.text, textDecoration: t.done && mode === "open" ? "line-through" : undefined }}>
          {t.title}
        </span>
        {projectName && <span className="shrink-0 truncate" style={{ ...T.body, color: C.text3, maxWidth: 180 }}>· {projectName}</span>}
      </div>
      <span className="whitespace-nowrap text-right" style={{ ...T.body, color: late ? TONE.amber.fg : C.text3 }}>{!t.done || mode === "closed" ? date : "готово"}</span>
      {onDelete && (
        <button
          type="button"
          title="Удалить задачу"
          aria-label="Удалить задачу"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF6B63] focus-visible:opacity-100 group-hover:opacity-100"
          style={{ color: C.text3 }}
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

/** Dialog with a plain task list (the real page's «Закрыто за N дн.» / «Открытые задачи» popups). */
export function TaskListDialog({ title, count, tasks, mode, projectName, onClose, onOpen }: { title: string; count: number; tasks: Task[]; mode: "closed" | "open"; projectName: (id?: string) => string | undefined; onClose: () => void; onOpen: (t: Task) => void }) {
  const act = useTaskActions();
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[80vh] w-full max-w-[640px] flex-col"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 p-6 pb-4">
          <div className="flex items-baseline gap-2">
            <span style={T.h2}>{title}</span>
            <span style={{ ...T.h2, color: C.text3 }}>{count}</span>
          </div>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <div className="mx-6 mb-6 min-h-0 overflow-y-auto [scrollbar-width:thin]" style={{ background: C.card, borderRadius: R.inner }}>
          {tasks.length === 0 ? (
            <div className="px-5 py-8 text-center" style={{ ...T.body, color: C.text3 }}>{mode === "closed" ? "В этом месяце ничего не закрыто" : "Открытых задач нет"}</div>
          ) : (
            tasks.map((t) => <TaskRow key={t.id} t={t} mode={mode} pad={20} projectName={projectName(t.projectId)} onOpen={() => onOpen(t)} onToggle={() => act.toggle(t.id)} onDelete={() => act.remove(t)} />)
          )}
        </div>
      </div>
    </div>
  );
}

const PRIOS: { p: Priority; label: string }[] = [
  { p: 1, label: "Высокий" },
  { p: 2, label: "Средний" },
  { p: 3, label: "Низкий" },
  { p: 0, label: "Без приоритета" },
];

/** Task editor — the main screen's TaskEditor (same fields, same buttons, Esc closes). */
export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { projects, allProjects, updateTask } = useData();
  // Active projects plus the task's own one if it was archived — so the select shows the truth.
  const projectOptions = task.projectId && !projects.some((p) => p.id === task.projectId) ? [...projects, ...allProjects.filter((p) => p.id === task.projectId)] : projects;
  const act = useTaskActions();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [due, setDue] = useState(task.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [estimate, setEstimate] = useState(task.estimateMin ? String(task.estimateMin) : "");
  useEsc(onClose);
  const save = () => {
    if (!title.trim()) return;
    const est = Math.max(0, Math.round(Number(estimate)));
    updateTask(task.id, { title: title.trim(), description: description.trim() || undefined, dueDate: due || undefined, priority, projectId: projectId || undefined, estimateMin: est || undefined });
    onClose();
  };
  const field = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text } as const;
  const label = { ...T.foot, color: C.text3, marginBottom: 6 } as const;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Задача"
        className="flex w-full max-w-[560px] flex-col gap-5 p-6"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span style={T.h2}>Задача</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="w-full bg-transparent outline-none" style={{ ...field, height: 52, fontSize: 16 }} placeholder="Название задачи" />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Описание, ссылки, детали…"
          className="w-full resize-none bg-transparent outline-none placeholder:text-[#5E6068]"
          style={{ ...field, height: "auto", padding: "12px 14px", lineHeight: 1.45 }}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col">
            <span style={label}>Срок</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="outline-none [color-scheme:dark]" style={field} />
          </label>
          <label className="flex flex-col">
            <span style={label}>Оценка, мин</span>
            <input type="number" min={0} step={15} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="—" className="outline-none" style={field} />
          </label>
        </div>
        <div className="flex flex-col">
          <span style={label}>Приоритет</span>
          <div className="flex flex-wrap gap-1.5">
            {PRIOS.map(({ p, label: l }) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className="inline-flex items-center gap-2 px-3.5 transition-colors"
                style={{ height: 36, borderRadius: 999, fontSize: 14, background: priority === p ? C.raise : "transparent", boxShadow: `inset 0 0 0 1px ${priority === p ? C.line2 : C.line}`, color: priority === p ? C.text : C.text2 }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[p] }} />
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col">
          <span style={label}>Проект</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="outline-none [color-scheme:dark]" style={field}>
            <option value="">Без проекта</option>
            {projectOptions.map((pr) => (
              <option key={pr.id} value={pr.id}>{pr.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => {
              act.remove(task);
              onClose();
            }}
            className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]"
            style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}
          >
            <Trash2 size={16} strokeWidth={1.75} />
            Удалить
          </button>
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={onClose}>Отмена</Btn>
            <Btn onClick={save} disabled={!title.trim()}>Сохранить</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What the dialogs need from the screen's model. */
export interface DialogSource {
  closedTasks: Task[];
  openTasks: Task[];
  closedTitle: string;
  projectName: (id?: string) => string | undefined;
}

/** Closed / open task lists (the real page's popups) and the editor. Render `node` once. */
export function useDialogs(m: DialogSource) {
  const { allTasks } = useData();
  const [list, setList] = useState<null | { mode: "closed" | "open"; title?: string; ids: string[] }>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const editing = editId ? allTasks.find((t) => t.id === editId) : undefined;
  /** Snapshot ids so a task toggled inside the list stays visible until the dialog closes. */
  const listTasks = useMemo(() => {
    if (!list) return [];
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    return list.ids.map((id) => byId.get(id)).filter((t): t is Task => !!t);
  }, [list, allTasks]);
  const openClosed = (title?: string, tasks?: Task[]) => setList({ mode: "closed", title, ids: (tasks ?? m.closedTasks).map((t) => t.id) });
  const openOpen = (title?: string, tasks?: Task[]) => setList({ mode: "open", title, ids: (tasks ?? m.openTasks).map((t) => t.id) });
  const edit = (t: Task) => setEditId(t.id);
  const node = (
    <>
      {list && (
        <TaskListDialog
          projectName={m.projectName}
          mode={list.mode}
          title={list.title ?? (list.mode === "closed" ? m.closedTitle : "Открытые задачи")}
          count={listTasks.length}
          tasks={listTasks}
          onClose={() => !editId && setList(null)}
          onOpen={edit}
        />
      )}
      {editing && <TaskEditor key={editing.id} task={editing} onClose={() => setEditId(null)} />}
    </>
  );
  return { openClosed, openOpen, edit, node };
}
