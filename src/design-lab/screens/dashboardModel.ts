/**
 * Design lab · the dashboard's DATA + ACTIONS, extracted from pages/Dashboard.tsx so that brand-new
 * compositions can be built on exactly the same behaviour. Every variant renders from this model;
 * no variant computes its own numbers — so a redesign can't silently change what the user sees.
 */
import { useEffect, useMemo, useState } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { isToday, isOverdue, dueLabel, formatDuration, todayStr, localDayStr, addDays } from "@/lib/format";
import { computeStreak } from "@/lib/gameStats";
import { levelProgress } from "@/lib/gamification";
import { parseNaturalInput } from "@/lib/nlp";
import { pushUndo } from "@/lib/undoStack";
import { isSnoozed } from "@/lib/taskGrouping";
import { todaySubtaskRows } from "@/lib/subtasks";
import { projectHealth, type HealthLevel } from "@/lib/projectHealth";
import { clientMoney } from "@/lib/clients";
import { fetchLibrary, type LibraryItem } from "@/lib/library";
import { NAV_ITEMS } from "@/lib/navConfig";
import { PRIORITY_META, levelTitle, type Priority, type Task } from "@/types";

export interface TodayRow {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
  priorityLabel: string;
  priorityShort: string;
  due?: string;
  dueLabel: string;
  overdue: boolean;
  /** Beyond the daily focus limit — visible but de-emphasised. */
  overLimit: boolean;
  projectName?: string;
  spentMin: number;
  estimateMin?: number;
  subtasksDone: number;
  subtasksTotal: number;
  task: Task;
}

export interface ProjectRow {
  id: string;
  name: string;
  done: number;
  total: number;
  pct: number;
  overdue: number;
  spentMin: number;
  spentLabel: string;
  health: HealthLevel;
  healthLabel: string;
  clientName?: string;
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  "off-track": "Сорвано",
  "at-risk": "Риск",
  "on-track": "В графике",
  done: "Готово",
  empty: "Пусто",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function useDashboardModel() {
  const data = useData();
  const {
    tasks, meetings, projects, clients, completionLog, gamification, settings,
    toggleTask, updateTask, addTask, addNote, toggleMeeting, deleteTask, restoreTask,
  } = data;
  const { toast } = useToast();

  const [library, setLibrary] = useState<LibraryItem[]>([]);
  useEffect(() => {
    fetchLibrary().then(setLibrary).catch(() => {});
  }, []);

  return useMemo(() => {
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const clientName = new Map(clients.map((c) => [c.id, c.name]));

    // ── Today (same rules as pages/Dashboard.tsx) ───────────────────────────────────────────
    const todayTasks = tasks
      .filter((t) => t.dueDate && !isSnoozed(t) && (isToday(t.dueDate) || (isOverdue(t.dueDate) && !t.done)))
      .sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        if (a.priority !== b.priority) return (a.priority || 9) - (b.priority || 9);
        return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      });
    const focusLimit = settings.dailyFocusLimit ?? 0;
    const overLimitIds = new Set<string>(
      focusLimit > 0 ? todayTasks.filter((t) => !t.done).slice(focusLimit).map((t) => t.id) : []
    );
    const todaySubs = todaySubtaskRows(tasks);
    const todayOpen = todayTasks.filter((t) => !t.done).length;
    const todayDone = todayTasks.length - todayOpen;
    const todayTotal = todayTasks.length + todaySubs.length;
    const overdueToday = todayTasks.filter((t) => !t.done && isOverdue(t.dueDate)).length;
    const minutesToday = todayTasks.reduce((s, t) => s + t.spentMin, 0);

    const today: TodayRow[] = todayTasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      priority: t.priority,
      priorityLabel: PRIORITY_META[t.priority].label,
      priorityShort: PRIORITY_META[t.priority].short,
      due: t.dueDate,
      dueLabel: t.dueDate ? dueLabel(t.dueDate) : "",
      overdue: !t.done && isOverdue(t.dueDate),
      overLimit: overLimitIds.has(t.id),
      projectName: t.projectId ? projectName.get(t.projectId) : undefined,
      spentMin: t.spentMin,
      estimateMin: t.estimateMin,
      subtasksDone: (t.subtasks ?? []).filter((s) => s.done).length,
      subtasksTotal: (t.subtasks ?? []).length,
      task: t,
    }));
    const plan = today.filter((r) => !r.overLimit);
    const overPlan = today.filter((r) => r.overLimit);

    // ── Totals ──────────────────────────────────────────────────────────────────────────────
    const openAll = tasks.filter((t) => !t.done);
    const overdueAll = openAll.filter((t) => isOverdue(t.dueDate)).length;
    const doneAll = tasks.filter((t) => t.done).length;
    const inProgress = openAll.length - overdueAll;
    const openByPriority = ([1, 2, 3, 0] as Priority[]).map((p) => ({
      priority: p,
      label: PRIORITY_META[p].label,
      count: openAll.filter((t) => t.priority === p).length,
    }));

    // ── Rhythm ──────────────────────────────────────────────────────────────────────────────
    const dynamics = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return { label: `${d.getDate()}.${d.getMonth() + 1}`, date: localDayStr(d), value: completionLog[localDayStr(d)] ?? 0 };
    });
    const year = Array.from({ length: 7 * 26 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (7 * 26 - 1 - i));
      return { date: localDayStr(d), value: completionLog[localDayStr(d)] ?? 0 };
    });
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
      const key = localDayStr(d);
      return {
        key,
        label: WEEKDAYS[i],
        isToday: key === todayStr(),
        done: tasks.filter((t) => t.done && t.completedAt && localDayStr(new Date(t.completedAt)) === key).length,
      };
    });
    const weekDone = week.reduce((s, d) => s + d.done, 0);
    const closed14 = dynamics.reduce((s, d) => s + d.value, 0);
    const peak14 = Math.max(0, ...dynamics.map((d) => d.value));
    const closedToday = completionLog[todayStr()] ?? 0;
    const streak = computeStreak(completionLog);
    const lvl = levelProgress(gamification.xp);

    // ── Projects ────────────────────────────────────────────────────────────────────────────
    const rank: Record<HealthLevel, number> = { "off-track": 0, "at-risk": 1, "on-track": 2, done: 3, empty: 4 };
    const projectRows: ProjectRow[] = projects
      .map((p) => {
        const pt = tasks.filter((t) => t.projectId === p.id);
        const done = pt.filter((t) => t.done).length;
        const spent = pt.reduce((s, t) => s + t.spentMin, 0);
        const health = projectHealth(pt);
        return {
          id: p.id,
          name: p.name,
          done,
          total: pt.length,
          pct: pt.length ? (done / pt.length) * 100 : 0,
          overdue: pt.filter((t) => !t.done && isOverdue(t.dueDate)).length,
          spentMin: spent,
          spentLabel: formatDuration(spent),
          health,
          healthLabel: HEALTH_LABEL[health],
          clientName: p.clientId ? clientName.get(p.clientId) : undefined,
        };
      })
      .sort((a, b) => rank[a.health] - rank[b.health]);

    // ── Meetings ────────────────────────────────────────────────────────────────────────────
    const startOfToday = new Date(new Date().toDateString());
    const upcomingMeetings = meetings
      .filter((m) => new Date(m.date) >= startOfToday)
      .sort((a, b) => {
        if (!!a.done !== !!b.done) return Number(!!a.done) - Number(!!b.done);
        return (a.date + a.time).localeCompare(b.date + b.time);
      })
      .map((m) => ({ ...m, dateLabel: dueLabel(m.date), clientName: m.clientId ? clientName.get(m.clientId) : undefined }));

    // ── Money (clients) ─────────────────────────────────────────────────────────────────────
    const money = clients.reduce(
      (acc, c) => {
        const m = clientMoney(c);
        acc.paidThisMonth += m.paidThisMonth;
        acc.pending += m.pending;
        acc.overdue += m.overdue;
        acc.paidTotal += m.paidTotal;
        return acc;
      },
      { paidThisMonth: 0, pending: 0, overdue: 0, paidTotal: 0 }
    );
    const followUps = clients
      .filter((c) => c.followUpAt && c.followUpAt <= todayStr())
      .map((c) => ({ id: c.id, name: c.name, date: c.followUpAt! }));

    // ── Reading pick (same seeded daily rotation as ReadingWidget) ──────────────────────────
    const queue = [...library.filter((i) => i.status === "doing"), ...library.filter((i) => i.status === "want")];
    const seed = [...todayStr()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const reading = queue.length ? queue[seed % queue.length] : null;

    // ── Navigation (same items/order as the real sidebar) ───────────────────────────────────
    const nav = NAV_ITEMS.filter((n) => !["calendar", "archive"].includes(n.id)).map((n) => ({
      ...n,
      badge: n.id === "tasks" ? todayOpen : undefined,
    }));

    // ── Actions — the same store calls the real dashboard makes ─────────────────────────────
    const actions = {
      toggle: (id: string) => toggleTask(id),
      add: (raw: string) => {
        if (!raw.trim()) return;
        const parsed = parseNaturalInput(raw);
        addTask({
          title: parsed.title.trim() || raw.trim(),
          done: false,
          dueDate: parsed.dueDate || todayStr(),
          priority: 0,
          tags: parsed.tags,
          important: parsed.important,
          remindAt: parsed.remindAt,
          estimateMin: parsed.estimateMin,
          recurrence: parsed.recurrence,
        });
      },
      remove: (t: Task) => {
        deleteTask(t.id);
        const run = pushUndo("Задача удалена", () => restoreTask(t));
        toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
      },
      moveOverPlanToTomorrow: () => {
        const tomorrow = addDays(new Date(), 1);
        overLimitIds.forEach((id) => updateTask(id, { dueDate: tomorrow }));
        toast(`Перенесено на завтра: ${overLimitIds.size}`);
      },
      saveNote: (text: string) => {
        if (!text.trim()) return;
        addNote({ title: text.trim().split("\n")[0].slice(0, 60), body: text.trim(), pinned: false });
        toast("Заметка сохранена");
      },
      toggleMeeting: (id: string) => toggleMeeting(id),
    };

    return {
      greeting: greeting(),
      dateLabel: new Date()
        .toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
        .replace(/^./, (c) => c.toUpperCase()),
      kpi: {
        todayDone,
        todayTotal,
        todayOpen,
        overdueToday,
        minutesToday,
        timeLabel: formatDuration(minutesToday),
        openCount: openAll.length,
        weekDone,
        closedToday,
        dailyGoal: gamification.dailyGoal,
        streak,
        bestStreak: gamification.bestStreak,
        level: lvl.level,
        levelTitle: levelTitle(lvl.level),
        levelPct: lvl.pct,
        xpToNext: lvl.toNext,
        gamification: gamification.enabled,
      },
      today,
      plan,
      overPlan,
      focusLimit,
      status: { doneAll, inProgress, overdueAll, openByPriority },
      dynamics,
      closed14,
      peak14,
      week,
      year,
      projects: projectRows,
      meetings: upcomingMeetings,
      money,
      followUps,
      reading,
      nav,
      actions,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, meetings, projects, clients, completionLog, gamification, settings, library]);
}

export type DashboardModel = ReturnType<typeof useDashboardModel>;

/** Money formatter for compact display: 125 000 ₽. */
export function rub(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}
