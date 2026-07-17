import type { AppData } from "@/types";
import { DEFAULT_SETTINGS, DEFAULT_GAMIFICATION } from "@/types";
import { uid } from "@/lib/id";
import { addDays } from "@/lib/format";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysAgoDate(n: number): string {
  return addDays(new Date(), -n);
}

function daysFromNow(n: number): string {
  return addDays(new Date(), n);
}

export function seedData(): AppData {
  const clientA = uid();
  const clientB = uid();
  const clientC = uid();
  const projectA = uid();
  const projectB = uid();

  // A few weeks of demo focus intervals so Analytics renders alive from first load.
  const pomodoroSessions = [6, 5, 5, 4, 3, 3, 2, 1, 1, 0].flatMap((day) =>
    Array.from({ length: [2, 3, 1, 4, 2, 1, 3, 2, 4, 1][day] ?? 2 }, () => ({
      id: uid(),
      kind: "work" as const,
      minutes: 25,
      startedAt: daysAgo(day),
      date: daysAgoDate(day),
    }))
  );

  return {
    settings: { ...DEFAULT_SETTINGS },
    gamification: { ...DEFAULT_GAMIFICATION, xp: 230, bestStreak: 7 },
    pomodoroSessions,
    completionLog: {
      [daysAgoDate(6)]: 2,
      [daysAgoDate(5)]: 4,
      [daysAgoDate(4)]: 1,
      [daysAgoDate(3)]: 5,
      [daysAgoDate(2)]: 3,
      [daysAgoDate(1)]: 6,
      [daysAgoDate(0)]: 2,
    },
    clients: [],
    projects: [
      { id: projectA, name: "Демо дашборда", status: "active", createdAt: daysAgo(10) },
      { id: projectB, name: "Редизайн карточки", status: "active", createdAt: daysAgo(5) },
      { id: uid(), name: "Личный сайт-портфолио", status: "active", createdAt: daysAgo(15) },
    ],
    tasks: [
      {
        id: uid(),
        title: "Прайс на серию лендингов",
        projectId: projectA,
        done: false,
        important: true,
        priority: 1,
        dueDate: daysFromNow(0),
        recurrence: "none",
        estimateMin: 90,
        spentMin: 35,
        tags: ["клиент", "деньги"],
        order: 0,
        links: [],
        comments: [],
        attachments: [],
        subtasks: [
          { id: uid(), title: "Собрать референсы", done: true },
          { id: uid(), title: "Согласовать с клиентом", done: false },
        ],
        createdAt: daysAgo(3),
      },
      {
        id: uid(),
        title: "Утренний апдейт по проектам",
        done: false,
        important: false,
        priority: 3,
        dueDate: daysFromNow(0),
        recurrence: "daily",
        estimateMin: 15,
        spentMin: 0,
        tags: ["рутина"],
        order: 1,
        links: [],
        comments: [],
        attachments: [],
        subtasks: [],
        createdAt: daysAgo(1),
      },
      {
        id: uid(),
        title: "Подготовить отчёт для клиента",
        projectId: projectB,
        done: false,
        important: false,
        priority: 2,
        dueDate: daysFromNow(-1),
        recurrence: "none",
        estimateMin: 120,
        spentMin: 0,
        tags: ["клиент"],
        order: 2,
        links: [],
        comments: [],
        attachments: [],
        subtasks: [
          { id: uid(), title: "Собрать метрики за квартал", done: false },
          { id: uid(), title: "Добавить графики по конверсии", done: false },
        ],
        createdAt: daysAgo(2),
      },
      {
        id: uid(),
        title: "Обновить портфолио",
        done: false,
        important: false,
        priority: 0,
        dueDate: daysFromNow(4),
        recurrence: "none",
        estimateMin: 180,
        spentMin: 20,
        tags: ["личное"],
        order: 3,
        links: [],
        comments: [],
        attachments: [],
        subtasks: [
          { id: uid(), title: "Выбрать 5 лучших кейсов", done: false },
          { id: uid(), title: "Написать описания", done: false },
          { id: uid(), title: "Выложить на сайт", done: false },
        ],
        createdAt: daysAgo(7),
      },
      {
        id: uid(),
        title: "Купить подарок на день рождения",
        done: false,
        important: false,
        priority: 0,
        recurrence: "none",
        spentMin: 0,
        tags: ["личное"],
        order: 4,
        links: [],
        comments: [],
        attachments: [],
        subtasks: [],
        createdAt: daysAgo(1),
      },
    ],
    notes: [
      {
        id: uid(),
        title: "Идеи для дашборда",
        body: "# Что важно\nПоказать риск клиентов **прямо на дашборде**, без графиков.\n\nСледующие шаги:\n- [ ] Собрать метрики за квартал\n- [ ] Добавить блок «сегодня связаться»\n- [x] Убрать лишние клики",
        pinned: true,
        tags: ["продукт"],
        linkedProjectId: projectA,
        createdAt: daysAgo(4),
      },
      {
        id: uid(),
        title: "Скрипт первого созвона",
        body: "1. Контекст задачи. 2. Бюджет и сроки. 3. Следующий шаг и дата.",
        pinned: false,
        tags: ["шаблоны"],
        createdAt: daysAgo(9),
      },
    ],
    meetings: [
      { id: uid(), title: "Созвон по онбордингу", clientId: clientA, date: daysFromNow(0), time: "11:30", durationMin: 30, recurrence: "none" },
      { id: uid(), title: "Демо дашборда", clientId: clientA, date: daysFromNow(0), time: "14:00", durationMin: 45, recurrence: "none" },
      { id: uid(), title: "Еженедельный синк", clientId: clientA, date: daysFromNow(1), time: "10:00", durationMin: 30, recurrence: "weekly" },
      { id: uid(), title: "Знакомство", clientId: clientB, date: daysFromNow(2), time: "16:30", durationMin: 30, recurrence: "none" },
    ],
  };
}
