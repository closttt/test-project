/**
 * Dashboard · Bondar Editorial · v1 «Редакционный индекс»
 * Composition: magazine front page. Numbered sidebar «1.0 … 8.0» with pixel icons and a floating
 * level plate, a giant Golos headline with an editorial deck, KPIs as a hairline-ruled strip of
 * oversized numerals whose dividers ARE the page's column lines, then the main story — today's plan
 * as an indexed table across three columns — and a sidebar column (rhythm dot-matrix, projects with
 * cell progress, money as the single lime plate, today's reading as a dithered cover under a card-plate).
 */
import { useState } from "react";

import { useDashboardModel, rub } from "@/design-lab/screens/dashboardModel";
import {
  B,
  T,
  display,
  tab,
  pad2,
  grid4,
  ColumnGrid,
  Signal,
  Chip,
  Pixel,
  PIX,
  NAV_PIX,
  PRIORITY_BARS,
  Cells,
  Check,
  Dither,
  DitherField,
  Button,
  KV,
  Hook,
  DockPlate,
  Bullet,
  bars,
  deck,
  healthColor,
  plural,
} from "@/design-lab/screens/_kit/bondar";

export default function BondarV1() {
  const m = useDashboardModel();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [showAllOver, setShowAllOver] = useState(false);
  const maxDay = Math.max(1, ...m.dynamics.map((d) => d.value));
  const planDone = m.plan.filter((r) => r.done).length;
  const planLate = m.plan.filter((r) => r.overdue).length;
  const overShown = showAllOver ? m.overPlan : m.overPlan.slice(0, 10);
  const statusTotal = Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll);

  const kpis = [
    {
      k: "Сегодня",
      v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`,
      sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просрочено` : "без просрочек",
      hot: m.kpi.overdueToday > 0,
      sig: bars(m.kpi.todayTotal ? m.kpi.todayDone / m.kpi.todayTotal : 0),
    },
    { k: "Время сегодня", v: m.kpi.timeLabel, sub: `${m.kpi.closedToday} закрыто из ${m.kpi.dailyGoal} по цели`, sig: bars(m.kpi.minutesToday / 240) },
    { k: "Открыто задач", v: String(m.kpi.openCount), sub: `${m.status.overdueAll} с просрочкой`, sig: bars(1 - m.status.overdueAll / Math.max(1, m.kpi.openCount)) },
    { k: "Закрыто за неделю", v: String(m.kpi.weekDone), sub: `серия ${m.kpi.streak} ${plural(m.kpi.streak, "день", "дня", "дней")}`, sig: bars(m.kpi.weekDone / (m.kpi.dailyGoal * 7)) },
  ];

  return (
    <div className="relative flex min-h-screen antialiased" style={{ background: B.bg, color: B.text, fontFamily: B.font }}>
      {/* ── Sidebar ──────────────────────────────────────────────────────────────── */}
      <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col" style={{ borderRight: `1px solid ${B.l10}` }}>
        <div className="px-5 pt-6">
          <div className="flex items-start justify-between">
            <div style={T.displayS}>
              Рабочий
              <br />
              стол
            </div>
            <Matrix6 />
          </div>
        </div>
        <div className="mt-10 px-5" style={{ ...T.caps, color: B.text3 }}>Навигация</div>
        <nav className="mt-3 flex flex-col px-2">
          {m.nav.map((n, i) => {
            const active = n.id === "dashboard";
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-current={active ? "page" : undefined}
                className="group relative flex h-9 items-center gap-[10px] px-3 outline-none transition-colors duration-200 hover:bg-[#101010] focus-visible:bg-[#101010]"
                style={{ background: active ? B.s1 : undefined }}
              >
                {active && <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: B.lime }} />}
                <span className="w-[22px]" style={{ ...T.num, color: active ? B.text : B.text3 }}>{i + 1}.0</span>
                <Pixel map={NAV_PIX[n.id] ?? PIX.dashboard} px={2} color={active ? B.text : B.text3} />
                <span
                  className="flex-1 truncate transition-colors duration-200 group-hover:text-white"
                  style={{ ...T.body, color: active ? B.text : B.text2 }}
                >
                  {n.label}
                </span>
                {n.badge ? <span style={{ ...T.num, color: B.lime }}>{n.badge}</span> : null}
              </a>
            );
          })}
        </nav>

        <DockPlate className="mx-3 mb-3 mt-auto flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span style={{ ...T.caps, color: B.text3 }}>Уровень {pad2(m.kpi.level)}</span>
            <Signal value={bars(m.kpi.levelPct / 100)} />
          </div>
          <div style={T.title}>{m.kpi.levelTitle}</div>
          <Cells pct={m.kpi.levelPct} count={20} size={6} on={B.lime} stretch />
          <div className="flex justify-between" style={{ ...T.meta, color: B.text3 }}>
            <span style={tab}>{m.kpi.xpToNext} XP до следующего</span>
            <span style={tab}>{Math.round(m.kpi.levelPct)}%</span>
          </div>
        </DockPlate>
      </aside>

      {/* ── Page ─────────────────────────────────────────────────────────────────── */}
      <main className="relative min-w-0 flex-1 px-5 pb-20 pt-8">
        <ColumnGrid />

        <header className="relative flex items-end justify-between gap-8">
          <div className="min-w-0">
            <Chip icon={PIX.chipCal}>{m.dateLabel}</Chip>
            <h1 className="mt-6" style={display(80)}>{m.greeting}</h1>
            <p className="mt-5 max-w-[560px]" style={{ ...T.bodyL, color: B.text2 }}>{deck(m)}</p>
          </div>
          <Button size="lg" onClick={() => document.getElementById("b1-add")?.focus()}>Новая задача</Button>
        </header>

        {/* KPI strip — numerals, not cards; the dividers are the column lines themselves */}
        <section className="relative mt-10" style={{ ...grid4, borderTop: `1px solid ${B.l15}`, borderBottom: `1px solid ${B.l15}` }}>
          <ColumnGrid margin={0} color={B.l10} />
          {kpis.map((s) => (
            <div key={s.k} className="relative flex min-w-0 flex-col pb-6 pt-5">
              <div className="flex items-center justify-between">
                <span style={{ ...T.caps, color: B.text3 }}>{s.k}</span>
                <Signal value={s.sig} />
              </div>
              <span className="mt-8 truncate" style={{ ...T.displayXl, ...tab }}>{s.v}</span>
              <span className="mt-3" style={{ ...T.meta, color: s.hot ? B.danger : B.text3 }}>{s.sub}</span>
            </div>
          ))}
        </section>

        <div className="relative mt-14" style={grid4}>
          {/* ── Main story: plan ─────────────────────────────────────────────────── */}
          <section className="col-span-3 min-w-0">
            <div className="flex items-end justify-between gap-6">
              <div className="flex items-baseline gap-4">
                <span style={{ ...T.num, color: B.text3 }}>01</span>
                <h2 style={T.displayM}>План дня</h2>
              </div>
              <span style={{ ...T.meta, color: B.text3, ...tab }}>
                {planDone} из {m.plan.length} готово
                {planLate ? <span style={{ color: B.danger }}> · {planLate} просрочено</span> : null}
              </span>
            </div>

            <div
              className="mt-6 grid h-8 items-center gap-4"
              style={{ gridTemplateColumns: PLAN_COLS, borderBottom: `1px solid ${B.l15}`, ...T.caps, color: B.text3 }}
            >
              <span>№</span>
              <span />
              <span>Задача</span>
              <span>Приоритет</span>
              <span>Время</span>
              <span className="text-right">Срок</span>
            </div>
            <ol>
              {m.plan.map((r, i) => (
                <li
                  key={r.id}
                  className="grid min-h-[56px] items-center gap-4 py-2 transition-colors duration-200 hover:bg-[#101010]"
                  style={{ gridTemplateColumns: PLAN_COLS, borderBottom: `1px solid ${B.l10}` }}
                >
                  <span style={{ ...T.num, color: B.text3 }}>{pad2(i + 1)}</span>
                  <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
                  <span className="min-w-0">
                    <span
                      className="block truncate"
                      style={{ ...T.bodyStrong, color: r.done ? B.text4 : B.text, textDecoration: r.done ? "line-through" : undefined }}
                    >
                      {r.title}
                    </span>
                    {(r.projectName || r.subtasksTotal > 0) && (
                      <span className="mt-1 block truncate" style={{ ...T.meta, color: B.text3 }}>
                        {r.projectName}
                        {r.projectName && r.subtasksTotal > 0 ? " · " : ""}
                        {r.subtasksTotal > 0 ? `подзадачи ${r.subtasksDone}/${r.subtasksTotal}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <Signal value={PRIORITY_BARS[r.priority]} on={r.priority === 1 ? B.lime : B.text} />
                    <span style={{ ...T.meta, color: B.text3 }}>{r.priorityShort}</span>
                  </span>
                  <span style={{ ...T.meta, color: B.text3, ...tab }}>{r.spentMin ? `${Math.round(r.spentMin)}м` : "—"}</span>
                  <span className="text-right" style={{ ...T.meta, color: r.overdue ? B.danger : B.text2, ...tab }}>{r.dueLabel}</span>
                </li>
              ))}
              {m.plan.length === 0 && (
                <li className="flex h-14 items-center gap-3" style={{ borderBottom: `1px solid ${B.l10}`, ...T.body, color: B.text3 }}>
                  <Bullet size={6} color={B.lime} /> План пуст — добавьте задачу ниже.
                </li>
              )}
            </ol>
            <form
              className="flex h-12 items-center gap-3 transition-colors duration-200 focus-within:!border-[#ADFB0C]"
              style={{ borderBottom: `1px solid ${B.l10}` }}
              onSubmit={(e) => {
                e.preventDefault();
                m.actions.add(draft);
                setDraft("");
              }}
            >
              <span className="w-8" style={{ color: B.lime }}><Hook size={16} /></span>
              <input
                id="b1-add"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Добавить на сегодня — «созвон завтра 15:00 !важно»"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7F7F7F]"
                style={{ ...T.body, color: B.text }}
              />
              <span className="px-2 py-1" style={{ ...T.caps, color: B.text3, background: B.s4, borderRadius: 4 }}>Enter</span>
            </form>

            {/* Over plan */}
            {m.overPlan.length > 0 && (
              <div className="mt-12">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-baseline gap-4">
                    <span style={{ ...T.num, color: B.text3 }}>02</span>
                    <h3 style={{ ...T.displayS, color: B.text2 }}>Сверх плана</h3>
                    <span style={{ ...T.meta, color: B.text3, ...tab }}>({m.overPlan.length})</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={m.actions.moveOverPlanToTomorrow}>Перенести на завтра</Button>
                </div>
                <ul className="mt-5 grid grid-cols-2 gap-x-10" style={{ borderTop: `1px solid ${B.l15}` }}>
                  {overShown.map((r) => (
                    <li key={r.id} className="flex h-10 min-w-0 items-center gap-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                      <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={14} />
                      <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: B.text2 }}>{r.title}</span>
                      <span className="shrink-0" style={{ ...T.meta, color: r.overdue ? B.danger : B.text3, ...tab }}>{r.dueLabel}</span>
                    </li>
                  ))}
                </ul>
                {m.overPlan.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllOver((v) => !v)}
                    className="mt-4 inline-flex items-center gap-2 outline-none transition-colors duration-200 hover:text-white"
                    style={{ ...T.meta, color: B.text3 }}
                  >
                    <Hook size={12} />
                    {showAllOver ? "Свернуть" : `Ещё ${m.overPlan.length - 10}`}
                  </button>
                )}
              </div>
            )}

            {/* Status · Meetings · Note — three cells on the three columns */}
            <div className="mt-14 grid grid-cols-3 gap-5" style={{ borderTop: `1px solid ${B.l15}` }}>
              <section className="min-w-0 pt-5">
                <CellHead n="03" title="Статус задач" />
                <div className="mt-5 flex items-end gap-6">
                  {[
                    { k: "Готово", v: m.status.doneAll, c: B.text },
                    { k: "В работе", v: m.status.inProgress, c: B.text },
                    { k: "Просрочено", v: m.status.overdueAll, c: B.danger },
                  ].map((s) => (
                    <div key={s.k} className="flex flex-col gap-2">
                      <span style={{ ...T.title, ...tab, color: s.c }}>{s.v}</span>
                      <span style={{ ...T.meta, color: B.text3 }}>{s.k}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex h-2 w-full gap-[2px]">
                  <span style={{ flex: m.status.doneAll / statusTotal, background: B.text }} />
                  <span style={{ flex: m.status.inProgress / statusTotal, background: B.off }} />
                  <span style={{ flex: m.status.overdueAll / statusTotal, background: B.danger }} />
                </div>
                <div className="mt-4">
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
              </section>

              <section className="min-w-0 pt-5">
                <CellHead n="04" title="Встречи" />
                {m.meetings.length === 0 ? (
                  <div className="mt-5 flex flex-col">
                    <DitherField kind="orb" seed={11} color={B.text} accent={B.lime} accentShare={0.12} className="h-[96px] w-full" />
                    <div className="mt-4" style={T.title}>Встреч нет</div>
                    <p className="mt-1" style={{ ...T.body, color: B.text2 }}>Календарь чист — день целиком под план.</p>
                  </div>
                ) : (
                  <ul className="mt-4">
                    {m.meetings.slice(0, 5).map((mt) => (
                      <li key={mt.id} className="flex h-12 min-w-0 items-center gap-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                        <Check done={!!mt.done} onClick={() => m.actions.toggleMeeting(mt.id)} label={mt.title} size={14} />
                        <span style={{ ...T.num, color: B.lime }}>{mt.time}</span>
                        <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: mt.done ? B.text4 : B.text }}>{mt.title}</span>
                        <span style={{ ...T.meta, color: B.text3 }}>{mt.dateLabel}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="min-w-0 pt-5">
                <CellHead n="05" title="Быстрая заметка" />
                <form
                  className="mt-5 flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    m.actions.saveNote(note);
                    setNote("");
                  }}
                >
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Мысль, ссылка, итог созвона…"
                    rows={4}
                    className="w-full resize-none bg-white/[0.02] p-3 outline-none transition-colors duration-200 placeholder:text-[#7F7F7F] focus:!border-[#ADFB0C]"
                    style={{ border: `1px solid ${B.l20}`, ...T.body, color: B.text }}
                  />
                  <Button variant={note.trim() ? "lime" : "outline"} size="sm" type="submit" full>Сохранить</Button>
                </form>
              </section>
            </div>
          </section>

          {/* ── Sidebar column ───────────────────────────────────────────────────── */}
          <aside className="flex min-w-0 flex-col gap-12">
            <section>
              <CellHead n="06" title="Ритм · 14 дней" />
              <div className="mt-5 flex h-[112px] items-end gap-[4px]">
                {m.dynamics.map((d, i) => {
                  const dots = Math.round((d.value / maxDay) * 12);
                  const isToday = i === m.dynamics.length - 1;
                  return (
                    <div key={d.date} className="flex flex-1 flex-col-reverse gap-[2px]" title={`${d.label}: ${d.value}`}>
                      {Array.from({ length: 12 }, (_, j) => (
                        <span key={j} className="h-[7.5px] w-full" style={{ background: j < dots ? (isToday ? B.lime : B.text) : B.l7 }} />
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.text3 }}>
                <span style={tab}>{m.dynamics[0].label}</span>
                <span>сегодня</span>
              </div>
              <div className="mt-3">
                <KV k="Закрыто" v={m.closed14} py={8} />
                <KV k="Пик дня" v={m.peak14} py={8} last />
              </div>
            </section>

            <section>
              <CellHead n="07" title="Проекты" />
              <div className="mt-4" style={{ borderTop: `1px solid ${B.l15}` }}>
                {m.projects.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex flex-col gap-2 py-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate" style={T.bodyStrong}>{p.name}</span>
                      <span style={{ ...T.num, color: B.text3 }}>{p.done}/{p.total}</span>
                    </div>
                    <Cells pct={p.pct} count={24} on={p.health === "off-track" ? B.danger : B.text} stretch />
                    <div className="flex justify-between gap-2" style={{ ...T.meta, color: B.text3 }}>
                      <span style={{ color: healthColor(p.health) }}>{p.healthLabel}</span>
                      <span className="truncate" style={tab}>
                        {Math.round(p.pct)}% · {p.spentLabel}
                        {p.overdue ? ` · ${p.overdue} просроч.` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="p-5" style={{ background: B.lime, color: B.onLime }}>
              <div className="flex items-center justify-between">
                <span style={{ ...T.caps }}>Деньги · месяц</span>
                <Signal value={m.money.overdue > 0 ? 1 : 3} on={B.onLime} off="rgba(0,0,0,.18)" />
              </div>
              <div className="mt-8 truncate" style={{ ...T.displayL, ...tab }}>{rub(m.money.paidThisMonth)}</div>
              <div style={{ ...T.meta, opacity: 0.6 }}>получено в этом месяце</div>
              <div className="mt-5" style={{ borderTop: "1px solid rgba(0,0,0,.15)" }}>
                <KV tone="lime" k="Ожидается" v={rub(m.money.pending)} py={10} />
                <KV tone="lime" k="Просрочено" v={rub(m.money.overdue)} py={10} />
                <KV tone="lime" k="Всего получено" v={rub(m.money.paidTotal)} py={10} last />
              </div>
              <div className="mt-3 flex items-start gap-2" style={{ ...T.meta }}>
                <Hook size={12} />
                {m.followUps.length
                  ? `Напомнить: ${m.followUps.map((f) => f.name).join(", ")}`
                  : "Фоллоу-апов на сегодня нет"}
              </div>
            </section>

            {m.reading && (
              <section>
                <CellHead n="08" title="Прочитать сегодня" />
                <div className="mt-4">
                  <Dither src={m.reading.coverUrl} className="h-[168px] w-full" fallbackKind="stripes" seed={4} />
                  <div
                    className="relative mx-3 -mt-12 p-4"
                    style={{ background: "rgba(0,0,0,.95)", backdropFilter: "blur(32px)", border: `1px solid ${B.lineStrong}` }}
                  >
                    <div className="line-clamp-3" style={T.bodyStrong}>{m.reading.title}</div>
                    {m.reading.domain && <div className="mt-2" style={{ ...T.meta, color: B.text3 }}>{m.reading.domain}</div>}
                  </div>
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

const PLAN_COLS = "28px 16px minmax(0,1fr) 96px 56px 64px";

function CellHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span style={{ ...T.num, color: B.text3 }}>{n}</span>
      <h3 style={T.title}>{title}</h3>
    </div>
  );
}

/** Brand mark: a 3×2 matrix lit in lime — the site's bento corner. */
function Matrix6() {
  return (
    <span className="mt-1 grid grid-cols-3 gap-[2px]" aria-hidden>
      {[1, 1, 1, 1, 1, 0].map((on, i) => (
        <span key={i} className="h-[7px] w-[7px]" style={{ background: on ? B.lime : B.off }} />
      ))}
    </span>
  );
}
