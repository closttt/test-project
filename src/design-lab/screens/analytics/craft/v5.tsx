/**
 * Аналитика · Craft Dark · v5 «Итоги» — a review of one CALENDAR MONTH (default: this month so far)
 * against the previous one. Owner's pick: «итоги за месяц, что было сделано, аналитика с прошлым
 * месяцем + возможность смотреть прошлые месяца».
 *
 *   ┌ title «Итоги» ·························· ‹ Октябрь 2026 ⌄ › ┐
 *   │ statement (sticky)      │ месяц к месяцу — 6 numbers + deltas │
 *   │ «В октябре закрыто 23»  │ chart: running totals / by day      │
 *   │ comparison sentence     │ что сделано      │ лучшие дни       │
 *   │ norm ring · buttons     │ проекты          │ календарь        │
 *   │                         │ что осталось     │ фокус и опыт     │
 *   └─────────────────────────┴──────────────────────────────────────┘
 */
import { useState } from "react";
import { ListChecks } from "lucide-react";

import { Btn, C, R, Ring, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import {
  Card,
  Delta,
  useWidth,
  MonthCompareChart,
  MONTHS_SHORT,
  MonthHeat,
  MonthStepper,
  daysWord,
  dur,
  fmtAvg,
  fmtDay,
  fmtShort,
  monthGen,
  monthIn,
  monthName,
  pctDelta,
  tasksWord,
  thisMonth,
  useDialogs,
  useMonthReview,
  type MonthModel,
  type YM,
} from "./_parts";

// ── Left: the statement ──────────────────────────────────────────────────────────────────────

function Statement({ m, onClosed, onOpen, stacked }: { m: MonthModel; onClosed: () => void; onOpen: () => void; stacked?: boolean }) {
  const { cur, cmp, prevFull } = m;
  const d = pctDelta(cur.closed, cmp.closed);
  const cmpText =
    cmp.closed === 0
      ? `${m.isCurrent ? "За те же дни" : "В"} ${m.isCurrent ? monthGen(m.prevYm) : monthIn(m.prevYm)} не было закрытий — сравнивать не с чем.`
      : d === 0
        ? `Ровно столько же, сколько ${m.cmpLabel}.`
        : `Это на ${Math.abs(d!)}% ${d! > 0 ? "больше" : "меньше"}, чем ${m.cmpLabel}, — тогда ${cmp.closed}.`;
  const normPct = (cur.goalDays / m.elapsed) * 100;
  return (
    <div className={`${stacked ? "" : "sticky top-5 self-start"} flex min-w-0 flex-col p-7`} style={{ background: C.card, borderRadius: R.card }} data-lab-block="statement">
      <div style={{ ...T.body, color: C.text3 }}>
        {m.isCurrent ? `1–${m.elapsed} ${monthGen(m.ym)} · месяц ещё идёт` : `${monthName(m.ym)} целиком · ${m.daysInMonth} ${daysWord(m.daysInMonth)}`}
      </div>
      <p className="mt-4" style={{ fontSize: "clamp(30px, 2.7vw, 40px)", lineHeight: 1.08, fontWeight: 500, letterSpacing: "-0.035em" }}>
        В {monthIn(m.ym)} {m.isCurrent ? "пока " : ""}
        {plural(cur.closed, "закрыта", "закрыто", "закрыто")} <span style={{ color: "#5AA9FF" }}>{cur.closed}</span> {tasksWord(cur.closed)}
      </p>
      <p className="mt-5" style={{ ...T.cell, color: C.text2, lineHeight: 1.5 }}>
        {cmpText}
        {m.isCurrent && prevFull.closed > 0 && ` Весь ${monthName(m.prevYm).toLowerCase()} — ${prevFull.closed}.`}
      </p>
      <p className="mt-3" style={{ ...T.cell, color: C.text2, lineHeight: 1.5 }}>
        {cur.closed
          ? `Работа шла ${cur.activeDays} ${daysWord(cur.activeDays)} из ${m.elapsed}, в среднем ${fmtAvg(cur.avgPerActive)} в такой день. Норма в ${m.goal} ${tasksWord(m.goal)} — ${cur.goalDays} ${plural(cur.goalDays, "раз", "раза", "раз")}.`
          : "Ни одной закрытой задачи за этот месяц."}
      </p>

      <div className="mt-7 flex items-center gap-4 pt-6" style={{ ...dashed, backgroundPosition: "left top" }}>
        <Ring pct={normPct} size={56} stroke={5}>
          <span style={{ ...T.foot, ...T.num, color: C.text2 }}>{Math.round(normPct)}%</span>
        </Ring>
        <div>
          <div style={{ ...T.cell, ...T.num }}>
            {cur.goalDays}
            <span style={{ color: C.text3, fontWeight: 400 }}>/{m.elapsed}</span>
          </div>
          <div style={{ ...T.foot, color: C.text3, marginTop: 2 }}>дней с нормой</div>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap gap-2">
        <Btn icon={<ListChecks size={16} strokeWidth={1.75} />} onClick={onClosed}>
          Закрытые · {cur.closed ? m.closedTasks.length : 0}
        </Btn>
        <Btn kind="ghost" onClick={onOpen}>
          Открытые · {m.openTasks.length}
        </Btn>
      </div>
    </div>
  );
}

// ── Right: chapters ──────────────────────────────────────────────────────────────────────────

function Head({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 style={T.title}>{title}</h3>
        {sub && <div className="mt-1" style={{ ...T.body, color: C.text2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Compare({ m }: { m: MonthModel }) {
  const { cur, cmp } = m;
  const items: { label: string; v: number; p: number; fmt?: (n: number) => string }[] = [
    { label: "Закрыто задач", v: cur.closed, p: cmp.closed },
    { label: "Активных дней", v: cur.activeDays, p: cmp.activeDays },
    { label: "Дней с нормой", v: cur.goalDays, p: cmp.goalDays },
    { label: "В активный день", v: cur.avgPerActive, p: cmp.avgPerActive, fmt: fmtAvg },
    { label: "Создано задач", v: cur.created, p: cmp.created },
    { label: "Опыт", v: cur.xp, p: cmp.xp, fmt: (n) => `${n.toLocaleString("ru-RU")} XP` },
  ];
  return (
    <Card block="compare" className="p-6" style={{ gridColumn: "span 2" }}>
      <Head title="Месяц к месяцу" sub={`${monthName(m.ym)} против ${m.isCurrent ? `тех же дней ${monthGen(m.prevYm)}` : monthGen(m.prevYm)}`} />
      <div className="mt-5 grid grid-cols-3 gap-x-6">
        {items.map((it, i) => {
          const f = it.fmt ?? ((n: number) => String(n));
          return (
            <div key={it.label} className="py-4" style={i < 3 ? dashed : undefined}>
              <div style={{ ...T.foot, color: C.text2 }}>{it.label}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="whitespace-nowrap" style={{ ...T.num, fontSize: 26, lineHeight: 1 }}>{f(it.v)}</span>
                <Delta value={pctDelta(Math.round(it.v * 10), Math.round(it.p * 10))} size={24} />
              </div>
              <div className="mt-1.5" style={{ ...T.foot, color: C.text3 }}>
                было {f(it.p)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Chart({ m }: { m: MonthModel }) {
  const [mode, setMode] = useState<"cum" | "daily">("cum");
  return (
    <Card block="chart" className="p-6" style={{ gridColumn: "span 2" }}>
      <Head
        title="Закрытия по дням месяца"
        sub={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-2">
              <span style={{ width: 14, height: 3, borderRadius: 9, background: C.accent }} />
              {monthName(m.ym)} · {m.cur.closed}
            </span>
            <span className="inline-flex items-center gap-2">
              <span style={{ width: 14, height: 0, borderTop: "2px dashed #7A7C84" }} />
              {monthName(m.prevYm)} · {m.prevFull.closed}
            </span>
          </span>
        }
        right={
          <div className="flex items-center gap-1 p-1" style={{ borderRadius: 999, background: C.raise }} role="tablist" aria-label="Вид графика">
            {(
              [
                ["cum", "Накопительно"],
                ["daily", "По дням"],
              ] as const
            ).map(([id, label]) => {
              const on = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setMode(id)}
                  className={`whitespace-nowrap transition-colors duration-150 ${on ? "" : "hover:text-[#F4F5F7]"}`}
                  style={{ height: 32, padding: "0 14px", borderRadius: 999, fontSize: 13, background: on ? "rgba(10,132,255,0.16)" : "transparent", color: on ? C.text : C.text2 }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        }
      />
      <div className="mt-8">
        <MonthCompareChart key={mode + m.ym.y + m.ym.m} cur={m.days} prev={m.prevFull.days} curLabel={monthName(m.ym)} prevLabel={monthName(m.prevYm)} mode={mode} goal={m.goal} />
      </div>
    </Card>
  );
}

function Done({ m, onAll, onEdit }: { m: MonthModel; onAll: () => void; onEdit: (id: string) => void }) {
  const list = m.closedTasks.slice(0, 7);
  return (
    <Card block="done" className="overflow-hidden">
      <div className="p-6 pb-3">
        <Head title="Что сделано" sub={`${m.closedTasks.length} ${plural(m.closedTasks.length, "задача закрыта", "задачи закрыто", "задач закрыто")} в ${monthIn(m.ym)}`} />
      </div>
      {list.length === 0 ? (
        <div className="px-6 pb-6" style={{ ...T.body, color: C.text3 }}>
          В этом месяце ничего не закрыто
        </div>
      ) : (
        <div>
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onEdit(t.id)}
              className="flex w-full items-center gap-3 px-6 text-left transition-colors duration-150 hover:bg-[#17171A]"
              style={{ minHeight: 44, ...dashed }}
            >
              <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: t.priority === 1 ? C.red : t.priority === 2 ? C.amber : t.priority === 3 ? C.accent : "#4A4C54" }} />
              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>{t.title}</span>
              <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>{t.completedAt ? fmtShort(new Date(t.completedAt)) : ""}</span>
            </button>
          ))}
        </div>
      )}
      {m.closedTasks.length > list.length && (
        <div className="mt-auto p-4 pt-3">
          <Btn kind="ghost" size={36} full onClick={onAll}>
            Все {m.closedTasks.length} {tasksWord(m.closedTasks.length)}
          </Btn>
        </div>
      )}
    </Card>
  );
}

function BestDays({ m, onDay }: { m: MonthModel; onDay: (key: string) => void }) {
  const best = m.cur.bestDays;
  const max = Math.max(1, best[0]?.closed ?? 0);
  return (
    <Card block="best-days" className="p-6">
      <Head title="Лучшие дни" sub={m.peakWeekday ? `чаще всего — ${m.peakWeekday.long}: ${m.peakWeekday.value} ${tasksWord(m.peakWeekday.value)}` : "закрытий не было"} />
      <div className="mt-4 flex flex-col gap-2">
        {best.length === 0 ? (
          <div style={{ ...T.body, color: C.text3 }}>Здесь появятся самые плотные дни месяца</div>
        ) : (
          best.map((d, i) => (
            <button key={d.key} type="button" onClick={() => onDay(d.key)} className="flex flex-col gap-2 p-3.5 text-left transition-colors duration-150 hover:bg-[#202025]" style={{ borderRadius: R.inner, background: C.raise }}>
              <div className="flex items-baseline justify-between gap-3">
                <span style={{ ...T.body, color: C.text }}>{fmtDay(d.date, { day: "numeric", month: "long", weekday: "short" })}</span>
                <span style={{ ...T.num, fontSize: 18, color: i === 0 ? "#5AA9FF" : C.text }}>{d.closed}</span>
              </div>
              <span style={{ height: 4, borderRadius: 99, background: C.line }}>
                <span className="block h-full" style={{ width: `${(d.closed / max) * 100}%`, borderRadius: 99, background: i === 0 ? C.accent : "#3D6FA8" }} />
              </span>
              {d.titles.length > 0 && (
                <span className="truncate" style={{ ...T.foot, color: C.text3 }}>
                  {d.titles.slice(0, 3).join(" · ")}
                  {d.titles.length > 3 ? ` · ещё ${d.titles.length - 3}` : ""}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

function Projects({ m, onPick }: { m: MonthModel; onPick: (id: string) => void }) {
  const rows = m.byProject.filter((p) => p.closed || p.prev).slice(0, 6);
  return (
    <Card block="projects" className="p-6">
      <Head title="Проекты" sub={`закрыто в ${monthIn(m.ym)} и ${m.cmpLabel}`} />
      <div className="mt-4 flex items-center gap-3" style={{ ...T.foot, color: C.text3, minHeight: 24, ...dashed }}>
        <span className="flex-1">Проект</span>
        <span className="w-8 text-right">{MONTHS_SHORT[m.ym.m]}</span>
        <span className="w-10 text-right">{MONTHS_SHORT[m.prevYm.m]}</span>
        <span className="w-[60px]" />
      </div>
      <div className="flex flex-col">
        {rows.length === 0 ? (
          <div style={{ ...T.body, color: C.text3 }}>Закрытий по проектам нет</div>
        ) : (
          rows.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => p.closed && onPick(p.id)}
              onKeyDown={(e) => e.key === "Enter" && p.closed && onPick(p.id)}
              className={`flex items-center gap-3 ${p.closed ? "cursor-pointer" : ""} transition-colors hover:text-white`}
              style={{ minHeight: 46, ...dashed }}
            >
              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: p.id === "none" ? C.text2 : C.text }}>{p.name}</span>
              <span className="w-8 shrink-0 text-right" style={{ ...T.num, fontSize: 16 }}>{p.closed}</span>
              <span className="w-10 shrink-0 text-right" style={{ ...T.foot, color: C.text3 }}>{p.prev}</span>
              <span className="flex w-[60px] shrink-0 justify-end">
                <Delta value={pctDelta(p.closed, p.prev)} size={24} />
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function Calendar({ m }: { m: MonthModel }) {
  return (
    <Card block="calendar" className="p-6">
      <Head title="Календарь" sub={`${m.cur.activeDays} ${plural(m.cur.activeDays, "активный день", "активных дня", "активных дней")} из ${m.elapsed}`} />
      <div className="mt-5">
        <MonthHeat days={m.days} rowH={28} gap={5} goal={m.goal} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 pt-4" style={{ ...dashed, backgroundPosition: "left top" }}>
        {[
          ["Серия в месяце", m.cur.longestStreak],
          ["Сейчас", m.streakNow],
          ["Лучшая", m.bestStreak],
        ].map(([l, v]) => (
          <div key={l as string}>
            <div style={{ ...T.foot, color: C.text3 }}>{l}</div>
            <div className="mt-1" style={{ ...T.num, fontSize: 18 }}>
              {v} <span style={{ ...T.foot, color: C.text3, fontWeight: 400 }}>{daysWord(v as number)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Left({ m, onOpenCarried, onOpenAll }: { m: MonthModel; onOpenCarried: () => void; onOpenAll: () => void }) {
  const c = m.carried;
  const parts = [
    { v: c.sameMonth, color: C.accent, label: `закрыто в ${monthIn(m.ym)}` },
    { v: c.later, color: "#3D6FA8", label: "закрыто позже" },
    { v: c.open, color: "#3A3A42", label: "ещё открыто" },
  ];
  return (
    <Card block="left" className="p-6">
      <Head title="Что осталось" sub={`из ${c.created} ${plural(c.created, "задачи", "задач", "задач")}, созданных в ${monthIn(m.ym)}`} />
      {c.created > 0 ? (
        <>
          <div className="mt-5 flex w-full gap-1" style={{ height: 10 }}>
            {parts.map((p) =>
              p.v > 0 ? <span key={p.label} title={`${p.label}: ${p.v}`} style={{ width: `${(p.v / c.created) * 100}%`, borderRadius: 999, background: p.color }} /> : null
            )}
          </div>
          <div className="mt-3 flex flex-col">
            {parts.map((p) => (
              <div
                key={p.label}
                role={p.label === "ещё открыто" && p.v ? "button" : undefined}
                onClick={p.label === "ещё открыто" && p.v ? onOpenCarried : undefined}
                className={`flex items-center gap-3 ${p.label === "ещё открыто" && p.v ? "cursor-pointer hover:text-white" : ""}`}
                style={{ minHeight: 40, ...dashed }}
              >
                <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 9, background: p.color }} />
                <span className="min-w-0 flex-1" style={{ ...T.body, color: C.text }}>{p.label}</span>
                <span style={{ ...T.num, fontSize: 16, fontWeight: 400, color: C.text2 }}>{p.v}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4" style={{ ...T.body, color: C.text3 }}>В этом месяце задач не создавалось</div>
      )}
      <button type="button" onClick={onOpenAll} className="mt-auto flex items-center justify-between pt-5 text-left transition-opacity hover:opacity-80">
        <span style={{ ...T.foot, color: C.text2 }}>Открыто сейчас всего</span>
        <span style={{ ...T.body, color: C.text }}>
          {m.openTasks.length}
          {m.overdueOpen > 0 && <span style={{ color: TONE.amber.fg }}> · {m.overdueOpen} просрочено</span>}
        </span>
      </button>
    </Card>
  );
}

function FocusXp({ m }: { m: MonthModel }) {
  const { cur, cmp } = m;
  return (
    <Card block="focus" className="p-6">
      <Head title="Фокус и опыт" sub={`уровень ${m.level.level} · ${m.level.title}`} />
      <div className="mt-5 flex items-center gap-5">
        <span className="hidden shrink-0 sm:block">
          <Ring pct={m.level.pct} size={84} stroke={7}>
            <span style={{ ...T.num, fontSize: 26 }}>{m.level.level}</span>
          </Ring>
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="whitespace-nowrap" style={{ ...T.num, fontSize: 22 }}>+{cur.xp.toLocaleString("ru-RU")} XP</span>
            <Delta value={pctDelta(cur.xp, cmp.xp)} size={24} />
          </div>
          <div className="mt-1" style={{ ...T.foot, color: C.text3, lineHeight: 1.4 }}>
            за задачи месяца · до уровня {m.level.level + 1} ещё {m.level.toNext.toLocaleString("ru-RU")} XP
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 pt-4" style={{ ...dashed, backgroundPosition: "left top" }}>
        <div>
          <div style={{ ...T.foot, color: C.text3 }}>Фокус</div>
          <div className="mt-1" style={{ ...T.num, fontSize: 18 }}>{dur(cur.focusMin)}</div>
          <div className="mt-1" style={{ ...T.foot, color: C.text3 }}>
            {cur.focusSessions ? `${cur.focusSessions} помодоро · было ${dur(cmp.focusMin)}` : "помодоро не запускались"}
          </div>
        </div>
        <div>
          <div style={{ ...T.foot, color: C.text3 }}>Точность оценок</div>
          <div className="mt-1" style={{ ...T.num, fontSize: 18 }}>{cur.accuracy === null ? "—" : `${cur.accuracy}%`}</div>
          <div className="mt-1" style={{ ...T.foot, color: C.text3 }}>
            {cur.accuracy === null ? "нет задач с оценкой и таймером" : `по ${cur.accuracyCount} ${plural(cur.accuracyCount, "задаче", "задачам", "задачам")}`}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────────────────────

export default function AnalyticsReview() {
  const [ym, setYm] = useState<YM>(thisMonth);
  const m = useMonthReview(ym);
  const d = useDialogs(m);
  // Body width (sidebar-independent): below ~860px the statement stacks above the chapters
  // instead of a cramped sticky column, so nothing overflows at 1024.
  const [bodyRef, bodyW] = useWidth<HTMLDivElement>();
  const stacked = bodyW > 0 && bodyW < 860;
  const dayTasks = (key: string) => m.closedTasks.filter((t) => t.completedAt && new Date(t.completedAt).toDateString() === new Date(key + "T12:00").toDateString());

  return (
    <CraftShell
      active="analytics"
      crumb="Аналитика"
      title="Итоги"
      subtitle={m.isCurrent ? "текущий месяц" : `${monthName(m.ym).toLowerCase()} ${m.ym.y}`}
      titleRight={<MonthStepper value={ym} onChange={setYm} min={m.firstYm} totals={m.monthTotals} />}
    >
      <div ref={bodyRef} className="mt-6 grid items-start gap-3" style={{ gridTemplateColumns: stacked ? "minmax(0,1fr)" : "minmax(0,0.78fr) minmax(0,1.4fr)" }}>
        <Statement m={m} stacked={stacked} onClosed={() => d.openClosed()} onOpen={() => d.openOpen()} />

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <Compare m={m} />
          <Chart m={m} />
          <Done m={m} onAll={() => d.openClosed()} onEdit={(id) => {
            const t = m.closedTasks.find((x) => x.id === id);
            if (t) d.edit(t);
          }} />
          <BestDays m={m} onDay={(key) => d.openClosed(`${fmtDay(new Date(key + "T12:00"))} · закрыто`, dayTasks(key))} />
          <Projects
            m={m}
            onPick={(id) => {
              const p = m.byProject.find((x) => x.id === id);
              if (p) d.openClosed(`${p.name} · ${monthName(m.ym).toLowerCase()}`, p.tasks);
            }}
          />
          <Calendar m={m} />
          <Left m={m} onOpenCarried={() => d.openOpen(`Созданы в ${monthIn(m.ym)} · открыты`, m.carried.openTasks)} onOpenAll={() => d.openOpen()} />
          <FocusXp m={m} />
        </div>
      </div>
      {d.node}
    </CraftShell>
  );
}
