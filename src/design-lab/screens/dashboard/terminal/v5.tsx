/**
 * Dashboard · Data Terminal · v5 «Командная строка»
 * Minimal shell: a thin top bar whose navigation is a row of keyboard-shortcut labels (g d, g t …),
 * a centred command prompt («› добавить …», Enter runs it — plain text adds a task; «заметка …»,
 * «готово 2», «перенести», «помощь» are commands), a session log, and below it the whole dashboard
 * as a log-style feed: [ ] / [x] plan lines, overdue in orange, ASCII bars █░ for projects and
 * status, a block-character sparkline for the rhythm, a text heat-map for the half-year, a dotted
 * ledger for money. A vim-like status line closes the screen.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useDashboardModel, rub, type DashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";
import { T, mono, sans, pad2, StatusSquare, useNow, stamp, hm } from "@/design-lab/screens/_kit/terminal";

const KEYS: Record<string, string> = {
  dashboard: "d",
  clients: "c",
  projects: "p",
  tasks: "t",
  planner: "l",
  notes: "n",
  analytics: "a",
  knowledge: "k",
};

const ASCII = '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

function bar(pct: number, width = 24) {
  const on = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return { on: "█".repeat(on), off: "░".repeat(width - on) };
}

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

interface LogLine {
  t: string;
  cmd: string;
  out: string;
  tone: "ok" | "err" | "info";
}

function Kbd({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className="inline-grid h-[18px] min-w-[18px] place-items-center px-1"
      style={{ ...mono(10, { lineHeight: 1, color: active ? "#000" : T.ink2 }), background: active ? T.lime : "#161616", boxShadow: active ? undefined : `inset 0 0 0 1px ${T.line2}`, borderRadius: 2 }}
    >
      {children}
    </span>
  );
}

/** «── ПЛАН ДНЯ ──────────── 0/5 ──» */
function Rule({ label, meta, metaColor = T.ink3 }: { label: string; meta?: ReactNode; metaColor?: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 pt-1" style={mono(11, { color: T.ink3 }, true)}>
      <span style={{ color: T.ink4 }}>──</span>
      <span style={{ color: T.ink, letterSpacing: "0.12em" }}>{label}</span>
      <span className="h-px flex-1" style={{ backgroundImage: `linear-gradient(90deg, ${T.ink4} 50%, transparent 50%)`, backgroundSize: "6px 1px" }} />
      {meta != null && <span style={{ color: metaColor }}>{meta}</span>}
      <span style={{ color: T.ink4 }}>──</span>
    </div>
  );
}

function Leader({ k, v, color = T.ink }: { k: ReactNode; v: ReactNode; color?: string }) {
  return (
    <div className="flex items-baseline gap-2" style={mono(13)}>
      <span style={{ color: T.ink2 }}>{k}</span>
      <span className="relative top-[-3px] flex-1" style={{ borderBottom: `1px dotted ${T.ink4}` }} />
      <span style={{ color }}>{v}</span>
    </div>
  );
}

export default function TerminalV5() {
  const m = useDashboardModel();
  const now = useNow();
  const st = stamp(now);
  const [cmd, setCmd] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [gMode, setGMode] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses the prompt; "g" then a letter flashes the matching section key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.key === "g") {
        setGMode(true);
        setTimeout(() => setGMode(false), 1200);
        return;
      }
      if (gMode) {
        const id = Object.entries(KEYS).find(([, k]) => k === e.key)?.[0];
        if (id) {
          setFlash(id);
          setTimeout(() => setFlash(null), 700);
        }
        setGMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gMode]);

  const push = (c: string, out: string, tone: LogLine["tone"] = "ok") =>
    setLog((l) => [...l.slice(-5), { t: stamp(new Date()).time, cmd: c, out, tone }]);

  const run = (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setHist((h) => [...h, c]);
    setHi(-1);
    setCmd("");
    const [head, ...rest] = c.split(/\s+/);
    const tail = rest.join(" ");
    const h = head.toLowerCase();
    if (h === "помощь" || h === "help" || h === "?") {
      push(c, "текст — задача · заметка <текст> · готово <№> · встреча <№> · перенести · очистить", "info");
    } else if (h === "очистить" || h === "clear") {
      setLog([]);
    } else if (h === "заметка" || h === "з") {
      if (!tail) return push(c, "нужен текст: заметка <текст>", "err");
      m.actions.saveNote(tail);
      push(c, `заметка сохранена · ${tail.length} симв`);
    } else if (h === "перенести") {
      if (!m.overPlan.length) return push(c, "сверх плана пусто — переносить нечего", "info");
      push(c, `на завтра: ${m.overPlan.length}`);
      m.actions.moveOverPlanToTomorrow();
    } else if ((h === "готово" || h === "x") && /^\d+$/.test(tail)) {
      const r = m.plan[Number(tail) - 1];
      if (!r) return push(c, `нет строки ${tail} в плане`, "err");
      m.actions.toggle(r.id);
      push(c, `${r.done ? "вернул" : "закрыл"}: ${r.title}`);
    } else if (h === "встреча" && /^\d+$/.test(tail)) {
      const x = m.meetings[Number(tail) - 1];
      if (!x) return push(c, `нет встречи ${tail}`, "err");
      m.actions.toggleMeeting(x.id);
      push(c, `${x.done ? "вернул" : "отметил"}: ${x.title}`);
    } else {
      m.actions.add(c);
      push(c, "добавлено в план на сегодня");
    }
  };

  const doneN = m.plan.filter((r) => r.done).length;
  const max14 = Math.max(1, ...m.dynamics.map((d) => d.value));
  const yMax = Math.max(1, ...m.year.map((d) => d.value));
  const openSum = Math.max(1, m.status.openByPriority.reduce((s, p) => s + p.count, 0));

  return (
    <div className="flex min-h-screen flex-col" style={{ background: T.bg, color: T.ink, fontFamily: T.mono }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex h-9 items-center gap-6 px-4" style={{ background: T.bg, borderBottom: `1px solid ${T.line}` }}>
        <span className="flex shrink-0 items-center gap-2" style={mono(11, { color: T.ink2 })}>
          <StatusSquare blink size={6} />
          <span style={{ color: T.ink }}>рабочий-стол</span>
          <span style={{ color: T.ink4 }}>~/дашборд</span>
        </span>
        <nav className="flex min-w-0 flex-1 items-center justify-center gap-4 overflow-hidden">
          {m.nav.map((n) => {
            const active = n.id === "dashboard";
            const lit = flash === n.id;
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                className="group flex shrink-0 items-center gap-1.5 outline-none focus-visible:underline"
                style={mono(11, { color: active || lit ? T.ink : T.ink3 })}
              >
                <Kbd active={gMode}>g</Kbd>
                <Kbd active={lit || (active && !gMode)}>{KEYS[n.id] ?? "·"}</Kbd>
                <span className="transition-colors group-hover:text-white">{n.label.toLowerCase()}</span>
                {n.badge ? <span style={{ color: T.lime }}>{n.badge}</span> : null}
              </a>
            );
          })}
        </nav>
        <span className="flex shrink-0 items-center gap-3" style={mono(11, { color: T.ink3 })}>
          {m.kpi.gamification && <span>ур {pad2(m.kpi.level)}</span>}
          <span style={{ color: T.ink }}>{st.time}</span>
        </span>
      </header>

      <main className="mx-auto w-full max-w-[1040px] flex-1 px-6 pb-20 pt-14">
        {/* ── Prompt ──────────────────────────────────────────────────────────── */}
        <div className="mb-3 flex items-baseline justify-between" style={mono(12, { color: T.ink3 })}>
          <span>
            <span style={{ color: T.ink }}>{m.greeting.toLowerCase()}</span> · {m.dateLabel.toLowerCase()}
          </span>
          <span>
            сессия {st.date.toLowerCase()}
          </span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(cmd);
          }}
          className="group flex h-16 items-center gap-4 px-5 transition-shadow focus-within:[box-shadow:inset_0_0_0_1px_#C8FF00]"
          style={{ background: "#0B0B0B", boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3 }}
        >
          <span style={mono(22, { color: T.lime, lineHeight: 1 })}>›</span>
          <input
            ref={inputRef}
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" && hist.length) {
                e.preventDefault();
                const i = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1);
                setHi(i);
                setCmd(hist[i]);
              } else if (e.key === "ArrowDown" && hi >= 0) {
                e.preventDefault();
                const i = hi + 1;
                if (i >= hist.length) {
                  setHi(-1);
                  setCmd("");
                } else {
                  setHi(i);
                  setCmd(hist[i]);
                }
              }
            }}
            placeholder="добавить … — «созвон с Пашей завтра 15:00 !важно»"
            aria-label="Командная строка: текст добавит задачу"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#474747]"
            style={mono(18, { color: T.ink, caretColor: T.lime })}
          />
          <span className="flex shrink-0 items-center gap-1.5" style={mono(10, { color: T.ink3 }, true)}>
            <Kbd active={!!cmd}>↵</Kbd> выполнить
          </span>
        </form>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1" style={mono(11, { color: T.ink3 })}>
          {[
            ["/", "фокус"],
            ["↑", "история"],
          ].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5">
              <Kbd>{k}</Kbd> {l}
            </span>
          ))}
          {["заметка …", "готово 2", "перенести", "помощь"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCmd(c.replace(" …", " "));
                inputRef.current?.focus();
              }}
              className="hover:text-white"
              style={{ color: T.ink2 }}
            >
              <span style={{ color: T.ink4 }}>›</span> {c}
            </button>
          ))}
        </div>

        {/* session log */}
        <div className="mt-5 flex min-h-[64px] flex-col gap-1.5 py-1 pl-4" style={{ borderLeft: `1px solid ${T.line2}`, ...mono(12) }}>
          {log.length === 0 ? (
            <>
              <span style={{ color: T.ink3 }}>
                [{st.time}] сеанс открыт · в плане {m.plan.length}, закрыто {doneN}
                {m.kpi.overdueToday ? (
                  <>
                    , <span style={{ color: T.orange }}>просрочено {m.kpi.overdueToday}</span>
                  </>
                ) : null}
              </span>
              <span style={{ color: T.ink4 }}>введите текст задачи или «помощь»</span>
            </>
          ) : (
            log.map((l, i) => (
              <span key={i} className="flex flex-col">
                <span style={{ color: T.ink3 }}>
                  [{l.t}] <span style={{ color: T.ink2 }}>› {l.cmd}</span>
                </span>
                <span style={{ color: l.tone === "err" ? T.orange : l.tone === "info" ? T.ink2 : T.lime }}>
                  {"  "}
                  {l.tone === "err" ? "✕" : l.tone === "info" ? "i" : "✓"} {l.out}
                </span>
              </span>
            ))
          )}
        </div>

        {/* ── Feed ────────────────────────────────────────────────────────────── */}
        <section className="mt-12">
          <Rule
            label="План дня"
            meta={
              <>
                {doneN}/{m.plan.length} · время {m.kpi.timeLabel}
                {m.kpi.overdueToday ? <span style={{ color: T.orange }}> · просрочено {m.kpi.overdueToday}</span> : null}
              </>
            }
          />
          {m.plan.length === 0 && <div style={mono(13, { color: T.ink3 })}>— план пуст. наберите задачу в строке выше.</div>}
          {m.plan.map((r, i) => (
            <PlanLine key={r.id} r={r} i={i} onToggle={() => m.actions.toggle(r.id)} />
          ))}
        </section>

        <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-10">
          <section className="min-w-0">
            <Rule label="Сверх плана" meta={m.overPlan.length} metaColor={m.overPlan.length ? T.orange : T.ink3} />
            {m.overPlan.length === 0 ? (
              <div style={mono(13, { color: T.ink3 })}>— всё помещается в лимит фокуса.</div>
            ) : (
              <>
                {m.overPlan.slice(0, 7).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => m.actions.toggle(r.id)}
                    aria-label={`Готово: ${r.title}`}
                    className="flex h-7 w-full items-center gap-3 text-left hover:text-white"
                    style={mono(12, { color: T.ink2 })}
                  >
                    <span style={{ color: T.ink4 }}>{r.done ? "[x]" : "[ ]"}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span style={{ color: r.overdue ? "#b0532e" : T.ink4 }}>{dd(r)}</span>
                  </button>
                ))}
                <div className="mt-2 flex items-center justify-between" style={mono(12, { color: T.ink3 })}>
                  <span>{m.overPlan.length > 7 ? `… ещё ${m.overPlan.length - 7}` : ""}</span>
                  <button type="button" onClick={() => run("перенести")} className="hover:text-white" style={{ color: T.lime }}>
                    › перенести на завтра
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="min-w-0">
            <Rule label="Встречи" meta={m.meetings.filter((x) => !x.done).length} />
            {m.meetings.length === 0 ? (
              <pre className="whitespace-pre-wrap" style={mono(12, { color: T.ink3, lineHeight: 1.6 })}>
                {`— встреч нет.\n  календарь чист: можно уйти в глубокую работу.\n  `}
                <span style={{ color: T.ink4 }}>{"08 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ 20"}</span>
              </pre>
            ) : (
              m.meetings.slice(0, 7).map((x, i) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => m.actions.toggleMeeting(x.id)}
                  className="flex h-7 w-full items-center gap-3 text-left hover:text-white"
                  style={mono(12, { color: x.done ? T.ink4 : T.ink })}
                >
                  <span style={{ color: T.ink4 }}>{x.done ? "[x]" : "[ ]"}</span>
                  <span style={{ color: T.ink3 }}>{pad2(i + 1)}</span>
                  <span>{x.time}</span>
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  <span style={{ color: T.ink3 }}>{x.dateLabel.toLowerCase()}</span>
                </button>
              ))
            )}
          </section>

          <section className="min-w-0">
            <Rule label="Ритм · 14 дней" meta={`${m.closed14} закрыто · пик ${m.peak14}`} />
            <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] items-end" style={{ fontFamily: ASCII, fontSize: 34, lineHeight: 1 }}>
              {m.dynamics.map((d, i) => {
                const lvl = d.value ? Math.max(0, Math.round((d.value / max14) * 7)) : -1;
                const last = i === m.dynamics.length - 1;
                return (
                  <span key={d.date} title={`${d.label}: ${d.value}`} className="text-center" style={{ color: last ? T.lime : d.value === m.peak14 ? T.ink : T.ink2 }}>
                    {lvl < 0 ? <span style={{ color: T.ink5 }}>▁</span> : SPARK[lvl]}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-[repeat(14,minmax(0,1fr))]" style={mono(10, { color: T.ink4 })}>
              {m.dynamics.map((d, i) => (
                <span key={d.date} className="text-center" style={{ color: i === m.dynamics.length - 1 ? T.lime : undefined }}>
                  {d.value}
                </span>
              ))}
            </div>
            <div className="mt-1 flex justify-between" style={mono(10, { color: T.ink4 })}>
              <span>{m.dynamics[0].label}</span>
              <span style={{ color: T.lime }}>сегодня</span>
            </div>
          </section>

          <section className="min-w-0">
            <Rule label="Статус" meta={`открыто ${m.kpi.openCount}`} />
            <div className="flex flex-col gap-1.5">
              <div style={mono(12, { color: T.ink2 })}>
                выполнено <span style={{ color: T.ink }}>{m.status.doneAll}</span> · в работе <span style={{ color: T.ink }}>{m.status.inProgress}</span> · просрочено{" "}
                <span style={{ color: m.status.overdueAll ? T.orange : T.ink }}>{m.status.overdueAll}</span>
              </div>
              <div className="h-2" />
              {m.status.openByPriority.map((p) => {
                const b = bar((p.count / openSum) * 100, 22);
                return (
                  <div key={p.priority} className="grid grid-cols-[120px_minmax(0,1fr)_32px] items-center gap-3" style={mono(12)}>
                    <span style={{ color: T.ink3 }}>{p.label.toLowerCase()}</span>
                    <span className="truncate" style={{ fontFamily: ASCII, letterSpacing: "1px" }}>
                      <span style={{ color: p.priority === 1 ? T.ink : T.ink2 }}>{b.on}</span>
                      <span style={{ color: T.ink5 }}>{b.off}</span>
                    </span>
                    <span className="text-right" style={{ color: T.ink }}>{p.count}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="mt-10">
          <Rule label="Проекты" meta={m.projects.length} />
          {m.projects.length === 0 && <div style={mono(13, { color: T.ink3 })}>— проектов нет.</div>}
          {m.projects.map((p) => {
            const b = bar(p.pct, 32);
            const color = p.health === "off-track" ? T.orange : p.health === "on-track" || p.health === "done" ? T.lime : T.ink2;
            return (
              <div key={p.id} className="grid h-7 grid-cols-[180px_minmax(0,1fr)_48px_64px_48px_96px] items-center gap-4" style={mono(12)}>
                <span className="truncate" style={{ color: T.ink }}>{p.name}</span>
                <span className="truncate" style={{ fontFamily: ASCII, letterSpacing: "1px" }}>
                  <span style={{ color: p.health === "off-track" ? T.orange : T.ink }}>{b.on}</span>
                  <span style={{ color: T.ink5 }}>{b.off}</span>
                </span>
                <span className="text-right" style={{ color: T.ink }}>{Math.round(p.pct)}%</span>
                <span className="text-right" style={{ color: T.ink3 }}>
                  {p.done}/{p.total}
                </span>
                <span className="text-right" style={{ color: T.ink3 }}>{p.spentLabel}</span>
                <span className="text-right" style={{ color }}>{p.healthLabel.toLowerCase()}</span>
              </div>
            );
          })}
        </section>

        <section className="mt-10">
          <Rule label="Полгода" meta={`${m.year.reduce((s, d) => s + d.value, 0)} закрыто`} />
          <div className="flex items-start gap-8">
            <div className="grid" style={{ gridTemplateRows: "repeat(7, 14px)", gridAutoFlow: "column", gridAutoColumns: "14px", fontFamily: ASCII, fontSize: 13, lineHeight: "14px" }}>
              {m.year.map((d, i) => {
                const f = d.value / yMax;
                const last = i === m.year.length - 1;
                const color = last ? T.lime : !d.value ? T.ink5 : f > 0.66 ? T.ink : f > 0.33 ? T.ink2 : T.ink3;
                return (
                  <span key={d.date} title={`${d.date}: ${d.value}`} className="grid place-items-center" style={{ color }}>
                    {d.value || last ? "■" : "·"}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-col gap-1" style={mono(11, { color: T.ink3 })}>
              <span>
                <span style={{ fontFamily: ASCII, color: T.ink5 }}>·</span> 0
              </span>
              <span>
                <span style={{ fontFamily: ASCII }}><span style={{ color: T.ink3 }}>■</span><span style={{ color: T.ink2 }}>■</span><span style={{ color: T.ink }}>■</span></span> мало → пик · <span style={{ color: T.lime, fontFamily: ASCII }}>■</span> сегодня
              </span>
              <span>
                серия <span style={{ color: T.ink }}>{m.kpi.streak}</span> дн · лучшая <span style={{ color: T.ink }}>{m.kpi.bestStreak}</span>
              </span>
              <span>
                неделя <span style={{ color: T.ink }}>{m.kpi.weekDone}</span> · цель/день <span style={{ color: T.ink }}>{m.kpi.dailyGoal}</span>
              </span>
            </div>
          </div>
        </section>

        <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-10">
          <section className="min-w-0">
            <Rule label="Деньги · ledger" meta="месяц" />
            <div className="flex flex-col gap-2">
              <Leader k="оплачено в этом месяце" v={rub(m.money.paidThisMonth)} color={m.money.paidThisMonth ? T.lime : T.ink} />
              <Leader k="ожидается" v={rub(m.money.pending)} />
              <Leader k="просрочено" v={rub(m.money.overdue)} color={m.money.overdue ? T.orange : T.ink} />
              <Leader k="получено всего" v={rub(m.money.paidTotal)} color={T.ink2} />
              <div className="mt-2" style={mono(12, { color: m.followUps.length ? T.orange : T.ink4 })}>
                {m.followUps.length ? `! напомнить: ${m.followUps.map((f) => f.name).join(", ")}` : "— напоминаний клиентам нет"}
              </div>
            </div>
          </section>

          <section className="min-w-0">
            <Rule label="Чтение · заметка" />
            {m.reading ? (
              <div style={mono(13, { color: T.ink2, lineHeight: 1.6 })}>
                <span style={{ color: T.ink4 }}>$ open </span>
                <a href={m.reading.url ?? "#"} target="_blank" rel="noreferrer" className="underline decoration-[#3f3f3f] underline-offset-4 hover:text-white hover:decoration-white" style={{ ...sans(14, 500), color: T.ink }}>
                  {m.reading.title}
                </a>
                <span style={{ color: T.ink4 }}> — {m.reading.domain ?? m.reading.type}</span>
              </div>
            ) : (
              <div style={mono(13, { color: T.ink3 })}>— очередь чтения пуста.</div>
            )}
            <div className="mt-4" style={{ boxShadow: `inset 0 0 0 1px ${T.line2}`, borderRadius: 3 }}>
              <div className="flex h-7 items-center justify-between px-3" style={{ borderBottom: `1px solid ${T.line}`, ...mono(11, { color: T.ink3 }) }}>
                <span>
                  <span style={{ color: T.ink4 }}>$</span> cat &gt;&gt; заметки.md
                </span>
                <span>ctrl ↵</span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && note.trim()) {
                    m.actions.saveNote(note);
                    push("заметка", "заметка сохранена");
                    setNote("");
                  }
                }}
                rows={3}
                placeholder="быстрая заметка…"
                aria-label="Быстрая заметка"
                className="block w-full resize-none bg-transparent px-3 py-2 outline-none placeholder:text-[#474747]"
                style={mono(12, { color: T.ink, lineHeight: 1.6 })}
              />
              <div className="flex h-8 items-center justify-end px-3" style={{ borderTop: `1px solid ${T.line}` }}>
                <button
                  type="button"
                  disabled={!note.trim()}
                  onClick={() => {
                    m.actions.saveNote(note);
                    push("заметка", "заметка сохранена");
                    setNote("");
                  }}
                  style={mono(11, { color: note.trim() ? T.lime : T.ink4 })}
                  className="enabled:hover:text-white"
                >
                  :w сохранить
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ── Status line ─────────────────────────────────────────────────────── */}
      <footer className="sticky bottom-0 z-20 flex h-7 items-center gap-0 pr-4" style={{ background: "#0B0B0B", borderTop: `1px solid ${T.line}`, ...mono(11, { color: T.ink3 }) }}>
        <span className="flex h-full items-center px-3" style={{ background: T.lime, color: "#000", fontWeight: 600, letterSpacing: "0.08em" }}>
          {gMode ? "G-" : "NORMAL"}
        </span>
        <span className="flex h-full items-center px-3" style={{ background: "#161616", color: T.ink2 }}>
          дашборд
        </span>
        <span className="ml-4 flex items-center gap-4">
          <span>
            план <span style={{ color: T.ink }}>{doneN}/{m.plan.length}</span>
          </span>
          <span>
            время <span style={{ color: T.ink }}>{m.kpi.timeLabel}</span>
          </span>
          <span>
            открыто <span style={{ color: T.ink }}>{m.kpi.openCount}</span>
          </span>
          <span>
            просрочено <span style={{ color: m.status.overdueAll ? T.orange : T.ink }}>{m.status.overdueAll}</span>
          </span>
        </span>
        <span className="ml-auto">
          utf-8 · ru · {st.time}
        </span>
      </footer>
    </div>
  );
}

function dd(r: TodayRow) {
  if (!r.due) return "--.--";
  const [, mo, d] = r.due.split("-");
  return `${d}.${mo}`;
}

function PlanLine({ r, i, onToggle }: { r: TodayRow; i: number; onToggle: () => void }) {
  const tone = r.done ? T.ink4 : r.overdue ? T.orange : T.ink;
  return (
    <div className="group grid h-8 grid-cols-[32px_28px_minmax(0,1fr)_120px_68px_52px_44px] items-center gap-3 transition-colors hover:bg-[#0B0B0B]" style={mono(13)}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={r.done}
        aria-label={r.done ? `Вернуть: ${r.title}` : `Готово: ${r.title}`}
        className="text-left outline-none transition-colors hover:text-white focus-visible:text-[#C8FF00]"
        style={{ color: r.done ? T.lime : T.ink2 }}
      >
        {r.done ? "[x]" : "[ ]"}
      </button>
      <span style={{ color: T.ink4 }}>{pad2(i + 1)}</span>
      <span className="truncate" style={{ ...sans(14, 400), color: r.done ? T.ink4 : T.ink, textDecoration: r.done ? "line-through" : undefined }}>
        {r.title}
      </span>
      <span className="truncate" style={{ color: T.ink3, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {r.projectName ?? "—"}
      </span>
      <span style={{ color: r.priority === 1 ? T.ink : T.ink3, fontSize: 11 }}>
        {r.priority === 1 ? "!!!" : r.priority === 2 ? "!!" : r.priority === 3 ? "!" : "·"} {r.priorityShort.toLowerCase()}
      </span>
      <span className="text-right" style={{ color: tone === T.ink ? T.ink2 : tone, fontSize: 12 }}>
        {dd(r)}
      </span>
      <span className="text-right" style={{ color: r.spentMin ? T.ink : T.ink4, fontSize: 12 }}>
        {hm(r.spentMin)}
      </span>
    </div>
  );
}
