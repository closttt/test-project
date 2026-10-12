/**
 * Dashboard · Craft Dark · v3 «Бенто с графиками» (refs 8 Celoci, 5 Relatel, dc-sent)
 * Composition: a slim sidebar straight on the canvas (logo, nav pills with counters, settings +
 * account at the bottom) and, to the right, the DocumentCraft header plaque (greeting + date ·
 * search pill · «Новая задача» + bell). Under it an 8px-rhythm bento of panels:
 *
 *   План дня (gauge)   │ Ритм · 14 дней (capsule bars) │ Статус задач
 *   Полгода (heat cells, spans two columns)            │   (tall: numbers, split bar, priorities)
 *   Сегодня (task table with round checks, add input)  │ Встречи
 *                                                      │ Быстрая заметка
 *
 * Charts stay in one blue hue plus greys; green/red only inside status pills.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  CircleDashed,
  Clock3,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Plus,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

import {
  AddInput,
  Avatar,
  Btn,
  C,
  CapsuleBars,
  Empty,
  HeatCells,
  Logo,
  NoteBox,
  Panel,
  R,
  RoundCheck,
  Row,
  SearchField,
  StatusPill,
  T,
  TH,
  IconBtn,
  dashed,
  plural,
  rootStyle,
  type Tone,
} from "@/design-lab/screens/_kit/craft";
import { useDashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";

// ── Local helpers ─────────────────────────────────────────────────────────────────────────────

const NAV_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutGrid,
  clients: Users,
  projects: FolderKanban,
  tasks: ListChecks,
  planner: CalendarDays,
  notes: NotebookPen,
  analytics: ChartColumn,
  knowledge: BookOpen,
};

/** Blue steps used by every chart on this screen (priority dots, split bar, legends). */
const BLUE = {
  solid: C.accent,
  mid: "rgba(10,132,255,0.55)",
  soft: "rgba(10,132,255,0.28)",
  grey: C.text3,
};

const PRIO_DOT: Record<number, string> = { 1: BLUE.solid, 2: BLUE.mid, 3: BLUE.soft, 0: C.line2 };

function dur(min: number): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Tile title row — 18px title, muted sub, optional right slot. Lighter than SectionHead (h2). */
function TileHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 style={T.title}>{title}</h2>
        {sub && <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0" style={{ width: size, height: size, borderRadius: 99, background: color }} />;
}

/** Small stat: muted label over a 24px number. */
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

/** Viewport ≥ px (for the two chart sizes: 1440 vs 1280). */
function useWide(px: number) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= px);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= px);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [px]);
  return wide;
}

/** Semicircle gauge — the kit's recipe, but the arc is not drawn at 0% (no stray round cap). */
function PlanGauge({ pct, size }: { pct: number; size: number }) {
  const sw = 16;
  const r = size / 2 - sw / 2 - 4;
  const len = Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const x0 = size / 2 - r;
  const x1 = size / 2 + r;
  const cy = size / 2;
  const arc = `M${x0},${cy} A${r},${r} 0 0 1 ${x1},${cy}`;
  const h = size / 2 + sw / 2 + 2;
  return (
    <div className="relative" style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
        <defs>
          <linearGradient id="v3gauge" x1="0" x2="1">
            <stop offset="0" stopColor="#0A6CF0" />
            <stop offset="1" stopColor="#7CC0FF" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke={C.raise} strokeWidth={sw} strokeLinecap="round" />
        {p > 0 && <path d={arc} fill="none" stroke="url(#v3gauge)" strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${(p / 100) * len} ${len}`} />}
      </svg>
      <div className="absolute inset-x-0 text-center" style={{ bottom: 4 }}>
        <div style={{ ...T.num, fontSize: size >= 210 ? 44 : 36, lineHeight: 1 }}>{Math.round(p)}%</div>
        <div style={{ ...T.foot, color: C.text2, marginTop: 6 }}>выполнено</div>
      </div>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────────

export default function CraftDashboardV3() {
  const m = useDashboardModel();
  const wide = useWide(1360);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const todayRef = useRef<HTMLDivElement>(null);

  // Plan of the day — counted from the same list the «Сегодня» tile shows.
  const doneToday = m.today.filter((r) => r.done).length;
  const totalToday = m.today.length;
  const pct = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return m.today;
    return m.today.filter((r) => r.title.toLowerCase().includes(q) || (r.projectName ?? "").toLowerCase().includes(q));
  }, [m.today, query]);
  const LIMIT = 7;
  const visible = showAll || query ? rows : rows.slice(0, LIMIT);
  const hidden = rows.length - visible.length;

  const yearActive = m.year.filter((d) => d.value > 0).length;
  const yearClosed = m.year.reduce((s, d) => s + d.value, 0);
  const firstDay = m.year[0] ? new Date(m.year[0].date) : new Date();
  const statusTotal = m.status.doneAll + m.status.inProgress + m.status.overdueAll;
  const maxPrio = Math.max(1, ...m.status.openByPriority.map((p) => p.count));

  const focusAdd = () => {
    const el = todayRef.current;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLInputElement>("form input")?.focus({ preventScroll: true });
  };

  return (
    <div className="min-h-screen" style={rootStyle}>
      <div className="flex gap-2" style={{ padding: 20 }}>
        {/* ── Sidebar (on the canvas, not a card) ───────────────────────────────────────── */}
        <aside className="sticky flex shrink-0 flex-col" style={{ top: 20, width: 232, height: "calc(100vh - 40px)" }}>
          <div className="flex items-center px-3" style={{ height: 68 }}>
            <Logo />
          </div>

          <nav className="mt-4 flex flex-col gap-1">
            {m.nav.map((n) => {
              const Icon = NAV_ICON[n.id] ?? LayoutGrid;
              const on = n.id === "dashboard";
              return (
                <button
                  key={n.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 text-left transition-colors duration-150"
                  style={{ height: 44, borderRadius: 999, background: on ? C.raise : "transparent", color: on ? C.text : C.text2, fontSize: 14 }}
                  onMouseEnter={(e) => !on && (e.currentTarget.style.color = C.text)}
                  onMouseLeave={(e) => !on && (e.currentTarget.style.color = C.text2)}
                >
                  <Icon size={18} strokeWidth={1.75} style={{ color: on ? C.accent : "currentColor" }} />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  {n.badge ? (
                    <span
                      className="grid place-items-center"
                      style={{
                        minWidth: 22,
                        height: 22,
                        padding: "0 7px",
                        borderRadius: 999,
                        fontSize: 12,
                        ...T.num,
                        fontWeight: 400,
                        letterSpacing: 0,
                        background: on ? C.accent : C.raise,
                        color: on ? "#fff" : C.text2,
                      }}
                    >
                      {n.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-3">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 text-left transition-colors duration-150 hover:text-[#F4F5F7]"
              style={{ height: 44, borderRadius: 999, color: C.text2, fontSize: 14 }}
            >
              <Settings size={18} strokeWidth={1.75} />
              Настройки
            </button>
            <div className="flex items-center gap-3 px-3" style={{ height: 64, borderRadius: R.card, background: C.panel }}>
              <Avatar initials="АБ" size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate" style={{ ...T.body, color: C.text }}>
                  Александр
                </div>
                <div className="truncate" style={{ ...T.foot, color: C.text3, marginTop: 2 }}>
                  Личное пространство
                </div>
              </div>
              <ChevronDown size={16} strokeWidth={1.75} color={C.text3} />
            </div>
          </div>
        </aside>

        {/* ── Main column ────────────────────────────────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Header plaque */}
          <header className="flex items-center gap-6 pl-6 pr-3" style={{ height: 68, background: C.panel, borderRadius: R.page }}>
            <div className="flex min-w-0 shrink-0 flex-col" style={{ width: wide ? 260 : 200 }}>
              <span className="truncate" style={{ ...T.cell, fontWeight: 500, letterSpacing: "-0.01em" }}>
                {m.greeting}
              </span>
              <span className="truncate" style={{ ...T.foot, color: C.text2, marginTop: 2 }}>
                {m.dateLabel}
              </span>
            </div>
            <div className="mx-auto flex min-w-0 flex-1" style={{ maxWidth: 440 }}>
              <SearchField height={44} value={query} onChange={setQuery} placeholder="Поиск по задачам на сегодня" />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2" style={{ width: wide ? 260 : undefined }}>
              <Btn icon={<Plus size={18} strokeWidth={2} />} onClick={focusAdd}>
                Новая задача
              </Btn>
              <IconBtn title="Уведомления" dot={m.kpi.overdueToday > 0 || m.followUps.length > 0}>
                <Bell size={18} strokeWidth={1.75} />
              </IconBtn>
            </div>
          </header>

          {/* Bento */}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: "minmax(0,0.8fr) minmax(0,1.3fr) minmax(0,1fr)",
              gridTemplateAreas: `"plan rhythm status" "year year status" "today today meet" "today today note"`,
              gridTemplateRows: "auto auto auto 1fr",
            }}
          >
            {/* A · План дня */}
            <Panel className="flex flex-col" style={{ gridArea: "plan" }}>
              <TileHead title="План дня" sub={totalToday ? `${doneToday} из ${totalToday} ${plural(totalToday, "задачи", "задач", "задач")}` : "Задач нет"} />
              <div className="flex flex-1 items-center justify-center py-6">
                <PlanGauge pct={pct} size={wide ? 224 : 192} />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4" style={{ boxShadow: `inset 0 1px 0 ${C.line}` }}>
                <MiniStat label="Осталось" value={m.kpi.todayOpen} />
                <MiniStat label="Время сегодня" value={m.kpi.minutesToday ? dur(m.kpi.minutesToday) : "0 мин"} />
              </div>
            </Panel>

            {/* B · Ритм */}
            <Panel className="flex flex-col" style={{ gridArea: "rhythm" }}>
              <TileHead
                title="Ритм · 14 дней"
                right={
                  <span style={{ ...T.foot, color: C.text2, padding: "6px 10px", borderRadius: 999, background: C.card }}>
                    пик {m.peak14} в день
                  </span>
                }
              />
              <div className="mt-3 flex items-baseline gap-2">
                <span style={{ ...T.num, fontSize: 40, lineHeight: 1 }}>{m.closed14}</span>
                <span style={{ ...T.body, color: C.text2 }}>{plural(m.closed14, "задача закрыта", "задачи закрыто", "задач закрыто")}</span>
              </div>
              <div className="mt-auto pt-6">
                <CapsuleBars data={m.dynamics.map((d) => ({ label: d.label.split(".")[0], value: d.value }))} height={wide ? 176 : 156} />
              </div>
            </Panel>

            {/* C · Статус задач */}
            <Panel className="flex flex-col" style={{ gridArea: "status" }}>
              <TileHead title="Статус задач" sub={`${statusTotal} ${plural(statusTotal, "задача", "задачи", "задач")} всего`} />
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { label: "Готово", value: m.status.doneAll, color: BLUE.solid },
                  { label: "В работе", value: m.status.inProgress, color: BLUE.soft },
                  { label: "Просрочено", value: m.status.overdueAll, color: BLUE.grey },
                ].map((s) => (
                  <div key={s.label} className="min-w-0">
                    <div style={{ ...T.num, fontSize: 32, lineHeight: 1 }}>{s.value}</div>
                    <div className="mt-2 flex items-center gap-1.5 truncate" style={{ ...T.foot, color: C.text2 }}>
                      <Dot color={s.color} size={6} />
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex w-full gap-1" style={{ height: 10 }}>
                {[
                  { v: m.status.doneAll, c: BLUE.solid },
                  { v: m.status.inProgress, c: BLUE.soft },
                  { v: m.status.overdueAll, c: BLUE.grey },
                ].map((p, i) =>
                  p.v > 0 ? <span key={i} style={{ width: `${(p.v / Math.max(1, statusTotal)) * 100}%`, minWidth: 6, borderRadius: 999, background: p.c }} /> : null
                )}
              </div>

              <div className="mt-8" style={{ ...T.foot, color: C.text2 }}>
                Открытые по приоритету
              </div>
              <div className="mt-2 flex flex-col">
                {m.status.openByPriority.map((p) => {
                  const filled = p.count ? Math.max(1, Math.round((p.count / maxPrio) * 16)) : 0;
                  return (
                    <div key={p.priority} className="flex items-center gap-3" style={{ minHeight: 44, ...dashed }}>
                      <Dot color={PRIO_DOT[p.priority]} />
                      <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                        {p.label}
                      </span>
                      <span className="hidden shrink-0 gap-[3px] min-[1360px]:flex" aria-hidden>
                        {Array.from({ length: 16 }, (_, i) => (
                          <span key={i} style={{ width: 4, height: 4, borderRadius: 9, background: i < filled ? PRIO_DOT[p.priority] : C.raise }} />
                        ))}
                      </span>
                      <span className="w-8 shrink-0 text-right" style={{ ...T.body, ...T.num, fontWeight: 400, letterSpacing: 0, color: C.text2 }}>
                        {p.count}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-auto pt-8">
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
                      style={{
                        height: 56,
                        borderRadius: R.small,
                        background: d.isToday ? C.raise : C.card,
                        boxShadow: d.isToday ? `inset 0 0 0 1px ${C.line2}` : undefined,
                      }}
                    >
                      <span style={{ fontSize: 11, color: d.isToday ? C.text2 : C.text3 }}>{d.label}</span>
                      <span style={{ ...T.num, fontSize: 14, color: d.done ? (d.isToday ? "#5AA9FF" : C.text) : C.text3 }}>{d.done}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {/* D · Полгода */}
            <Panel style={{ gridArea: "year" }}>
              <div className="flex items-stretch gap-6">
                <div className="flex min-w-0 flex-1 flex-col">
                  <TileHead
                    title="Полгода"
                    sub={`Серия ${m.kpi.streak} ${plural(m.kpi.streak, "день", "дня", "дней")} · лучшая ${m.kpi.bestStreak}`}
                  />
                  <div className="mt-auto grid grid-cols-2 gap-4 pt-5">
                    <MiniStat label="Закрыто" value={yearClosed} />
                    <MiniStat label="Активных дней" value={`${yearActive} из ${m.year.length}`} />
                  </div>
                </div>
                <div className="shrink-0">
                  <HeatCells values={m.year.map((d) => d.value)} cols={26} cell={wide ? 14 : 12} gap={wide ? 4 : 3} />
                  <div className="mt-3 flex items-center justify-between" style={{ ...T.foot, color: C.text3 }}>
                    <span>
                      {MONTHS[firstDay.getMonth()]} — сегодня
                    </span>
                    <span className="flex items-center gap-1.5">
                      меньше
                      {[C.raise, "rgba(10,132,255,0.30)", "rgba(10,132,255,0.60)", C.accent].map((c) => (
                        <span key={c} style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                      ))}
                      больше
                    </span>
                  </div>
                </div>
              </div>
            </Panel>

            {/* E · Сегодня */}
            <Panel pad={0} className="flex flex-col overflow-hidden" style={{ gridArea: "today" }}>
              <div ref={todayRef} className="flex flex-1 flex-col">
                <div className="px-6 pt-6">
                  <TileHead
                    title="Сегодня"
                    sub={
                      totalToday
                        ? `${m.kpi.todayOpen} ${plural(m.kpi.todayOpen, "открытая", "открытые", "открытых")}${m.kpi.overdueToday ? ` · ${m.kpi.overdueToday} с прошлых дней` : ""}${m.focusLimit ? ` · фокус ${m.focusLimit}` : ""}`
                        : "Свободный день"
                    }
                  />
                </div>

                {rows.length > 0 ? (
                  <>
                    <div className="mt-5 grid items-center gap-4 px-6 pb-3" style={{ gridTemplateColumns: COLS, ...dashed }}>
                      <span />
                      <TH icon={<ListChecks size={14} strokeWidth={1.75} />}>Задача</TH>
                      <TH icon={<CalendarDays size={14} strokeWidth={1.75} />}>Срок</TH>
                      <TH icon={<Clock3 size={14} strokeWidth={1.75} />}>Время</TH>
                      <TH icon={<CircleDashed size={14} strokeWidth={1.75} />}>Статус</TH>
                    </div>
                    {visible.map((r) => (
                      <TaskRow key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />
                    ))}
                    {hidden > 0 && (
                      <div className="flex justify-center pt-4">
                        <Btn kind="ghost" size={36} onClick={() => setShowAll(true)}>
                          Показать ещё {hidden}
                        </Btn>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-6 pt-5">
                    <Empty>{query ? "Ничего не найдено" : "На сегодня задач нет — добавьте первую ниже"}</Empty>
                  </div>
                )}

                <div className="mt-auto p-6 pt-5">
                  <AddInput onAdd={m.actions.add} />
                </div>
              </div>
            </Panel>

            {/* F · Встречи */}
            <Panel style={{ gridArea: "meet" }}>
              <TileHead title="Встречи" sub={m.meetings.length ? `${m.meetings.length} ${plural(m.meetings.length, "предстоит", "предстоят", "предстоят")}` : undefined} />
              <div className="mt-4">
                {m.meetings.length === 0 ? (
                  <Empty>Ближайших встреч нет</Empty>
                ) : (
                  <div className="flex flex-col">
                    {m.meetings.slice(0, 4).map((mt) => (
                      <div key={mt.id} className="flex items-center gap-3" style={{ minHeight: 60, ...dashed, opacity: mt.done ? 0.5 : 1 }}>
                        <RoundCheck done={!!mt.done} onChange={() => m.actions.toggleMeeting(mt.id)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate" style={{ ...T.body, color: C.text }}>
                            {mt.title}
                          </div>
                          <div className="truncate" style={{ ...T.foot, color: C.text3, marginTop: 3 }}>
                            {[mt.dateLabel, mt.clientName].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <span
                          className="inline-flex shrink-0 items-center gap-1.5"
                          style={{ height: 32, padding: "0 12px", borderRadius: 999, background: C.card, ...T.body, color: C.text2 }}
                        >
                          {mt.url ? <Video size={14} strokeWidth={1.75} /> : <Clock3 size={14} strokeWidth={1.75} />}
                          {mt.time}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>

            {/* G · Быстрая заметка */}
            <Panel className="flex flex-col" style={{ gridArea: "note" }}>
              <TileHead title="Быстрая заметка" sub="Попадёт в «Заметки»" />
              <div className="mt-4 flex min-h-0 flex-1 flex-col [&>div]:flex-1 [&_textarea]:flex-1">
                <NoteBox onSave={m.actions.saveNote} rows={4} />
              </div>
            </Panel>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Today row ─────────────────────────────────────────────────────────────────────────────────

const COLS = "22px minmax(0,1fr) 84px 92px 128px";

function statusOf(r: TodayRow): { tone: Tone; label: string } {
  if (r.done) return { tone: "green", label: "Готово" };
  if (r.overdue) return { tone: "red", label: "Просрочено" };
  if (r.overLimit) return { tone: "neutral", label: "Вне фокуса" };
  return { tone: "blue", label: "В плане" };
}

function TaskRow({ r, onToggle }: { r: TodayRow; onToggle: () => void }) {
  const st = statusOf(r);
  const time = r.estimateMin ? `${dur(r.spentMin)} / ${dur(r.estimateMin)}` : dur(r.spentMin);
  return (
    <Row cols={COLS} height={68} muted={r.overLimit && !r.done}>
      <RoundCheck done={r.done} onChange={onToggle} />
      <div className="min-w-0 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {r.priority > 0 && <Dot color={PRIO_DOT[r.priority]} size={6} />}
          <span className="truncate" style={{ ...T.cell, fontSize: 15, color: r.done ? C.text3 : C.text, textDecoration: r.done ? "line-through" : undefined, textDecorationColor: C.text3 }}>
            {r.title}
          </span>
        </div>
        <div className="mt-1 truncate" style={{ ...T.foot, color: C.text3 }}>
          {r.projectName ?? "Без проекта"}
          {r.subtasksTotal > 0 && ` · ${r.subtasksDone}/${r.subtasksTotal} подзадач`}
        </div>
      </div>
      <span className="truncate" style={{ ...T.body, color: C.text2 }}>
        {r.dueLabel}
      </span>
      <span className="truncate" style={{ ...T.body, color: r.spentMin ? C.text2 : C.text3 }}>
        {time}
      </span>
      <span>
        <StatusPill tone={st.tone}>{st.label}</StatusPill>
      </span>
    </Row>
  );
}
