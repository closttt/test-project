export function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

/** Minutes → "1ч 30м" / "45м". */
export function formatDuration(min: number): string {
  if (!min) return "0м";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}ч ${m}м`;
  if (h) return `${h}ч`;
  return `${m}м`;
}

/** Local calendar day as YYYY-MM-DD. NOT `toISOString()` — that reads the UTC day, which flips
 * hours before/after local midnight depending on the timezone offset (e.g. 3h early in Moscow). */
export function localDayStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add (or subtract, with a negative n) days from a date, returned as a local YYYY-MM-DD string. */
export function addDays(base: Date | string, n: number): string {
  const d = typeof base === "string" ? new Date(base) : new Date(base.getTime());
  d.setDate(d.getDate() + n);
  return localDayStr(d);
}

export function isToday(dateStr: string): boolean {
  return dateStr === localDayStr();
}

export function todayStr(): string {
  return localDayStr();
}

/** Due date is strictly before today (date-only comparison). */
export function isOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  return dateStr < todayStr();
}

/** Due date is after today. */
export function isUpcoming(dateStr?: string): boolean {
  if (!dateStr) return false;
  return dateStr > todayStr();
}

/** Friendly relative label for a due date. */
export function dueLabel(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return "Сегодня";
  if (dateStr === addDays(new Date(), 1)) return "Завтра";
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}
