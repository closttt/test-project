import type { Payment } from "@/types";
import { todayStr, addDays } from "@/lib/format";

/** Shared payment lifecycle used by both clients and students. */
export type PaymentState = "paid" | "overdue" | "soon" | "scheduled";

export const PAYMENT_STATE_META: Record<
  PaymentState,
  { label: string; badge: "success" | "risk" | "warning" | "secondary" }
> = {
  paid: { label: "Оплачено", badge: "success" },
  overdue: { label: "Просрочено", badge: "risk" },
  soon: { label: "Скоро оплата", badge: "warning" },
  scheduled: { label: "Запланировано", badge: "secondary" },
};

/** Days ahead at which a still-unpaid payment starts glowing «скоро оплата» (yellow). */
export const SOON_WINDOW_DAYS = 3;

/**
 * A single payment's state: paid → зелёный; still pending and past its date → просрочено (red);
 * within the next few days → скоро оплата (yellow); further out → запланировано (neutral).
 */
export function paymentState(p: Payment, today = todayStr()): PaymentState {
  if (p.status === "paid") return "paid";
  if (p.date < today) return "overdue";
  // Threshold derived from `today` (not the real clock) so the result is deterministic/testable.
  return p.date <= addDays(today, SOON_WINDOW_DAYS) ? "soon" : "scheduled";
}
