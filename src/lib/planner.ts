import { uid } from "@/lib/id";
import type { PlanBlock, PlanColor, PlanTemplate } from "@/types";

/**
 * «Планер» — a week of time blocks: seven day columns with a 00:00–24:00 time scale, onto which
 * tasks and pinned routines («Тренировка», «Английский», «Созвон») are dragged and then stretched
 * to the length they need. The page owns the pointer gestures; everything numeric — snapping a
 * pointer to a slot, keeping a block inside its day, laying out blocks that overlap — lives here,
 * pure and tested.
 */

/** Grid resolution: every start time and every length is a multiple of half an hour. */
export const SLOT_MIN = 30;
export const DAY_MIN = 24 * 60;
/** Default length of a block dragged in from a task that has no estimate. */
export const DEFAULT_BLOCK_MIN = 60;

export const PLAN_COLORS: Record<PlanColor, { label: string; block: string; dot: string }> = {
  blue: { label: "Синий", block: "border-brand bg-brand/15", dot: "bg-brand" },
  green: { label: "Зелёный", block: "border-success bg-success/15", dot: "bg-success" },
  violet: { label: "Фиолетовый", block: "border-violet-500 bg-violet-500/15", dot: "bg-violet-500" },
  orange: { label: "Оранжевый", block: "border-amber-500 bg-amber-500/15", dot: "bg-amber-500" },
  rose: { label: "Розовый", block: "border-rose-500 bg-rose-500/15", dot: "bg-rose-500" },
  slate: { label: "Серый", block: "border-muted-foreground bg-muted-foreground/15", dot: "bg-muted-foreground" },
};

export const PLAN_COLOR_ORDER: PlanColor[] = ["blue", "green", "violet", "orange", "rose", "slate"];

/** Starter routines for a fresh planner — the examples the owner named; editable and deletable. */
export function defaultTemplates(): PlanTemplate[] {
  return [
    { id: uid(), title: "Тренировка", durationMin: 90, color: "green" },
    { id: uid(), title: "Английский", durationMin: 60, color: "violet" },
    { id: uid(), title: "Созвон", durationMin: 30, color: "blue" },
  ];
}

/** Rounds to the nearest slot. */
export function snap(min: number, step = SLOT_MIN): number {
  return Math.round(min / step) * step;
}

/**
 * Start minute for a block of `durationMin` whose top edge is at `offsetMin` from midnight:
 * snapped to the grid and clamped so the whole block stays inside the day.
 */
export function startFromOffset(offsetMin: number, durationMin: number): number {
  const latest = DAY_MIN - Math.min(durationMin, DAY_MIN);
  return Math.max(0, Math.min(latest, snap(offsetMin)));
}

/** New length after the bottom edge was dragged by `deltaMin`: at least one slot, never past 24:00. */
export function resizeDuration(startMin: number, originalMin: number, deltaMin: number): number {
  const wanted = snap(originalMin + deltaMin);
  return Math.max(SLOT_MIN, Math.min(DAY_MIN - startMin, wanted));
}

/** Length for a task dropped onto the grid: its estimate rounded up to a slot, else an hour. */
export function durationForTask(estimateMin?: number): number {
  if (!estimateMin || estimateMin <= 0) return DEFAULT_BLOCK_MIN;
  return Math.min(DAY_MIN, Math.max(SLOT_MIN, Math.ceil(estimateMin / SLOT_MIN) * SLOT_MIN));
}

/** «07:30» */
export function formatClock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** «07:30–09:00» — 24:00 is written as such, not wrapped to 00:00. */
export function formatRange(startMin: number, durationMin: number): string {
  const end = startMin + durationMin;
  return `${formatClock(startMin)}–${end >= DAY_MIN ? "24:00" : formatClock(end)}`;
}

/** «30 мин», «1 ч», «1,5 ч», «2,5 ч» — the way the owner says lengths out loud. */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} мин`;
  const hours = min / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(".", ",")} ч`;
}

/** Sum of block lengths, for the per-day total in the column header. */
export function totalMinutes(blocks: PlanBlock[]): number {
  return blocks.reduce((s, b) => s + b.durationMin, 0);
}

export interface PlacedBlock {
  block: PlanBlock;
  /** 0-based lane inside its overlap cluster. */
  lane: number;
  /** How many lanes that cluster needs — the block is 1/lanes of the column wide. */
  lanes: number;
}

/**
 * Side-by-side layout for one day, calendar style: blocks that overlap in time share the column
 * width instead of covering each other. Blocks are swept in start order; each takes the first lane
 * that is free by its start, and every block in a connected cluster of overlaps gets that
 * cluster's lane count so their widths line up.
 */
export function layoutDay(blocks: PlanBlock[]): PlacedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.durationMin - a.durationMin);
  const out: PlacedBlock[] = [];
  let cluster: PlacedBlock[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    cluster.forEach((p) => { p.lanes = lanes; });
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    const end = block.startMin + block.durationMin;
    if (cluster.length > 0 && block.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ block, lane, lanes: 1 });
    clusterEnd = cluster.length === 1 ? end : Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return out;
}

const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** «Пн» for a YYYY-MM-DD date (local, never UTC-parsed). */
export function dayShort(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return DAY_SHORT[new Date(y, (m ?? 1) - 1, d ?? 1).getDay()];
}
