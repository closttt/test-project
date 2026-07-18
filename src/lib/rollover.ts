const DISMISSED_KEY = "crm-rollover-dismissed-v1";

/** Pure: true when the rollover banner was already dismissed for `today`. */
export function isDismissedFor(dismissedDate: string | null, today: string): boolean {
  return dismissedDate === today;
}

export function loadRolloverDismissedDate(): string | null {
  return localStorage.getItem(DISMISSED_KEY);
}

export function dismissRolloverToday(today: string): void {
  localStorage.setItem(DISMISSED_KEY, today);
}
