import { isOverdue, isToday, formatDuration, localDayStr, addDays } from "@/lib/format";
import { levelProgress } from "@/lib/gamification";
import { PRIORITY_META } from "@/types";
import type { useData } from "@/store/DataProvider";

type Ctx = ReturnType<typeof useData>;

/** Compact text snapshot of the user's live data — sent as the system prompt for every AI request. */
export function buildAiContext(ctx: Ctx): string {
  const { tasks, projects, notes, meetings, completionLog, gamification, pomodoroSessions } = ctx;

  const openTasks = tasks.filter((t) => !t.done);
  const upcomingMeetings = [...meetings]
    .filter((m) => !m.done)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 15);
  const overdue = openTasks.filter((t) => isOverdue(t.dueDate));
  const today = openTasks.filter((t) => t.dueDate && isToday(t.dueDate));
  const byPriority = ([1, 2, 3, 0] as const).map((p) => ({
    label: PRIORITY_META[p].label,
    count: openTasks.filter((t) => t.priority === p).length,
  }));

  const weekCutoff = addDays(new Date(), -6);
  const weekDone = Object.entries(completionLog)
    .filter(([date]) => date >= weekCutoff)
    .reduce((s, [, n]) => s + n, 0);

  let streak = 0;
  {
    const d = new Date();
    if (!completionLog[localDayStr(d)]) d.setDate(d.getDate() - 1);
    while (completionLog[localDayStr(d)]) { streak++; d.setDate(d.getDate() - 1); }
  }

  const lvl = levelProgress(gamification.xp);
  const focusMin = (pomodoroSessions ?? []).filter((p) => p.kind === "work").reduce((s, p) => s + p.minutes, 0);

  const projectLines = projects.slice(0, 15).map((p) => {
    const pt = tasks.filter((t) => t.projectId === p.id);
    const done = pt.filter((t) => t.done).length;
    return `- ${p.name}: ${done}/${pt.length} задач выполнено`;
  });

  const recentNotes = [...notes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((n) => `- ${n.title || "без названия"}`);

  const overdueLines = overdue.slice(0, 20).map((t) => `- ${t.title} (срок: ${t.dueDate})`);
  const todayLines = today.slice(0, 20).map((t) => `- ${t.title}${t.done ? " ✓" : ""}`);
  const meetingLines = upcomingMeetings.map((m) => `- ${m.title} (${m.date} ${m.time})`);

  return [
    "Ты — ассистент личного таск-менеджера пользователя. Отвечай кратко, по-русски, по делу, опираясь на данные ниже.",
    "",
    `## Сводка`,
    `Открыто задач: ${openTasks.length}. Просрочено: ${overdue.length}. На сегодня: ${today.length}. Встреч предстоит: ${upcomingMeetings.length}.`,
    `Закрыто за неделю: ${weekDone}. Текущий стрик: ${streak} дн. Уровень: ${lvl.level} (${gamification.xp} XP). Всего фокуса: ${formatDuration(focusMin)}.`,
    `Открытые по приоритету: ${byPriority.map((p) => `${p.label} — ${p.count}`).join(", ")}.`,
    "",
    overdueLines.length ? `## Просроченные задачи\n${overdueLines.join("\n")}` : "",
    todayLines.length ? `## Задачи на сегодня\n${todayLines.join("\n")}` : "",
    meetingLines.length ? `## Предстоящие встречи\n${meetingLines.join("\n")}` : "",
    projectLines.length ? `## Проекты\n${projectLines.join("\n")}` : "",
    recentNotes.length ? `## Последние заметки\n${recentNotes.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}
