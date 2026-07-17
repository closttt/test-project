import type { Layout } from "react-grid-layout";

export interface WidgetMeta {
  id: string;
  title: string;
}

/** All dashboard widgets, in default order. */
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
];

export const DEFAULT_LAYOUT: Layout[] = [
  { i: "kpi-today", x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "kpi-time", x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "kpi-open", x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "kpi-week", x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "dynamics", x: 0, y: 2, w: 8, h: 5, minW: 3, minH: 4 },
  { i: "status", x: 8, y: 2, w: 4, h: 8, minW: 3, minH: 6 },
  { i: "today", x: 0, y: 7, w: 8, h: 8, minW: 4, minH: 4 },
  { i: "meetings", x: 0, y: 15, w: 4, h: 5, minW: 3, minH: 4 },
  { i: "note", x: 4, y: 15, w: 4, h: 5, minW: 3, minH: 4 },
  { i: "projects", x: 8, y: 15, w: 4, h: 5, minW: 3, minH: 4 },
];

const LAYOUT_KEY = "crm-dashboard-layout-v1";
const HIDDEN_KEY = "crm-dashboard-hidden-v1";

export function loadLayout(): Layout[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const saved = JSON.parse(raw) as Layout[];
    // Merge: keep saved positions, add any new widgets from default.
    const byId = new Map(saved.map((l) => [l.i, l]));
    return WIDGETS.map((w) => byId.get(w.id) ?? DEFAULT_LAYOUT.find((d) => d.i === w.id)!);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: Layout[]) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

export function loadHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveHidden(hidden: string[]) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
}

export function resetDashboard() {
  localStorage.removeItem(LAYOUT_KEY);
  localStorage.removeItem(HIDDEN_KEY);
}
