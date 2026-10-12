/**
 * Достижения · Craft Dark — everything except the level banner, shared by v1…v4.
 * Each variant file only supplies its own banner (`Banner`) and renders <AchievementsScreen>.
 *
 *   banner        — per variant (v1 path of 20 levels · v2 level ring · v3 tier shelf · v4 compact strip)
 *   two quest cards — «Квесты дня» (today's 3 quests) · «Марафон месяца» (season challenge, pace)
 *   «Этапы пути» — milestone rows (levels, task counts, streaks): badge, desc, progress n/target or «Получено»
 *   records       — streak, record day, total done, focus
 *   «Коллекция»   — all 30 achievements as live 3D badges; locked ones steel-grey; click opens the badge
 *
 * Real data only: gamification (xp, unlocked ids, bestStreak), computeGameStats over all tasks,
 * daily quests, the month's season. Read-only — nothing is written to the store.
 */
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { Check, Flame, Lock, Trophy, X, Zap } from "lucide-react";

import { C, IconBtn, R, StatusPill, T, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { useData } from "@/store/DataProvider";
import { ACHIEVEMENTS, levelProgress, type GameStats } from "@/lib/gamification";
import { computeGameStats } from "@/lib/gameStats";
import { questsForDay, questDone, seasonProgress } from "@/lib/quests";
import { formatDuration, todayStr } from "@/lib/format";
import { levelTitle } from "@/types";

import { LiveBadge } from "./badges";

// ── Progress per achievement (value → target), from the same stats the unlock tests read ─────

type Prog = { value: number; target: number; unit?: string };
const P: Record<string, (s: GameStats) => Prog> = {
  "first-task": (s) => ({ value: s.lifetimeDone, target: 1 }),
  "ten-tasks": (s) => ({ value: s.lifetimeDone, target: 10 }),
  "fifty-tasks": (s) => ({ value: s.lifetimeDone, target: 50 }),
  "hundred-tasks": (s) => ({ value: s.lifetimeDone, target: 100 }),
  "milestone-250": (s) => ({ value: s.lifetimeDone, target: 250 }),
  "milestone-500": (s) => ({ value: s.lifetimeDone, target: 500 }),
  "streak-3": (s) => ({ value: s.streak, target: 3, unit: "дн." }),
  "streak-7": (s) => ({ value: s.streak, target: 7, unit: "дн." }),
  "streak-30": (s) => ({ value: s.streak, target: 30, unit: "дн." }),
  "inbox-zero": (s) => ({ value: s.openTasks === 0 && s.totalTasks > 0 ? 1 : 0, target: 1 }),
  "focus-2h": (s) => ({ value: s.minutesToday, target: 120, unit: "мин" }),
  "level-5": (s) => ({ value: s.level, target: 5 }),
  "level-10": (s) => ({ value: s.level, target: 10 }),
  "level-15": (s) => ({ value: s.level, target: 15 }),
  "level-20": (s) => ({ value: s.level, target: 20 }),
  "first-pomodoro": (s) => ({ value: s.pomodoros, target: 1 }),
  "ten-pomodoros": (s) => ({ value: s.pomodoros, target: 10 }),
  "fifty-pomodoros": (s) => ({ value: s.pomodoros, target: 50 }),
  "pomodoro-100": (s) => ({ value: s.pomodoros, target: 100 }),
  "pomodoro-200": (s) => ({ value: s.pomodoros, target: 200 }),
  "focus-10h": (s) => ({ value: s.focusMinTotal, target: 600, unit: "мин" }),
  "big-focus-day": (s) => ({ value: s.maxFocusMinInDay, target: 240, unit: "мин" }),
  "long-session-90": (s) => ({ value: s.longestFocusSession, target: 90, unit: "мин" }),
  "multi-project": (s) => ({ value: s.projectsTouched, target: 5 }),
  "night-owl": (s) => ({ value: s.nightOwlDone, target: 5 }),
  "early-bird": (s) => ({ value: s.earlyBirdDone, target: 5 }),
  perfectionist: (s) => ({ value: s.tasksWithDueDate >= 3 && s.overdueTasks === 0 ? 1 : 0, target: 1 }),
  comeback: (s) => ({ value: s.comeback ? 1 : 0, target: 1 }),
  "record-day": (s) => ({ value: s.maxTasksInDay, target: 8 }),
  "pomodoro-day": (s) => ({ value: s.maxPomodorosInDay, target: 6 }),
};

/** Level tiers (each is also an achievement badge). */
export const TIERS = [
  { level: 5, id: "level-5" },
  { level: 10, id: "level-10" },
  { level: 15, id: "level-15" },
  { level: 20, id: "level-20" },
];

export const MAX_LEVEL = 20;

/** Progress (0–100) through tier `i`, counting the part of the current level already earned. */
export function tierPct(level: number, levelPct: number, i: number) {
  const t = TIERS[i];
  const from = i === 0 ? 1 : TIERS[i - 1].level;
  if (level >= t.level) return 100;
  if (level < from) return 0;
  return ((level - from + levelPct / 100) / (t.level - from)) * 100;
}

export interface Ach {
  id: string;
  title: string;
  desc: string;
  unlocked: boolean;
  prog: Prog;
}

function useAchievements() {
  const data = useData();
  return useMemo(() => {
    const stats = computeGameStats({ ...data, tasks: data.allTasks });
    const got = new Set(data.gamification.achievements);
    const list: Ach[] = ACHIEVEMENTS.map((a) => ({
      id: a.id,
      title: a.title,
      desc: a.desc,
      unlocked: got.has(a.id) || a.test(stats),
      prog: (P[a.id] ?? (() => ({ value: 0, target: 1 })))(stats),
    }));
    const lvl = levelProgress(data.gamification.xp);
    const today = todayStr();
    const quests = questsForDay(today).map((q) => ({
      id: q.id,
      title: q.title,
      xp: q.xp,
      target: q.target,
      value: Math.min(q.target, q.progress(data, today)),
      done: questDone(q, data, today),
    }));
    const season = seasonProgress(data);
    return { stats, list, lvl, quests, season, xp: data.gamification.xp, bestStreak: data.gamification.bestStreak };
  }, [data]);
}

export type AchData = ReturnType<typeof useAchievements>;

export interface BannerProps {
  a: AchData;
  gotCount: number;
  /** The next tier above the current level (the last one once all are reached). */
  nextTier: (typeof TIERS)[number];
  /** Levels left to the next tier. */
  toTier: number;
}

// ── Pieces ────────────────────────────────────────────────────────────────────────────────────

export function Bar({ pct, h = 6, color = C.accent, track = "rgba(255,255,255,0.10)" }: { pct: number; h?: number; color?: string; track?: string }) {
  return (
    <div className="w-full overflow-hidden" style={{ height: h, borderRadius: 999, background: track }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", borderRadius: 999, background: color, transition: "width 400ms ease" }} />
    </div>
  );
}

/** Three short segments lit by progress (hirehi-style level meter). */
function Segments({ pct, done }: { pct: number; done?: boolean }) {
  const lit = done ? 3 : pct >= 66 ? 2 : pct >= 33 ? 1 : pct > 0 ? 0.5 : 0;
  return (
    <div className="flex justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="relative overflow-hidden" style={{ width: 52, height: 6, borderRadius: 999, background: C.dash }}>
          <span
            className="absolute inset-y-0 left-0"
            style={{ width: lit >= i + 1 ? "100%" : lit > i ? "45%" : "0%", borderRadius: 999, background: done ? C.accent : "#5AA9FF" }}
          />
        </span>
      ))}
    </div>
  );
}

function fmt(p: Prog) {
  const v = Math.min(p.value, p.target);
  if (p.unit === "мин" && p.target >= 60) return `${formatDuration(v) || "0 мин"} / ${formatDuration(p.target)}`;
  return `${v} / ${p.target}`;
}

const num1 = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function Card({ children, block, className = "", style }: { children: ReactNode; block: string; className?: string; style?: CSSProperties }) {
  return (
    <section data-lab-block={block} className={`min-w-0 p-6 ${className}`} style={{ background: C.card, borderRadius: R.card, ...style }}>
      {children}
    </section>
  );
}

/** Banner surface shared by the variants: deep sapphire with a soft light from the emblem side. */
export const BANNER_BG = "linear-gradient(135deg, #133D93 0%, #0C2766 46%, #0A1736 100%)";
export const BANNER_SHADOW = "inset 0 1px 0 rgba(255,255,255,0.12)";
export const ON_BLUE = { text2: "rgba(255,255,255,0.72)", text3: "rgba(255,255,255,0.52)", accent: "#9FD0FF", fill: "#7CC0FF", track: "rgba(255,255,255,0.12)" };

/** The big hero emblem: floating 3D medal with the current level on its plaque, on a soft pedestal of light. */
export function HeroEmblem({ level, size = 220, className = "" }: { level: number; size?: number; className?: string }) {
  return (
    <div data-lab-block="emblem" className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{ bottom: -size * 0.04, width: size * 0.78, height: size * 0.16, background: "radial-gradient(closest-side, rgba(124,192,255,0.45), rgba(124,192,255,0))" }}
      />
      <LiveBadge id="hero" size={size} tilt={14} float num={String(level)} />
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────────

type Filter = "all" | "got" | "progress" | "locked";

export function AchievementsScreen({ Banner }: { Banner: ComponentType<BannerProps> }) {
  const a = useAchievements();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Ach | null>(null);

  const lvl = a.lvl;
  const nextTier = TIERS.find((t) => t.level > lvl.level) ?? TIERS[TIERS.length - 1];
  const toTier = Math.max(0, nextTier.level - lvl.level);
  const gotCount = a.list.filter((x) => x.unlocked).length;

  const milestones = ["level-5", "level-10", "level-15", "level-20", "hundred-tasks", "milestone-250", "milestone-500", "streak-30"]
    .map((id) => a.list.find((x) => x.id === id))
    .filter((x): x is Ach => !!x);

  const shown = a.list.filter((x) =>
    filter === "got" ? x.unlocked : filter === "progress" ? !x.unlocked && x.prog.value > 0 : filter === "locked" ? !x.unlocked && x.prog.value <= 0 : true
  );
  const order = [...shown].sort((x, y) => Number(y.unlocked) - Number(x.unlocked));

  // Season pace — from completionLog via seasonProgress; the month length is target / 2.
  const now = new Date();
  const daysInMonth = Math.max(1, Math.round(a.season.target / 2));
  const dayOfMonth = Math.min(daysInMonth, now.getDate());
  const left = Math.max(0, a.season.target - a.season.done);
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
  const seasonPct = (a.season.done / a.season.target) * 100;

  return (
    <CraftShell active="achievements" crumb="Достижения" subtitle={`${gotCount} из ${a.list.length} получено · ${a.xp} XP`}>
      <Banner a={a} gotCount={gotCount} nextTier={nextTier} toTier={toTier} />

      {/* ── Quests ─────────────────────────────────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-1 gap-3 min-[1200px]:grid-cols-2">
        <Card block="quests">
          <div className="flex items-center gap-5">
            <LiveBadge id="first-task" size={84} locked={!a.quests.some((q) => q.done)} />
            <div className="min-w-0">
              <h2 style={T.h2}>Квесты дня</h2>
              <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>
                {a.quests.filter((q) => q.done).length} из {a.quests.length} · обновятся завтра
              </div>
            </div>
          </div>
          <div className="mt-5" style={{ ...T.body, color: C.text2 }}>
            Три маленькие цели на сегодня — за каждую XP
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {a.quests.map((q) => (
              <li key={q.id} className="flex items-center gap-3">
                <span
                  className="grid shrink-0 place-items-center"
                  style={{ width: 22, height: 22, borderRadius: 99, background: q.done ? C.accent : "transparent", boxShadow: q.done ? "none" : `inset 0 0 0 1.5px ${C.line2}` }}
                >
                  {q.done && <Check size={13} strokeWidth={3} color="#fff" />}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ ...T.cell, color: q.done ? C.text2 : C.text }}>
                  {q.title}
                </span>
                <span style={{ ...T.body, ...T.num, color: C.text3 }}>
                  {q.value}/{q.target}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 pt-4" style={{ ...dashed, backgroundPosition: "left top" }}>
            <div style={{ ...T.foot, color: C.text3 }}>Награда за набор</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.quests.map((q) => (
                <span key={q.id} style={{ ...T.body, padding: "6px 12px", borderRadius: 999, background: C.raise, color: q.done ? C.text3 : C.text }}>
                  +{q.xp} XP
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card block="season">
          <div className="flex items-center gap-5">
            <LiveBadge id="streak-7" size={84} locked={a.season.done === 0} />
            <div className="min-w-0">
              <h2 style={T.h2}>{a.season.title.replace(/^.*?: /, "").replace(/^./, (c) => c.toUpperCase())}</h2>
              <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>
                {a.season.title.split(":")[0]} · {a.season.done} из {a.season.target}
              </div>
            </div>
          </div>
          <div className="mt-5" style={{ ...T.body, color: C.text2 }}>
            Закрывай в среднем две задачи в день весь месяц
          </div>
          <div className="mt-6 flex items-baseline gap-2">
            <span style={{ ...T.num, fontSize: 48, lineHeight: 1 }}>{Math.min(100, Math.round(seasonPct))}%</span>
            <span style={{ ...T.body, color: C.text2 }}>марафона пройдено</span>
          </div>
          <div className="mt-4">
            <Bar pct={seasonPct} h={10} />
          </div>
          <div className="mt-3 flex justify-between" style={{ ...T.foot, color: C.text3 }}>
            <span>{a.season.done} закрыто</span>
            <span>осталось {left}</span>
          </div>
          <div className="mt-5 pt-4" style={{ ...dashed, backgroundPosition: "left top" }}>
            <div style={{ ...T.foot, color: C.text3 }}>Темп</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span style={{ ...T.body, padding: "6px 12px", borderRadius: 999, background: C.raise }}>{num1(a.season.done / dayOfMonth)} в день сейчас</span>
              <span style={{ ...T.body, padding: "6px 12px", borderRadius: 999, background: left === 0 ? "rgba(10,132,255,0.14)" : C.raise }}>
                {left === 0 ? "марафон пройден" : `нужно ${num1(left / daysLeft)} в день`}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Этапы пути ─────────────────────────────────────────────────────────── */}
      <Card block="path" className="mt-3">
        <h2 style={T.h2}>Этапы пути</h2>
        <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>Большие вехи — уровни, сотни задач и серии</div>
        <div className="mt-5 flex flex-col gap-2">
          {milestones.map((m, i) => {
            const pct = (m.prog.value / m.prog.target) * 100;
            return (
              <div
                key={m.id}
                data-lab-block={i === 0 ? "path-row" : undefined}
                className="grid cursor-pointer items-center gap-5 px-5 py-4 transition-colors hover:bg-[#232328]"
                style={{ gridTemplateColumns: "56px minmax(0,1fr) minmax(150px,260px)", borderRadius: R.inner, background: C.raise }}
                onClick={() => setOpen(m)}
              >
                <LiveBadge id={m.id} size={56} locked={!m.unlocked} tilt={12} spinOnClick={false} />
                <div className="min-w-0">
                  <div className="truncate" style={T.title}>
                    {m.title}
                  </div>
                  <div className="truncate" style={{ ...T.body, color: C.text2, marginTop: 2 }}>
                    {m.desc}
                  </div>
                </div>
                {m.unlocked ? (
                  <span className="flex items-center justify-end gap-2" style={{ ...T.cell, color: C.text2 }}>
                    <Check size={16} strokeWidth={2} /> Получено
                  </span>
                ) : (
                  <div className="flex items-center gap-3">
                    <Bar pct={pct} />
                    <span className="shrink-0 whitespace-nowrap" style={{ ...T.body, ...T.num, color: C.text3 }}>
                      {fmt(m.prog)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Серия и рекорды ────────────────────────────────────────────────────── */}
      <div data-lab-block="records" className="mt-3 grid grid-cols-2 gap-3 min-[1200px]:grid-cols-4">
        {[
          { icon: <Flame size={18} strokeWidth={1.75} />, label: "Серия сейчас", value: `${a.stats.streak} ${plural(a.stats.streak, "день", "дня", "дней")}`, sub: `рекорд ${a.bestStreak}` },
          { icon: <Zap size={18} strokeWidth={1.75} />, label: "Ударный день", value: `${a.stats.maxTasksInDay} ${plural(a.stats.maxTasksInDay, "задача", "задачи", "задач")}`, sub: "больше всего за день" },
          { icon: <Trophy size={18} strokeWidth={1.75} />, label: "Закрыто всего", value: String(a.stats.lifetimeDone), sub: `в ${a.stats.projectsTouched} ${plural(a.stats.projectsTouched, "проекте", "проектах", "проектах")}` },
          { icon: <Check size={18} strokeWidth={1.75} />, label: "Фокус всего", value: formatDuration(a.stats.focusMinTotal) || "0 мин", sub: `${a.stats.pomodoros} ${plural(a.stats.pomodoros, "сессия", "сессии", "сессий")}` },
        ].map((r) => (
          <div key={r.label} className="min-w-0 p-5" style={{ background: C.card, borderRadius: R.card }}>
            <div className="flex items-center gap-2" style={{ ...T.body, color: C.text2 }}>
              <span style={{ color: "#5AA9FF" }}>{r.icon}</span>
              {r.label}
            </div>
            <div className="mt-3 truncate" style={{ ...T.num, fontSize: 30, lineHeight: 1.05 }}>
              {r.value}
            </div>
            <div className="truncate" style={{ ...T.foot, color: C.text3, marginTop: 4 }}>
              {r.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── Коллекция ──────────────────────────────────────────────────────────── */}
      <section data-lab-block="collection" className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <h2 style={T.h2}>Коллекция</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex gap-1">
              {(
                [
                  ["all", "Все"],
                  ["got", "Получены"],
                  ["progress", "В процессе"],
                  ["locked", "Не начаты"],
                ] as [Filter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className="whitespace-nowrap transition-colors"
                  style={{ height: 36, padding: "0 14px", borderRadius: 999, fontSize: 14, background: filter === id ? "rgba(10,132,255,0.14)" : "transparent", color: filter === id ? C.text : C.text3 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="whitespace-nowrap" style={{ ...T.body, color: C.text3 }}>
              {gotCount} из {a.list.length} получено
            </span>
          </div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {order.map((x, i) => {
            const pct = (x.prog.value / x.prog.target) * 100;
            return (
              <article
                key={x.id}
                data-lab-block={i === 0 ? "collection-card" : undefined}
                className="flex min-w-0 cursor-pointer flex-col items-center px-6 pb-7 pt-8 text-center transition-colors hover:bg-[#17171A]"
                style={{ background: C.card, borderRadius: R.card }}
                onClick={() => setOpen(x)}
              >
                <LiveBadge id={x.id} size={148} locked={!x.unlocked} spinOnClick={false} />
                <div className="mt-5" style={{ ...T.title, fontSize: 19 }}>
                  {x.title}
                </div>
                <div className="mt-3">
                  <Segments pct={pct} done={x.unlocked} />
                </div>
                <div className="mt-2.5 flex gap-3" style={{ ...T.body, color: C.text3 }}>
                  <span>{x.unlocked ? "Получено" : x.prog.value > 0 ? "В процессе" : "Не начато"}</span>
                  {!x.unlocked && x.prog.target > 1 && <span style={T.num}>{fmt(x.prog)}</span>}
                </div>
                <div className="mt-3" style={{ ...T.cell, color: C.text2, lineHeight: 1.4 }}>
                  {x.desc}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {open && <BadgeDialog a={open} onClose={() => setOpen(null)} />}
    </CraftShell>
  );
}

function BadgeDialog({ a, onClose }: { a: Ach; onClose: () => void }) {
  const pct = (a.prog.value / a.prog.target) * 100;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={a.title}
        className="relative flex w-full max-w-[440px] flex-col items-center p-8 text-center"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="absolute right-4 top-4">
          <IconBtn title="Закрыть" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </IconBtn>
        </div>
        <div
          className="pointer-events-none absolute left-1/2 top-10 h-64 w-64 -translate-x-1/2 rounded-full"
          style={{ background: a.unlocked ? "radial-gradient(circle, rgba(10,132,255,0.35), transparent 65%)" : "none" }}
        />
        <LiveBadge id={a.id} size={240} locked={!a.unlocked} tilt={20} float={a.unlocked} />
        <div className="mt-6" style={T.h2}>
          {a.title}
        </div>
        <div className="mt-2" style={{ ...T.cell, color: C.text2 }}>
          {a.desc}
        </div>
        <div className="mt-6 w-full">
          {a.unlocked ? (
            <StatusPill tone="blue" size={40}>
              Получено
            </StatusPill>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between" style={{ ...T.body, color: C.text3 }}>
                <span className="flex items-center gap-1.5">
                  <Lock size={14} strokeWidth={1.75} /> Ещё не открыто
                </span>
                <span style={T.num}>{fmt(a.prog)}</span>
              </div>
              <Bar pct={pct} h={8} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

