/**
 * Dashboard · Data Terminal · v3 «Мониторинг»
 * Solexa-style monitoring console: segmented section nav, a filter strip (health filter for the
 * asset grid + period switch for the goal ring), a row of four instruments (goal ring, half-year
 * dot matrix, segmented gauge of open tasks, a "site map" of projects with overdue beacons), then
 * a grid of project "asset" cards with labelled mini bars and a right «Детали» column that carries
 * today's plan as inspectable records. Rhythm, meetings, money, note and reading close the page.
 */
import { useMemo, useState, type ReactNode } from "react";

import { useDashboardModel, rub, type DashboardModel, type ProjectRow } from "@/design-lab/screens/dashboardModel";
import {
  T,
  mono,
  sans,
  pad2,
  MonoLabel,
  CellGrid,
  Cell,
  CellHead,
  Hatch,
  StatusSquare,
  Glyph,
  NAV_GLYPH,
  useNow,
  stamp,
  TermCheck,
  PriorityBars,
  Dial,
  SegGauge,
  LineChart,
  YearMatrix,
  AddLine,
  NoteBox,
  TermButton,
  Empty,
  healthSignal,
  hm,
} from "@/design-lab/screens/_kit/terminal";

type Health = "all" | "off-track" | "at-risk" | "on-track";
type Period = "day" | "week" | "d14";

function Seg<V extends string>({ value, options, onChange }: { value: V; options: { v: V; label: ReactNode }[]; onChange: (v: V) => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-0.5 p-0.5" style={{ boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3 }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className="flex h-7 items-center gap-1.5 px-3 outline-none transition-colors hover:text-white focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
            style={{ ...mono(10, {}, true), lineHeight: 1, borderRadius: 2, background: on ? T.limeTint : "transparent", color: on ? T.lime : T.ink3 }}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

function Bar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate" style={mono(9, { color: T.ink3 }, true)}>{label}</span>
        <span style={mono(10, { color: T.ink2 })}>{value}</span>
      </div>
      <span className="relative h-[3px] w-full" style={{ background: T.ink5 }}>
        <span className="absolute inset-y-0 left-0" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </span>
    </div>
  );
}

export default function TerminalV3() {
  const m = useDashboardModel();
  const now = useNow();
  const st = stamp(now);
  const [health, setHealth] = useState<Health>("all");
  const [period, setPeriod] = useState<Period>("day");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: m.projects.length, "off-track": 0, "at-risk": 0, "on-track": 0 };
    m.projects.forEach((p) => {
      if (p.health in c) c[p.health] += 1;
    });
    return c;
  }, [m.projects]);

  const projects = m.projects.filter((p) => (health === "all" || p.health === health) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const maxSpent = Math.max(1, ...m.projects.map((p) => p.spentMin));

  const goal =
    period === "day"
      ? { v: m.kpi.closedToday, max: m.kpi.dailyGoal, label: "сегодня" }
      : period === "week"
        ? { v: m.kpi.weekDone, max: m.kpi.dailyGoal * 7, label: "неделя" }
        : { v: m.closed14, max: m.kpi.dailyGoal * 14, label: "14 дней" };

  const openSegs = 28;
  const overdueShare = m.kpi.openCount ? m.status.overdueAll / m.kpi.openCount : 0;
  const segs = Array.from({ length: openSegs }, (_, i) => (i < Math.round(overdueShare * openSegs) ? T.orange : i < openSegs ? (i % 2 ? "#5a5a5a" : "#6e6e6e") : T.ink5));

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <div className="mx-auto max-w-[1600px] px-6 pb-10">
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="flex h-16 items-center justify-between gap-6">
          <span className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center" style={{ boxShadow: `inset 0 0 0 1px ${T.line3}` }}>
              <Glyph name="target" size={14} color={T.lime} />
            </span>
            <span style={sans(18, 500)}>Рабочий стол</span>
            <MonoLabel color={T.ink4}>/ мониторинг</MonoLabel>
          </span>
          <span className="flex items-center gap-3">
            <label className="flex h-9 w-[260px] items-center gap-2 px-3" style={{ boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3 }}>
              <Glyph name="search" size={13} color={T.ink3} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Найти проект"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#4a4a4a]"
                style={sans(13, 400, { color: T.ink })}
              />
            </label>
            {m.kpi.gamification && (
              <span className="flex h-9 items-center gap-3 px-3" style={{ boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3 }}>
                <span className="grid h-5 w-5 place-items-center" style={{ background: T.lime, color: "#000", ...mono(10, { fontWeight: 600 }) }}>
                  {m.kpi.level}
                </span>
                <span className="flex flex-col">
                  <span style={sans(12, 500)}>{m.kpi.levelTitle}</span>
                  <span style={mono(9, { color: T.ink3 })}>{m.kpi.xpToNext} xp до {m.kpi.level + 1}</span>
                </span>
              </span>
            )}
            <span className="flex h-9 items-center gap-2 px-3" style={{ boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3, ...mono(11, { color: T.ink }) }}>
              <StatusSquare blink size={5} />
              {st.time}
            </span>
          </span>
        </header>

        {/* ── Section nav ─────────────────────────────────────────────────────── */}
        <nav className="flex items-center gap-1.5 pb-4">
          {m.nav.map((n) => {
            const active = n.id === "dashboard";
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex h-9 items-center gap-2 px-3.5 outline-none transition-colors hover:text-white hover:[box-shadow:inset_0_0_0_1px_#3a3a3a] focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
                style={{
                  ...sans(13, active ? 500 : 400),
                  color: active ? T.ink : T.ink2,
                  background: active ? T.raised : "transparent",
                  boxShadow: `inset 0 0 0 1px ${active ? T.line3 : T.line}`,
                  borderRadius: 3,
                }}
              >
                <Glyph name={NAV_GLYPH[n.id] ?? "dots"} size={13} color={active ? T.lime : T.ink3} />
                {n.label}
                {n.badge ? <span style={mono(10, { color: T.lime })}>{n.badge}</span> : null}
                {active && <StatusSquare size={5} />}
              </a>
            );
          })}
        </nav>

        {/* ── Filter strip ────────────────────────────────────────────────────── */}
        <div className="flex h-14 items-center justify-between gap-4 px-3" style={{ boxShadow: `inset 0 0 0 1px ${T.line}`, background: T.panel }}>
          <span className="flex min-w-0 items-baseline gap-3 pl-1">
            <span className="whitespace-nowrap" style={sans(16, 500)}>{m.greeting}</span>
            <span className="truncate" style={mono(11, { color: T.ink3 }, true)}>{st.date}</span>
          </span>
          <span className="flex items-center gap-3">
            <Seg
              value={health}
              onChange={setHealth}
              options={[
                { v: "all", label: <>все <span style={{ color: T.ink3 }}>{counts.all}</span></> },
                { v: "off-track", label: <>сорвано <span style={{ color: T.ink3 }}>{counts["off-track"]}</span></> },
                { v: "at-risk", label: <>риск <span style={{ color: T.ink3 }}>{counts["at-risk"]}</span></> },
                { v: "on-track", label: <>в графике <span style={{ color: T.ink3 }}>{counts["on-track"]}</span></> },
              ]}
            />
            <span className="h-5 w-px" style={{ background: T.line2 }} />
            <Seg
              value={period}
              onChange={setPeriod}
              options={[
                { v: "day", label: "день" },
                { v: "week", label: "неделя" },
                { v: "d14", label: "14 дней" },
              ]}
            />
          </span>
        </div>

        {/* ── Instruments ─────────────────────────────────────────────────────── */}
        <CellGrid className="mt-3 grid-cols-[1fr_1.15fr_1fr_1.15fr]">
          <Cell className="flex h-[188px] items-center gap-5 px-5">
            <Dial value={goal.v} max={Math.max(1, goal.max)} size={136} ticks={40}>
              <span style={mono(24, { letterSpacing: "-0.04em" })}>
                {goal.v}
                <span style={{ color: T.ink4 }}>/{goal.max}</span>
              </span>
              <MonoLabel className="mt-1">{goal.label}</MonoLabel>
            </Dial>
            <div className="flex min-w-0 flex-col gap-3">
              <MonoLabel color={T.ink}>Цель</MonoLabel>
              <span style={sans(12, 400, { color: T.ink3, lineHeight: 1.45 })}>
                {m.kpi.dailyGoal} закрытых в день. Серия {m.kpi.streak} дн, лучшая {m.kpi.bestStreak}.
              </span>
            </div>
          </Cell>
          <Cell className="flex h-[188px] flex-col justify-between overflow-hidden px-5 py-4">
            <div className="flex items-center justify-between">
              <MonoLabel color={T.ink}>Полгода · по дням</MonoLabel>
              <span style={mono(11, { color: T.ink2 })}>{m.year.reduce((s, d) => s + d.value, 0)} закрыто</span>
            </div>
            <YearMatrix year={m.year} cell={8} gap={3} />
            <div className="flex justify-between" style={mono(9, { color: T.ink4 }, true)}>
              <span>{m.year[0]?.date.slice(5).split("-").reverse().join(".")}</span>
              <span>сегодня</span>
            </div>
          </Cell>
          <Cell className="flex h-[188px] flex-col items-center justify-center gap-2 px-5">
            <SegGauge segments={segs} size={176} barLen={22} barW={5}>
              <MonoLabel>Открыто задач</MonoLabel>
              <span className="mt-1" style={mono(28, { letterSpacing: "-0.04em", lineHeight: 1 })}>{m.kpi.openCount}</span>
            </SegGauge>
            <span className="flex items-center gap-4" style={mono(10, { color: T.ink3 }, true)}>
              <span className="flex items-center gap-1.5"><StatusSquare color={T.orange} size={5} /> {m.status.overdueAll} просрочено</span>
              <span className="flex items-center gap-1.5"><StatusSquare color="#6e6e6e" size={5} /> {m.status.inProgress} в работе</span>
            </span>
          </Cell>
          <Cell className="flex h-[188px] flex-col px-5 py-4">
            <div className="flex items-center justify-between">
              <MonoLabel color={T.ink}>Карта проектов</MonoLabel>
              <span className="flex items-center gap-1.5" style={mono(10, { color: T.ink3 }, true)}>
                <StatusSquare color={T.orange} size={5} /> просрочка
              </span>
            </div>
            <ProjectMap projects={m.projects} />
          </Cell>
        </CellGrid>

        {/* ── Assets + details ────────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_340px] gap-3 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="mb-3 flex h-9 items-center justify-between">
              <h2 style={sans(20, 500)}>
                Проекты <span style={{ color: T.ink4 }}>({projects.length})</span>
              </h2>
              <MonoLabel>по здоровью ↓</MonoLabel>
            </div>
            <CellGrid className="grid-cols-3">
              {projects.length === 0 && <Empty title="Нет проектов под фильтр" icon="projects" className="col-span-3 h-[160px]" />}
              {projects.map((p) => (
                <AssetCard key={p.id} p={p} index={m.projects.indexOf(p)} maxSpent={maxSpent} />
              ))}
              {projects.length % 3 !== 0 && Array.from({ length: 3 - (projects.length % 3) }, (_, i) => <Hatch key={i} />)}
            </CellGrid>

            <CellGrid className="mt-3 grid-cols-3">
              <Cell className="col-span-2">
                <CellHead
                  label="Ритм · закрыто за 14 дней"
                  icon={<Glyph name="pulse" size={12} />}
                  right={
                    <span style={mono(10, { color: T.ink2 }, true)}>
                      {m.closed14} всего · пик {m.peak14}
                    </span>
                  }
                />
                <div className="px-4 pb-2 pt-3">
                  <LineChart data={m.dynamics} height={312} initialIndex={m.dynamics.length - 1} />
                </div>
              </Cell>
              <Cell className="flex flex-col">
                <CellHead label="Статус задач" icon={<Glyph name="analytics" size={12} />} />
                <div className="flex flex-col gap-4 px-4 py-4">
                  <div className="grid grid-cols-3" style={{ gap: 1, background: T.line }}>
                    {[
                      { k: "готово", v: m.status.doneAll, c: T.ink },
                      { k: "в работе", v: m.status.inProgress, c: T.ink },
                      { k: "просроч", v: m.status.overdueAll, c: m.status.overdueAll ? T.orange : T.ink },
                    ].map((s) => (
                      <div key={s.k} className="flex flex-col gap-1.5 py-1 pr-2" style={{ background: T.cell, paddingLeft: s.k === "готово" ? 0 : 10 }}>
                        <MonoLabel size={9}>{s.k}</MonoLabel>
                        <span style={mono(18, { color: s.c, letterSpacing: "-0.03em" })}>{s.v}</span>
                      </div>
                    ))}
                  </div>
                  {m.status.openByPriority.map((p) => (
                    <Bar
                      key={p.priority}
                      label={p.label}
                      value={String(p.count)}
                      pct={m.kpi.openCount ? (p.count / m.kpi.openCount) * 100 : 0}
                      color={p.priority === 1 ? T.ink : "#6e6e6e"}
                    />
                  ))}
                </div>
                <Hatch className="min-h-4 flex-1" style={{ borderTop: `1px solid ${T.line}` }} />
              </Cell>
            </CellGrid>
          </div>

          <Details m={m} />
        </div>

        {/* ── Lower band ──────────────────────────────────────────────────────── */}
        <CellGrid className="mt-3 grid-cols-4">
          <Cell className="flex flex-col">
            <CellHead label={`Встречи · ${m.meetings.filter((x) => !x.done).length}`} icon={<Glyph name="meeting" size={12} />} />
            {m.meetings.length === 0 ? (
              <Empty title="Встреч нет" hint="Календарь свободен" className="min-h-[150px] flex-1" />
            ) : (
              m.meetings.slice(0, 4).map((x) => (
                <div key={x.id} className="flex h-11 items-center gap-3 px-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <TermCheck done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} size={12} />
                  <span style={mono(12, { color: T.ink })}>{x.time}</span>
                  <span className="min-w-0 flex-1 truncate" style={sans(13, 400, { color: x.done ? T.ink4 : T.ink })}>{x.title}</span>
                  <span style={mono(10, { color: T.ink3 })}>{x.dateLabel}</span>
                </div>
              ))
            )}
          </Cell>
          <Cell className="flex flex-col">
            <CellHead label="Деньги · месяц" icon={<Glyph name="money" size={12} />} right={m.money.overdue > 0 ? <StatusSquare color={T.orange} blink size={5} /> : null} />
            <div className="flex flex-col gap-3 px-4 py-4">
              <span style={mono(24, { letterSpacing: "-0.04em", lineHeight: 1 })}>{rub(m.money.paidThisMonth)}</span>
              <dl className="flex flex-col gap-1.5" style={mono(11)}>
                {[
                  { k: "Ожидается", v: rub(m.money.pending), c: T.ink },
                  { k: "Просрочено", v: rub(m.money.overdue), c: m.money.overdue ? T.orange : T.ink },
                  { k: "Всего", v: rub(m.money.paidTotal), c: T.ink2 },
                ].map((r) => (
                  <div key={r.k} className="flex justify-between">
                    <dt style={{ color: T.ink3 }}>{r.k}</dt>
                    <dd style={{ color: r.c }}>{r.v}</dd>
                  </div>
                ))}
              </dl>
              <span style={mono(10, { color: m.followUps.length ? T.orange : T.ink4 }, true)}>
                {m.followUps.length ? `напомнить: ${m.followUps.map((f) => f.name).join(", ")}` : "напоминаний нет"}
              </span>
            </div>
          </Cell>
          <Cell className="flex flex-col">
            <CellHead label="Быстрая заметка" icon={<Glyph name="notes" size={12} />} />
            <div className="flex-1">
              <NoteBox onSave={m.actions.saveNote} rows={4} />
            </div>
          </Cell>
          <Cell className="flex flex-col">
            <CellHead label="Чтение дня" icon={<Glyph name="book" size={12} />} />
            {m.reading ? (
              <a href={m.reading.url ?? "#"} target="_blank" rel="noreferrer" className="group flex flex-1 gap-3 px-4 py-4">
                <span className="h-[72px] w-[72px] shrink-0 overflow-hidden" style={{ background: T.raised }}>
                  {m.reading.coverUrl && <img src={m.reading.coverUrl} alt="" className="h-full w-full object-cover" style={{ filter: "grayscale(1)" }} />}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-3 group-hover:underline" style={sans(13, 500)}>{m.reading.title}</span>
                  <span className="mt-1.5 block" style={mono(10, { color: T.ink3 }, true)}>{m.reading.domain ?? m.reading.type}</span>
                </span>
              </a>
            ) : (
              <Empty title="Очередь пуста" icon="book" className="flex-1" />
            )}
          </Cell>
        </CellGrid>
      </div>
    </div>
  );
}

function AssetCard({ p, index, maxSpent }: { p: ProjectRow; index: number; maxSpent: number }) {
  const hs = healthSignal(p.health);
  const status = p.health === "off-track" ? "Сорвано" : p.healthLabel;
  return (
    <Cell className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-[#0E0E0E]">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate" style={sans(15, 500)}>{p.name}</span>
          <span className="mt-0.5 block truncate" style={mono(10, { color: T.ink4 }, true)}>
            PRJ-{pad2(index + 1)} · {p.clientName ?? "без клиента"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5" style={mono(10, { color: hs.color === T.ink4 ? T.ink3 : hs.color }, true)}>
          <StatusSquare color={hs.color} hollow={hs.hollow} size={6} />
          {status}
        </span>
      </div>
      <div className="flex items-baseline gap-5 pb-3" style={{ borderBottom: `1px dashed ${T.line2}` }}>
        <span className="flex items-baseline gap-1.5">
          <Glyph name="tasks" size={12} color={T.lime} />
          <span style={mono(20, { letterSpacing: "-0.03em" })}>
            {p.done}
            <span style={{ color: T.ink4 }}>/{p.total}</span>
          </span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <Glyph name="clock" size={12} color={T.ink3} />
          <span style={mono(20, { letterSpacing: "-0.03em" })}>{p.spentLabel}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3">
        <Bar label="Готовность" value={`${Math.round(p.pct)}%`} pct={p.pct} color={p.health === "on-track" || p.health === "done" ? T.lime : T.ink} />
        <Bar label="Просрочки" value={String(p.overdue)} pct={p.total ? (p.overdue / Math.max(1, p.total - p.done)) * 100 : 0} color={T.orange} />
        <Bar label="Доля времени" value={hm(p.spentMin)} pct={(p.spentMin / maxSpent) * 100} color="#8a8a8a" />
        <Bar label="Осталось" value={String(p.total - p.done)} pct={p.total ? ((p.total - p.done) / p.total) * 100 : 0} color="#5a5a5a" />
      </div>
    </Cell>
  );
}

/** Map-like grid: one striped "plot" per project, fill = progress, orange beacons = overdue. */
function ProjectMap({ projects }: { projects: ProjectRow[] }) {
  const list = projects.slice(0, 8);
  if (!list.length) return <Empty title="Нет проектов" icon="projects" className="mt-3 flex-1" />;
  return (
    <div className="mt-3 flex flex-1 gap-2">
      {list.map((p, i) => (
        <div key={p.id} className="flex min-w-0 flex-1 flex-col gap-1.5" title={`${p.name}: ${Math.round(p.pct)}%, просрочено ${p.overdue}`}>
          <div
            className="relative flex-1 overflow-hidden"
            style={{
              boxShadow: `inset 0 0 0 1px ${T.line2}`,
              backgroundImage: `repeating-linear-gradient(90deg, ${T.ink5} 0 1px, transparent 1px 4px), repeating-linear-gradient(0deg, ${T.ink5} 0 1px, transparent 1px 10px)`,
            }}
          >
            <span
              className="absolute inset-x-0 bottom-0"
              style={{ height: `${p.pct}%`, backgroundImage: `repeating-linear-gradient(90deg, #4a4a4a 0 1px, transparent 1px 4px)` }}
            />
            {Array.from({ length: Math.min(4, p.overdue) }, (_, k) => {
              const seed = (i * 37 + k * 53) % 100;
              return (
                <span
                  key={k}
                  className="absolute h-[5px] w-[5px]"
                  style={{ left: `${15 + ((seed * 7) % 60)}%`, top: `${12 + ((seed * 13) % 70)}%`, background: T.orange, boxShadow: `0 0 6px ${T.orange}` }}
                />
              );
            })}
          </div>
          <span className="truncate text-center" style={mono(9, { color: p.overdue ? T.ink2 : T.ink4 })}>{pad2(i + 1)}</span>
        </div>
      ))}
    </div>
  );
}

function Details({ m }: { m: DashboardModel }) {
  return (
    <aside className="min-w-0">
      <div className="mb-3 flex h-9 items-center justify-between">
        <h2 style={sans(20, 500)}>
          Детали <span style={{ color: T.ink4 }}>· план дня</span>
        </h2>
        <span style={mono(12, { color: T.ink })}>
          {m.plan.filter((r) => r.done).length}/{m.plan.length}
        </span>
      </div>
      <div style={{ boxShadow: `inset 0 0 0 1px ${T.line}`, background: T.cell }}>
        <AddLine onAdd={m.actions.add} placeholder="Добавить в план…" className="h-11 px-3" style={{ borderBottom: `1px solid ${T.line}` }} />
        <div className="flex flex-col gap-2 p-2">
          {m.plan.length === 0 && <Empty title="План пуст" icon="tasks" className="h-[120px]" />}
          {m.plan.map((r) => {
            const status = r.done ? { t: "Готово", c: T.lime } : r.overdue ? { t: "Просрочено", c: T.orange } : { t: "В плане", c: T.ink2 };
            return (
              <div key={r.id} className="px-3 py-2.5 transition-colors hover:bg-[#121212]" style={{ boxShadow: `inset 0 0 0 1px ${T.line}`, background: T.panel }}>
                <div className="flex items-center gap-2.5">
                  <TermCheck done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={13} />
                  <span className="min-w-0 flex-1 truncate" style={sans(13, 500, { color: r.done ? T.ink4 : T.ink, textDecoration: r.done ? "line-through" : undefined })}>
                    {r.title}
                  </span>
                  <span style={mono(10, { color: status.c })}>{status.t}</span>
                </div>
                <dl className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-y-1 pl-[23px]" style={mono(10)}>
                  <dt style={{ color: T.ink4 }}>Проект</dt>
                  <dd className="truncate text-right" style={{ color: T.ink2 }}>{r.projectName ?? "—"}</dd>
                  <dt style={{ color: T.ink4 }}>Приоритет</dt>
                  <dd className="flex items-center justify-end gap-1.5" style={{ color: T.ink2 }}>
                    <PriorityBars priority={r.priority} /> {r.priorityLabel}
                  </dd>
                  <dt style={{ color: T.ink4 }}>Срок · время</dt>
                  <dd className="text-right" style={{ color: r.overdue ? T.orange : T.ink2 }}>
                    {r.dueLabel} · {hm(r.spentMin)}
                    {r.subtasksTotal ? ` · ${r.subtasksDone}/${r.subtasksTotal}` : ""}
                  </dd>
                </dl>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 px-3 pb-3 pt-1" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="flex h-10 items-center justify-between">
            <span className="flex items-center gap-2">
              <MonoLabel color={T.ink}>Сверх плана</MonoLabel>
              <span style={mono(10, { color: m.overPlan.length ? T.orange : T.ink3 })}>{m.overPlan.length}</span>
            </span>
            {m.overPlan.length > 0 && (
              <TermButton icon="forward" onClick={m.actions.moveOverPlanToTomorrow}>
                на завтра
              </TermButton>
            )}
          </div>
          {m.overPlan.slice(0, 5).map((r) => (
            <div key={r.id} className="flex h-6 items-center gap-2.5">
              <TermCheck done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={11} />
              <span className="min-w-0 flex-1 truncate" style={sans(12, 400, { color: T.ink2 })}>{r.title}</span>
              <span style={mono(10, { color: r.overdue ? "#b0532e" : T.ink4 })}>{r.dueLabel}</span>
            </div>
          ))}
          {m.overPlan.length > 5 && <MonoLabel color={T.ink4}>+ ещё {m.overPlan.length - 5}</MonoLabel>}
          {m.overPlan.length === 0 && <MonoLabel color={T.ink4}>всё в пределах лимита</MonoLabel>}
        </div>
      </div>
    </aside>
  );
}
