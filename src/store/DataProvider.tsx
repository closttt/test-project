import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  AppData,
  Client,
  Student,
  Project,
  Task,
  Subtask,
  Note,
  Meeting,
  Payment,
  Touch,
  RiskLevel,
  Settings,
  SavedView,
  Gamification,
  PomodoroSession,
  Recurrence,
  ProjectTemplateTask,
} from "@/types";
import { ACCENTS } from "@/types";
import { loadData, createDebouncedSaver } from "@/lib/storage";
import { seedData } from "@/lib/seed";
import { uid } from "@/lib/id";
import { daysSince, todayStr, localDayStr } from "@/lib/format";
import { xpForTaskCompletion } from "@/lib/gamification";
import { playPop } from "@/lib/sound";
import { clearUndo } from "@/lib/undoStack";

/** Consecutive days with completions ending today/yesterday — used to keep bestStreak fresh. */
function streakOf(log: Record<string, number>): number {
  let count = 0;
  const d = new Date();
  if (!log[localDayStr(d)]) d.setDate(d.getDate() - 1);
  while (log[localDayStr(d)]) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

interface DataContextValue extends AppData {
  addClient: (
    input: Omit<Client, "id" | "createdAt" | "tags" | "contacts" | "customFields" | "touches"> &
      Partial<Pick<Client, "tags" | "contacts" | "customFields" | "touches">>
  ) => void;
  updateClient: (id: string, patch: Partial<Client>) => void;
  touchClient: (id: string) => void;
  deleteClient: (id: string) => void;
  restoreClient: (client: Client) => void;
  addPayment: (clientId: string, payment: Omit<Payment, "id">) => void;
  updatePayment: (clientId: string, paymentId: string, patch: Partial<Payment>) => void;
  deletePayment: (clientId: string, paymentId: string) => void;
  addTouch: (clientId: string, touch: Omit<Touch, "id">) => void;
  deleteTouch: (clientId: string, touchId: string) => void;
  addStudent: (
    input: Omit<Student, "id" | "createdAt" | "payments" | "tags" | "active"> &
      Partial<Pick<Student, "payments" | "tags" | "active">>
  ) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  restoreStudent: (student: Student) => void;
  addStudentPayment: (studentId: string, payment: Omit<Payment, "id">) => void;
  updateStudentPayment: (studentId: string, paymentId: string, patch: Partial<Payment>) => void;
  deleteStudentPayment: (studentId: string, paymentId: string) => void;
  /** Returns the new project's id (used by callers that need to act on it right away, e.g. the AI tools). */
  addProject: (input: Omit<Project, "id" | "createdAt">) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  addProjectSection: (projectId: string, name: string) => void;
  deleteProjectSection: (projectId: string, name: string) => void;
  renameProjectSection: (projectId: string, oldName: string, newName: string) => void;
  reorderProjectSections: (projectId: string, orderedNames: string[]) => void;
  addProjectComment: (projectId: string, text: string) => void;
  deleteProjectComment: (projectId: string, commentId: string) => void;
  deleteProject: (id: string) => void;
  restoreProject: (project: Project) => void;
  /** Returns the new task's id (used by callers that need to act on it right away, e.g. the AI tools). */
  addTask: (
    input: Omit<
      Task,
      "id" | "createdAt" | "subtasks" | "order" | "tags" | "important" | "recurrence" | "priority" | "spentMin" | "links" | "comments" | "attachments"
    > & {
      subtaskTitles?: string[];
      tags?: string[];
      important?: boolean;
      priority?: Task["priority"];
      recurrence?: Task["recurrence"];
      links?: string[];
    }
  ) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  toggleImportant: (id: string) => void;
  startTimer: (id: string) => void;
  stopTimer: (id: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  updateSubtask: (taskId: string, subtaskId: string, patch: Partial<Subtask>) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  reorderTasks: (orderedIds: string[]) => void;
  deleteTask: (id: string) => void;
  restoreTask: (task: Task) => void;
  archiveTask: (id: string) => void;
  unarchiveTask: (id: string) => void;
  archiveDoneTasks: () => number;
  archiveProject: (id: string) => void;
  unarchiveProject: (id: string) => void;
  archiveNote: (id: string) => void;
  unarchiveNote: (id: string) => void;
  addPomodoroSession: (session: Omit<PomodoroSession, "id" | "date">) => void;
  /** Returns the new note's id (used by callers that need to act on it right away, e.g. the AI tools). */
  addNote: (input: Omit<Note, "id" | "createdAt" | "tags"> & { tags?: string[] }) => string;
  updateNote: (id: string, patch: Partial<Note>) => void;
  /** Persist a manual order for the given note ids (used by drag-to-reorder). */
  reorderNotes: (orderedIds: string[]) => void;
  toggleNotePin: (id: string) => void;
  deleteNote: (id: string) => void;
  restoreNote: (note: Note) => void;
  addMeeting: (input: Omit<Meeting, "id" | "durationMin" | "recurrence"> & { durationMin?: number; recurrence?: Meeting["recurrence"] }) => void;
  updateMeeting: (id: string, patch: Partial<Meeting>) => void;
  deleteMeeting: (id: string) => void;
  restoreMeeting: (meeting: Meeting) => void;
  /** Close/reopen a meeting the same way a task is checked off. */
  toggleMeeting: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addSavedView: (view: Omit<SavedView, "id">) => void;
  deleteSavedView: (id: string) => void;
  addChecklistTemplate: (name: string, items: string[]) => void;
  deleteChecklistTemplate: (id: string) => void;
  addProjectTemplate: (name: string, sections: string[], tasks: ProjectTemplateTask[]) => void;
  deleteProjectTemplate: (id: string) => void;
  /** Creates a project and immediately seeds it with a template's sections + starter tasks. */
  createProjectFromTemplate: (name: string, templateId: string) => void;
  updateGamification: (patch: Partial<Gamification>) => void;
  replaceAll: (data: AppData) => void;
  clientRisk: (client: Client) => RiskLevel;
  /** Full arrays including archived — for export and the Archive page. */
  allTasks: Task[];
  allProjects: Project[];
  allNotes: Note[];
  archivedTasks: Task[];
  archivedProjects: Project[];
  archivedNotes: Note[];
}

const DataContext = createContext<DataContextValue | null>(null);

/** Advance a YYYY-MM-DD date by one recurrence step. */
function advanceDate(dateStr: string, rec: Exclude<Recurrence, "none">): string {
  const d = new Date(dateStr);
  if (rec === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (rec === "weekdays") {
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
  } else if (rec === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (rec === "monthly-first-monday") {
    d.setMonth(d.getMonth() + 1, 1); // first of next month
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); // roll forward to the first Monday
  } else {
    // Plain "monthly": clamp to the target month's last day instead of letting setMonth overflow
    // into the month after (e.g. Jan 31 -> Mar 3, silently skipping Feb, if left unclamped).
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, daysInTargetMonth));
  }
  return localDayStr(d);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData() ?? seedData());
  // Debounced so a drag-reorder (Reorder.Group onReorder fires on every pixel moved) doesn't
  // write to localStorage on every intermediate frame — see createDebouncedSaver's docstring for
  // why flush() below is not optional.
  const saverRef = useRef(createDebouncedSaver());

  useEffect(() => {
    saverRef.current.schedule(data);
  }, [data]);

  // A debounced write still in flight when the tab is closed/hidden/backgrounded would silently
  // drop the user's last edit — flush immediately on every signal that the page might not get
  // another tick. pagehide (not just beforeunload) also covers mobile Safari's bfcache path and
  // simple tab switches; visibilitychange:hidden covers backgrounding without a full unload.
  useEffect(() => {
    const flush = () => saverRef.current.flush();
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  // Apply theme + accent + density to <html> so tokens switch app-wide.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", data.settings.theme === "light");
    root.classList.toggle("dark", data.settings.theme === "dark");
    const hsl = ACCENTS[data.settings.accent].hsl;
    root.style.setProperty("--brand", hsl);
    root.style.setProperty("--ring", hsl);
    root.classList.toggle("density-compact", data.settings.density === "compact");
    // Mirrored so FX primitives can honour the setting without importing the store (lib/effects.ts).
    root.dataset.effects = data.settings.effects ?? "full";
  }, [data.settings.theme, data.settings.accent, data.settings.density, data.settings.effects]);

  const value = useMemo<DataContextValue>(
    () => ({
      ...data,
      // Active views see only non-archived entities; archived live behind /archive + export.
      tasks: data.tasks.filter((t) => !t.archivedAt),
      projects: data.projects.filter((p) => !p.archivedAt),
      notes: data.notes.filter((n) => !n.archivedAt),
      allTasks: data.tasks,
      allProjects: data.projects,
      allNotes: data.notes,
      archivedTasks: data.tasks.filter((t) => t.archivedAt),
      archivedProjects: data.projects.filter((p) => p.archivedAt),
      archivedNotes: data.notes.filter((n) => n.archivedAt),

      addClient: (input) =>
        setData((d) => ({
          ...d,
          clients: [
            ...d.clients,
            {
              tags: [],
              contacts: [],
              customFields: [],
              touches: [],
              ...input,
              id: uid(),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateClient: (id, patch) =>
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      touchClient: (id) =>
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) =>
            c.id === id ? { ...c, lastActivityAt: new Date().toISOString() } : c
          ),
        })),
      deleteClient: (id) =>
        setData((d) => ({
          ...d,
          clients: d.clients.filter((c) => c.id !== id),
          // Don't leave projects/meetings pointing at a client id that no longer exists.
          projects: d.projects.map((p) => (p.clientId === id ? { ...p, clientId: undefined } : p)),
          meetings: d.meetings.map((m) => (m.clientId === id ? { ...m, clientId: undefined } : m)),
        })),
      restoreClient: (client) =>
        setData((d) => ({ ...d, clients: [...d.clients, client] })),
      addPayment: (clientId, payment) =>
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) =>
            c.id === clientId
              ? { ...c, payments: [...c.payments, { ...payment, id: uid() }], lastActivityAt: new Date().toISOString() }
              : c
          ),
        })),
      updatePayment: (clientId, paymentId, patch) =>
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) =>
            c.id === clientId
              ? { ...c, payments: c.payments.map((p) => (p.id === paymentId ? { ...p, ...patch } : p)) }
              : c
          ),
        })),
      deletePayment: (clientId, paymentId) =>
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) =>
            c.id === clientId ? { ...c, payments: c.payments.filter((p) => p.id !== paymentId) } : c
          ),
        })),
      addTouch: (clientId, touch) =>
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) =>
            c.id === clientId
              ? { ...c, touches: [...c.touches, { ...touch, id: uid() }], lastActivityAt: new Date().toISOString() }
              : c
          ),
        })),
      deleteTouch: (clientId, touchId) =>
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) =>
            c.id === clientId ? { ...c, touches: c.touches.filter((t) => t.id !== touchId) } : c
          ),
        })),

      addStudent: (input) =>
        setData((d) => ({
          ...d,
          students: [
            ...d.students,
            { active: true, payments: [], tags: [], ...input, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      updateStudent: (id, patch) =>
        setData((d) => ({
          ...d,
          students: d.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      deleteStudent: (id) =>
        setData((d) => ({ ...d, students: d.students.filter((s) => s.id !== id) })),
      restoreStudent: (student) =>
        setData((d) => ({ ...d, students: [...d.students, student] })),
      addStudentPayment: (studentId, payment) =>
        setData((d) => ({
          ...d,
          students: d.students.map((s) =>
            s.id === studentId ? { ...s, payments: [...s.payments, { ...payment, id: uid() }] } : s
          ),
        })),
      updateStudentPayment: (studentId, paymentId, patch) =>
        setData((d) => ({
          ...d,
          students: d.students.map((s) =>
            s.id === studentId
              ? { ...s, payments: s.payments.map((p) => (p.id === paymentId ? { ...p, ...patch } : p)) }
              : s
          ),
        })),
      deleteStudentPayment: (studentId, paymentId) =>
        setData((d) => ({
          ...d,
          students: d.students.map((s) =>
            s.id === studentId ? { ...s, payments: s.payments.filter((p) => p.id !== paymentId) } : s
          ),
        })),

      addProject: (input) => {
        const id = uid();
        setData((d) => ({
          ...d,
          projects: [...d.projects, { ...input, id, createdAt: new Date().toISOString() }],
        }));
        return id;
      },
      updateProject: (id, patch) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      addProjectSection: (projectId, name) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) =>
            p.id === projectId && !(p.sections ?? []).includes(name)
              ? { ...p, sections: [...(p.sections ?? []), name] }
              : p
          ),
        })),
      deleteProjectSection: (projectId, name) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) =>
            p.id === projectId ? { ...p, sections: (p.sections ?? []).filter((s) => s !== name) } : p
          ),
          // Un-assign tasks that were in the removed section.
          tasks: d.tasks.map((t) => (t.projectId === projectId && t.section === name ? { ...t, section: undefined } : t)),
        })),
      renameProjectSection: (projectId, oldName, newName) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) =>
            p.id === projectId
              ? { ...p, sections: (p.sections ?? []).map((s) => (s === oldName ? newName : s)) }
              : p
          ),
          tasks: d.tasks.map((t) =>
            t.projectId === projectId && t.section === oldName ? { ...t, section: newName } : t
          ),
        })),
      reorderProjectSections: (projectId, orderedNames) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === projectId ? { ...p, sections: orderedNames } : p)),
        })),
      addProjectComment: (projectId, text) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) =>
            p.id === projectId
              ? { ...p, comments: [...(p.comments ?? []), { id: uid(), text, at: new Date().toISOString() }] }
              : p
          ),
        })),
      deleteProjectComment: (projectId, commentId) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) =>
            p.id === projectId ? { ...p, comments: (p.comments ?? []).filter((c) => c.id !== commentId) } : p
          ),
        })),
      deleteProject: (id) =>
        setData((d) => ({
          ...d,
          projects: d.projects.filter((p) => p.id !== id),
          // Mirror deleteProjectSection's reparenting — don't leave tasks/notes pointing at a
          // project id that no longer exists.
          tasks: d.tasks.map((t) => (t.projectId === id ? { ...t, projectId: undefined, section: undefined } : t)),
          notes: d.notes.map((n) => (n.linkedProjectId === id ? { ...n, linkedProjectId: undefined } : n)),
        })),
      restoreProject: (project) =>
        setData((d) => ({ ...d, projects: [...d.projects, project] })),

      addTask: ({ subtaskTitles, tags, important, priority, recurrence, links, ...input }) => {
        const id = uid();
        setData((d) => ({
          ...d,
          tasks: [
            {
              ...input,
              id,
              createdAt: new Date().toISOString(),
              order: -1,
              important: important ?? false,
              priority: priority ?? 0,
              spentMin: 0,
              links: links ?? [],
              comments: [],
              attachments: [],
              recurrence: recurrence ?? "none",
              tags: tags ?? [],
              subtasks: (subtaskTitles ?? [])
                .map((t) => t.trim())
                .filter(Boolean)
                .map((title) => ({ id: uid(), title, done: false })),
            },
            ...d.tasks.map((t) => ({ ...t, order: t.order + 1 })),
          ].map((t, i) => ({ ...t, order: i })),
        }));
        return id;
      },
      updateTask: (id, patch) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      toggleTask: (id) => {
        // Soft "pop" on completion (fires within the click gesture).
        const t0 = data.tasks.find((t) => t.id === id);
        if (t0 && !t0.done && data.settings.soundEnabled) playPop();
        setData((d) => {
          const target = d.tasks.find((t) => t.id === id);
          const completing = target ? !target.done : false;
          const today = todayStr();
          const completionLog = completing
            ? { ...d.completionLog, [today]: (d.completionLog[today] ?? 0) + 1 }
            : d.completionLog;
          const gamification =
            completing && d.gamification.enabled && target
              ? {
                  ...d.gamification,
                  xp: d.gamification.xp + xpForTaskCompletion(target.priority),
                  bestStreak: Math.max(d.gamification.bestStreak, streakOf(completionLog)),
                }
              : d.gamification;
          return {
            ...d,
            completionLog,
            gamification,
            tasks: d.tasks.map((t) => {
              if (t.id !== id) return t;
              // Completing a recurring task reschedules it to the next occurrence (Todoist-style).
              if (!t.done && t.recurrence !== "none" && t.dueDate) {
                return {
                  ...t,
                  dueDate: advanceDate(t.dueDate, t.recurrence),
                  completedAt: new Date().toISOString(),
                  subtasks: t.subtasks.map((s) => ({ ...s, done: false, completedAt: undefined })),
                };
              }
              return { ...t, done: !t.done, completedAt: !t.done ? new Date().toISOString() : undefined };
            }),
          };
        });
      },
      toggleImportant: (id) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === id ? { ...t, important: !t.important } : t)),
        })),
      startTimer: (id) =>
        setData((d) => {
          const now = new Date().toISOString();
          return {
            ...d,
            // Only one timer runs at a time — stop any others first.
            tasks: d.tasks.map((t) => {
              if (t.id === id) return { ...t, timerStartedAt: now };
              if (t.timerStartedAt) {
                const add = Math.round((Date.now() - new Date(t.timerStartedAt).getTime()) / 60000);
                return { ...t, spentMin: t.spentMin + Math.max(0, add), timerStartedAt: undefined };
              }
              return t;
            }),
          };
        }),
      stopTimer: (id) =>
        setData((d) => {
          const t = d.tasks.find((x) => x.id === id);
          const add = t?.timerStartedAt
            ? Math.max(0, Math.round((Date.now() - new Date(t.timerStartedAt).getTime()) / 60000))
            : 0;
          // Focus XP: +1 per 2 tracked minutes, capped per session.
          const focusXp = d.gamification.enabled ? Math.min(30, Math.floor(add / 2)) : 0;
          return {
            ...d,
            gamification: focusXp ? { ...d.gamification, xp: d.gamification.xp + focusXp } : d.gamification,
            tasks: d.tasks.map((x) =>
              x.id === id && x.timerStartedAt
                ? { ...x, spentMin: x.spentMin + add, timerStartedAt: undefined }
                : x
            ),
          };
        }),
      toggleSubtask: (taskId, subtaskId) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: t.subtasks.map((s) =>
                    s.id === subtaskId
                      ? { ...s, done: !s.done, completedAt: !s.done ? new Date().toISOString() : undefined }
                      : s
                  ),
                }
              : t
          ),
        })),
      addSubtask: (taskId, title) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: [...t.subtasks, { id: uid(), title: title.trim(), done: false }] }
              : t
          ),
        })),
      updateSubtask: (taskId, subtaskId, patch) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, ...patch } : s)) }
              : t
          ),
        })),
      deleteSubtask: (taskId, subtaskId) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }
              : t
          ),
        })),
      reorderTasks: (orderedIds) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => {
            const idx = orderedIds.indexOf(t.id);
            return idx === -1 ? t : { ...t, order: idx };
          }),
        })),
      deleteTask: (id) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks
            .filter((t) => t.id !== id)
            // Strip the deleted id out of every other task's dependency list — otherwise a task
            // can stay "blocked" forever by a dependency that no longer exists.
            .map((t) => (t.blockedBy?.includes(id) ? { ...t, blockedBy: t.blockedBy.filter((b) => b !== id) } : t)),
        })),
      restoreTask: (task) => setData((d) => ({ ...d, tasks: [...d.tasks, task] })),
      archiveTask: (id) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === id ? { ...t, archivedAt: new Date().toISOString() } : t)),
        })),
      unarchiveTask: (id) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === id ? { ...t, archivedAt: undefined } : t)),
        })),
      archiveDoneTasks: () => {
        const n = data.tasks.filter((t) => t.done && !t.archivedAt).length;
        setData((d) => {
          const now = new Date().toISOString();
          return {
            ...d,
            tasks: d.tasks.map((t) => (t.done && !t.archivedAt ? { ...t, archivedAt: now } : t)),
          };
        });
        return n;
      },
      archiveProject: (id) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p)),
        })),
      unarchiveProject: (id) =>
        setData((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === id ? { ...p, archivedAt: undefined } : p)),
        })),
      archiveNote: (id) =>
        setData((d) => ({
          ...d,
          notes: d.notes.map((n) => (n.id === id ? { ...n, archivedAt: new Date().toISOString() } : n)),
        })),
      unarchiveNote: (id) =>
        setData((d) => ({
          ...d,
          notes: d.notes.map((n) => (n.id === id ? { ...n, archivedAt: undefined } : n)),
        })),
      addPomodoroSession: (session) =>
        setData((d) => {
          const focusXp =
            d.gamification.enabled && session.kind === "work" ? Math.min(20, Math.round(session.minutes / 3)) : 0;
          return {
            ...d,
            gamification: focusXp ? { ...d.gamification, xp: d.gamification.xp + focusXp } : d.gamification,
            pomodoroSessions: [
              ...d.pomodoroSessions,
              { ...session, id: uid(), date: todayStr() },
            ],
            // Credit tracked minutes to the linked task, like the manual timer does.
            tasks:
              session.kind === "work" && session.taskId
                ? d.tasks.map((t) =>
                    t.id === session.taskId ? { ...t, spentMin: t.spentMin + session.minutes } : t
                  )
                : d.tasks,
          };
        }),

      addNote: (input) => {
        const id = uid();
        setData((d) => ({
          ...d,
          notes: [...d.notes, { tags: [], ...input, id, createdAt: new Date().toISOString() }],
        }));
        return id;
      },
      updateNote: (id, patch) =>
        setData((d) => ({
          ...d,
          notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),
      reorderNotes: (orderedIds) =>
        setData((d) => ({
          ...d,
          notes: d.notes.map((n) => {
            const idx = orderedIds.indexOf(n.id);
            return idx === -1 ? n : { ...n, order: idx };
          }),
        })),
      toggleNotePin: (id) =>
        setData((d) => ({
          ...d,
          notes: d.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
        })),
      deleteNote: (id) => setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) })),
      restoreNote: (note) => setData((d) => ({ ...d, notes: [...d.notes, note] })),

      addMeeting: ({ durationMin, recurrence, ...input }) =>
        setData((d) => ({
          ...d,
          meetings: [
            ...d.meetings,
            { ...input, id: uid(), durationMin: durationMin ?? 30, recurrence: recurrence ?? "none" },
          ],
        })),
      updateMeeting: (id, patch) =>
        setData((d) => ({
          ...d,
          meetings: d.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      deleteMeeting: (id) =>
        setData((d) => ({ ...d, meetings: d.meetings.filter((m) => m.id !== id) })),
      restoreMeeting: (meeting) =>
        setData((d) => ({ ...d, meetings: [...d.meetings, meeting] })),
      toggleMeeting: (id) => {
        // Soft "pop" on completion, same gesture as a task (fires within the click).
        const m0 = data.meetings.find((m) => m.id === id);
        if (m0 && !m0.done && data.settings.soundEnabled) playPop();
        setData((d) => ({
          ...d,
          meetings: d.meetings.map((m) =>
            m.id === id ? { ...m, done: !m.done, completedAt: !m.done ? new Date().toISOString() : undefined } : m
          ),
        }));
      },

      updateSettings: (patch) =>
        setData((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      addSavedView: (view) =>
        setData((d) => ({
          ...d,
          settings: { ...d.settings, savedViews: [...d.settings.savedViews, { ...view, id: uid() }] },
        })),
      deleteSavedView: (id) =>
        setData((d) => ({
          ...d,
          settings: { ...d.settings, savedViews: d.settings.savedViews.filter((v) => v.id !== id) },
        })),
      addChecklistTemplate: (name, items) =>
        setData((d) => ({
          ...d,
          settings: {
            ...d.settings,
            checklistTemplates: [...d.settings.checklistTemplates, { id: uid(), name, items }],
          },
        })),
      deleteChecklistTemplate: (id) =>
        setData((d) => ({
          ...d,
          settings: {
            ...d.settings,
            checklistTemplates: d.settings.checklistTemplates.filter((t) => t.id !== id),
          },
        })),
      addProjectTemplate: (name, sections, tasks) =>
        setData((d) => ({
          ...d,
          settings: {
            ...d.settings,
            projectTemplates: [...d.settings.projectTemplates, { id: uid(), name, sections, tasks }],
          },
        })),
      deleteProjectTemplate: (id) =>
        setData((d) => ({
          ...d,
          settings: {
            ...d.settings,
            projectTemplates: d.settings.projectTemplates.filter((t) => t.id !== id),
          },
        })),
      createProjectFromTemplate: (name, templateId) =>
        setData((d) => {
          const tpl = d.settings.projectTemplates.find((t) => t.id === templateId);
          const projectId = uid();
          const newProject: Project = {
            id: projectId,
            name,
            status: "active",
            sections: tpl?.sections ?? [],
            createdAt: new Date().toISOString(),
          };
          const startOrder = d.tasks.length;
          const newTasks: Task[] = (tpl?.tasks ?? []).map((t, i) => ({
            id: uid(),
            title: t.title,
            projectId,
            section: t.section,
            done: false,
            important: false,
            priority: 0,
            links: [],
            comments: [],
            attachments: [],
            recurrence: "none",
            spentMin: 0,
            tags: [],
            subtasks: [],
            order: startOrder + i,
            createdAt: new Date().toISOString(),
          }));
          return { ...d, projects: [...d.projects, newProject], tasks: [...d.tasks, ...newTasks] };
        }),
      updateGamification: (patch) =>
        setData((d) => ({ ...d, gamification: { ...d.gamification, ...patch } })),
      replaceAll: (next) => {
        // A pending undo entry from before the replacement would restore an object into a
        // dataset it no longer belongs to — drop the stack along with swapping the data.
        clearUndo();
        setData(next);
      },

      clientRisk: (client) => {
        const days = daysSince(client.lastActivityAt);
        if (days >= data.settings.riskRiskDays) return "risk";
        if (days >= data.settings.riskAttentionDays) return "attention";
        return "none";
      },
    }),
    [data]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
