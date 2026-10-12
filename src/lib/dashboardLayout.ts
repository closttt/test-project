import type { Layout } from "react-grid-layout";

export interface WidgetMeta {
  id: string;
  title: string;
}

/** All dashboard widgets, in default order. Money/risk widgets live on the Клиенты page instead —
 * the dashboard stays task-focused (moved there per explicit feedback, not duplicated in both places). */
export const WIDGETS: WidgetMeta[] = [
  { id: "kpi-today", title: "Задачи сегодня" },
  { id: "kpi-time", title: "Время сегодня" },
  { id: "kpi-open", title: "Открыто задач" },
  { id: "kpi-week", title: "Закрыто за неделю" },
  { id: "dynamics", title: "Динамика выполнения" },
  { id: "status", title: "Статус задач" },
  { id: "today", title: "Задачи на сегодня" },
  { id: "meetings", title: "Встречи" },
  { id: "note", title: "Быстрая заметка" },
  { id: "projects", title: "Проекты" },
  { id: "reading", title: "Прочитать сегодня" },
];

/** Fixed composition — sized so every widget fits on one screen (row height is fitted to the
 * viewport in Dashboard). Left: KPIs → dynamics → today → meetings + note; right: status →
 * projects → reading. No per-user editing: the grid is the same for everyone. */
export const DEFAULT_LAYOUT: Layout[] = [
  { i: "kpi-today", x: 0, y: 0, w: 3, h: 2 },
  { i: "kpi-time", x: 3, y: 0, w: 3, h: 2 },
  { i: "kpi-open", x: 6, y: 0, w: 3, h: 2 },
  { i: "kpi-week", x: 9, y: 0, w: 3, h: 2 },
  { i: "dynamics", x: 0, y: 2, w: 8, h: 5 },
  { i: "status", x: 8, y: 2, w: 4, h: 8 },
  { i: "today", x: 0, y: 7, w: 8, h: 8 },
  { i: "meetings", x: 0, y: 15, w: 4, h: 5 },
  { i: "note", x: 4, y: 15, w: 4, h: 5 },
  { i: "projects", x: 8, y: 10, w: 4, h: 5 },
  { i: "reading", x: 8, y: 15, w: 4, h: 5 },
];

/** Grid height in rows — the bottom edge of the lowest widget. */
export const LAYOUT_ROWS = Math.max(...DEFAULT_LAYOUT.map((l) => l.y + l.h));
