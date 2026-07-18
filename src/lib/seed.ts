import type { AppData } from "@/types";
import { DEFAULT_SETTINGS, DEFAULT_GAMIFICATION } from "@/types";
import { uid } from "@/lib/id";
import { addDays } from "@/lib/format";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysAgoDate(n: number): string {
  return addDays(new Date(), -n);
}

function daysFromNow(n: number): string {
  return addDays(new Date(), n);
}

/**
 * Starter workspace for a fresh install (empty localStorage). Per the owner's explicit request
 * the seed ships an EMPTY board — no demo tasks, projects, clients, notes, meetings or stats — so
 * a new/reset instance starts blank for them to fill themselves. Only the Ученики (students)
 * section keeps its examples ("учеников оставь"); the Knowledge base is Supabase-backed and never
 * touched by the seed. Add-your-own from here.
 */
export function seedData(): AppData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    gamification: { ...DEFAULT_GAMIFICATION },
    pomodoroSessions: [],
    completionLog: {},
    clients: [],
    students: [
      {
        id: uid(),
        name: "Даниил Романов",
        monthlyFee: 15000,
        paymentsPerMonth: 2,
        active: true,
        payments: [
          { id: uid(), amount: 7500, status: "paid", date: daysAgoDate(18) },
          { id: uid(), amount: 7500, status: "paid", date: daysAgoDate(4) },
          { id: uid(), amount: 7500, status: "pending", date: daysFromNow(11) },
        ],
        tags: [],
        createdAt: daysAgo(70),
      },
      {
        id: uid(),
        name: "Марина Ковалёва",
        monthlyFee: 20000,
        paymentsPerMonth: 1,
        active: true,
        payments: [
          { id: uid(), amount: 20000, status: "paid", date: daysAgoDate(25) },
          { id: uid(), amount: 20000, status: "pending", date: daysFromNow(4) },
        ],
        tags: [],
        createdAt: daysAgo(40),
      },
      {
        id: uid(),
        name: "Артём Соколов",
        monthlyFee: 12000,
        paymentsPerMonth: 1,
        active: true,
        payments: [{ id: uid(), amount: 12000, status: "pending", date: daysAgoDate(2) }],
        tags: [],
        createdAt: daysAgo(20),
      },
    ],
    projects: [],
    tasks: [],
    notes: [],
    meetings: [],
  };
}
