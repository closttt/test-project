export type ClientStatus = "active" | "negotiation" | "archived";
export type ProjectStatus = "planned" | "active" | "done" | "archived";
export type RiskLevel = "none" | "attention" | "risk";
export type Theme = "dark" | "light";
export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "monthly-first-monday";
export type MeetingRecurrence = "none" | "weekly" | "monthly";
export type PaymentStatus = "paid" | "pending";
export type TouchType = "call" | "email" | "meeting" | "message" | "note";
export type Accent = "blue" | "green" | "violet" | "orange" | "rose";
export type Density = "comfortable" | "compact";
/** How loud the reward FX are: full = burst+confetti+XP float, subtle = toned down, off = none. */
export type EffectsLevel = "full" | "subtle" | "off";
export type DateFormat = "dmy" | "text";
export type PomodoroKind = "work" | "break";

export interface Contact {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
}

export interface CustomField {
  id: string;
  key: string;
  value: string;
}

export interface Touch {
  id: string;
  type: TouchType;
  note: string;
  date: string; // YYYY-MM-DD
}

export interface TaskComment {
  id: string;
  text: string;
  at: string; // ISO
}

/** Metadata for a file attached to a task — the blob itself lives in IndexedDB (see lib/attachments.ts). */
export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

export interface Payment {
  id: string;
  amount: number;
  status: PaymentStatus;
  date: string;
  note?: string;
}

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  status: ClientStatus;
  revenue: number;
  expectedPayment: number;
  payments: Payment[];
  tags: string[];
  contacts: Contact[];
  customFields: CustomField[];
  touches: Touch[];
  lastActivityAt: string;
  /** Date to reach out next (YYYY-MM-DD); surfaced on the dashboard when due. */
  followUpAt?: string;
  notes?: string;
  createdAt: string;
}

/**
 * A student on a recurring monthly plan (kept deliberately simpler than Client — no touches/risk).
 * The owner updates payments by hand. Reuses the `Payment` shape for history.
 */
export interface Student {
  id: string;
  name: string;
  note?: string;
  /** Total monthly fee. */
  monthlyFee: number;
  /** How many payments the month is split into: 1 (whole) or 2 (half + half). */
  paymentsPerMonth: 1 | 2;
  /** Inactive students are hidden from the default list but keep their history. */
  active: boolean;
  /** Payment history — same shape as client payments (amount, status, date, note). */
  payments: Payment[];
  tags: string[];
  createdAt: string;
}

export interface ProjectComment {
  id: string;
  text: string;
  at: string; // ISO
}

export interface Project {
  id: string;
  name: string;
  clientId?: string;
  status: ProjectStatus;
  /** Ordered section names for grouping this project's tasks. */
  sections?: string[];
  /** Cover image — attachment id, blob lives in IndexedDB (see lib/attachments.ts). */
  coverAttachmentId?: string;
  /** Project-level update/journal feed — "what needs adding/doing", not tied to one task. */
  comments?: ProjectComment[];
  /** Manual priority — set via PriorityPicker, same as tasks. */
  priority?: Priority;
  /** Photo gallery (screenshots, references) — separate from the single cover image. */
  photos?: Attachment[];
  /** General file attachments — separate story from the photo gallery (any file type, not just images). */
  files?: Attachment[];
  archivedAt?: string;
  createdAt: string;
}

/**
 * A subtask is a small task: besides a title it carries its own due date, priority, reminder and
 * notes, and it opens in its own card (SubtaskEditDialog). What it deliberately does NOT have is
 * the heavy machinery of a real Task — no project, tags, attachments, timer or recurrence: those
 * belong to the parent, and duplicating them here would make «подзадача» and «задача» the same
 * thing with two names.
 */
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  /** Own due date (YYYY-MM-DD). A subtask with a date behaves like a small task: it shows up in
   * «Задачи на сегодня» on its own, so a parent with 20 subtasks doesn't dump all of them into
   * today — only the pieces actually scheduled for today appear. */
  dueDate?: string;
  /** Own priority, same 0–3 scale as tasks. Undefined = 0 (без приоритета) for old data. */
  priority?: Priority;
  /** Local reminder datetime (YYYY-MM-DDTHH:mm) — fires like a task reminder (see ReminderEngine). */
  remindAt?: string;
  /** Free-form notes shown in the subtask card. */
  description?: string;
  /** ISO datetime when it was last completed. */
  completedAt?: string;
}

/** 0 = без приоритета, 1 = Высокий, 2 = Средний, 3 = Низкий. */
export type Priority = 0 | 1 | 2 | 3;

/** A single completed pomodoro (or break) interval — powers analytics + focus XP. */
export interface PomodoroSession {
  id: string;
  taskId?: string;
  kind: PomodoroKind;
  /** Whole minutes credited by this interval. */
  minutes: number;
  startedAt: string; // ISO
  date: string; // YYYY-MM-DD (local day the interval finished)
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  /** Optional section name within the project (grouping). */
  section?: string;
  done: boolean;
  /** ISO datetime when the task was archived (hidden from all active views). */
  archivedAt?: string;
  important: boolean;
  priority: Priority;
  /** ISO datetime when the task was last completed. */
  completedAt?: string;
  links: string[];
  comments: TaskComment[];
  dueDate?: string;
  /** Local reminder datetime (YYYY-MM-DDTHH:mm); fires an in-app + browser notification. */
  remindAt?: string;
  /** Hidden from active lists until this date (YYYY-MM-DD). */
  snoozedUntil?: string;
  recurrence: Recurrence;
  /** Estimated effort in minutes. */
  estimateMin?: number;
  /** Accumulated tracked time in minutes. */
  spentMin: number;
  /** ISO datetime when the running timer started (undefined = not running). */
  timerStartedAt?: string;
  tags: string[];
  subtasks: Subtask[];
  /** Locally-attached files (metadata only — blobs in IndexedDB). */
  attachments: Attachment[];
  /** Column id in the custom kanban board ("Доска" mode); unset tasks show in the first column. */
  kanbanColumnId?: string;
  /** IDs of other tasks that must be completed first (this task "waits for" them). */
  blockedBy?: string[];
  order: number;
  createdAt: string;
}

export const PRIORITY_META: Record<Priority, { label: string; short: string; color: string; dot: string }> = {
  0: { label: "Без приоритета", short: "—", color: "text-muted-foreground/40", dot: "hsl(var(--muted-foreground))" },
  1: { label: "Высокий", short: "Выс", color: "text-risk", dot: "hsl(var(--risk))" },
  2: { label: "Средний", short: "Ср", color: "text-amber-400", dot: "hsl(38 92% 55%)" },
  3: { label: "Низкий", short: "Низ", color: "text-brand", dot: "hsl(var(--brand))" },
};

/**
 * A card saved into the cloud "knowledge base" (e.g. forwarded from Telegram by the Hermes Agent
 * bot). Written server-side (service_role key), read-only from the browser (anon key + RLS).
 */
export interface KnowledgeCard {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  tags: string[];
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  tags: string[];
  archivedAt?: string;
  linkedClientId?: string;
  linkedProjectId?: string;
  /** Manual order — drives drag-to-reorder within the «Закреплённые» section. */
  order?: number;
  createdAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  clientId?: string;
  date: string;
  time: string;
  durationMin: number;
  recurrence: MeetingRecurrence;
  /** Call link (Zoom/Meet/etc) — when set, the meeting title links straight to it. */
  url?: string;
  /** Closed like a task — the meeting happened (or was skipped) and is out of the way. */
  done?: boolean;
  /** ISO datetime the meeting was closed. */
  completedAt?: string;
  /** Same picker as tasks — a meeting shows up in the task list and ranks alongside them. */
  priority?: Priority;
  tags?: string[];
}

export interface SavedView {
  id: string;
  name: string;
  list: string;
  tag: string | null;
  query: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: string[];
}

export interface ProjectTemplateTask {
  title: string;
  section?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  sections: string[];
  tasks: ProjectTemplateTask[];
}

export interface PomodoroSettings {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  /** Work rounds before a long break. */
  roundsBeforeLong: number;
  /** Auto-start the next phase when one ends. */
  autostart: boolean;
}

export interface Settings {
  riskAttentionDays: number;
  riskRiskDays: number;
  theme: Theme;
  accent: Accent;
  density: Density;
  dateFormat: DateFormat;
  weekStartsMonday: boolean;
  savedViews: SavedView[];
  checklistTemplates: ChecklistTemplate[];
  projectTemplates: ProjectTemplate[];
  pomodoro: PomodoroSettings;
  /** Play a soft "pop" when a task is completed. */
  soundEnabled: boolean;
  /** Intensity of completion FX (checkbox burst, +XP float, confetti, streak flicker). */
  effects: EffectsLevel;
  /**
   * Ivy Lee / Essentialism cap: how many tasks a day is "the plan" (0 = off).
   * Purely a nudge — anything past the cap is de-emphasised with a one-click "move to tomorrow",
   * never silently rescheduled behind the user's back.
   */
  dailyFocusLimit: number;
  /** Suppress reminder toasts/notifications during quiet hours. */
  quietEnabled: boolean;
  quietFrom: number; // hour 0–23
  quietTo: number; // hour 0–23
  /** Permanently delete archived items older than N days (0 = keep forever). */
  trashPurgeDays: number;
}

export const DEFAULT_POMODORO: PomodoroSettings = {
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  roundsBeforeLong: 4,
  autostart: false,
};

export interface Gamification {
  enabled: boolean;
  xp: number;
  dailyGoal: number;
  achievements: string[];
  bestStreak: number;
  /** Quest ids already rewarded, per day: { "2026-07-15": ["close-3", …] }. Keeps XP one-shot. */
  questLog?: Record<string, string[]>;
}

export const DEFAULT_GAMIFICATION: Gamification = {
  enabled: true,
  xp: 0,
  dailyGoal: 3,
  achievements: [],
  bestStreak: 0,
  questLog: {},
};

export interface AppData {
  clients: Client[];
  students: Student[];
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  meetings: Meeting[];
  settings: Settings;
  /** Map YYYY-MM-DD → number of tasks completed that day. Powers the streak and the dynamics chart. */
  completionLog: Record<string, number>;
  gamification: Gamification;
  /** Completed pomodoro/break intervals — powers focus analytics + focus XP. */
  pomodoroSessions: PomodoroSession[];
}

export const DEFAULT_SETTINGS: Settings = {
  riskAttentionDays: 14,
  riskRiskDays: 30,
  theme: "dark",
  accent: "blue",
  density: "comfortable",
  dateFormat: "dmy",
  weekStartsMonday: true,
  savedViews: [],
  checklistTemplates: [],
  projectTemplates: [],
  pomodoro: DEFAULT_POMODORO,
  soundEnabled: true,
  effects: "full",
  dailyFocusLimit: 0,
  quietEnabled: false,
  quietFrom: 22,
  quietTo: 8,
  trashPurgeDays: 30,
};

/** True if `hour` (0–23) falls inside the quiet window (handles overnight wrap). */
export function isQuietHour(from: number, to: number, hour: number): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Playful title shown next to the level number. Index by min(level, last). */
export const LEVEL_TITLES = [
  "Новичок", "Ученик", "Практик", "Уверенный", "Опытный",
  "Профи", "Ветеран", "Эксперт", "Мастер", "Гуру потока",
  "Виртуоз", "Стратег", "Титан", "Архитектор", "Легенда",
  "Икона", "Феномен", "Повелитель времени", "Бессмертный", "Абсолют потока",
];

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(Math.max(level, 1), LEVEL_TITLES.length) - 1];
}

export const ACCENTS: Record<Accent, { label: string; hsl: string; swatch: string }> = {
  blue: { label: "Синий", hsl: "217 91% 60%", swatch: "#3b82f6" },
  green: { label: "Зелёный", hsl: "142 71% 45%", swatch: "#22c55e" },
  violet: { label: "Фиолетовый", hsl: "262 83% 63%", swatch: "#8b5cf6" },
  orange: { label: "Оранжевый", hsl: "25 95% 55%", swatch: "#f97316" },
  rose: { label: "Розовый", hsl: "347 87% 60%", swatch: "#f43f5e" },
};
