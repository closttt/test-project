/**
 * Dashboard · Bondar Editorial · v2 «Таймлайн дня»
 * Shell: top navigation (wordmark left, «1.0 Дашборд …» as text with a lime 2px underline under the
 * active item, level + lime CTA right) — no sidebar.
 * Composition: the page IS the day. Three columns hold a vertical hour ruler 08:00–22:00 with the
 * plan's timed tasks and meetings placed on it (past hours hatched, a lime «now» line), untimed tasks
 * stacked in an «В течение дня» lane above the ruler. The fourth column is a stack of big numerals
 * (KPIs), the 14-day rhythm and status. Below the fold: projects table, money plate, reading, note.
 */
import { useEffect, useMemo, useState } from "react";

import { useDashboardModel, rub, type TodayRow } from "@/design-lab/screens/dashboardModel";
import { useData } from "@/store/DataProvider";
import { localDayStr } from "@/lib/format";
import {
  B,
  T,
  tab,
  pad2,
  grid4,
  ColumnGrid,
  Signal,
  Chip,
  PIX,
  PRIORITY_BARS,
  Cells,
  Check,
  Dither,
  DitherField,
  Button,
  KV,
  Hook,
  Sparkle,
  Matrix,
  hatch,
  bars,
  deck,
  healthColor,
  plural,
} from "@/design-lab/screens/_kit/bondar";

const START_H = 8;
const END_H = 22;
const HOUR = 72; // px per hour on the ruler
const PAST = 24; // past hours are compressed — the page opens on «now», not on the morning
const RULER_LABEL = 72; // time column

interface Slot {
  key: string;
  kind: "task" | "meeting" | "block";
  start: number; // minutes from midnight
  dur: number;
  title: string;
  sub?: string;
  done: boolean;
  late?: boolean;
  lateLabel?: string;
  priority?: number;
  onToggle?: () => void;
  col: number;
  cols: number;
}

const hhmm = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

/** Time of a plan task: planner block today → reminder today → «в 14:00» in the title. */
function timeOf(r: TodayRow, blocks: { taskId?: string; startMin: number; durationMin: number }[], today: string) {
  const b = blocks.find((x) => x.taskId === r.id);
  if (b) return { start: b.startMin, dur: b.durationMin };
  const ra = r.task.remindAt;
  if (ra && ra.startsWith(today)) {
    const [h, mm] = ra.slice(11, 16).split(":").map(Number);
    if (!Number.isNaN(h)) return { start: h * 60 + (mm || 0), dur: r.estimateMin || 60 };
  }
  const m = r.title.match(/(?:^|\s)(?:в\s)?([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/);
  if (m) return { start: +m[1] * 60 + +m[2], dur: r.estimateMin || 60 };
  return null;
}

/** Greedy column packing for overlapping slots. */
function pack(slots: Omit<Slot, "col" | "cols">[]): Slot[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const out: Slot[] = [];
  let cluster: Slot[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((s) => s.col + 1));
    cluster.forEach((s) => (s.cols = cols));
    out.push(...cluster);
    cluster = [];
  };
  for (const s of sorted) {
    if (s.start >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.start + c.dur > s.start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...s, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, s.start + s.dur);
  }
  if (cluster.length) flush();
  return out;
}

function useNowMin() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now.getHours() * 60 + now.getMinutes();
}

export default function BondarV2() {
  const m = useDashboardModel();
  const { planBlocks } = useData();
  const nowMin = useNowMin();
  const today = localDayStr();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  const { untimed, slots, meetingsToday, meetingsLater } = useMemo(() => {
    const blocks = (planBlocks ?? []).filter((b) => b.date === today);
    const untimedRows: TodayRow[] = [];
    const raw: Omit<Slot, "col" | "cols">[] = [];
    for (const r of m.plan) {
      const t = timeOf(r, blocks, today);
      if (!t) {
        untimedRows.push(r);
        continue;
      }
      raw.push({
        key: `t-${r.id}`,
        kind: "task",
        start: t.start,
        dur: Math.max(30, t.dur),
        title: r.title,
        sub: r.projectName,
        lateLabel: r.overdue ? `просрочено с ${r.dueLabel}` : undefined,
        done: r.done,
        late: r.overdue,
        priority: r.priority,
        onToggle: () => m.actions.toggle(r.id),
      });
    }
    for (const b of blocks.filter((b) => !b.taskId)) {
      raw.push({ key: `b-${b.id}`, kind: "block", start: b.startMin, dur: b.durationMin, title: b.title, done: !!b.done });
    }
    const mt = m.meetings.filter((x) => x.date === today);
    for (const x of mt) {
      const [h, mm] = x.time.split(":").map(Number);
      raw.push({
        key: `m-${x.id}`,
        kind: "meeting",
        start: h * 60 + (mm || 0),
        dur: Math.max(30, x.durationMin || 30),
        title: x.title,
        sub: x.clientName,
        done: !!x.done,
        onToggle: () => m.actions.toggleMeeting(x.id),
      });
    }
    return { untimed: untimedRows, slots: pack(raw), meetingsToday: mt, meetingsLater: m.meetings.filter((x) => x.date !== today) };
  }, [m, planBlocks, today]);

  const dayStart = START_H * 60;
  const dayEnd = END_H * 60;
  // Ruler geometry: hours before the current one collapse to PAST px, the rest get the full HOUR.
  // Hours holding a slot never collapse, so a past-due slot keeps its full height.
  const firstSlotH = slots.length ? Math.floor(Math.min(...slots.map((s) => s.start)) / 60) : END_H;
  const firstFull = Math.min(Math.max(Math.min(Math.floor(nowMin / 60), firstSlotH), START_H), END_H);
  const hourH = (h: number) => (h < firstFull ? PAST : HOUR);
  const hourTop = (h: number) => (h <= firstFull ? (h - START_H) * PAST : (firstFull - START_H) * PAST + (h - firstFull) * HOUR);
  const yOf = (min: number) => {
    const c = Math.min(Math.max(min, dayStart), dayEnd);
    const h = Math.floor(c / 60);
    return hourTop(h) + ((c % 60) / 60) * hourH(h);
  };
  const nowY = yOf(nowMin);
  const nowInDay = nowMin >= dayStart && nowMin <= dayEnd;
  const maxDay = Math.max(1, ...m.dynamics.map((d) => d.value));
  const statusTotal = Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll);

  const kpis = [
    {
      k: "Сегодня",
      v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`,
      sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просрочено` : "без просрочек",
      hot: m.kpi.overdueToday > 0,
      sig: bars(m.kpi.todayTotal ? m.kpi.todayDone / m.kpi.todayTotal : 0),
    },
    { k: "Время", v: m.kpi.timeLabel, sub: `цель ${m.kpi.dailyGoal} задач в день`, sig: bars(m.kpi.minutesToday / 240) },
    { k: "Открыто", v: String(m.kpi.openCount), sub: `${m.status.overdueAll} с просрочкой`, sig: bars(1 - m.status.overdueAll / Math.max(1, m.kpi.openCount)) },
    { k: "За неделю", v: String(m.kpi.weekDone), sub: `серия ${m.kpi.streak} ${plural(m.kpi.streak, "день", "дня", "дней")}`, sig: bars(m.kpi.weekDone / (m.kpi.dailyGoal * 7)) },
  ];

  return (
    <div className="relative min-h-screen antialiased" style={{ background: B.bg, color: B.text, fontFamily: B.font }}>
      <ColumnGrid />

      {/* ── Top navigation ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 flex h-16 items-center gap-8 px-5"
        style={{ background: B.bg, borderBottom: `1px solid ${B.l10}` }}
      >
        <a href="#" onClick={(e) => e.preventDefault()} className="flex shrink-0 items-center gap-3 outline-none">
          <Matrix value={5} cell={7} />
          <span style={T.title}>Рабочий стол</span>
        </a>
        <nav className="flex h-full min-w-0 items-stretch">
          {m.nav.map((n, i) => {
            const active = n.id === "dashboard";
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-current={active ? "page" : undefined}
                className="group relative flex items-center gap-[6px] px-[10px] outline-none transition-colors duration-200 hover:bg-[#101010] focus-visible:bg-[#101010]"
              >
                <span className="max-[1399px]:hidden" style={{ ...T.num, fontSize: 11, color: active ? B.lime : B.text3 }}>{i + 1}.0</span>
                <span className="whitespace-nowrap transition-colors duration-200 group-hover:text-white" style={{ ...T.body, color: active ? B.text : B.text2 }}>
                  {n.label}
                </span>
                {n.badge ? <span style={{ ...T.num, fontSize: 11, color: B.lime }}>{n.badge}</span> : null}
                <span
                  className="absolute inset-x-[10px] bottom-[-1px] h-[2px] transition-opacity duration-200"
                  style={{ background: active ? B.lime : B.l20, opacity: active ? 1 : 0 }}
                />
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-5">
          <span className="flex items-center gap-2 max-[1399px]:hidden" title={`${m.kpi.xpToNext} XP до следующего уровня`}>
            <span style={{ ...T.meta, color: B.text3 }}>Ур. {m.kpi.level} · {m.kpi.levelTitle}</span>
            <Signal value={bars(m.kpi.levelPct / 100)} />
          </span>
          <Button onClick={() => document.getElementById("b2-add")?.focus()}>Новая задача</Button>
        </div>
      </header>

      {/* ── Masthead ───────────────────────────────────────────────────────────── */}
      <section className="relative px-5 pb-8 pt-8" style={grid4}>
        <div className="col-span-3 min-w-0">
          <Chip icon={PIX.chipCal}>{m.dateLabel}</Chip>
          <h1 className="mt-5" style={T.displayXl}>{m.greeting}</h1>
          <p className="mt-4 max-w-[640px]" style={{ ...T.bodyL, color: B.text2 }}>{deck(m)}</p>
        </div>
        <div className="flex min-w-0 flex-col justify-end">
          <span style={{ ...T.caps, color: B.text3 }}>Сейчас</span>
          <span className="mt-2" style={{ ...T.displayL, ...tab, color: B.lime }}>{hhmm(nowMin)}</span>
          <span className="mt-2" style={{ ...T.meta, color: B.text3 }}>
            {nowMin < dayStart ? "день ещё не начался" : nowMin > dayEnd ? "день закончился" : `до 22:00 — ${Math.floor((dayEnd - nowMin) / 60)} ч ${pad2((dayEnd - nowMin) % 60)} мин`}
          </span>
        </div>
      </section>

      <div className="relative px-5" style={grid4}>
        {/* ── The day ──────────────────────────────────────────────────────────── */}
        <section className="col-span-3 min-w-0" aria-label="День по часам">
          {/* Lane: anytime today */}
          <div style={{ borderTop: `1px solid ${B.l15}` }}>
            <div className="flex">
              <div className="shrink-0 pt-4" style={{ width: RULER_LABEL }}>
                <span style={{ ...T.caps, color: B.text3 }}>Весь
                  <br />день</span>
              </div>
              <div className="min-w-0 flex-1 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <h2 style={T.title}>В течение дня</h2>
                    <span style={{ ...T.num, color: B.text3 }}>{untimed.length}</span>
                  </div>
                  <span className="flex items-center gap-2" style={{ ...T.meta, color: B.text3 }}>
                    <Sparkle size={12} />
                    {meetingsToday.length
                      ? `${meetingsToday.length} ${plural(meetingsToday.length, "встреча", "встречи", "встреч")} на шкале`
                      : "Встреч сегодня нет — шкала свободна"}
                  </span>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-5" style={{ borderTop: `1px solid ${B.l10}` }}>
                  {untimed.map((r) => (
                    <li
                      key={r.id}
                      className="flex h-12 min-w-0 items-center gap-3 transition-colors duration-200 hover:bg-[#101010]"
                      style={{ borderBottom: `1px solid ${B.l10}` }}
                    >
                      <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate"
                          style={{ ...T.bodyStrong, color: r.done ? B.text4 : B.text, textDecoration: r.done ? "line-through" : undefined }}
                        >
                          {r.title}
                        </span>
                        {r.projectName && <span className="block truncate" style={{ ...T.meta, color: B.text3 }}>{r.projectName}</span>}
                      </span>
                      <Signal value={PRIORITY_BARS[r.priority]} on={r.priority === 1 ? B.lime : B.text} w={4} h={10} />
                      <span className="w-12 shrink-0 text-right" style={{ ...T.meta, color: r.overdue ? B.danger : B.text3, ...tab }}>{r.dueLabel}</span>
                    </li>
                  ))}
                  {untimed.length === 0 && (
                    <li className="col-span-2 flex h-12 items-center" style={{ ...T.body, color: B.text3, borderBottom: `1px solid ${B.l10}` }}>
                      Всё в плане стоит на шкале по времени.
                    </li>
                  )}
                </ul>
                <form
                  className="flex h-11 items-center gap-3 transition-colors duration-200 focus-within:!border-[#ADFB0C]"
                  style={{ borderBottom: `1px solid ${B.l10}` }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    m.actions.add(draft);
                    setDraft("");
                  }}
                >
                  <span style={{ color: B.lime }}><Hook size={14} /></span>
                  <input
                    id="b2-add"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Добавить — «созвон 15:00 !важно» встанет на шкалу"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7F7F7F]"
                    style={{ ...T.body, color: B.text }}
                  />
                </form>
                {m.overPlan.length > 0 && (
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="min-w-0 truncate" style={{ ...T.meta, color: B.text3 }}>
                      Сверх плана · {m.overPlan.length}: {m.overPlan.slice(0, 3).map((r) => r.title).join(", ")}…
                    </span>
                    <Button variant="outline" size="sm" onClick={m.actions.moveOverPlanToTomorrow}>Перенести на завтра</Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ruler */}
          <div className="relative mt-2" style={{ height: hourTop(END_H) + 24, borderTop: `1px solid ${B.l15}` }}>
            {/* past hours hatch */}
            {nowMin > dayStart && (
              <div className="absolute right-0 top-0" style={{ left: RULER_LABEL, height: nowY, ...hatch("#121212") }} />
            )}
            {Array.from({ length: END_H - START_H + 1 }, (_, i) => {
              const h = START_H + i;
              const past = h * 60 < nowMin - 59;
              return (
                <div key={h} className="absolute inset-x-0" style={{ top: hourTop(h) }}>
                  <div className="flex items-start">
                    <span
                      className="-mt-[7px] shrink-0"
                      style={{ width: RULER_LABEL, ...T.num, color: past ? B.off : B.text3, background: B.bg }}
                    >
                      {pad2(h)}:00
                    </span>
                    <span className="h-px flex-1" style={{ background: i === 0 ? "transparent" : B.l10 }} />
                  </div>
                  {h < END_H && h >= firstFull && (
                    <span className="absolute h-px" style={{ top: HOUR / 2, left: RULER_LABEL, right: 0, background: B.l5 }} />
                  )}
                </div>
              );
            })}

            {/* slots */}
            <div className="absolute inset-y-0 right-0" style={{ left: RULER_LABEL }}>
              {slots.map((s) => {
                const top = yOf(s.start);
                const h = Math.max(36, yOf(s.start + s.dur) - top - 4);
                const meeting = s.kind === "meeting";
                const block = s.kind === "block";
                return (
                  <div
                    key={s.key}
                    className="group absolute flex gap-3 overflow-hidden px-3 py-2 transition-colors duration-200"
                    style={{
                      top: top + 2,
                      height: h,
                      left: `calc(${(s.col / s.cols) * 100}% + ${s.col ? 4 : 0}px)`,
                      width: `calc(${100 / s.cols}% - ${s.cols > 1 ? 4 : 0}px)`,
                      background: meeting ? B.white : block ? B.s2 : B.s1,
                      color: meeting ? B.bg : B.text,
                      border: `1px solid ${meeting ? B.white : B.lineStrong}`,
                      boxShadow: !meeting && !block && s.priority === 1 ? `inset 2px 0 0 ${B.lime}` : undefined,
                      opacity: s.done ? 0.55 : 1,
                    }}
                  >
                    {s.onToggle && <Check done={s.done} onClick={s.onToggle} label={s.title} tone={meeting ? "light" : "dark"} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span style={{ ...T.num, color: meeting ? "rgba(0,0,0,.55)" : B.text3 }}>
                          {hhmm(s.start)}–{hhmm(Math.min(24 * 60 - 1, s.start + s.dur))}
                        </span>
                        <span style={{ ...T.caps, color: meeting ? "rgba(0,0,0,.55)" : B.text3 }}>
                          {meeting ? "Встреча" : block ? "Блок" : "Задача"}
                        </span>
                      </div>
                      <div
                        className="mt-1 truncate"
                        style={{ ...T.bodyStrong, textDecoration: s.done ? "line-through" : undefined }}
                      >
                        {s.title}
                      </div>
                      {(s.sub || s.lateLabel) && (
                        <div className="truncate" style={{ ...T.meta, color: meeting ? "rgba(0,0,0,.55)" : B.text3 }}>
                          {s.sub}
                          {s.sub && s.lateLabel ? " · " : ""}
                          {s.lateLabel && <span style={{ color: B.danger }}>{s.lateLabel}</span>}
                        </div>
                      )}
                    </div>
                    {s.priority !== undefined && (
                      <Signal value={PRIORITY_BARS[s.priority]} on={s.priority === 1 ? B.lime : B.text} w={4} h={10} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* now */}
            {nowInDay && (
              <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowY - 10 }}>
                <span
                  className="flex h-5 items-center justify-center"
                  style={{ width: RULER_LABEL - 12, background: B.lime, color: B.onLime, ...T.num }}
                >
                  {hhmm(nowMin)}
                </span>
                <span className="h-px flex-1" style={{ marginLeft: 12, background: B.lime }} />
                <span className="h-[6px] w-[6px]" style={{ background: B.lime }} />
              </div>
            )}

            {slots.length === 0 && (
              <div
                className="absolute flex items-center gap-3"
                style={{ left: RULER_LABEL + 16, top: hourTop(Math.min(END_H - 1, firstFull + 1)) + HOUR / 2 - 10, ...T.body, color: B.text3 }}
              >
                <Sparkle size={14} /> На шкале пусто: добавьте время в задачу — «… 15:00» — и она встанет сюда.
              </div>
            )}
          </div>
        </section>

        {/* ── Numerals column ──────────────────────────────────────────────────── */}
        <aside className="min-w-0" style={{ borderTop: `1px solid ${B.l15}` }}>
          {kpis.map((s) => (
            <div key={s.k} className="py-5" style={{ borderBottom: `1px solid ${B.l10}` }}>
              <div className="flex items-center justify-between">
                <span style={{ ...T.caps, color: B.text3 }}>{s.k}</span>
                <Signal value={s.sig} />
              </div>
              <div className="mt-4 truncate" style={{ ...T.displayL, ...tab }}>{s.v}</div>
              <div className="mt-2" style={{ ...T.meta, color: s.hot ? B.danger : B.text3 }}>{s.sub}</div>
            </div>
          ))}

          <div className="py-6" style={{ borderBottom: `1px solid ${B.l10}` }}>
            <div className="flex items-baseline justify-between">
              <span style={{ ...T.caps, color: B.text3 }}>Ритм · 14 дней</span>
              <span style={{ ...T.num, color: B.text3 }}>{m.closed14} · пик {m.peak14}</span>
            </div>
            <div className="relative mt-5 h-[96px]">
              {[0.25, 0.5, 0.75].map((f) => (
                <span key={f} className="absolute inset-x-0 h-px" style={{ bottom: `${f * 100}%`, background: B.l5 }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-[4px]">
                {m.dynamics.map((d, i) => (
                  <span
                    key={d.date}
                    title={`${d.label}: ${d.value}`}
                    className="min-w-[6px] flex-1"
                    style={{
                      height: `${Math.max(2, (d.value / maxDay) * 100)}%`,
                      background: i === m.dynamics.length - 1 ? B.lime : d.value ? B.text : B.off,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.text3 }}>
              <span style={tab}>{m.dynamics[0].label}</span>
              <span>сегодня</span>
            </div>
          </div>

          <div className="py-6" style={{ borderBottom: `1px solid ${B.l10}` }}>
            <span style={{ ...T.caps, color: B.text3 }}>Статус задач</span>
            <div className="mt-4 flex h-2 gap-[2px]">
              <span style={{ flex: m.status.doneAll / statusTotal, background: B.text }} />
              <span style={{ flex: m.status.inProgress / statusTotal, background: B.off }} />
              <span style={{ flex: m.status.overdueAll / statusTotal, background: B.danger }} />
            </div>
            <div className="mt-3">
              <KV k="Выполнено" v={m.status.doneAll} py={8} />
              <KV k="В работе" v={m.status.inProgress} py={8} />
              <KV k="Просрочено" v={m.status.overdueAll} valueColor={m.status.overdueAll ? B.danger : undefined} py={8} />
              {m.status.openByPriority.map((p, i) => (
                <KV
                  key={p.priority}
                  k={<span className="flex items-center gap-2"><Signal value={PRIORITY_BARS[p.priority]} w={4} h={8} />{p.label}</span>}
                  v={p.count}
                  py={8}
                  last={i === m.status.openByPriority.length - 1}
                />
              ))}
            </div>
          </div>

          <div className="py-6">
            <div className="flex items-baseline justify-between">
              <span style={{ ...T.caps, color: B.text3 }}>Встречи дальше</span>
              <span style={{ ...T.num, color: B.text3 }}>{meetingsLater.length}</span>
            </div>
            {meetingsLater.length === 0 ? (
              <div className="mt-4 flex items-center gap-4">
                <DitherField kind="orb" seed={21} color={B.text} accent={B.lime} className="h-14 w-14 shrink-0" cell={3} />
                <p style={{ ...T.body, color: B.text2 }}>В календаре пусто — ни сегодня, ни дальше.</p>
              </div>
            ) : (
              <ul className="mt-3">
                {meetingsLater.slice(0, 4).map((x) => (
                  <li key={x.id} className="flex h-11 items-center gap-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                    <Check done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} size={14} />
                    <span className="min-w-0 flex-1 truncate" style={T.body}>{x.title}</span>
                    <span style={{ ...T.num, color: B.text3 }}>{x.dateLabel} {x.time}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ── After the day ───────────────────────────────────────────────────────── */}
      <div className="relative mt-16 px-5 pb-20" style={grid4}>
        <section className="col-span-2 min-w-0">
          <div className="flex items-baseline gap-3">
            <span style={{ ...T.num, color: B.text3 }}>02</span>
            <h2 style={T.displayS}>Проекты</h2>
          </div>
          <div
            className="mt-5 grid h-8 items-center gap-4"
            style={{ gridTemplateColumns: PROJ_COLS, borderBottom: `1px solid ${B.l15}`, ...T.caps, color: B.text3 }}
          >
            <span>№</span>
            <span>Проект</span>
            <span>Прогресс</span>
            <span>Статус</span>
            <span className="text-right">Время</span>
          </div>
          {m.projects.slice(0, 6).map((p, i) => (
            <div
              key={p.id}
              className="grid h-12 items-center gap-4 transition-colors duration-200 hover:bg-[#101010]"
              style={{ gridTemplateColumns: PROJ_COLS, borderBottom: `1px solid ${B.l10}` }}
            >
              <span style={{ ...T.num, color: B.text3 }}>{pad2(i + 1)}</span>
              <span className="min-w-0 truncate" style={T.bodyStrong}>
                {p.name}
                {p.clientName && <span style={{ ...T.meta, color: B.text3 }}> · {p.clientName}</span>}
              </span>
              <span className="flex items-center gap-3">
                <Cells pct={p.pct} count={16} on={p.health === "off-track" ? B.danger : B.text} />
                <span style={{ ...T.num, color: B.text3 }}>{Math.round(p.pct)}%</span>
              </span>
              <span style={{ ...T.meta, color: healthColor(p.health) }}>
                {p.healthLabel}
                {p.overdue ? ` · ${p.overdue}` : ""}
              </span>
              <span className="text-right" style={{ ...T.meta, color: B.text3, ...tab }}>{p.spentLabel}</span>
            </div>
          ))}
        </section>

        <section className="flex min-w-0 flex-col p-5" style={{ background: B.lime, color: B.onLime }}>
          <div className="flex items-center justify-between">
            <span style={T.caps}>Деньги · месяц</span>
            <Signal value={m.money.overdue > 0 ? 1 : 3} on={B.onLime} off="rgba(0,0,0,.18)" />
          </div>
          <div className="mt-10 truncate" style={{ ...T.displayL, ...tab }}>{rub(m.money.paidThisMonth)}</div>
          <div style={{ ...T.meta, opacity: 0.6 }}>получено в этом месяце</div>
          <div className="mt-auto pt-6">
            <KV tone="lime" k="Ожидается" v={rub(m.money.pending)} py={10} />
            <KV tone="lime" k="Просрочено" v={rub(m.money.overdue)} py={10} />
            <KV tone="lime" k="Всего получено" v={rub(m.money.paidTotal)} py={10} last />
            <div className="flex items-center gap-2 pt-3" style={T.meta}>
              <Hook size={12} />
              {m.followUps.length ? `Напомнить: ${m.followUps.map((f) => f.name).join(", ")}` : "Фоллоу-апов на сегодня нет"}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-6">
          {m.reading && (
            <div>
              <span style={{ ...T.caps, color: B.text3 }}>Прочитать сегодня</span>
              <div className="mt-3 flex gap-4">
                <Dither src={m.reading.coverUrl} className="h-[88px] w-[88px] shrink-0" cell={3} />
                <div className="min-w-0">
                  <div className="line-clamp-3" style={T.bodyStrong}>{m.reading.title}</div>
                  {m.reading.domain && <div className="mt-1" style={{ ...T.meta, color: B.text3 }}>{m.reading.domain}</div>}
                </div>
              </div>
            </div>
          )}
          <form
            className="flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              m.actions.saveNote(note);
              setNote("");
            }}
          >
            <span style={{ ...T.caps, color: B.text3 }}>Заметка</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Мысль, ссылка, итог созвона…"
              className="mt-3 w-full resize-none bg-white/[0.02] p-3 outline-none transition-colors duration-200 placeholder:text-[#7F7F7F] focus:!border-[#ADFB0C]"
              style={{ border: `1px solid ${B.l20}`, ...T.body, color: B.text }}
            />
            <div className="mt-2">
              <Button variant={note.trim() ? "lime" : "outline"} size="sm" type="submit" full>Сохранить заметку</Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

const PROJ_COLS = "24px minmax(0,1fr) 168px 96px 56px";

