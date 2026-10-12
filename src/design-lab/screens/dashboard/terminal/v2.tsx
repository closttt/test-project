/**
 * Dashboard · Data Terminal · v2 «Торговый терминал»
 * Azura-style trading desk on a hairline grid: top bar (text nav, search that filters the book,
 * quick add, status pill), an account column of KPIs with delta chips, a big crosshair chart of
 * 14-day closes with value tags, a dense "positions" table of today's plan, a right rail for
 * projects / note / reading, and a status bar with totals pinned to the bottom.
 */
import { useMemo, useState, type ReactNode } from "react";

import { useDashboardModel, rub, type DashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";
import {
  T,
  mono,
  sans,
  pad2,
  MonoLabel,
  Hatch,
  StatusSquare,
  Glyph,
  useNow,
  stamp,
  TermCheck,
  PriorityBars,
  Cells,
  LineChart,
  YearMatrix,
  AddLine,
  NoteBox,
  TermButton,
  Empty,
  healthSignal,
  hm,
} from "@/design-lab/screens/_kit/terminal";

function Chip({ children, tone = "mute" }: { children: ReactNode; tone?: "lime" | "orange" | "mute" }) {
  const c =
    tone === "lime" ? { background: T.limeTint, color: T.lime } : tone === "orange" ? { background: T.orangeTint, color: T.orange } : { background: "#1A1A1A", color: T.ink2 };
  return (
    <span className="inline-flex h-4 items-center px-1" style={{ ...mono(10, { fontWeight: 500, lineHeight: 1 }), ...c, borderRadius: 2 }}>
      {children}
    </span>
  );
}

function Seg<V extends string>({ value, options, onChange }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void }) {
  return (
    <span className="inline-flex h-6 items-center p-0.5" style={{ background: "#121212", boxShadow: `inset 0 0 0 1px ${T.line}`, borderRadius: 3 }}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className="h-5 px-2 outline-none transition-colors hover:text-white focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
          style={{ ...mono(10, {}, true), lineHeight: 1, borderRadius: 2, background: value === o.v ? "#2A2A2A" : "transparent", color: value === o.v ? T.ink : T.ink3 }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

const SECTION = "px-4 py-4";
const line = `1px solid ${T.line}`;

export default function TerminalV2() {
  const m = useDashboardModel();
  const now = useNow();
  const st = stamp(now);
  const [query, setQuery] = useState("");
  const [chartTab, setChartTab] = useState<"closes" | "year">("closes");
  const [range, setRange] = useState<"7" | "14">("14");
  const [book, setBook] = useState<"plan" | "over" | "meet">("plan");
  const [filter, setFilter] = useState<"open" | "done" | "all">("all");

  const hot = m.kpi.overdueToday > 0;
  const series = range === "7" ? m.dynamics.slice(-7) : m.dynamics;
  const sumRange = series.reduce((s, d) => s + d.value, 0);
  const prev = range === "7" ? m.dynamics.slice(0, 7).reduce((s, d) => s + d.value, 0) : 0;

  const rows = useMemo(() => {
    const src = book === "over" ? m.overPlan : m.plan;
    const q = query.trim().toLowerCase();
    return src
      .filter((r) => (filter === "open" ? !r.done : filter === "done" ? r.done : true))
      .filter((r) => !q || r.title.toLowerCase().includes(q) || (r.projectName ?? "").toLowerCase().includes(q));
  }, [m.plan, m.overPlan, book, filter, query]);

  const focusAdd = () => {
    setBook("plan");
    setTimeout(() => document.getElementById("t2-add")?.focus(), 30);
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ background: T.bg, color: T.ink, fontFamily: T.sans }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 px-4 min-[1400px]:gap-6" style={{ background: T.bg, borderBottom: line }}>
        <span className="flex items-center gap-2.5">
          <span className="grid h-5 w-5 place-items-center" style={{ background: T.lime }}>
            <span className="h-2 w-2" style={{ background: "#000" }} />
          </span>
          <span className="whitespace-nowrap" style={mono(12, { fontWeight: 600, color: T.ink }, true)}>Рабочий стол</span>
        </span>
        <nav className="flex min-w-0 items-center gap-0.5">
          {m.nav.map((n) => {
            const active = n.id === "dashboard";
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex h-8 items-center gap-1.5 px-2 outline-none transition-colors hover:text-white focus-visible:ring-1 focus-visible:ring-[#C8FF00] min-[1400px]:px-2.5"
                style={{ ...sans(13, active ? 500 : 400), color: active ? T.ink : T.ink2, background: active ? "#141414" : undefined, borderRadius: 3, whiteSpace: "nowrap" }}
              >
                {n.label}
                {n.badge ? <Chip tone="lime">{n.badge}</Chip> : null}
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex h-8 w-[180px] items-center gap-2 px-2.5 min-[1400px]:w-[240px] 2xl:w-[300px]" style={{ background: "#0E0E0E", boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3 }}>
            <Glyph name="search" size={13} color={T.ink3} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Фильтр задач и проектов"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#4a4a4a]"
              style={sans(12, 400, { color: T.ink })}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Очистить" className="text-[#6b6b6b] hover:text-white">
                <Glyph name="close" size={12} />
              </button>
            ) : (
              <span className="px-1" style={{ ...mono(10, { color: T.ink3 }), background: "#1A1A1A", borderRadius: 2 }}>/</span>
            )}
          </label>
          <button
            type="button"
            onClick={focusAdd}
            className="flex h-8 items-center gap-1.5 px-3 outline-none transition-[filter] hover:brightness-110 focus-visible:ring-1 focus-visible:ring-white"
            style={{ background: T.lime, color: "#000", ...mono(11, { fontWeight: 600 }, true), lineHeight: 1, borderRadius: 3 }}
          >
            <Glyph name="plus" size={12} /> Задача
          </button>
          <span
            className="flex h-8 items-center gap-2 px-2.5"
            style={{ background: hot ? T.orangeTint : T.limeTint, color: hot ? T.orange : T.lime, ...mono(10, { fontWeight: 500 }, true), lineHeight: 1, borderRadius: 3 }}
          >
            <StatusSquare color={hot ? T.orange : T.lime} blink />
            <span className="hidden min-[1400px]:inline">{hot ? "Просрочка" : "В плане"}</span>
            {hot ? m.kpi.overdueToday : <span className="min-[1400px]:hidden">ок</span>}
          </span>
          {m.kpi.gamification && (
            <span className="grid h-8 w-8 place-items-center" title={`Уровень ${m.kpi.level} · ${m.kpi.levelTitle}`} style={{ boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3, ...mono(11, { color: T.ink }) }}>
              {pad2(m.kpi.level)}
            </span>
          )}
        </div>
      </header>

      {/* ── Body: account · market · rail ───────────────────────────────────── */}
      <div className="grid flex-1 grid-cols-[240px_minmax(0,1fr)_272px] min-[1400px]:grid-cols-[256px_minmax(0,1fr)_288px] 2xl:grid-cols-[280px_minmax(0,1fr)_320px]" style={{ gap: 1, background: T.line }}>
        <Account m={m} focusAdd={focusAdd} />

        <section className="flex min-w-0 flex-col" style={{ background: T.bg }}>
          {/* chart */}
          <div className="flex h-11 items-center justify-between gap-4 px-4" style={{ borderBottom: line }}>
            <div className="flex h-full items-center gap-5">
              {(
                [
                  { v: "closes", l: "Закрыто" },
                  { v: "year", l: "Полгода" },
                ] as const
              ).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setChartTab(t.v)}
                  className="relative h-full outline-none transition-colors hover:text-white focus-visible:text-white"
                  style={{ ...mono(11, { fontWeight: 500 }, true), color: chartTab === t.v ? T.ink : T.ink3 }}
                >
                  {t.l}
                  {chartTab === t.v && <span className="absolute inset-x-0 -bottom-px h-0.5" style={{ background: T.ink }} />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-baseline gap-2">
                <span style={mono(16, { color: T.ink, letterSpacing: "-0.02em" })}>{chartTab === "year" ? m.year.reduce((s, d) => s + d.value, 0) : sumRange}</span>
                <MonoLabel>закрыто</MonoLabel>
                {chartTab === "closes" && range === "7" && prev > 0 && (
                  <Chip tone={sumRange >= prev ? "lime" : "orange"}>
                    {sumRange >= prev ? "+" : ""}
                    {Math.round(((sumRange - prev) / prev) * 100)}%
                  </Chip>
                )}
                {chartTab === "closes" && range === "14" && <Chip>пик {m.peak14}</Chip>}
              </span>
              {chartTab === "closes" && (
                <Seg
                  value={range}
                  onChange={setRange}
                  options={[
                    { v: "7", label: "7д" },
                    { v: "14", label: "14д" },
                  ]}
                />
              )}
            </div>
          </div>
          <div className="px-4 pb-2 pt-3" style={{ borderBottom: line }}>
            {chartTab === "closes" ? (
              <LineChart data={series} height={268} initialIndex={series.length - 1} />
            ) : (
              <div className="flex h-[268px] flex-col justify-center gap-5 overflow-hidden">
                <YearMatrix year={m.year} cell={11} gap={3} />
                <div className="flex items-center gap-5" style={mono(10, { color: T.ink3 }, true)}>
                  <span>{m.year[0]?.date}</span>
                  <span className="h-px flex-1" style={{ background: T.line2 }} />
                  <span style={{ color: T.ink }}>сегодня</span>
                </div>
              </div>
            )}
          </div>

          {/* book tabs */}
          <div className="flex h-11 items-center justify-between gap-4 px-4" style={{ borderBottom: line }}>
            <div className="flex h-full items-center gap-5">
              {(
                [
                  { v: "plan", l: "План", c: m.plan.length },
                  { v: "over", l: "Сверх плана", c: m.overPlan.length },
                  { v: "meet", l: "Встречи", c: m.meetings.filter((x) => !x.done).length },
                ] as const
              ).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setBook(t.v)}
                  className="relative flex h-full items-center gap-2 outline-none transition-colors hover:text-white focus-visible:text-white"
                  style={{ ...mono(11, { fontWeight: 500 }, true), color: book === t.v ? T.ink : T.ink3 }}
                >
                  {t.l}
                  <Chip tone={t.v === "over" && t.c ? "orange" : "mute"}>{t.c}</Chip>
                  {book === t.v && <span className="absolute inset-x-0 -bottom-px h-0.5" style={{ background: T.ink }} />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {book !== "meet" && (
                <Seg
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { v: "all", label: "Все" },
                    { v: "open", label: "Открытые" },
                    { v: "done", label: "Закрытые" },
                  ]}
                />
              )}
              {book === "over" && m.overPlan.length > 0 && (
                <TermButton icon="forward" onClick={m.actions.moveOverPlanToTomorrow} tone="solid">
                  Всё на завтра
                </TermButton>
              )}
              {query && (
                <TermButton icon="close" onClick={() => setQuery("")}>
                  «{query.slice(0, 12)}»
                </TermButton>
              )}
            </div>
          </div>

          {book === "meet" ? <MeetBook m={m} /> : <Book rows={rows} m={m} over={book === "over"} />}

          {book === "plan" && (
            <AddLine id="t2-add" onAdd={m.actions.add} placeholder="Новая строка в план — «отчёт пт 12:00 !важно»" className="h-11 px-4" style={{ borderBottom: line }} />
          )}
          <Hatch className="min-h-6 flex-1" />
        </section>

        <Rail m={m} />
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <footer className="sticky bottom-0 z-20 flex h-8 shrink-0 items-center gap-4 px-3" style={{ background: T.bg, borderTop: line }}>
        <span
          className="flex h-5 items-center gap-1.5 px-2"
          style={{ background: hot ? T.orangeTint : T.limeTint, color: hot ? T.orange : T.lime, ...mono(10, { fontWeight: 500 }, true), lineHeight: 1, borderRadius: 2 }}
        >
          <StatusSquare size={5} color={hot ? T.orange : T.lime} />
          {hot ? "Есть просрочка" : "Всё по плану"}
        </span>
        <span className="flex min-w-0 items-center gap-4 truncate" style={mono(10, { color: T.ink3 }, true)}>
          <span>
            план <b style={{ color: T.ink, fontWeight: 500 }}>{m.plan.filter((r) => r.done).length}/{m.plan.length}</b>
          </span>
          <span>
            время <b style={{ color: T.ink, fontWeight: 500 }}>{m.kpi.timeLabel}</b>
          </span>
          <span>
            открыто <b style={{ color: T.ink, fontWeight: 500 }}>{m.kpi.openCount}</b>
          </span>
          <span>
            просрочено <b style={{ color: m.status.overdueAll ? T.orange : T.ink, fontWeight: 500 }}>{m.status.overdueAll}</b>
          </span>
          <span>
            ожидается <b style={{ color: T.ink, fontWeight: 500 }}>{rub(m.money.pending)}</b>
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {m.kpi.gamification && (
            <span className="flex h-5 items-center px-2" style={{ background: "#161616", ...mono(10, { color: T.ink2 }, true), lineHeight: 1, borderRadius: 2 }}>
              ур {pad2(m.kpi.level)} · {m.kpi.xpToNext} xp
            </span>
          )}
          <span className="flex h-5 items-center px-2" style={{ background: "#161616", ...mono(10, { color: T.ink2 }, true), lineHeight: 1, borderRadius: 2 }}>
            серия {m.kpi.streak} дн
          </span>
          <span className="flex h-5 items-center px-2" style={{ background: "#161616", ...mono(10, { color: T.lime }), lineHeight: 1, borderRadius: 2 }}>
            {st.time}
          </span>
        </span>
      </footer>
    </div>
  );
}

// ── Account column ──────────────────────────────────────────────────────────────────────────
function Account({ m, focusAdd }: { m: DashboardModel; focusAdd: () => void }) {
  return (
    <aside className="flex min-w-0 flex-col" style={{ background: T.bg }}>
      <div className="px-4 pb-4 pt-3.5" style={{ borderBottom: line }}>
        <div className="flex items-center justify-between">
          <MonoLabel>Сегодня</MonoLabel>
          <MonoLabel color={T.ink3}>{stamp(new Date(), false).date}</MonoLabel>
        </div>
        <div className="mt-2.5" style={sans(13, 400, { color: T.ink2 })}>
          {m.greeting}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span style={mono(30, { color: T.ink, letterSpacing: "-0.04em", lineHeight: 1 })}>
            {m.kpi.todayDone}/{m.kpi.todayTotal}
          </span>
          <MonoLabel>закрыто</MonoLabel>
          {m.kpi.overdueToday > 0 && <Chip tone="orange">{m.kpi.overdueToday} просроч</Chip>}
        </div>
      </div>

      <dl style={{ borderBottom: line }}>
        {[
          { k: "Время сегодня", v: m.kpi.timeLabel, chip: <Chip tone={m.kpi.closedToday >= m.kpi.dailyGoal ? "lime" : "mute"}>цель {m.kpi.closedToday}/{m.kpi.dailyGoal}</Chip> },
          { k: "Открыто задач", v: String(m.kpi.openCount), chip: m.status.overdueAll ? <Chip tone="orange">{m.status.overdueAll}</Chip> : <Chip tone="lime">0</Chip> },
          { k: "За неделю", v: String(m.kpi.weekDone), chip: <Chip tone={m.kpi.streak ? "lime" : "mute"}>серия {m.kpi.streak}</Chip> },
        ].map((r, i) => (
          <div key={r.k} className="flex h-10 items-center justify-between gap-2 px-4" style={{ borderTop: i ? line : undefined }}>
            <MonoLabel>{r.k}</MonoLabel>
            <span className="flex items-center gap-2">
              {r.chip}
              <span className="min-w-[40px] text-right" style={mono(15, { color: T.ink, letterSpacing: "-0.02em" })}>{r.v}</span>
            </span>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-3" style={{ borderBottom: line }}>
        {[
          { l: "Задача", i: "plus", on: focusAdd },
          { l: "Заметка", i: "notes", on: () => document.querySelector<HTMLTextAreaElement>("#t2-note textarea")?.focus() },
          { l: "На завтра", i: "forward", on: m.actions.moveOverPlanToTomorrow, dis: m.overPlan.length === 0 },
        ].map((b, i) => (
          <button
            key={b.l}
            type="button"
            disabled={b.dis}
            onClick={b.on}
            className="flex h-14 flex-col items-center justify-center gap-2 outline-none transition-colors enabled:hover:bg-[#111] disabled:opacity-40 focus-visible:bg-[#111]"
            style={{ borderLeft: i ? line : undefined, color: T.ink2 }}
          >
            <Glyph name={b.i} size={14} color={T.ink} />
            <span style={mono(10, {}, true)}>{b.l}</span>
          </button>
        ))}
      </div>
      <div className={SECTION} style={{ borderBottom: line }}>
        <MonoLabel>Статус задач</MonoLabel>
        <dl className="mt-3 flex flex-col">
          {[
            { k: "Выполнено", v: m.status.doneAll, c: T.ink },
            { k: "В работе", v: m.status.inProgress, c: T.ink },
            { k: "Просрочено", v: m.status.overdueAll, c: m.status.overdueAll ? T.orange : T.ink },
          ].map((r) => (
            <div key={r.k} className="flex h-6 items-center justify-between">
              <dt style={sans(12, 400, { color: T.ink3 })}>{r.k}</dt>
              <dd style={mono(12, { color: r.c })}>{r.v}</dd>
            </div>
          ))}
          <div className="my-2 h-px" style={{ background: T.line }} />
          {m.status.openByPriority.map((p) => (
            <div key={p.priority} className="flex h-6 items-center justify-between">
              <dt className="flex items-center gap-2" style={sans(12, 400, { color: T.ink3 })}>
                <PriorityBars priority={p.priority} /> {p.label}
              </dt>
              <dd style={mono(12, { color: T.ink })}>{p.count}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={`${SECTION} flex-1`}>
        <div className="flex items-center justify-between">
          <MonoLabel>Деньги · месяц</MonoLabel>
          {m.money.overdue > 0 && <Chip tone="orange">долг</Chip>}
        </div>
        <div className="mt-3" style={mono(22, { color: T.ink, letterSpacing: "-0.03em" })}>
          {rub(m.money.paidThisMonth)}
        </div>
        <dl className="mt-3 flex flex-col">
          {[
            { k: "Ожидается", v: rub(m.money.pending), c: T.ink },
            { k: "Просрочено", v: rub(m.money.overdue), c: m.money.overdue ? T.orange : T.ink },
            { k: "Всего получено", v: rub(m.money.paidTotal), c: T.ink2 },
          ].map((r) => (
            <div key={r.k} className="flex h-6 items-center justify-between">
              <dt style={sans(12, 400, { color: T.ink3 })}>{r.k}</dt>
              <dd style={mono(12, { color: r.c })}>{r.v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-col gap-1">
          {m.followUps.length === 0 ? (
            <span className="flex items-center gap-2" style={mono(10, { color: T.ink4 }, true)}>
              <StatusSquare size={5} color={T.ink4} hollow /> напоминаний нет
            </span>
          ) : (
            m.followUps.slice(0, 4).map((f) => (
              <span key={f.id} className="flex h-6 items-center justify-between">
                <span className="flex min-w-0 items-center gap-2 truncate" style={sans(12, 400, { color: T.ink })}>
                  <StatusSquare size={5} color={T.orange} />
                  {f.name}
                </span>
                <span style={mono(10, { color: T.ink3 })}>{f.date.slice(5).split("-").reverse().join(".")}</span>
              </span>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

// ── Positions-like table ────────────────────────────────────────────────────────────────────
function lag(r: TodayRow) {
  if (!r.due) return "без срока";
  const d = Math.round((new Date(new Date().toDateString()).getTime() - new Date(r.due + "T00:00:00").getTime()) / 86400000);
  if (r.done) return "закрыто";
  return d > 0 ? `просрочка ${d} дн` : d === 0 ? "срок сегодня" : `через ${-d} дн`;
}

const COLS = "grid-cols-[28px_minmax(0,1fr)_92px_60px_72px_44px_76px] min-[1400px]:grid-cols-[28px_minmax(0,1fr)_120px_76px_72px_52px_92px]";

function Book({ rows, m, over }: { rows: TodayRow[]; m: DashboardModel; over: boolean }) {
  const shown = over ? rows.slice(0, 8) : rows;
  return (
    <div>
      <div className={`grid h-8 items-center gap-3 px-4 ${COLS}`} style={{ borderBottom: line }}>
        {["", "Задача", "Проект", "Приоритет", "Срок", "Время", ""].map((h, i) => (
          <span key={i} className={i >= 4 ? "text-right" : ""} style={mono(10, { color: T.ink4 }, true)}>
            {h}
          </span>
        ))}
      </div>
      {shown.length === 0 && <Empty title="Нет строк" hint="Сними фильтр или добавь задачу" icon="list" className="h-[150px]" />}
      {shown.map((r) => (
        <div key={r.id} className={`group grid h-[52px] items-center gap-3 px-4 transition-colors hover:bg-[#0D0D0D] ${COLS}`} style={{ borderBottom: line }}>
          <TermCheck done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate" style={sans(13, 500, { color: r.done ? T.ink4 : T.ink, textDecoration: r.done ? "line-through" : undefined })}>
              {r.title}
            </span>
            <span className="flex items-center gap-2" style={mono(10, { color: T.ink3 })}>
              {r.subtasksTotal > 0 && (
                <span>
                  подзадачи {r.subtasksDone}/{r.subtasksTotal}
                </span>
              )}
              {r.estimateMin ? <span>оценка {hm(r.estimateMin)}</span> : null}
              {!r.subtasksTotal && !r.estimateMin && <span style={{ color: r.overdue ? "#a5502f" : T.ink4 }}>{lag(r)}</span>}
            </span>
          </span>
          <span className="truncate" style={mono(11, { color: r.projectName ? T.ink2 : T.ink4 }, true)}>
            {r.projectName ?? "—"}
          </span>
          <span className="flex items-center gap-2" style={mono(11, { color: T.ink2 })}>
            <PriorityBars priority={r.priority} />
            {r.priorityShort}
          </span>
          <span className="flex justify-end">
            {r.overdue ? <Chip tone="orange">{r.dueLabel}</Chip> : <span style={mono(11, { color: T.ink2 })}>{r.dueLabel}</span>}
          </span>
          <span className="text-right" style={mono(12, { color: r.spentMin ? T.ink : T.ink4 })}>
            {hm(r.spentMin)}
          </span>
          <span className="flex justify-end">
            <button
              type="button"
              onClick={() => m.actions.toggle(r.id)}
              className="h-6 px-2 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
              style={{
                ...mono(10, {}, true),
                lineHeight: 1,
                borderRadius: 2,
                background: r.done ? "transparent" : "#1A1A1A",
                color: r.done ? T.ink3 : T.ink,
                boxShadow: r.done ? `inset 0 0 0 1px ${T.line2}` : undefined,
              }}
            >
              {r.done ? "Вернуть" : "Готово"}
            </button>
          </span>
        </div>
      ))}
      {over && rows.length > shown.length && (
        <div className="flex h-9 items-center px-4" style={{ borderBottom: line }}>
          <MonoLabel color={T.ink4}>+ ещё {rows.length - shown.length} строк</MonoLabel>
        </div>
      )}
      <div className="flex h-9 items-center gap-5 px-4" style={{ ...mono(10, { color: T.ink3 }, true), borderBottom: line }}>
        <span>
          строк <b style={{ color: T.ink, fontWeight: 500 }}>{rows.length}</b>
        </span>
        <span>
          закрыто <b style={{ color: T.ink, fontWeight: 500 }}>{rows.filter((r) => r.done).length}</b>
        </span>
        <span>
          время <b style={{ color: T.ink, fontWeight: 500 }}>{hm(rows.reduce((s, r) => s + r.spentMin, 0))}</b>
        </span>
        <span className="flex items-center gap-1.5">
          просрочено <Chip tone={rows.some((r) => r.overdue) ? "orange" : "mute"}>{rows.filter((r) => r.overdue).length}</Chip>
        </span>
      </div>
    </div>
  );
}

function MeetBook({ m }: { m: DashboardModel }) {
  if (m.meetings.length === 0)
    return <Empty title="Встреч нет" hint="Ближайшие созвоны появятся здесь из календаря" icon="meeting" className="h-[200px]" />;
  return (
    <div>
      {m.meetings.slice(0, 8).map((x) => (
        <div key={x.id} className="grid h-12 grid-cols-[28px_56px_minmax(0,1fr)_120px_80px_92px] items-center gap-3 px-4" style={{ borderBottom: line }}>
          <TermCheck done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} />
          <span style={mono(13, { color: x.done ? T.ink4 : T.ink })}>{x.time}</span>
          <span className="truncate" style={sans(13, 500, { color: x.done ? T.ink4 : T.ink })}>
            {x.title}
          </span>
          <span className="truncate" style={mono(11, { color: T.ink2 }, true)}>{x.clientName ?? "—"}</span>
          <span className="text-right" style={mono(11, { color: T.ink2 })}>{x.dateLabel}</span>
          <span className="flex justify-end">
            {x.url ? (
              <a href={x.url} target="_blank" rel="noreferrer" className="flex h-6 items-center gap-1 px-2 hover:text-white" style={{ ...mono(10, { color: T.lime }, true), background: "#1A1A1A", borderRadius: 2 }}>
                Войти <Glyph name="arrowUR" size={10} />
              </a>
            ) : (
              <span style={mono(10, { color: T.ink4 })}>{x.durationMin}м</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Right rail ──────────────────────────────────────────────────────────────────────────────
function Rail({ m }: { m: DashboardModel }) {
  return (
    <aside className="flex min-w-0 flex-col" style={{ background: T.bg }}>
      <div className="flex h-11 items-center justify-between px-4" style={{ borderBottom: line }}>
        <MonoLabel color={T.ink}>Проекты</MonoLabel>
        <Chip>{m.projects.length}</Chip>
      </div>
      {m.projects.length === 0 && <Empty title="Проектов нет" icon="projects" className="h-[120px]" />}
      {m.projects.map((p) => {
        const hs = healthSignal(p.health);
        return (
          <div key={p.id} className="flex flex-col gap-2 px-4 py-3" style={{ borderBottom: line }}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <StatusSquare color={hs.color} hollow={hs.hollow} />
                <span className="truncate" style={sans(13, 500)}>{p.name}</span>
              </span>
              <span style={mono(12, { color: T.ink })}>{Math.round(p.pct)}%</span>
            </div>
            <Cells pct={p.pct} cells={30} h={4} gap={1} color={p.health === "off-track" ? T.orange : T.ink2} />
            <div className="flex items-center justify-between" style={mono(10, { color: T.ink3 })}>
              <span>
                {p.done}/{p.total} · {p.spentLabel}
              </span>
              {p.overdue > 0 ? <Chip tone="orange">−{p.overdue}</Chip> : <span style={{ color: hs.color }}>{p.healthLabel}</span>}
            </div>
          </div>
        );
      })}

      <div className="flex h-11 items-center justify-between px-4" style={{ borderBottom: line }}>
        <MonoLabel color={T.ink}>Чтение дня</MonoLabel>
        <Glyph name="book" size={12} color={T.ink3} />
      </div>
      {m.reading ? (
        <a
          href={m.reading.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="group grid grid-cols-[56px_minmax(0,1fr)] gap-3 px-4 py-3 transition-colors hover:bg-[#0D0D0D]"
          style={{ borderBottom: line }}
        >
          <span className="h-14 w-14 overflow-hidden" style={{ background: T.raised }}>
            {m.reading.coverUrl && <img src={m.reading.coverUrl} alt="" className="h-full w-full object-cover" style={{ filter: "grayscale(1) contrast(1.2)" }} />}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 group-hover:text-white" style={sans(13, 500, { color: T.ink })}>{m.reading.title}</span>
            <span className="mt-1 block" style={mono(10, { color: T.ink3 }, true)}>{m.reading.domain ?? m.reading.type}</span>
          </span>
        </a>
      ) : (
        <Empty title="Очередь пуста" icon="book" className="h-[88px]" />
      )}
      <div className="flex h-11 items-center justify-between px-4" style={{ borderBottom: line }}>
        <MonoLabel color={T.ink}>Быстрая заметка</MonoLabel>
        <Glyph name="notes" size={12} color={T.ink3} />
      </div>
      <div id="t2-note" className="h-[128px]" style={{ borderBottom: line }}>
        <NoteBox onSave={m.actions.saveNote} rows={3} />
      </div>
      <Hatch className="min-h-6 flex-1" />
    </aside>
  );
}
