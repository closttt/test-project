import type { Student } from "@/types";
import { todayStr } from "@/lib/format";
import { paymentState, PAYMENT_STATE_META, type PaymentState } from "@/lib/payments";

/** Derived from the owner's manual payment log — no automation. Reuses the shared payment states
 * plus a «none» for a student with nothing pending and nothing paid this month. */
export type StudentPayStatus = PaymentState | "none";

export const STUDENT_STATUS_META: Record<
  StudentPayStatus,
  { label: string; badge: "success" | "warning" | "risk" | "secondary" }
> = {
  ...PAYMENT_STATE_META,
  paid: { label: "Оплата проведена", badge: "success" },
  none: { label: "Нет оплат в этом месяце", badge: "secondary" },
};

const monthOf = (dateStr: string) => dateStr.slice(0, 7);

/**
 * Current payment status of a student: the earliest still-pending payment decides the state
 * (просрочено / скоро оплата / запланировано); with nothing pending it's «оплата проведена» if
 * something was paid this month, else «нет оплат».
 */
export function studentStatus(student: Student, today = todayStr()): StudentPayStatus {
  const pending = student.payments
    .filter((p) => p.status === "pending")
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pending.length) return paymentState(pending[0], today);
  const paidThisMonth = student.payments.some(
    (p) => p.status === "paid" && monthOf(p.date) === monthOf(today)
  );
  return paidThisMonth ? "paid" : "none";
}

export interface StudentTotals {
  paidTotal: number;
  paidThisMonth: number;
  /** Sum of still-pending payments. */
  outstanding: number;
  /** Earliest pending payment date, if any (drives «скоро оплата» hints). */
  nextDue?: string;
}

export function studentTotals(student: Student, today = todayStr()): StudentTotals {
  let paidTotal = 0;
  let paidThisMonth = 0;
  let outstanding = 0;
  let nextDue: string | undefined;
  for (const p of student.payments) {
    if (p.status === "paid") {
      paidTotal += p.amount;
      if (monthOf(p.date) === monthOf(today)) paidThisMonth += p.amount;
    } else {
      outstanding += p.amount;
      if (!nextDue || p.date < nextDue) nextDue = p.date;
    }
  }
  return { paidTotal, paidThisMonth, outstanding, nextDue };
}
