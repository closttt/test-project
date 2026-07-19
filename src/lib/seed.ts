import type { AppData } from "@/types";
import { DEFAULT_SETTINGS, DEFAULT_GAMIFICATION } from "@/types";
import { uid } from "@/lib/id";

/**
 * Starter workspace for a fresh install (empty localStorage). The board is otherwise EMPTY — no
 * demo tasks, projects, clients, notes, meetings, no focus history, no XP/level — so Analytics
 * reads zero and everything is entered by hand. The Knowledge base is Supabase-backed and never
 * part of the seed. The only seeded content is the owner's three real students (Рома / Лиза /
 * Ирина), restored by name after an earlier reset; their fees and payment history were lost in
 * that reset, so they come back blank for the owner to re-enter — no fabricated amounts.
 */
export function seedData(): AppData {
  const student = (name: string) => ({
    id: uid(),
    name,
    monthlyFee: 0,
    paymentsPerMonth: 1 as const,
    active: true,
    payments: [],
    tags: [],
    createdAt: new Date().toISOString(),
  });

  return {
    settings: { ...DEFAULT_SETTINGS },
    gamification: { ...DEFAULT_GAMIFICATION },
    pomodoroSessions: [],
    completionLog: {},
    clients: [],
    students: [student("Рома"), student("Лиза"), student("Ирина")],
    projects: [],
    tasks: [],
    notes: [],
    meetings: [],
  };
}
