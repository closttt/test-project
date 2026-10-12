/**
 * Dashboard · Data Terminal · v4 «Пульт»
 * JCA drone-console composition: an icon-only rail; the main screen is a large "viewport" whose
 * feed is the 14-day rhythm, with HUD overlays (thirds grid, horizon tilted by the trend, a
 * bracket locked on the peak, status chips, level slider, a recording-style timer of today's
 * time). Beside it — instrument panels (today's readings, the daily-goal compass dial). Under it —
 * a control strip: mode switch (план / сверх / встречи) with compact rows, a 3-column metric
 * block with vertical hairlines, and a D-pad of quick actions.
 */
import { useRef, useState, type ReactNode } from "react";

import { useDashboardModel, rub, type DashboardModel } from "@/design-lab/screens/dashboardModel";
import {
  T,
  mono,
  sans,
  pad2,
  MonoLabel,
  Hatch,
  StatusSquare,
  Glyph,
  NAV_GLYPH,
  useNow,
  useWidth,
  stamp,
  TermCheck,
  PriorityBars,
  Dial,
  MiniBars,
  AddLine,
  NoteBox,
  Empty,
  healthSignal,
  hm,
} from "@/design-lab/screens/_kit/terminal";

const PANEL = { background: "#0D0D0D", boxShadow: `inset 0 0 0 1px ${T.line}`, borderRadius: 4 } as const;

type Mode = "plan" | "over" | "meet";

export default function TerminalV4() {
  const m = useDashboardModel();
  const now = useNow();
  const st = stamp(now);
  const [mode, setMode] = useState<Mode>("plan");
  const noteRef = useRef<HTMLDivElement>(null);

  const focusAdd = () => {
    setMode("plan");
    setTimeout(() => document.getElementById("t4-add")?.focus(), 30);
  };
  const closeFirst = () => {
    const r = m.plan.find((x) => !x.done);
    if (r) m.actions.toggle(r.id);
  };

  return (
    <div className="min-h-screen p-4" style={{ background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <div className="flex min-h-[calc(100vh-32px)] overflow-hidden" style={{ background: "#050505", boxShadow: `inset 0 0 0 1px ${T.line}`, borderRadius: 6 }}>
        {/* ── Icon rail ───────────────────────────────────────────────────────── */}
        <aside className="flex w-16 shrink-0 flex-col items-center justify-between py-5" style={{ borderRight: `1px solid ${T.line}` }}>
          <div className="flex flex-col items-center gap-6">
            <span className="grid h-8 w-8 place-items-center" style={{ background: T.ink, color: "#000", ...mono(11, { fontWeight: 600 }), borderRadius: 2 }}>
              РС
            </span>
            <nav className="flex flex-col items-center gap-1.5">
              {m.nav.map((n) => {
                const active = n.id === "dashboard";
                return (
                  <a
                    key={n.id}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    title={n.label}
                    aria-label={n.label}
                    className="group relative grid h-10 w-10 place-items-center outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
                    style={{ background: active ? "#1A1A1A" : "transparent", borderRadius: 3, color: active ? T.ink : T.ink3 }}
                  >
                    <span className="transition-colors group-hover:text-white">
                      <Glyph name={NAV_GLYPH[n.id] ?? "dots"} size={16} />
                    </span>
                    {active && <span className="absolute left-[-12px] top-2.5 h-5 w-0.5" style={{ background: T.lime }} />}
                    {n.badge ? (
                      <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center px-0.5" style={{ background: T.lime, color: "#000", ...mono(9, { fontWeight: 600, lineHeight: 1 }), borderRadius: 2 }}>
                        {n.badge}
                      </span>
                    ) : null}
                    <span
                      className="pointer-events-none absolute left-12 z-30 hidden whitespace-nowrap px-2 py-1 group-hover:block"
                      style={{ background: "#1A1A1A", boxShadow: `inset 0 0 0 1px ${T.line2}`, ...mono(10, { color: T.ink }, true), borderRadius: 2 }}
                    >
                      {n.label}
                    </span>
                  </a>
                );
              })}
            </nav>
          </div>
          {m.kpi.gamification && (
            <div className="flex flex-col items-center gap-2" title={`Уровень ${m.kpi.level} · ${m.kpi.levelTitle}`}>
              <Dial value={m.kpi.levelPct} max={100} size={40} bezel={false} thickness={2}>
                <span style={mono(11, { fontWeight: 600 })}>{m.kpi.level}</span>
              </Dial>
              <MonoLabel size={8}>ур</MonoLabel>
            </div>
          )}
        </aside>

        {/* ── Console ─────────────────────────────────────────────────────────── */}
        <main className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_320px] content-start gap-3 p-3 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <Viewport m={m} time={st.time} />
          <div className="flex h-[520px] flex-col gap-3">
            <Readings m={m} />
            <GoalCompass m={m} />
          </div>

          <ControlStrip m={m} mode={mode} setMode={setMode} focusAdd={focusAdd} closeFirst={closeFirst} focusNote={() => noteRef.current?.querySelector("textarea")?.focus()} />
          <ProjectsPanel m={m} />

          <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
            <div ref={noteRef} className="flex h-[176px] flex-col overflow-hidden" style={PANEL}>
              <PanelHead icon="notes" label="Быстрая заметка" />
              <div className="flex-1">
                <NoteBox onSave={m.actions.saveNote} rows={3} />
              </div>
            </div>
            <div className="flex h-[176px] flex-col overflow-hidden" style={PANEL}>
              <PanelHead icon="book" label="Чтение дня" />
              {m.reading ? (
                <a href={m.reading.url ?? "#"} target="_blank" rel="noreferrer" className="group flex flex-1 items-center gap-4 px-4">
                  <span className="h-[88px] w-[88px] shrink-0 overflow-hidden" style={{ background: T.raised, borderRadius: 2 }}>
                    {m.reading.coverUrl && <img src={m.reading.coverUrl} alt="" className="h-full w-full object-cover" style={{ filter: "grayscale(1) contrast(1.2)" }} />}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-3 group-hover:underline" style={sans(15, 500)}>{m.reading.title}</span>
                    <span className="mt-2 block" style={mono(10, { color: T.ink3 }, true)}>{m.reading.domain ?? m.reading.type}</span>
                  </span>
                </a>
              ) : (
                <Empty title="Очередь пуста" icon="book" className="flex-1" />
              )}
            </div>
            <div className="flex h-[176px] flex-col overflow-hidden" style={PANEL}>
              <PanelHead icon="money" label="Деньги · месяц" right={m.money.overdue > 0 ? <StatusSquare color={T.orange} size={5} blink /> : null} />
              <div className="grid flex-1 grid-cols-3 px-4 py-3">
                {[
                  { k: "Оплачено", v: m.money.paidThisMonth, c: T.ink },
                  { k: "Ждём", v: m.money.pending, c: T.ink },
                  { k: "Долг", v: m.money.overdue, c: m.money.overdue ? T.orange : T.ink },
                ].map((r, i) => (
                  <div key={r.k} className="flex flex-col justify-center gap-1.5" style={{ borderLeft: i ? `1px solid ${T.line2}` : undefined, paddingLeft: i ? 12 : 0 }}>
                    <MonoLabel size={9}>{r.k}</MonoLabel>
                    <span className="truncate" style={mono(14, { color: r.c, fontWeight: 500 })}>{rub(r.v)}</span>
                  </div>
                ))}
              </div>
              <div className="flex h-8 items-center px-4" style={{ borderTop: `1px solid ${T.line}`, ...mono(10, { color: m.followUps.length ? T.orange : T.ink4 }, true) }}>
                <span className="truncate">{m.followUps.length ? `напомнить · ${m.followUps.map((f) => f.name).join(", ")}` : "напоминаний нет"}</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PanelHead({ icon, label, right }: { icon: string; label: string; right?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between px-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      <span className="flex items-center gap-2" style={{ color: T.ink3 }}>
        <Glyph name={icon} size={12} />
        <MonoLabel>{label}</MonoLabel>
      </span>
      {right}
    </div>
  );
}

// ── Viewport ────────────────────────────────────────────────────────────────────────────────
function HudBox({ children, className, style, title }: { children: ReactNode; className?: string; style?: React.CSSProperties; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center ${className ?? ""}`} style={{ background: "rgba(0,0,0,.55)", boxShadow: `inset 0 0 0 1px ${T.line3}`, borderRadius: 3, ...style }}>
      {children}
    </span>
  );
}

function Viewport({ m, time }: { m: DashboardModel; time: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 520;
  const data = m.dynamics;
  const n = data.length;
  const left = 150;
  const right = 24;
  const top = 92;
  const bottom = 44;
  const pw = Math.max(10, w - left - right);
  const ph = H - top - bottom;
  const max = Math.max(4, ...data.map((d) => d.value));
  const x = (i: number) => left + (i / (n - 1)) * pw;
  const y = (v: number) => top + ph - (v / max) * ph;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const peak = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0);
  const last7 = data.slice(-7).reduce((s, d) => s + d.value, 0);
  const prev7 = data.slice(0, 7).reduce((s, d) => s + d.value, 0);
  const trend = prev7 ? (last7 - prev7) / prev7 : last7 ? 1 : 0;
  const tilt = Math.max(-14, Math.min(14, trend * 14));
  const cx = left + pw / 2;
  const cy = top + ph / 2;
  const recording = m.kpi.minutesToday > 0;

  return (
    <section ref={ref} className="relative h-[520px] overflow-hidden" style={{ ...PANEL, background: "#080808" }}>
      {w > 0 && (
        <svg width={w} height={H} className="absolute inset-0" aria-label={`Ритм 14 дней: ${m.closed14} закрыто`}>
          <defs>
            <linearGradient id="t4feed" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity={0.16} />
              <stop offset="1" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* thirds grid */}
          {[1, 2].map((k) => (
            <g key={k} stroke="#fff" strokeOpacity={0.06}>
              <line x1={(w * k) / 3} x2={(w * k) / 3} y1={0} y2={H} />
              <line x1={0} x2={w} y1={(H * k) / 3} y2={(H * k) / 3} />
            </g>
          ))}
          {/* day columns */}
          {data.map((d, i) => (
            <line key={d.date} x1={x(i)} x2={x(i)} y1={top + ph} y2={top + ph + 6} stroke={T.ink4} />
          ))}
          <path d={`${path} L${x(n - 1)} ${top + ph} L${x(0)} ${top + ph} Z`} fill="url(#t4feed)" />
          <path d={path} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.5} strokeLinejoin="round" />
          <line x1={left} x2={left + pw} y1={top + ph + 0.5} y2={top + ph + 0.5} stroke={T.line3} />
          {data.map((d, i) =>
            i % 2 === 0 && i < n - 2 ? (
              <text key={d.date} x={x(i)} y={H - 18} textAnchor="middle" fill={T.ink4} style={{ font: `400 9px ${T.mono}` }}>
                {d.label}
              </text>
            ) : null
          )}
          <text x={x(n - 1)} y={H - 18} textAnchor="end" fill={T.lime} style={{ font: `500 9px ${T.mono}`, letterSpacing: "0.08em" }}>
            СЕГОДНЯ
          </text>
          {/* today marker */}
          <rect x={x(n - 1) - 3} y={y(data[n - 1].value) - 3} width={6} height={6} fill={T.lime} />
          {/* lock bracket on the peak */}
          {(() => {
            const px = x(peak);
            const py = y(data[peak].value);
            const s = 26;
            const c = 7;
            const b = (dx: number, dy: number) => `M${px + dx * s} ${py + dy * s - dy * c} L${px + dx * s} ${py + dy * s} L${px + dx * s - dx * c} ${py + dy * s}`;
            return (
              <g stroke={T.lime} strokeWidth={1} fill="none">
                <path d={b(-1, -1)} />
                <path d={b(1, -1)} />
                <path d={b(-1, 1)} />
                <path d={b(1, 1)} />
                <line x1={px} x2={px} y1={py - s - 8} y2={py - s + 2} />
                <text x={px + s + 6} y={py - s + 8} fill={T.lime} stroke="none" style={{ font: `500 10px ${T.mono}`, letterSpacing: "0.08em" }}>
                  ПИК {data[peak].value} · {data[peak].label}
                </text>
              </g>
            );
          })()}
          {/* horizon (tilted by 7-day trend) + reticle */}
          <g transform={`rotate(${-tilt} ${cx} ${cy})`} stroke="#fff" strokeWidth={1.5}>
            <line x1={cx - 90} x2={cx - 12} y1={cy} y2={cy} />
            <line x1={cx + 12} x2={cx + 90} y1={cy} y2={cy} />
            <rect x={cx - 6} y={cy - 6} width={12} height={12} fill="none" />
          </g>
          <text x={cx + 98} y={cy + 4} fill={T.ink2} style={{ font: `400 10px ${T.mono}`, letterSpacing: "0.06em" }}>
            ТРЕНД 7Д {trend >= 0 ? "+" : ""}
            {Math.round(trend * 100)}%
          </text>
        </svg>
      )}

      {/* left HUD column */}
      <div className="absolute inset-y-0 left-0 flex w-[132px] flex-col justify-between p-4" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.75), rgba(0,0,0,.35))", borderRight: `1px solid ${T.line}` }}>
        <div className="flex flex-col gap-4">
          <HudBox className="h-7 justify-center px-2.5 self-start">
            <span style={mono(10, { color: T.ink }, true)}>Ритм</span>
          </HudBox>
          <span style={mono(11, { color: T.ink2 })}>
            <span style={{ color: T.lime }}>14Д</span> · {m.closed14} закр
          </span>
          <div className="flex flex-col gap-2">
            <MonoLabel size={9}>Уровень</MonoLabel>
            <span className="relative h-px w-full" style={{ background: T.line3 }}>
              <span className="absolute -top-px left-0 h-[3px]" style={{ width: `${m.kpi.levelPct}%`, background: T.ink }} />
              <span className="absolute -top-[5px] h-[11px] w-[3px]" style={{ left: `calc(${m.kpi.levelPct}% - 1px)`, background: T.ink }} />
            </span>
            <HudBox className="h-5 self-start px-1.5">
              <span style={mono(10, { color: T.ink })}>{pad2(m.kpi.level)}</span>
            </HudBox>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { k: "Выполнено", v: m.status.doneAll, c: T.lime },
              { k: "В работе", v: m.status.inProgress, c: T.ink },
              { k: "Просрочено", v: m.status.overdueAll, c: T.orange },
              { k: "Высокий приоритет", v: m.status.openByPriority[0]?.count ?? 0, c: T.ink2 },
            ].map((s) => (
              <HudBox key={s.k} className="h-6 gap-1 px-1.5" title={s.k}>
                <StatusSquare color={s.c} size={4} />
                <span style={mono(9, { color: T.ink2 })}>{s.v}</span>
              </HudBox>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 p-2" style={{ boxShadow: `inset 0 0 0 1px ${T.line3}`, borderRadius: 3 }}>
          <span className="flex items-center justify-between">
            <span style={mono(10, { color: T.ink })}>НЕД {m.kpi.weekDone}</span>
            <span style={mono(9, { color: T.ink3 })}>пн–вс</span>
          </span>
          <MiniBars values={m.week.map((d) => d.done)} height={36} color="#ffffff" last={null} gap={2} />
        </div>
      </div>

      {/* top-right: timer */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <HudBox className="h-8 gap-2 px-3">
          <StatusSquare color={T.ink3} size={5} />
          <span style={mono(11, { color: T.ink2 })}>{time}</span>
        </HudBox>
        <HudBox className="h-8 gap-2 px-3" style={{ background: "rgba(0,0,0,.8)" }}>
          <StatusSquare color={recording ? T.orange : T.ink4} size={7} blink={recording} />
          <span style={mono(13, { color: T.ink, fontWeight: 500 })}>{hm(m.kpi.minutesToday)}</span>
          <MonoLabel size={9}>сегодня</MonoLabel>
        </HudBox>
      </div>
      <div className="absolute left-[150px] top-4">
        <HudBox className="h-8 gap-2.5 px-3">
          <MonoLabel color={T.ink2}>закрыто сегодня</MonoLabel>
          <span style={mono(13, { color: m.kpi.closedToday ? T.lime : T.ink, fontWeight: 500 })}>{m.kpi.closedToday}</span>
        </HudBox>
      </div>
    </section>
  );
}

// ── Instrument panels ───────────────────────────────────────────────────────────────────────
function Readings({ m }: { m: DashboardModel }) {
  const rows = [
    { k: "Закрыто сегодня", sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просрочено` : "без просрочек", v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`, pct: m.kpi.todayTotal ? (m.kpi.todayDone / m.kpi.todayTotal) * 100 : 0, hot: m.kpi.overdueToday > 0 },
    { k: "Открыто задач", sub: `${m.status.overdueAll} с просрочкой`, v: String(m.kpi.openCount), pct: m.kpi.openCount ? (m.status.inProgress / m.kpi.openCount) * 100 : 0, hot: false },
    { k: "За неделю", sub: `серия ${m.kpi.streak} дн`, v: String(m.kpi.weekDone), pct: Math.min(100, (m.kpi.weekDone / Math.max(1, m.kpi.dailyGoal * 7)) * 100), hot: false },
  ];
  return (
    <section className="flex flex-col px-5 py-4" style={PANEL}>
      <div className="flex items-start justify-between">
        <div>
          <h1 style={sans(20, 600)}>{m.greeting}</h1>
          <div className="mt-1" style={sans(12, 400, { color: T.ink3 })}>{m.dateLabel}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col">
        {rows.map((r) => (
          <div key={r.k} className="flex flex-col gap-2 py-2" style={{ borderTop: `1px solid ${T.line}` }}>
            <div className="flex items-baseline justify-between">
              <span style={sans(13, 500)}>{r.k}</span>
              <span style={mono(15, { color: r.hot ? T.orange : T.ink, fontWeight: 500 })}>{r.v}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="relative h-px flex-1" style={{ background: T.line3 }}>
                <span className="absolute -top-px left-0 h-[3px]" style={{ width: `${r.pct}%`, background: r.hot ? T.orange : T.ink }} />
              </span>
              <span style={mono(9, { color: T.ink3 }, true)}>{r.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GoalCompass({ m }: { m: DashboardModel }) {
  const v = m.kpi.closedToday;
  const g = Math.max(1, m.kpi.dailyGoal);
  return (
    <section className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-5 py-3" style={PANEL}>
      <span className="absolute left-4 top-3.5">
        <MonoLabel>Цель дня</MonoLabel>
      </span>
      <span className="h-6 px-2.5 leading-6" style={{ background: v >= g ? T.lime : T.limeTint, color: v >= g ? "#000" : T.lime, ...mono(12, { fontWeight: 600, lineHeight: "24px" }), borderRadius: 3 }}>
        {v}/{g}
      </span>
      <div className="relative">
        <Dial value={v} max={g} size={136} ticks={72}>
          <span className="relative grid h-[58px] w-[58px] place-items-center" style={{ boxShadow: `inset 0 0 0 1px ${T.line3}`, borderRadius: "50%" }}>
            <span style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: `14px solid ${T.ink}`, transform: `rotate(${(v / g) * 360}deg)`, transformOrigin: "50% 70%" }} />
          </span>
        </Dial>
        {[
          { l: "0", s: { top: 18, left: "50%", transform: "translateX(-50%)" } },
          { l: "¼", s: { right: 18, top: "50%", transform: "translateY(-50%)" } },
          { l: "½", s: { bottom: 18, left: "50%", transform: "translateX(-50%)" } },
          { l: "¾", s: { left: 18, top: "50%", transform: "translateY(-50%)" } },
        ].map((c) => (
          <span key={c.l} className="absolute" style={{ ...c.s, ...mono(9, { color: T.ink3 }) }}>
            {c.l}
          </span>
        ))}
      </div>
      <span className="flex items-center gap-4" style={mono(10, { color: T.ink3 }, true)}>
        <span>
          серия <b style={{ color: T.ink, fontWeight: 500 }}>{m.kpi.streak}</b>
        </span>
        <span>
          лучшая <b style={{ color: T.ink, fontWeight: 500 }}>{m.kpi.bestStreak}</b>
        </span>
        {m.kpi.gamification && (
          <span>
            xp <b style={{ color: T.ink, fontWeight: 500 }}>{m.kpi.xpToNext}</b>
          </span>
        )}
      </span>
    </section>
  );
}

// ── Control strip ───────────────────────────────────────────────────────────────────────────
function ControlStrip({
  m,
  mode,
  setMode,
  focusAdd,
  closeFirst,
  focusNote,
}: {
  m: DashboardModel;
  mode: Mode;
  setMode: (v: Mode) => void;
  focusAdd: () => void;
  closeFirst: () => void;
  focusNote: () => void;
}) {
  const rows = mode === "over" ? m.overPlan.slice(0, 5) : m.plan;
  return (
    <section className="grid grid-cols-[minmax(0,1fr)_212px_196px] gap-0 2xl:grid-cols-[minmax(0,1fr)_260px_200px]" style={PANEL}>
      {/* mode + rows */}
      <div className="flex min-w-0 flex-col py-3 pl-3 pr-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex h-8 items-center p-0.5" style={{ background: "#151515", borderRadius: 3 }}>
            {(
              [
                { v: "plan", l: "План", i: "tasks", c: `${m.plan.filter((r) => r.done).length}/${m.plan.length}` },
                { v: "over", l: "Сверх", i: "forward", c: String(m.overPlan.length) },
                { v: "meet", l: "Встречи", i: "meeting", c: String(m.meetings.filter((x) => !x.done).length) },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setMode(t.v)}
                className="flex h-7 items-center gap-1.5 px-2.5 outline-none transition-colors hover:text-white focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
                style={{ ...mono(10, {}, true), lineHeight: 1, borderRadius: 2, background: mode === t.v ? "#2A2A2A" : "transparent", color: mode === t.v ? T.ink : T.ink3 }}
              >
                <Glyph name={t.i} size={11} />
                {t.l}
                <span style={{ color: mode === t.v ? T.ink3 : T.ink4 }}>{t.c}</span>
              </button>
            ))}
          </span>
          {mode === "over" && m.overPlan.length > 0 && (
            <button type="button" onClick={m.actions.moveOverPlanToTomorrow} className="flex h-7 items-center gap-1.5 px-2 hover:text-white" style={{ ...mono(10, { color: T.ink2 }, true), boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 2 }}>
              <Glyph name="forward" size={11} /> все на завтра
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-col">
          {mode === "meet" ? (
            m.meetings.length === 0 ? (
              <Empty title="Встреч нет" hint="Эфир свободен" className="mt-1 h-[176px]" />
            ) : (
              m.meetings.slice(0, 5).map((x) => (
                <div key={x.id} className="grid h-9 grid-cols-[14px_44px_minmax(0,1fr)_auto] items-center gap-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <TermCheck done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} size={12} />
                  <span style={mono(12)}>{x.time}</span>
                  <span className="truncate" style={sans(13, 400, { color: x.done ? T.ink4 : T.ink })}>{x.title}</span>
                  <span style={mono(10, { color: T.ink3 })}>{x.dateLabel}</span>
                </div>
              ))
            )
          ) : (
            <>
              {rows.length === 0 && <Empty title="Пусто" icon="tasks" className="mt-1 h-[140px]" />}
              {rows.map((r) => (
                <div key={r.id} className="grid h-9 grid-cols-[14px_minmax(0,1fr)_auto_64px_40px] items-center gap-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <TermCheck done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={12} />
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate" style={sans(13, 400, { color: r.done ? T.ink4 : T.ink, textDecoration: r.done ? "line-through" : undefined })}>{r.title}</span>
                    {r.projectName && <span className="shrink-0" style={mono(9, { color: T.ink4 }, true)}>{r.projectName}</span>}
                  </span>
                  <PriorityBars priority={r.priority} />
                  <span className="text-right" style={mono(10, { color: r.overdue ? T.orange : T.ink3 })}>{r.dueLabel}</span>
                  <span className="text-right" style={mono(10, { color: T.ink4 })}>{hm(r.spentMin)}</span>
                </div>
              ))}
              {mode === "over" && m.overPlan.length > 5 && (
                <span className="flex h-7 items-center">
                  <MonoLabel color={T.ink4}>+ ещё {m.overPlan.length - 5}</MonoLabel>
                </span>
              )}
              {mode === "plan" && <AddLine id="t4-add" onAdd={m.actions.add} placeholder="Добавить в план" className="h-9" />}
            </>
          )}
        </div>
      </div>

      {/* metrics, JCA-style 3 columns with vertical hairlines */}
      <div className="grid grid-cols-2 content-center gap-y-4 px-4 py-3" style={{ borderLeft: `1px solid ${T.line}` }}>
        {[
          { k: "Время", v: m.kpi.timeLabel },
          { k: "Цель", v: `${m.kpi.closedToday}/${m.kpi.dailyGoal}` },
          { k: "Готово", v: String(m.status.doneAll) },
          { k: "Просроч", v: String(m.status.overdueAll), hot: m.status.overdueAll > 0 },
          { k: "14 дней", v: String(m.closed14) },
          { k: "Пик", v: String(m.peak14) },
        ].map((s, i) => (
          <div key={s.k} className="flex flex-col gap-1" style={{ borderLeft: i % 2 ? `1px solid ${T.line2}` : undefined, paddingLeft: i % 2 ? 14 : 0 }}>
            <MonoLabel size={9}>{s.k}</MonoLabel>
            <span style={mono(15, { color: s.hot ? T.orange : T.ink, fontWeight: 500 })}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* D-pad of quick actions */}
      <div className="flex items-center justify-center py-3" style={{ borderLeft: `1px solid ${T.line}` }}>
        <DPad
          up={{ label: "Задача", run: focusAdd }}
          right={{ label: "Завтра", run: m.actions.moveOverPlanToTomorrow, disabled: m.overPlan.length === 0 }}
          down={{ label: "Заметка", run: focusNote }}
          left={{ label: "Режим", run: () => setMode(mode === "plan" ? "meet" : mode === "meet" ? "over" : "plan") }}
          center={{ label: "Готово", run: closeFirst, disabled: !m.plan.some((r) => !r.done) }}
        />
      </div>
    </section>
  );
}

interface PadAction {
  label: string;
  run: () => void;
  disabled?: boolean;
}

function DPad({ up, right, down, left, center }: { up: PadAction; right: PadAction; down: PadAction; left: PadAction; center: PadAction }) {
  const S = 168;
  const btn = (a: PadAction, pos: React.CSSProperties, arrow: string) => (
    <button
      type="button"
      onClick={a.run}
      disabled={a.disabled}
      aria-label={a.label}
      title={a.label}
      className="absolute flex flex-col items-center gap-0.5 outline-none transition-colors enabled:hover:text-white disabled:opacity-30 focus-visible:text-[#C8FF00]"
      style={{ ...pos, color: T.ink2 }}
    >
      <span style={mono(11)}>{arrow}</span>
      <span style={mono(8, {}, true)}>{a.label}</span>
    </button>
  );
  return (
    <div className="relative" style={{ width: S, height: S }}>
      <span className="absolute inset-0" style={{ borderRadius: "50%", background: "#141414", boxShadow: `inset 0 0 0 1px ${T.line2}` }} />
      <span className="absolute inset-[34px]" style={{ borderRadius: "50%", boxShadow: `inset 0 0 0 1px ${T.line}` }} />
      {btn(up, { top: 8, left: "50%", transform: "translateX(-50%)" }, "▲")}
      {btn(down, { bottom: 8, left: "50%", transform: "translateX(-50%)", flexDirection: "column-reverse" }, "▼")}
      {btn(left, { left: 6, top: "50%", transform: "translateY(-50%)" }, "◀")}
      {btn(right, { right: 4, top: "50%", transform: "translateY(-50%)" }, "▶")}
      <button
        type="button"
        onClick={center.run}
        disabled={center.disabled}
        aria-label="Закрыть первую открытую задачу плана"
        title="Закрыть первую открытую задачу"
        className="absolute left-1/2 top-1/2 grid h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 place-items-center outline-none transition-[filter] enabled:hover:brightness-125 disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
        style={{ borderRadius: "50%", background: "#0A0A0A", boxShadow: `inset 0 0 0 1px ${T.line3}`, ...mono(9, { color: T.lime }, true) }}
      >
        {center.label}
      </button>
    </div>
  );
}

function ProjectsPanel({ m }: { m: DashboardModel }) {
  return (
    <section className="flex flex-col overflow-hidden" style={PANEL}>
      <PanelHead icon="projects" label={`Проекты · ${m.projects.length}`} />
      {m.projects.length === 0 && <Empty title="Проектов нет" icon="projects" className="flex-1" />}
      <div className="flex flex-col px-4 py-1">
        {m.projects.slice(0, 6).map((p) => {
          const hs = healthSignal(p.health);
          return (
            <div key={p.id} className="grid h-[37px] grid-cols-[8px_minmax(0,1fr)_72px_36px] items-center gap-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <StatusSquare color={hs.color} hollow={hs.hollow} size={6} />
              <span className="truncate" style={sans(13, 400)}>{p.name}</span>
              <span className="relative h-px" style={{ background: T.line3 }}>
                <span className="absolute -top-px left-0 h-[3px]" style={{ width: `${p.pct}%`, background: p.health === "off-track" ? T.orange : T.ink }} />
              </span>
              <span className="text-right" style={mono(11, { color: T.ink2 })}>{Math.round(p.pct)}%</span>
            </div>
          );
        })}
      </div>
      <Hatch className="min-h-3 flex-1" />
    </section>
  );
}
