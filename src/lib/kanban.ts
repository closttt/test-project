import { uid } from "@/lib/id";

/** User-defined kanban columns ("Доска" mode) — add/rename/reorder/delete, like a TickTick custom board. */
export interface KanbanColumn {
  id: string;
  title: string;
  /** Label colour — a token key from COLUMN_COLORS, not a raw hex. */
  color?: ColumnColor;
  /** Work-in-progress cap. When the column holds more, the count turns red as a nudge. */
  wipLimit?: number;
}

/** Column label colours, on DS tokens — no hex in components. */
export type ColumnColor = "none" | "brand" | "success" | "risk" | "amber" | "muted";

export const COLUMN_COLORS: Record<ColumnColor, { label: string; dot: string }> = {
  none: { label: "Без цвета", dot: "bg-transparent border border-border" },
  brand: { label: "Синий", dot: "bg-brand" },
  success: { label: "Зелёный", dot: "bg-success" },
  amber: { label: "Жёлтый", dot: "bg-amber-400" },
  risk: { label: "Красный", dot: "bg-risk" },
  muted: { label: "Серый", dot: "bg-muted-foreground" },
};

export const COLUMN_COLOR_ORDER: ColumnColor[] = ["none", "brand", "success", "amber", "risk", "muted"];

const KEY = "crm-kanban-columns-v1";

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "todo", title: "Сделать", color: "muted" },
  { id: "doing", title: "В работе", color: "brand" },
  { id: "done", title: "Готово", color: "success" },
];

export function loadKanbanColumns(): KanbanColumn[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      saveKanbanColumns(DEFAULT_COLUMNS);
      return DEFAULT_COLUMNS;
    }
    const parsed = JSON.parse(raw) as KanbanColumn[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export function saveKanbanColumns(cols: KanbanColumn[]) {
  localStorage.setItem(KEY, JSON.stringify(cols));
}

export function newKanbanColumn(title: string): KanbanColumn {
  return { id: uid(), title, color: "none" };
}
