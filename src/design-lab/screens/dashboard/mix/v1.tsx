/**
 * Dashboard · Гибрид · v1 «Бенто × Канбан» — round 2 of the owner's notes (design-lab/notes.md):
 * sidebar without the streak card and avatar, a clearer tinted active item; a bell that warns 5
 * minutes before a meeting with a chime; progress against the DAILY NORM (gamification.dailyGoal),
 * not all tasks; «Полгода» removed; rhythm bars list the tasks closed that day on hover; meetings
 * show their live / soon / later states; «Задачи дня» as one plain list (ring + n/норма + overdue
 * pill in the header, date on the right, no status/time columns, no view switch) with a solid add.
 *
 *   ┌ sidebar ┐ ┌ page panel ────────────────────────────────────────────────┐
 *   │ logo    │ │ Рабочий стол / Сегодня           date · bell · Новая задача │
 *   │ search  │ │ [folder] Сегодня  greeting                                  │
 *   │ nav     │ │ ring n из нормы │ norm segments │ просрочено │ Заметка       │
 *   │         │ │ План дня │ Ритм · 14 дней (hover → tasks) │ Приоритеты+неделя│
 *   │ settings│ │ Задачи дня (list, 2 cols)              │ Встречи         │
 *   └─────────┘ └─────────────────────────────────────────────────────────────┘
 *
 * Elements carry data-lab-block="…" so the board can open each one on its own page.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BellRing,
  BookOpen,
  CalendarClock,
  ChartColumn,
  ChevronDown,
  Focus,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import {
  Btn,
  C,
  CapsuleBars,
  Empty,
  IconBtn,
  Logo,
  NoteBox,
  R,
  Ring,
  RoundCheck,
  StatusPill,
  T,
  TONE,
  dashed,
  plural,
  rootStyle,
} from "@/design-lab/screens/_kit/craft";
import { useDashboardModel, type DashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";
import { MeetingBell, MobileNav, Sidebar } from "@/design-lab/screens/_kit/craftShell";
import { TagChips } from "@/design-lab/screens/_kit/controls";
import { MeetingEditor, PrioChip, ProjectChip, TaskEditor, useTasksModel, type TaskDraft } from "@/design-lab/screens/tasks/craft/_parts";
import { useData } from "@/store/DataProvider";
import { localDayStr, todayStr } from "@/lib/format";
import { dueMeetingAlerts, meetingStart, MEETING_LEAD_MIN } from "@/lib/meetingAlerts";
import { notificationPermission, requestNotifications } from "@/lib/reminders";
import { playChime } from "@/lib/sound";
import type { Meeting, Task } from "@/types";

// ── Local helpers ─────────────────────────────────────────────────────────────────────────────

const NAV_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Users,
  projects: FolderKanban,
  tasks: ListChecks,
  planner: CalendarClock,
  notes: NotebookPen,
  analytics: ChartColumn,
  knowledge: BookOpen,
};

const PRIO_DOT: Record<number, string> = { 0: "#4A4C54", 1: C.red, 2: C.amber, 3: C.accent };
const ICON = { size: 18, strokeWidth: 1.75 } as const;
const MIN = 60 * 1000;

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, open, close]);
}

function useWide(px: number) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= px);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= px);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [px]);
  return wide;
}

/** Re-render every `ms` — for «через 12 мин» labels. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function dur(min: number): string {
  if (!min) return "0 мин";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function FolderTile() {
  return (
    <svg width="52" height="44" viewBox="0 0 52 44" fill="none" aria-hidden>
      <defs>
        <linearGradient id="mixfolder" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3D9DFF" />
          <stop offset="1" stopColor="#0A6CF0" />
        </linearGradient>
      </defs>
      <path d="M0 8a6 6 0 0 1 6-6h12.5a6 6 0 0 1 4.2 1.7L26 7h20a6 6 0 0 1 6 6v25a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V8Z" fill="#0A5BC8" />
      <path d="M0 15a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6v23a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V15Z" fill="url(#mixfolder)" />
      <path d="M6 10h40a5 5 0 0 1 5 5" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none" />
    </svg>
  );
}

function NoteButton({ onSave }: { onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 whitespace-nowrap px-4 transition-colors duration-150 hover:bg-[#1D1D21]"
        style={{ height: 44, borderRadius: 999, background: open ? C.line : C.raise, fontSize: 14, color: C.text }}
      >
        <NotebookPen size={16} strokeWidth={1.75} color={C.text2} />
        Заметка
        <ChevronDown size={16} strokeWidth={1.75} color={C.text2} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 p-4"
          style={{ top: 52, width: 360, background: C.panel, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span style={{ ...T.cell, fontWeight: 500 }}>Быстрая заметка</span>
            <span style={{ ...T.foot, color: C.text3 }}>сохранится в «Заметки»</span>
          </div>
          <NoteBox
            rows={5}
            onSave={(v) => {
              onSave(v);
              if (v.trim()) setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Progress strip — against the daily norm ──────────────────────────────────────────────────

function Progress({ m, closed, goal }: { m: DashboardModel; closed: number; goal: number }) {
  const pct = goal ? Math.min(100, (closed / goal) * 100) : 0;
  const left = Math.max(0, goal - closed);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3 pl-3 pr-3" style={{ background: C.card, borderRadius: R.card }}>
      <div className="flex shrink-0 items-center gap-3">
        <Ring pct={pct} size={44} stroke={4}>
          <span style={{ ...T.foot, ...T.num, color: C.text2 }}>{Math.round(pct)}%</span>
        </Ring>
        <div>
          <div style={{ ...T.cell, ...T.num }}>
            {closed} <span style={{ color: C.text3, fontWeight: 400 }}>из {goal}</span>
          </div>
          <div style={{ ...T.foot, color: C.text3, marginTop: 2 }}>дневная норма</div>
        </div>
      </div>
      <div className="hidden shrink-0 self-stretch sm:block" style={{ width: 1, background: C.line }} />
      <div className="min-w-[200px] flex-1">
        <div className="mb-2.5 flex items-center justify-between gap-4" style={{ ...T.foot, color: C.text2 }}>
          <span>{closed >= goal ? "Норма дня выполнена" : `Осталось ${left} ${plural(left, "задача", "задачи", "задач")} до нормы`}</span>
          <span className="hidden md:inline" style={{ color: C.text3 }}>норма задаётся в настройках</span>
        </div>
        {/* One capsule per task of the norm, lit as tasks are closed. */}
        <div className="flex gap-1.5" style={{ height: 8 }}>
          {Array.from({ length: goal }, (_, i) => (
            <span key={i} className="flex-1" style={{ borderRadius: 999, background: i < closed ? C.accent : "#25252B", boxShadow: i < closed ? "0 0 10px rgba(10,132,255,0.35)" : undefined }} />
          ))}
        </div>
      </div>
      {m.kpi.overdueToday > 0 && (
        <StatusPill tone="amber" size={40}>
          {m.kpi.overdueToday} просрочено
        </StatusPill>
      )}
      <NoteButton onSave={m.actions.saveNote} />
    </div>
  );
}

// ── Bento tiles ───────────────────────────────────────────────────────────────────────────────

function Tile({ children, area, className = "" }: { children: ReactNode; area: string; className?: string }) {
  return (
    <section data-lab-block={area} className={`flex min-w-0 flex-col p-6 ${className}`} style={{ gridArea: area, background: C.card, borderRadius: R.card }}>
      {children}
    </section>
  );
}

function TileHead({ title, sub, right, icon }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 shrink-0" style={{ color: C.text2 }}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 style={T.title}>{title}</h2>
          {sub && <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div style={{ ...T.foot, color: C.text2 }}>{label}</div>
      <div className="mt-1 truncate" style={{ ...T.num, fontSize: 20, lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

const FIREWORKS_KEY = "crm-plan-fireworks-day";
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A short fireworks burst over the gauge (~1.5 s, canvas, no layout cost): three or four shells in
 * the kit's blues with a little green and amber, gravity and fade. `run` > 0 fires; each change
 * fires again. Skipped entirely under prefers-reduced-motion.
 */
function Fireworks({ run }: { run: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!run || !cv || reducedMotion()) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.offsetWidth;
    const H = cv.offsetHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.scale(dpr, dpr);
    const COLORS = [C.accent, "#5AA9FF", "#7CC0FF", C.green, C.amber, "#FFFFFF"];
    type P = { x: number; y: number; vx: number; vy: number; c: string; born: number; life: number };
    const parts: P[] = [];
    const shells = [
      { x: 0.5, y: 0.34, at: 0 },
      { x: 0.28, y: 0.42, at: 180 },
      { x: 0.72, y: 0.4, at: 320 },
      { x: 0.5, y: 0.22, at: 520 },
    ];
    const t0 = performance.now();
    const fired = new Set<number>();
    let raf = 0;
    const frame = (now: number) => {
      const el = now - t0;
      shells.forEach((sh, i) => {
        if (fired.has(i) || el < sh.at) return;
        fired.add(i);
        const n = 34;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + Math.random() * 0.2;
          const sp = 1.6 + Math.random() * 2.2;
          parts.push({ x: sh.x * W, y: sh.y * H, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, c: COLORS[(i + k) % COLORS.length], born: now, life: 900 + Math.random() * 500 });
        }
      });
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        const age = now - p.born;
        if (age > p.life) continue;
        p.vx *= 0.975;
        p.vy = p.vy * 0.975 + 0.045;
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = Math.max(0, 1 - age / p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (el < 1700) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
    };
  }, [run]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute z-30" style={{ inset: "-70px -60px -20px", width: "calc(100% + 120px)", height: "calc(100% + 90px)" }} />;
}

/** Half-ring gauge. `hot` (hover/focus) thickens and lights the arc; the number lifts a touch. */
function PlanGauge({ pct, size, hot }: { pct: number; size: number; hot: boolean }) {
  const sw = 16;
  const r = size / 2 - sw / 2 - 4;
  const len = Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const arc = `M${size / 2 - r},${size / 2} A${r},${r} 0 0 1 ${size / 2 + r},${size / 2}`;
  const h = size / 2 + sw / 2 + 2;
  const ease = "stroke-width .18s ease, filter .18s ease, stroke .18s ease";
  return (
    <div className="relative" style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="mixgauge" x1="0" x2="1">
            <stop offset="0" stopColor="#0A6CF0" />
            <stop offset="1" stopColor="#7CC0FF" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke={hot ? C.line2 : C.raise} strokeWidth={hot ? sw + 3 : sw} strokeLinecap="round" style={{ transition: ease }} />
        {p > 0 && (
          <path
            d={arc}
            fill="none"
            stroke="url(#mixgauge)"
            strokeWidth={hot ? sw + 3 : sw}
            strokeLinecap="round"
            strokeDasharray={`${(p / 100) * len} ${len}`}
            style={{ transition: ease, filter: hot ? "drop-shadow(0 0 10px rgba(10,132,255,0.45))" : "none" }}
          />
        )}
      </svg>
      <div className="absolute inset-x-0 text-center" style={{ bottom: 4, transform: hot ? "translateY(-2px)" : undefined, transition: "transform .18s ease" }}>
        <div style={{ ...T.num, fontSize: size >= 200 ? 40 : 34, lineHeight: 1 }}>{Math.round(p)}%</div>
        <div style={{ ...T.foot, color: C.text2, marginTop: 6 }}>плана дня</div>
      </div>
    </div>
  );
}

function PlanTile({ m, closed, goal, wide }: { m: DashboardModel; closed: number; goal: number; wide: boolean }) {
  const { tasks } = useData();
  const pct = goal ? (closed / goal) * 100 : 0;
  const full = closed >= goal;
  const [hot, setHot] = useState(false);
  const [burst, setBurst] = useState(0);
  const closedToday = useMemo(() => {
    const today = todayStr();
    return tasks
      .filter((t) => t.done && t.completedAt && localDayStr(new Date(t.completedAt)) === today)
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }, [tasks]);
  // Fireworks once a day, the first time the norm is reached (remembered per browser, by date).
  useEffect(() => {
    if (!full) return;
    const today = todayStr();
    try {
      if (localStorage.getItem(FIREWORKS_KEY) === today) return;
      localStorage.setItem(FIREWORKS_KEY, today);
    } catch {
      /* storage blocked — still celebrate, it just may repeat on reload */
    }
    setBurst((b) => b + 1);
  }, [full]);
  const left = Math.max(0, goal - closed);
  return (
    <Tile area="plan">
      <TileHead title="План дня" sub={`${closed} из ${goal} ${plural(goal, "задачи", "задач", "задач")} нормы`} />
      <div className="flex flex-1 items-center justify-center py-5">
        <div
          className="relative outline-none"
          role={full ? "button" : undefined}
          tabIndex={0}
          aria-label={`План дня: ${closed} из ${goal}`}
          onMouseEnter={() => setHot(true)}
          onMouseLeave={() => setHot(false)}
          onFocus={() => setHot(true)}
          onBlur={() => setHot(false)}
          onClick={() => full && setBurst((b) => b + 1)}
          onKeyDown={(e) => full && e.key === "Enter" && setBurst((b) => b + 1)}
          style={{ cursor: full ? "pointer" : "default" }}
        >
          <PlanGauge pct={pct} size={wide ? 208 : 180} hot={hot} />
          <Fireworks run={burst} />
          <div
            role="tooltip"
            className="pointer-events-none absolute left-1/2 z-20 p-3"
            style={{
              bottom: "calc(100% + 12px)",
              width: 260,
              background: C.panel,
              borderRadius: R.small,
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              opacity: hot ? 1 : 0,
              transform: `translate(-50%, ${hot ? 0 : 4}px)`,
              transition: "opacity .16s ease, transform .16s ease",
            }}
          >
            <div className="flex items-baseline justify-between" style={{ ...T.foot, color: C.text2 }}>
              <span>Норма дня</span>
              <span style={{ ...T.num, color: C.text }}>
                {closed} из {goal}
              </span>
            </div>
            <div className="mt-2 flex gap-1" style={{ height: 6 }}>
              {Array.from({ length: goal }, (_, i) => (
                <span key={i} className="flex-1" style={{ borderRadius: 999, background: i < closed ? C.accent : C.line2 }} />
              ))}
            </div>
            <div className="mt-2" style={{ ...T.foot, color: full ? TONE.green.fg : C.text3 }}>
              {full ? (closed > goal ? `Норма выполнена, +${closed - goal} сверху` : "Норма выполнена") : `Осталось ${left} ${plural(left, "задача", "задачи", "задач")}`}
            </div>
            {closedToday.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1 pt-2.5" style={{ ...dashed, backgroundPosition: "left top" }}>
                {closedToday.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center gap-2" style={{ fontSize: 12, color: C.text2 }}>
                    <span className="shrink-0" style={{ width: 4, height: 4, borderRadius: 9, background: C.accent }} />
                    <span className="truncate">{t.title}</span>
                  </li>
                ))}
                {closedToday.length > 6 && <li style={{ fontSize: 12, color: C.text3 }}>и ещё {closedToday.length - 6}</li>}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-4" style={{ ...dashed, backgroundPosition: "left top" }}>
        <MiniStat label="Осталось до нормы" value={left} />
        <MiniStat label="Время сегодня" value={dur(m.kpi.minutesToday)} />
      </div>
    </Tile>
  );
}

/** Capsule bars; hovering a day shows the tasks closed that day in small type. */
function RhythmTile({ m, wide }: { m: DashboardModel; wide: boolean }) {
  const { tasks } = useData();
  const [hover, setHover] = useState<number | null>(null);
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of tasks) {
      if (!t.done || !t.completedAt) continue;
      const k = localDayStr(new Date(t.completedAt));
      const xs = map.get(k) ?? [];
      xs.push(t.title);
      map.set(k, xs);
    }
    return map;
  }, [tasks]);
  const data = m.dynamics.map((d) => ({ label: d.label.split(".")[0], value: d.value }));
  const day = hover !== null ? m.dynamics[hover] : null;
  const titles = day ? byDay.get(day.date) ?? [] : [];
  const barsH = wide ? 160 : 140;
  return (
    <Tile area="rhythm">
      <TileHead
        title="Ритм · 14 дней"
        right={
          <span className="whitespace-nowrap" style={{ ...T.foot, color: C.text2, padding: "6px 12px", borderRadius: 999, background: C.raise }}>
            пик {m.peak14} в день
          </span>
        }
      />
      <div className="mt-3 flex items-baseline gap-2">
        <span style={{ ...T.num, fontSize: 40, lineHeight: 1 }}>{m.closed14}</span>
        <span style={{ ...T.body, color: C.text2 }}>{plural(m.closed14, "задача закрыта", "задачи закрыто", "задач закрыто")}</span>
      </div>
      <div className="relative mt-auto pt-6" onMouseLeave={() => setHover(null)}>
        <CapsuleBars data={data} height={barsH} highlight={hover ?? undefined} />
        {/* Invisible hover columns over the bars. */}
        <div className="absolute inset-x-0 flex gap-1.5" style={{ top: 24, height: barsH }}>
          {data.map((_, i) => (
            <div key={i} className="flex-1 cursor-default" onMouseEnter={() => setHover(i)} />
          ))}
        </div>
        {day && hover !== null && (
          <div
            className="pointer-events-none absolute z-20 p-3"
            style={{
              bottom: barsH + 6,
              left: `clamp(0px, calc(${((hover + 0.5) / data.length) * 100}% - 120px), calc(100% - 240px))`,
              width: 240,
              background: C.panel,
              borderRadius: R.small,
              boxShadow: `inset 0 0 0 1px ${C.line2}, 0 16px 40px rgba(0,0,0,0.5)`,
            }}
          >
            <div className="flex items-baseline justify-between" style={{ ...T.foot, color: C.text2 }}>
              <span>{new Date(day.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}</span>
              <span style={{ color: C.text }}>
                {day.value} {plural(day.value, "задача", "задачи", "задач")}
              </span>
            </div>
            {titles.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {titles.slice(0, 6).map((t, i) => (
                  <li key={i} className="flex items-center gap-2" style={{ fontSize: 12, color: C.text2 }}>
                    <span className="shrink-0" style={{ width: 4, height: 4, borderRadius: 9, background: C.accent }} />
                    <span className="truncate">{t}</span>
                  </li>
                ))}
                {titles.length > 6 && <li style={{ fontSize: 12, color: C.text3 }}>и ещё {titles.length - 6}</li>}
              </ul>
            ) : (
              <div className="mt-2" style={{ fontSize: 12, color: C.text3 }}>
                {day.value ? "Названия не сохранились" : "Ничего не закрыто"}
              </div>
            )}
          </div>
        )}
      </div>
    </Tile>
  );
}

function PriorityTile({ m }: { m: DashboardModel }) {
  const max = Math.max(1, ...m.status.openByPriority.map((p) => p.count));
  return (
    <Tile area="prio">
      <TileHead title="Приоритеты" sub={`${m.kpi.openCount} ${plural(m.kpi.openCount, "открытая задача", "открытые задачи", "открытых задач")}`} />
      <div className="mt-3 flex flex-col">
        {m.status.openByPriority.map((p) => {
          const filled = p.count ? Math.max(1, Math.round((p.count / max) * 14)) : 0;
          const dot = PRIO_DOT[p.priority] ?? PRIO_DOT[0];
          return (
            <div key={p.priority} className="flex items-center gap-3" style={{ minHeight: 42, ...dashed }}>
              <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 9, background: dot }} />
              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                {p.label}
              </span>
              <span className="hidden shrink-0 gap-[3px] min-[1360px]:flex" aria-hidden>
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={i} style={{ width: 3, height: 12, borderRadius: 99, background: i < filled ? dot : C.line2 }} />
                ))}
              </span>
              <span className="w-7 shrink-0 text-right" style={{ ...T.body, ...T.num, color: C.text2 }}>
                {p.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-auto pt-6">
        <div className="flex items-baseline justify-between" style={{ ...T.foot, color: C.text2 }}>
          <span>Эта неделя</span>
          <span>
            закрыто <span style={{ color: C.text }}>{m.kpi.weekDone}</span>
          </span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {m.week.map((d) => (
            <div
              key={d.key}
              className="flex flex-col items-center justify-center gap-1"
              style={{ height: 52, borderRadius: R.small, background: C.raise, boxShadow: d.isToday ? `inset 0 0 0 1px ${C.accent}` : undefined }}
            >
              <span style={{ fontSize: 11, color: d.isToday ? "#5AA9FF" : C.text3 }}>{d.label}</span>
              <span style={{ ...T.num, fontSize: 14, color: d.done ? C.text : C.text3 }}>{d.done}</span>
            </div>
          ))}
        </div>
      </div>
    </Tile>
  );
}

// ── Meetings — live / soon / later ───────────────────────────────────────────────────────────

interface MeetingView {
  id: string;
  title: string;
  time: string;
  durationMin: number;
  start: number;
  sub?: string;
  url?: string;
  done?: boolean;
}

/** Shown only when there are no real meetings — so the owner sees what the states look like. */
function demoMeetings(now: number): MeetingView[] {
  const at = (minFromNow: number) => {
    const t = new Date(now + minFromNow * MIN);
    t.setMinutes(Math.round(t.getMinutes() / 5) * 5, 0, 0);
    return t.getTime();
  };
  return [
    { id: "d1", title: "Созвон с клиентом по смете", sub: "Google Meet", durationMin: 45, start: at(-15), url: "#" },
    { id: "d2", title: "Дизайн-ревью главного экрана", sub: "Zoom", durationMin: 30, start: at(40), url: "#" },
    { id: "d3", title: "Планёрка на завтра", sub: "Без ссылки", durationMin: 20, start: at(190) },
  ].map((x) => ({ ...x, time: hhmm(x.start) }));
}

function MeetingCard({ mt, now, onToggle, onOpen }: { mt: MeetingView; now: number; onToggle?: () => void; onOpen?: () => void }) {
  const end = mt.start + mt.durationMin * MIN;
  const live = !mt.done && mt.start <= now && now < end;
  const soonMin = Math.ceil((mt.start - now) / MIN);
  const soon = !mt.done && !live && soonMin > 0 && soonMin <= 60;
  return (
    <article
      className="flex flex-col gap-3 p-4"
      style={{
        borderRadius: R.inner,
        background: live ? "rgba(10,132,255,0.09)" : C.raise,
        opacity: mt.done ? 0.5 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span style={{ ...T.title, ...T.num }}>{mt.time}</span>
          <span style={{ ...T.foot, color: C.text3 }}>{mt.durationMin} мин</span>
        </div>
        {live ? (
          <span className="inline-flex items-center gap-1.5" style={{ ...T.foot, color: "#5AA9FF" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: C.accent, opacity: 0.6 }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: C.accent }} />
            </span>
            идёт · ещё {Math.ceil((end - now) / MIN)} мин
          </span>
        ) : soon ? (
          <span className="inline-flex items-center gap-1.5" style={{ ...T.foot, color: C.text2 }}>
            <BellRing size={13} strokeWidth={1.75} />
            через {soonMin} мин
          </span>
        ) : (
          onToggle && <RoundCheck done={!!mt.done} onChange={onToggle} size={20} />
        )}
      </div>
      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          title="Открыть встречу"
          className="block w-full truncate text-left transition-colors hover:text-[#5AA9FF]"
          style={{ ...T.body, fontWeight: 500, color: C.text }}
        >
          {mt.title}
        </button>
        {mt.sub && (
          <div className="mt-1 truncate" style={{ ...T.foot, color: C.text3 }}>
            {mt.sub}
          </div>
        )}
      </div>
      {live && mt.url && (
        <Btn size={36} icon={<Video size={16} strokeWidth={1.75} />} full onClick={() => mt.url !== "#" && window.open(mt.url, "_blank")}>
          Подключиться
        </Btn>
      )}
      {soon && <div style={{ ...T.foot, color: C.text3 }}>Напомню со звуком в {hhmm(mt.start - MEETING_LEAD_MIN * MIN)}</div>}
    </article>
  );
}

function MeetingsTile({ m }: { m: DashboardModel }) {
  const now = useNow();
  /** "new" — «+» в шапке плитки; id — клик по названию встречи. */
  const [editing, setEditing] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  const real: MeetingView[] = m.meetings.slice(0, 4).map((mt) => ({
    id: mt.id,
    title: mt.title,
    time: mt.time,
    durationMin: mt.durationMin,
    start: meetingStart(mt),
    sub: [mt.dateLabel, mt.clientName].filter(Boolean).join(" · "),
    url: mt.url,
    done: mt.done,
  }));
  // No sample meetings in the live app: an empty day just says so in the subtitle.
  const list = real;
  return (
    <Tile area="meet">
      <TileHead
        icon={<CalendarClock size={18} strokeWidth={1.75} />}
        title="Встречи"
        sub={list.length ? `${list.length} ${plural(list.length, "встреча", "встречи", "встреч")} впереди` : "Встреч впереди нет"}
        right={
          <IconBtn title="Новая встреча" size={36} onClick={() => setEditing("new")}>
            <Plus size={18} strokeWidth={1.75} />
          </IconBtn>
        }
      />
      <div className="mt-4 flex flex-col gap-2">
        {list.map((mt) => (
          <MeetingCard key={mt.id} mt={mt} now={now} onToggle={() => m.actions.toggleMeeting(mt.id)} onOpen={() => setEditing(mt.id)} />
        ))}
      </div>
      {editing && <MeetingEditor key={editing} meetingId={editing === "new" ? undefined : editing} onClose={closeEditor} />}
    </Tile>
  );
}

// ── Задачи дня — one plain list ──────────────────────────────────────────────────────────────

function SolidAdd({ onAdd, inputRef }: { onAdd: (v: string) => void; inputRef: React.RefObject<HTMLInputElement> }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
      className="flex items-center gap-2 pl-5 pr-1.5"
      style={{ height: 56, borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line}` }}
    >
      <input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Новая задача на сегодня — «завтра 15:00 #дизайн»"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      <Btn type="submit" icon={<Plus size={16} strokeWidth={2} />}>
        Добавить
      </Btn>
    </form>
  );
}

function TaskLine({ r, onToggle, onOpen, onDelete }: { r: TodayRow; onToggle: () => void; onOpen: () => void; onDelete: () => void }) {
  const late = r.overdue && !r.done;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group grid cursor-pointer items-center gap-4 px-6 outline-none transition-colors duration-150 hover:bg-[#17171A] focus-visible:bg-[#17171A]"
      style={{ gridTemplateColumns: "22px minmax(0,1fr) auto 32px", minHeight: 56, ...dashed, opacity: r.overLimit && !r.done ? 0.55 : 1 }}
    >
      <RoundCheck done={r.done} onChange={onToggle} />
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="min-w-0 truncate"
          style={{ ...T.cell, minWidth: 96, color: r.done ? C.text3 : C.text, textDecoration: r.done ? "line-through" : undefined, textDecorationColor: C.text3 }}
        >
          {r.title}
        </span>
        <PrioChip p={r.priority} />
        {r.projectName && r.task.projectId && (
          <span className="hidden min-w-0 shrink sm:inline-flex">
            <ProjectChip id={r.task.projectId} name={r.projectName} />
          </span>
        )}
        <span className="hidden min-w-0 shrink md:inline-flex">
          <TagChips tags={r.task.tags} />
        </span>
        {r.subtasksTotal > 0 && (
          <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
            {r.subtasksDone}/{r.subtasksTotal}
          </span>
        )}
      </div>
      <span className="whitespace-nowrap text-right" style={{ ...T.body, color: late ? TONE.amber.fg : C.text3 }}>
        {r.done ? "готово" : late ? `с ${r.dueLabel}` : r.dueLabel}
      </span>
      <button
        type="button"
        title="Удалить задачу"
        aria-label="Удалить задачу"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF6B63] focus-visible:opacity-100 group-hover:opacity-100"
        style={{ color: C.text3 }}
      >
        <Trash2 size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function TasksTile({
  m,
  rows,
  closed,
  goal,
  query,
  onToggle,
  onOpen,
  onDelete,
  inputRef,
}: {
  m: DashboardModel;
  rows: TodayRow[];
  closed: number;
  goal: number;
  query: string;
  onToggle: (r: TodayRow) => void;
  onOpen: (r: TodayRow) => void;
  onDelete: (r: TodayRow) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [showAll, setShowAll] = useState(false);
  const limit = m.focusLimit || goal;
  const open = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);
  const visible = showAll || query ? open : open.slice(0, limit);
  const hidden = open.length - visible.length;
  const pct = goal ? Math.min(100, (closed / goal) * 100) : 0;
  return (
    <section data-lab-block="board" className="flex min-w-0 flex-col overflow-hidden" style={{ gridArea: "tasks", background: C.card, borderRadius: R.card }}>
      <header className="flex items-center justify-between gap-4 px-6" style={{ height: 68, ...dashed }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <ListChecks size={18} strokeWidth={1.75} color={C.text2} />
          <h2 style={T.title}>Задачи дня</h2>
          {query && <span className="truncate" style={{ ...T.body, color: C.text3 }}>· поиск «{query}»</span>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-2" title="Закрыто из дневной нормы">
            <Ring pct={pct} size={26} stroke={3} />
            <span style={{ ...T.body, ...T.num, color: C.text2 }}>
              {closed}/{goal}
            </span>
          </span>
          {m.kpi.overdueToday > 0 && (
            <StatusPill tone="amber" size={28}>
              {m.kpi.overdueToday} просроч.
            </StatusPill>
          )}
        </div>
      </header>

      {visible.length + done.length === 0 ? (
        <div className="px-6 pt-5">
          <Empty>{query ? "Ничего не найдено" : "На сегодня задач нет — добавьте первую ниже"}</Empty>
        </div>
      ) : (
        <div>
          {visible.map((r, i) => (
            <div key={r.id} data-lab-block={i === 0 ? "card" : undefined}>
              <TaskLine r={r} onToggle={() => onToggle(r)} onOpen={() => onOpen(r)} onDelete={() => onDelete(r)} />
            </div>
          ))}
          {done.map((r) => (
            <TaskLine key={r.id} r={r} onToggle={() => onToggle(r)} onOpen={() => onOpen(r)} onDelete={() => onDelete(r)} />
          ))}
        </div>
      )}

      {(hidden > 0 || (showAll && open.length > limit && !query)) && (
        <div className="flex justify-center pt-4">
          <Btn kind="ghost" size={36} onClick={() => setShowAll((x) => !x)}>
            {hidden > 0 ? `Ещё ${hidden} ${plural(hidden, "задача", "задачи", "задач")} сверх лимита` : "Свернуть"}
          </Btn>
        </div>
      )}

      <div data-lab-block="lane-plan" className="mt-auto p-6 pt-5">
        <SolidAdd onAdd={m.actions.add} inputRef={inputRef} />
      </div>
    </section>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────────

export default function MixBentoKanban() {
  const m = useDashboardModel();
  const { meetings, settings } = useData();
  const wide = useWide(1360);
  // Below 1200 the three-column bento folds to two columns, below 700 (phones) to one.
  const mid = useWide(1200);
  const tablet = useWide(700);
  const [query, setQuery] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  /** Overdue tasks leave m.today once ticked — keep a snapshot so they stay (struck) in the list. */
  const [closedHere, setClosedHere] = useState<TodayRow[]>([]);
  const { tasks } = useData();
  const tm = useTasksModel();
  const navigate = useNavigate();
  const [editId, setEditId] = useState<string | null>(null);
  /** «Новая задача» dialog — the Tasks screen's form in create mode, due today by default. */
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const closeEditor = useCallback(() => {
    setEditId(null);
    setDraft(null);
  }, []);
  const removeTask = (t: Task) => {
    setClosedHere((xs) => xs.filter((x) => x.id !== t.id));
    setEditId(null);
    m.actions.remove(t);
  };

  const goal = Math.max(1, m.kpi.dailyGoal || m.focusLimit || 5);
  const closed = m.kpi.closedToday;

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const match = (r: TodayRow) => !q || r.title.toLowerCase().includes(q) || (r.projectName ?? "").toLowerCase().includes(q);
    const ids = new Set(m.today.map((r) => r.id));
    const alive = new Set(tasks.map((t) => t.id));
    const extra = closedHere.filter((r) => !ids.has(r.id) && alive.has(r.id)).map((r) => ({ ...r, done: true }));
    return [...m.today, ...extra].filter(match);
  }, [m.today, closedHere, q, tasks]);

  const toggle = (r: TodayRow) => {
    if (!r.done && r.overdue) setClosedHere((xs) => [r, ...xs.filter((x) => x.id !== r.id)]);
    if (r.done) setClosedHere((xs) => xs.filter((x) => x.id !== r.id));
    m.actions.toggle(r.id);
  };

  const open = m.today.filter((r) => !r.done).length;

  return (
    <div className="flex min-h-screen gap-2 p-3 lg:p-5" style={rootStyle}>
      <Sidebar active="dashboard" search={{ value: query, onChange: setQuery, placeholder: "Поиск задач" }} />

      <main className="min-w-0 flex-1 p-4 lg:p-6" style={{ background: C.panel, borderRadius: R.page }}>
        <MobileNav active="dashboard" />
        <div data-lab-block="topbar" className="flex items-center justify-between gap-4" style={{ height: 44 }}>
          <div className="flex min-w-0 items-center gap-2.5" style={{ ...T.body, color: C.text3 }}>
            <LayoutDashboard size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="hidden sm:inline">Рабочий стол</span>
            <span className="hidden sm:inline" style={{ color: C.line2 }}>/</span>
            <span style={{ color: C.text }}>Сегодня</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="mr-2 hidden whitespace-nowrap md:inline" style={{ ...T.body, color: C.text3 }}>
              {m.dateLabel}
            </span>
            <MeetingBell dot={m.followUps.length > 0} />
            {/* Full-screen focus mode (/focus) — a labelled pill from tablet up, an icon on phones. */}
            <span className="hidden sm:inline-flex">
              <Btn kind="ghost" icon={<Focus size={16} strokeWidth={1.75} />} onClick={() => navigate("/focus")}>
                Фокус
              </Btn>
            </span>
            <span className="sm:hidden">
              <IconBtn title="Фокус" filled onClick={() => navigate("/focus")}>
                <Focus size={16} strokeWidth={1.75} />
              </IconBtn>
            </span>
            <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={() => setDraft({ dueDate: todayStr() })}>
              Новая задача
            </Btn>
          </div>
        </div>

        <div data-lab-block="title" className="mt-6 flex items-center gap-4">
          <FolderTile />
          <h1 style={{ fontSize: 40, lineHeight: 1.05, fontWeight: 500, letterSpacing: "-0.035em" }}>Сегодня</h1>
          <span className="ml-1 self-end pb-1" style={{ ...T.body, color: C.text3 }}>
            {m.greeting} · {open} {plural(open, "задача", "задачи", "задач")} в работе
          </span>
        </div>

        <div data-lab-block="progress" className="mt-6">
          <Progress m={m} closed={closed} goal={goal} />
        </div>

        <div
          className="mt-3 grid gap-3"
          style={
            mid
              ? { gridTemplateColumns: "minmax(0,0.85fr) minmax(0,1.3fr) minmax(0,1fr)", gridTemplateAreas: `"plan rhythm prio" "tasks tasks meet"` }
              : tablet
                ? { gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gridTemplateAreas: `"plan prio" "rhythm rhythm" "tasks tasks" "meet meet"` }
                : { gridTemplateColumns: "minmax(0,1fr)", gridTemplateAreas: `"plan" "prio" "rhythm" "tasks" "meet"` }
          }
        >
          <PlanTile m={m} closed={closed} goal={goal} wide={wide} />
          <RhythmTile m={m} wide={wide} />
          <PriorityTile m={m} />
          <TasksTile m={m} rows={rows} closed={closed} goal={goal} query={query.trim()} onToggle={toggle} onOpen={(r) => setEditId(r.id)} onDelete={(r) => removeTask(tasks.find((x) => x.id === r.id) ?? r.task)} inputRef={addInput} />
          <MeetingsTile m={m} />
        </div>
      </main>
      {(editId || draft) && <TaskEditor taskId={editId} draft={draft ?? undefined} m={tm} onClose={closeEditor} />}
    </div>
  );
}
