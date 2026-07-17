export interface RecentItem {
  id: string;
  label: string;
  to: string;
  /** Extra router state to pass along (e.g. { openTaskId } / { openNoteId }) so the target page
   * opens straight to the right item instead of just landing on the list. */
  state?: Record<string, unknown>;
}

const KEY = "crm-recent-v1";
const MAX = 6;

export function getRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem) {
  // Dedupe by id, not by `to` — tasks/notes share one base route (/tasks, /notes) and are only
  // distinguished by id + state, so deduping on `to` would collapse every task into one slot.
  const list = getRecent().filter((r) => r.id !== item.id);
  list.unshift(item);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}
