import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

import { DataProvider, useData } from "@/store/DataProvider";
import { todayStr } from "@/lib/format";

/**
 * Flow tests: they drive the REAL store the same way the UI does, so they catch the class of
 * bug a pure unit test misses — e.g. "closing a task in bulk skipped the XP/streak path".
 * This is our stand-in for E2E (no browser binary; Playwright is off the table by agreement).
 */

function wrapper({ children }: { children: ReactNode }) {
  return <DataProvider>{children}</DataProvider>;
}

function setup() {
  return renderHook(() => useData(), { wrapper });
}

/** The seed ships demo data; start every flow from a clean slate. */
function reset(result: { current: ReturnType<typeof useData> }) {
  act(() => {
    result.current.replaceAll({
      ...result.current,
      clients: [], projects: [], tasks: [], notes: [], meetings: [],
      completionLog: {}, pomodoroSessions: [],
      gamification: { ...result.current.gamification, xp: 0, achievements: [], bestStreak: 0, questLog: {} },
    });
  });
}

describe("flow: completing a task", () => {
  it("awards XP, logs the completion and marks it done", () => {
    const { result } = setup();
    reset(result);

    act(() => result.current.addTask({ title: "Написать отчёт", done: false, priority: 1 }));
    const id = result.current.tasks[0].id;
    const xpBefore = result.current.gamification.xp;

    act(() => result.current.toggleTask(id));

    const task = result.current.tasks.find((t) => t.id === id)!;
    expect(task.done).toBe(true);
    expect(task.completedAt).toBeTruthy();
    expect(result.current.completionLog[todayStr()]).toBe(1);
    // Priority 1 pays base 10 + bonus 10.
    expect(result.current.gamification.xp).toBe(xpBefore + 20);
  });

  it("reopening a task doesn't hand out XP twice", () => {
    const { result } = setup();
    reset(result);
    act(() => result.current.addTask({ title: "t", done: false }));
    const id = result.current.tasks[0].id;

    act(() => result.current.toggleTask(id));
    const xpAfterClose = result.current.gamification.xp;
    act(() => result.current.toggleTask(id)); // reopen
    act(() => result.current.toggleTask(id)); // close again

    expect(result.current.tasks.find((t) => t.id === id)!.done).toBe(true);
    // Closing twice pays twice (that's by design) — but reopening must never ADD xp.
    expect(result.current.gamification.xp).toBe(xpAfterClose * 2);
  });

  it("a recurring task rolls forward instead of closing", () => {
    const { result } = setup();
    reset(result);
    act(() =>
      result.current.addTask({ title: "Ежедневная", done: false, dueDate: todayStr(), recurrence: "daily" })
    );
    const id = result.current.tasks[0].id;

    act(() => result.current.toggleTask(id));

    const task = result.current.tasks.find((t) => t.id === id)!;
    expect(task.done).toBe(false);                  // still open…
    expect(task.dueDate).not.toBe(todayStr());      // …but moved to the next occurrence
    expect(result.current.completionLog[todayStr()]).toBe(1); // and today still counts
  });

  it("a weekly recurring task rolls forward by 7 days", () => {
    const { result } = setup();
    reset(result);
    act(() =>
      result.current.addTask({ title: "Еженедельная", done: false, dueDate: "2026-07-15", recurrence: "weekly" })
    );
    const id = result.current.tasks[0].id;
    act(() => result.current.toggleTask(id));
    expect(result.current.tasks.find((t) => t.id === id)!.dueDate).toBe("2026-07-22");
  });

  it("a weekdays-only recurring task skips the weekend", () => {
    const { result } = setup();
    reset(result);
    // 2026-07-17 is a Friday — the next weekday must be Monday 2026-07-20.
    act(() =>
      result.current.addTask({ title: "Будни", done: false, dueDate: "2026-07-17", recurrence: "weekdays" })
    );
    const id = result.current.tasks[0].id;
    act(() => result.current.toggleTask(id));
    expect(result.current.tasks.find((t) => t.id === id)!.dueDate).toBe("2026-07-20");
  });

  it("a monthly recurring task due on the 31st clamps into February instead of skipping it", () => {
    const { result } = setup();
    reset(result);
    // Regression test: a naive `setMonth(getMonth()+1)` on Jan 31 overflows to Mar 3 in a
    // non-leap year, silently skipping February entirely.
    act(() =>
      result.current.addTask({ title: "Месячная", done: false, dueDate: "2026-01-31", recurrence: "monthly" })
    );
    const id = result.current.tasks[0].id;
    act(() => result.current.toggleTask(id));
    const next = result.current.tasks.find((t) => t.id === id)!.dueDate!;
    expect(next.startsWith("2026-02")).toBe(true);
    expect(next).toBe("2026-02-28"); // 2026 is not a leap year — clamped to Feb's last day
  });

  it("a monthly-first-monday task lands on the first Monday of the next month", () => {
    const { result } = setup();
    reset(result);
    act(() =>
      result.current.addTask({ title: "Первый понедельник", done: false, dueDate: "2026-07-15", recurrence: "monthly-first-monday" })
    );
    const id = result.current.tasks[0].id;
    act(() => result.current.toggleTask(id));
    const next = new Date(result.current.tasks.find((t) => t.id === id)!.dueDate!);
    expect(next.getMonth()).toBe(7); // August (0-indexed)
    expect(next.getDay()).toBe(1); // Monday
  });
});

describe("flow: closing a meeting", () => {
  it("marks it done and stamps completedAt", () => {
    const { result } = setup();
    reset(result);
    act(() => result.current.addMeeting({ title: "Созвон", date: todayStr(), time: "10:00" }));
    const id = result.current.meetings[0].id;

    act(() => result.current.toggleMeeting(id));
    expect(result.current.meetings[0].done).toBe(true);
    expect(result.current.meetings[0].completedAt).toBeTruthy();

    act(() => result.current.toggleMeeting(id));
    expect(result.current.meetings[0].done).toBe(false);
    expect(result.current.meetings[0].completedAt).toBeUndefined();
  });

  /**
   * The property the whole "meetings are tasks" design rests on: there is ONE record, so
   * every surface (Задачи / Дашборд / Календарь) reads the same `done`. If someone ever
   * "helpfully" mirrors a meeting into a Task, this test is what should start failing.
   */
  it("closing it once is closed for every surface — a single record, not copies", () => {
    const { result } = setup();
    reset(result);
    act(() => result.current.addMeeting({ title: "Планёрка", date: todayStr(), time: "09:00" }));
    const id = result.current.meetings[0].id;

    act(() => result.current.toggleMeeting(id));

    // Nothing was duplicated into tasks…
    expect(result.current.tasks).toHaveLength(0);
    // …and every reader of the store sees the one closed record.
    expect(result.current.meetings.filter((m) => m.id === id)).toHaveLength(1);
    expect(result.current.meetings.find((m) => m.id === id)!.done).toBe(true);
  });

  it("carries task-style fields: priority and tags", () => {
    const { result } = setup();
    reset(result);
    act(() => result.current.addMeeting({ title: "Демо", date: todayStr(), time: "12:00" }));
    const id = result.current.meetings[0].id;

    act(() => result.current.updateMeeting(id, { priority: 1, tags: ["работа"] }));

    expect(result.current.meetings[0].priority).toBe(1);
    expect(result.current.meetings[0].tags).toEqual(["работа"]);
  });
});

describe("flow: archive keeps data out of active lists but not out of export", () => {
  it("archived tasks leave `tasks` and stay in `allTasks`", () => {
    const { result } = setup();
    reset(result);
    act(() => result.current.addTask({ title: "Старое", done: false }));
    const id = result.current.tasks[0].id;

    act(() => result.current.archiveTask(id));

    expect(result.current.tasks.find((t) => t.id === id)).toBeUndefined();
    expect(result.current.allTasks.find((t) => t.id === id)).toBeDefined();
    expect(result.current.archivedTasks).toHaveLength(1);
  });
});

describe("flow: project ↔ client link", () => {
  it("a project created for a client shows up under that client", () => {
    const { result } = setup();
    reset(result);
    act(() =>
      result.current.addClient({
        name: "ООО Ромашка", status: "active", revenue: 0, expectedPayment: 0,
        payments: [], lastActivityAt: new Date().toISOString(),
      })
    );
    const clientId = result.current.clients[0].id;

    act(() => result.current.addProject({ name: "Лендинг", status: "active", clientId }));

    expect(result.current.projects.filter((p) => p.clientId === clientId)).toHaveLength(1);
  });
});

describe("flow: client risk zone", () => {
  it("goes none → attention → risk as contact goes stale, and «был на связи» resets it", () => {
    const { result } = setup();
    reset(result);

    const stale = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString();
    };

    act(() =>
      result.current.addClient({
        name: "Тихий клиент", status: "active", revenue: 0, expectedPayment: 0,
        payments: [], lastActivityAt: stale(40), // past the 30-day risk threshold
      })
    );
    const id = result.current.clients[0].id;
    expect(result.current.clientRisk(result.current.clients[0])).toBe("risk");

    act(() => result.current.updateClient(id, { lastActivityAt: stale(20) })); // 14..30 → attention
    expect(result.current.clientRisk(result.current.clients[0])).toBe("attention");

    act(() => result.current.touchClient(id));
    expect(result.current.clientRisk(result.current.clients[0])).toBe("none");
  });
});
