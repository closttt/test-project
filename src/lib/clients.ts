import type { Client } from "@/types";
import { todayStr } from "@/lib/format";

const monthOf = (dateStr: string) => dateStr.slice(0, 7);

export interface ClientMoney {
  /** Everything ever marked paid. */
  paidTotal: number;
  paidThisMonth: number;
  /** Expected but not yet paid (sum of pending payments). */
  pending: number;
  /** Pending payments whose date is already in the past. */
  overdue: number;
}

/** Pure aggregation over a client's payment log — reused by the Clients page and the dashboard. */
export function clientMoney(client: Client, today = todayStr()): ClientMoney {
  let paidTotal = 0;
  let paidThisMonth = 0;
  let pending = 0;
  let overdue = 0;
  for (const p of client.payments) {
    if (p.status === "paid") {
      paidTotal += p.amount;
      if (monthOf(p.date) === monthOf(today)) paidThisMonth += p.amount;
    } else {
      pending += p.amount;
      if (p.date < today) overdue += p.amount;
    }
  }
  return { paidTotal, paidThisMonth, pending, overdue };
}

/** «Допродажа» — the client came back: more than one paid payment, or more than one linked project. */
export function isRepeatClient(client: Client, linkedProjectCount: number): boolean {
  const paidCount = client.payments.filter((p) => p.status === "paid").length;
  return paidCount > 1 || linkedProjectCount > 1;
}
