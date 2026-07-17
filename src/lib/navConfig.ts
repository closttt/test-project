/** User-customizable sidebar order + visibility. Achievements/Settings stay pinned (not listed here). */
export interface NavItemMeta {
  id: string;
  label: string;
  to: string;
}

export const NAV_ITEMS: NavItemMeta[] = [
  { id: "dashboard", label: "Дашборд", to: "/" },
  { id: "projects", label: "Проекты", to: "/projects" },
  { id: "tasks", label: "Задачи", to: "/tasks" },
  { id: "notes", label: "Заметки", to: "/notes" },
  { id: "calendar", label: "Календарь", to: "/calendar" },
  { id: "analytics", label: "Аналитика", to: "/analytics" },
  { id: "knowledge", label: "База знаний", to: "/knowledge" },
  { id: "archive", label: "Архив", to: "/archive" },
];

const ORDER_KEY = "crm-nav-order-v1";
const HIDDEN_KEY = "crm-nav-hidden-v1";

const ALL_IDS = NAV_ITEMS.map((n) => n.id);

export function loadNavOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const saved = raw ? (JSON.parse(raw) as string[]).filter((id) => ALL_IDS.includes(id)) : [];
    const missing = ALL_IDS.filter((id) => !saved.includes(id));
    return [...saved, ...missing];
  } catch {
    return ALL_IDS;
  }
}

export function saveNavOrder(order: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

export function loadNavHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveNavHidden(hidden: Set<string>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
}

export function resetNav() {
  localStorage.removeItem(ORDER_KEY);
  localStorage.removeItem(HIDDEN_KEY);
}
