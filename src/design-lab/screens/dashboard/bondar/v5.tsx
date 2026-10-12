/**
 * Dashboard · Bondar Editorial · v5 «Лонгрид»
 * Shell: no sidebar, no top bar — a floating black dock at the bottom (the site's «МЕНЮ» plate with
 * inset #262626 + layered shadow) holds «1.0 … 8.0» navigation and quick add.
 * Composition: the dashboard read as the owner's site. A light #F7F7F7 page with the 4-column black 7%
 * hairline grid; every section repeats the site's rhythm — centred eyebrow chip → big title →
 * content: hero with a two-tone headline and KPI cells (one lime hero cell), «План дня» as the
 * light/dark pricing pair, «Ритм» chart + year pixel matrix, «Проекты» as a case table, a black
 * «Деньги» band with lime prices, «Встречи», and a black «Чтение» finale with the site's dark form.
 */
import { useState, type ReactNode } from "react";

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
  Matrix,
  Chip,
  PIX,
  PRIORITY_BARS,
  Cells,
  Check,
  Dither,
  DitherField,
  Button,
  CtaBar,
  CornerMarks,
  Hook,
  DockPlate,
  bars,
  deck,
  healthColor,
  plural,
} from "@/design-lab/screens/_kit/bondar";

function SectionHead({ chip, icon, title, tone = "light", sub }: { chip: string; icon: string[]; title: string; tone?: "light" | "dark"; sub?: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <Chip tone={tone} icon={icon} size="lg">{chip}</Chip>
      <h2 className="mt-9" style={{ ...T.displayXl, color: tone === "light" ? B.ink : B.text }}>{title}</h2>
      {sub && <p className="mt-5 max-w-[520px]" style={{ ...T.bodyL, color: tone === "light" ? B.text3 : B.text2 }}>{sub}</p>}
    </div>
  );
}

function Section({ children, tone = "light", id }: { children: ReactNode; tone?: "light" | "dark"; id?: string }) {
  return (
    <section id={id} className="relative px-5 pb-24 pt-24" style={{ background: tone === "light" ? B.paper : B.bg, color: tone === "light" ? B.ink : B.text }}>
      <ColumnGrid color={tone === "light" ? B.d7 : B.l5} />
      <div className="relative">{children}</div>
    </section>
  );
}

export default function BondarV5() {
  const m = useDashboardModel();
  const [draft, setDraft] = useState("");
  const [dockDraft, setDockDraft] = useState("");
  const [note, setNote] = useState("");
  const planDone = m.plan.filter((r) => r.done).length;
  const maxDay = Math.max(1, ...m.dynamics.map((d) => d.value));
  const maxYear = Math.max(1, ...m.year.map((d) => d.value));
  const statusTotal = Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll);
  const addTask = () => {
    m.actions.add(draft);
    setDraft("");
  };

  return (
    <div className="relative min-h-screen antialiased" style={{ background: B.paper, color: B.ink, fontFamily: B.font }}>
      {/* ── Hero ───────────────────────────────────────────────────────────────── */}
      <section className="relative px-5 pb-6 pt-6">
        <ColumnGrid color={B.d7} />
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-3">
            <Matrix value={5} cell={7} off={B.pixOffLight} />
            <span style={T.title}>Рабочий стол</span>
          </span>
          <span className="flex items-center gap-3" style={{ ...T.meta, color: B.text3 }}>
            Ур. {m.kpi.level} · {m.kpi.levelTitle} · {m.kpi.xpToNext} XP до следующего
            <Signal value={bars(m.kpi.levelPct / 100)} off={B.pixOffLight} />
          </span>
        </div>

        <div className="relative mt-20" style={grid4}>
          <div className="col-span-3 min-w-0">
            <h1 style={{ ...display(88), fontSize: "clamp(64px, 6.1vw, 88px)", fontWeight: 600 }}>
              {m.greeting},
              <br />
              <span style={{ color: B.ink4 }}>{m.dateLabel.toLowerCase()}</span>
            </h1>
          </div>
          <div className="flex min-w-0 flex-col justify-end">
            <p style={{ ...T.bodyL, fontSize: 18, lineHeight: 1.3, fontWeight: 500 }}>{deck(m)}</p>
          </div>
        </div>

        <div className="relative mt-14" style={{ ...grid4, borderTop: `1px solid ${B.d15}`, borderBottom: `1px solid ${B.d15}` }}>
          <ColumnGrid margin={0} color={B.d10} />
          {[
            { k: "Сегодня", v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`, sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просрочено` : "без просрочек", hero: true, sig: bars(m.kpi.todayTotal ? m.kpi.todayDone / m.kpi.todayTotal : 0) },
            { k: "Время сегодня", v: m.kpi.timeLabel, sub: `${m.kpi.closedToday} закрыто из ${m.kpi.dailyGoal} по цели`, sig: bars(m.kpi.minutesToday / 240) },
            { k: "Открыто задач", v: String(m.kpi.openCount), sub: `${m.status.overdueAll} с просрочкой`, hot: m.status.overdueAll > 0, sig: bars(1 - m.status.overdueAll / Math.max(1, m.kpi.openCount)) },
            { k: "Закрыто за неделю", v: String(m.kpi.weekDone), sub: `серия ${m.kpi.streak} ${plural(m.kpi.streak, "день", "дня", "дней")} · рекорд ${m.kpi.bestStreak}`, sig: bars(m.kpi.weekDone / (m.kpi.dailyGoal * 7)) },
          ].map((s) => (
            <div
              key={s.k}
              className="relative flex min-w-0 flex-col"
              style={s.hero ? { background: B.lime, margin: "-1px 0", padding: "20px 20px 24px" } : { padding: "20px 0 24px" }}
            >
              <div className="flex items-center justify-between">
                <span style={{ ...T.caps, color: s.hero ? "rgba(0,0,0,.6)" : B.text3 }}>{s.k}</span>
                <Signal value={s.sig} on={s.hero ? B.onLime : B.ink} off={s.hero ? "rgba(0,0,0,.15)" : B.pixOffLight} />
              </div>
              <span className="mt-10 truncate" style={{ ...T.displayXl, ...tab }}>{s.v}</span>
              <span className="mt-3 truncate" style={{ ...T.meta, color: s.hero ? "rgba(0,0,0,.7)" : s.hot ? B.danger : B.text3 }}>{s.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 01 План дня — light / dark pricing pair ───────────────────────────── */}
      <Section id="plan">
        <SectionHead chip="Фокус дня" icon={PIX.chipCheck} title="План дня" sub={`${planDone} из ${m.plan.length} готово. Всё, что не влезло в лимит фокуса, — справа.`} />
        <div className="mt-12" style={grid4}>
          {/* light card */}
          <article className="relative col-span-2 flex min-w-0 flex-col" style={{ background: B.white, boxShadow: `inset 0 0 0 1px ${B.d20}` }}>
            <CornerMarks />
            <div className="flex flex-col items-center px-6 pt-5">
              <span style={{ ...T.num, color: B.text3 }}>01</span>
              <DitherField kind="orb" seed={5} color={B.ink} className="mt-2 h-[92px] w-[200px]" cell={4} dot={2} />
              <div className="mt-3" style={{ ...T.title, fontSize: 18 }}>План</div>
              <div className="mt-1" style={{ ...T.caps, color: B.text3 }}>{m.plan.length} {plural(m.plan.length, "задача", "задачи", "задач")} · лимит {m.focusLimit || "—"}</div>
            </div>
            <div className="mt-5 flex items-baseline gap-3 px-6 py-4" style={{ borderTop: `1px solid ${B.d15}` }}>
              <span style={{ ...display(44), ...tab }}>{planDone}/{m.plan.length}</span>
              <span style={{ ...T.meta, color: B.text3 }}>готово сегодня</span>
            </div>
            <ul className="px-6" style={{ borderTop: `1px solid ${B.d15}` }}>
              <li className="pb-2 pt-4" style={{ ...T.meta, color: B.text3 }}>Что входит</li>
              {m.plan.map((r, i) => (
                <li
                  key={r.id}
                  className="flex min-h-[52px] items-center gap-3 py-2"
                  style={{ borderBottom: i < m.plan.length - 1 ? `1px solid ${B.d10}` : undefined }}
                >
                  <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} tone="light" />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate"
                      style={{ ...T.bodyStrong, fontSize: 15, color: r.done ? B.ink4 : B.ink, textDecoration: r.done ? "line-through" : undefined }}
                    >
                      {r.title}
                    </span>
                    <span className="block truncate" style={{ ...T.meta, color: B.text3 }}>
                      {r.projectName ? `${r.projectName} · ` : ""}
                      <span style={{ color: r.overdue ? B.danger : B.text3 }}>{r.overdue ? `просрочено с ${r.dueLabel}` : r.dueLabel}</span>
                    </span>
                  </span>
                  <Signal value={PRIORITY_BARS[r.priority]} on={B.ink} off={B.pixOffLight} w={4} h={10} />
                </li>
              ))}
              {m.plan.length === 0 && <li className="py-4" style={{ ...T.body, color: B.text3 }}>План пуст.</li>}
            </ul>
            <form
              className="mt-auto flex h-[59px] items-center gap-3 px-6 transition-colors duration-200 focus-within:bg-black/[0.02]"
              style={{ borderTop: `1px solid ${B.d15}` }}
              onSubmit={(e) => {
                e.preventDefault();
                addTask();
              }}
            >
              <Hook size={14} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Добавить в план — «созвон завтра 15:00 !важно»"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7F7F7F]"
                style={{ ...T.body, color: B.ink }}
              />
              <span style={{ ...T.btnCaps }}>Добавить</span>
            </form>
          </article>

          {/* dark card */}
          <article className="relative col-span-2 flex min-w-0 flex-col" style={{ background: B.bg, color: B.text }}>
            <CornerMarks />
            <div className="flex flex-col items-center px-6 pt-5">
              <span style={{ ...T.num, color: B.text3 }}>02</span>
              <DitherField kind="blob" seed={8} color={B.lime} className="mt-2 h-[92px] w-[200px]" cell={4} dot={2} />
              <div className="mt-3" style={{ ...T.title, fontSize: 18 }}>Сверх плана</div>
              <div className="mt-1" style={{ ...T.caps, color: B.text3 }}>за лимитом фокуса · можно перенести</div>
            </div>
            <div className="mt-5 flex items-baseline gap-3 px-6 py-4" style={{ borderTop: `1px solid ${B.l15}` }}>
              <span style={{ ...display(44), ...tab, color: B.lime }}>{m.overPlan.length}</span>
              <span style={{ ...T.meta, color: B.text3 }}>{plural(m.overPlan.length, "задача", "задачи", "задач")} ждут места</span>
            </div>
            <ul className="px-6" style={{ borderTop: `1px solid ${B.l15}` }}>
              <li className="pb-2 pt-4" style={{ ...T.meta, color: B.text3 }}>Ближайшие</li>
              {m.overPlan.slice(0, m.plan.length || 5).map((r, i, arr) => (
                <li key={r.id} className="flex min-h-[52px] items-center gap-3 py-2" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${B.l10}` : undefined }}>
                  <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ ...T.bodyStrong, fontSize: 15, color: r.done ? B.text4 : B.text }}>{r.title}</span>
                    <span className="block truncate" style={{ ...T.meta, color: B.text3 }}>
                      {r.projectName ? `${r.projectName} · ` : ""}
                      <span style={{ color: r.overdue ? B.danger : B.text3 }}>{r.dueLabel}</span>
                    </span>
                  </span>
                  <Signal value={PRIORITY_BARS[r.priority]} on={B.text} w={4} h={10} />
                </li>
              ))}
              {m.overPlan.length === 0 && <li className="py-4" style={{ ...T.body, color: B.text3 }}>Всё влезло в фокус.</li>}
            </ul>
            <div className="mt-auto">
              <CtaBar tone="invert" height={59} onClick={m.actions.moveOverPlanToTomorrow} disabled={!m.overPlan.length}>
                Перенести {m.overPlan.length} на завтра
              </CtaBar>
            </div>
          </article>
        </div>
      </Section>

      {/* ── 02 Ритм ────────────────────────────────────────────────────────────── */}
      <Section id="rhythm">
        <SectionHead chip="Результаты" icon={PIX.chipStar} title="Ритм" sub={`${m.closed14} ${plural(m.closed14, "задача закрыта", "задачи закрыты", "задач закрыто")} за 14 дней, пик — ${m.peak14} в день.`} />
        <div className="mt-12" style={grid4}>
          <div className="col-span-3 min-w-0">
            <div className="relative h-[260px]">
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <span key={f} className="absolute inset-x-0 h-px" style={{ bottom: `${f * 100}%`, background: f === 0 ? B.d20 : B.d7 }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-2">
                {m.dynamics.map((d, i) => {
                  const today = i === m.dynamics.length - 1;
                  return (
                    <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.label}: ${d.value}`}>
                      <span className="mb-2 text-center" style={{ ...T.num, color: d.value ? B.ink : B.text3 }}>{d.value || ""}</span>
                      <span style={{ height: `${Math.max(1.5, (d.value / maxDay) * 85)}%`, background: today ? B.lime : d.value ? B.ink : B.pixOffLight, boxShadow: today ? `inset 0 0 0 1px ${B.ink}` : undefined }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {m.dynamics.map((d, i) => (
                <span key={d.date} className="min-w-0 flex-1 text-center" style={{ ...T.meta, fontSize: 11, color: i === m.dynamics.length - 1 ? B.ink : B.text3, ...tab }}>
                  {i === m.dynamics.length - 1 ? "сег." : d.label}
                </span>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            {[
              ["Закрыто за 14 дней", m.closed14],
              ["Пик дня", m.peak14],
              ["За неделю", m.kpi.weekDone],
              ["Сегодня", m.kpi.closedToday],
              ["Серия", `${m.kpi.streak} дн.`],
              ["Рекорд серии", `${m.kpi.bestStreak} дн.`],
            ].map(([k, v], i, arr) => (
              <div key={String(k)} className="flex items-baseline justify-between py-3" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${B.d10}` : undefined, ...T.body }}>
                <span style={{ color: B.text3 }}>{k}</span>
                <span style={tab}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16" style={grid4}>
          <div className="col-span-2 min-w-0">
            <div className="flex items-baseline justify-between">
              <span style={{ ...T.caps, color: B.text3 }}>Полгода · 26 недель</span>
              <span style={{ ...T.meta, color: B.text3 }}>одна клетка — один день</span>
            </div>
            <div className="mt-4 grid grid-flow-col gap-[2px]" style={{ gridTemplateRows: "repeat(7, minmax(0,1fr))", gridAutoColumns: "minmax(0,1fr)" }}>
              {m.year.map((d, i) => {
                const last = i === m.year.length - 1;
                const a = d.value / maxYear;
                return (
                  <span
                    key={d.date}
                    title={`${d.date}: ${d.value}`}
                    className="aspect-square"
                    style={{ background: last ? B.lime : d.value ? `rgba(32,32,32,${0.18 + a * 0.82})` : B.pixOffLight }}
                  />
                );
              })}
            </div>
          </div>
          <div className="col-span-2 min-w-0">
            <div className="flex items-baseline justify-between">
              <span style={{ ...T.caps, color: B.text3 }}>Статус задач</span>
              <span style={{ ...T.num, color: B.text3 }}>{m.status.doneAll + m.status.inProgress + m.status.overdueAll}</span>
            </div>
            <div className="mt-4 grid grid-cols-3">
              {[
                { k: "Выполнено", v: m.status.doneAll, c: B.ink },
                { k: "В работе", v: m.status.inProgress, c: B.ink },
                { k: "Просрочено", v: m.status.overdueAll, c: B.danger },
              ].map((s, i) => (
                <div key={s.k} className="flex flex-col gap-2 px-4 first:pl-0" style={{ borderLeft: i ? `1px solid ${B.d10}` : undefined }}>
                  <span style={{ ...T.displayM, fontWeight: 500, ...tab, color: s.c }}>{s.v}</span>
                  <span style={{ ...T.meta, color: B.text3 }}>{s.k}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex h-2 gap-[2px]">
              <span style={{ flex: m.status.doneAll / statusTotal, background: B.ink }} />
              <span style={{ flex: m.status.inProgress / statusTotal, background: B.pixOffLight }} />
              <span style={{ flex: m.status.overdueAll / statusTotal, background: B.danger }} />
            </div>
            <div className="mt-5 grid grid-cols-4">
              {m.status.openByPriority.map((p) => (
                <div key={p.priority} className="flex flex-col gap-2">
                  <Signal value={PRIORITY_BARS[p.priority]} on={B.ink} off={B.pixOffLight} />
                  <span style={{ ...T.title, ...tab }}>{p.count}</span>
                  <span style={{ ...T.meta, color: B.text3 }}>{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── 03 Проекты — case table ───────────────────────────────────────────── */}
      <Section id="projects">
        <SectionHead chip="Кейсы" icon={PIX.chipPerson} title="Проекты" sub={`${m.projects.length} ${plural(m.projects.length, "проект", "проекта", "проектов")} — от тех, что горят, к тем, что в графике.`} />
        <div className="mt-12">
          <div className="grid h-9 items-center gap-5" style={{ gridTemplateColumns: PROJ, borderBottom: `1px solid ${B.d15}`, ...T.caps, color: B.text3 }}>
            <span>№</span>
            <span>Проект</span>
            <span>Прогресс</span>
            <span>Состояние</span>
            <span className="text-right">Задачи</span>
            <span className="text-right">Время</span>
          </div>
          {m.projects.map((p, i) => (
            <div
              key={p.id}
              className="grid min-h-[68px] items-center gap-5 py-2 transition-colors duration-300 hover:bg-white"
              style={{ gridTemplateColumns: PROJ, borderBottom: `1px solid ${B.d10}` }}
            >
              <span style={{ ...T.num, color: B.text3 }}>{pad2(i + 1)}</span>
              <span className="min-w-0">
                <span className="block truncate" style={T.title}>{p.name}</span>
                <span className="block truncate" style={{ ...T.meta, color: B.text3 }}>{p.clientName ?? "Свой проект"}</span>
              </span>
              <span className="flex items-center gap-3">
                <Cells pct={p.pct} count={20} size={8} on={p.health === "off-track" ? B.danger : B.ink} off={B.pixOffLight} />
                <span style={{ ...T.num }}>{Math.round(p.pct)}%</span>
              </span>
              <span className="flex items-center gap-2" style={{ ...T.body, color: healthColor(p.health, "light") }}>
                {p.healthLabel}
                {p.overdue ? <span style={{ ...T.meta, color: B.text3 }}>· {p.overdue} просроч.</span> : null}
              </span>
              <span className="text-right" style={{ ...T.body, ...tab }}>{p.done}/{p.total}</span>
              <span className="text-right" style={{ ...T.body, ...tab, color: B.text3 }}>{p.spentLabel}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 04 Деньги — black band ────────────────────────────────────────────── */}
      <Section id="money" tone="dark">
        <SectionHead chip="Клиенты" icon={PIX.chipCoin} title="Деньги" tone="dark" sub="Оплаты клиентов в этом месяце: что пришло, что в пути и что задержано." />
        <div className="mt-12" style={grid4}>
          {[
            { k: "Получено", v: m.money.paidThisMonth, unit: "в этом месяце", c: B.lime },
            { k: "Ожидается", v: m.money.pending, unit: "в пути", c: B.text },
            { k: "Просрочено", v: m.money.overdue, unit: "задержано", c: m.money.overdue ? B.danger : B.text },
            { k: "Всего", v: m.money.paidTotal, unit: "за всё время", c: B.text },
          ].map((s) => (
            <div key={s.k} className="min-w-0 pt-5" style={{ borderTop: `1px solid ${B.l15}` }}>
              <span style={{ ...T.meta, color: B.text3 }}>{s.k}</span>
              <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
                <span className="truncate" style={{ fontSize: 44, lineHeight: 1, letterSpacing: "-0.04em", ...tab, color: s.c }}>{rub(s.v)}</span>
              </div>
              <span className="mt-2 block" style={{ ...T.meta, color: B.text3 }}>{s.unit}</span>
            </div>
          ))}
        </div>
        <div className="mt-10 flex items-center gap-2" style={{ ...T.body, color: B.text2 }}>
          <Hook size={14} color={B.lime} />
          {m.followUps.length ? `Напомнить сегодня: ${m.followUps.map((f) => f.name).join(", ")}` : "Фоллоу-апов на сегодня нет — никому не нужно напоминать."}
        </div>
      </Section>

      {/* ── 05 Встречи ───────────────────────────────────────────────────────── */}
      <Section id="meetings">
        <SectionHead chip="Календарь" icon={PIX.chipCal} title="Встречи" />
        {m.meetings.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center">
            <DitherField kind="orb" seed={17} color={B.ink} accent={B.lime} accentShare={0.08} className="h-[200px] w-[240px]" cell={4} dot={3} />
            <div className="mt-8" style={T.displayS}>Встреч нет</div>
            <p className="mt-3 max-w-[420px]" style={{ ...T.bodyL, color: B.text3 }}>Ни сегодня, ни дальше по календарю. Весь день — под план.</p>
            <div className="mt-8">
              <Button variant="black" onClick={() => document.getElementById("b5-dock-add")?.focus()}>Добавить задачу</Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto mt-12 max-w-[713px]">
            {m.meetings.map((x) => (
              <div key={x.id} className="flex min-h-[68px] items-center gap-4 px-5" style={{ boxShadow: `inset 0 0 0 1px ${B.d7}`, marginTop: -1, background: x.done ? B.paper : B.white }}>
                <Check done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} tone="light" />
                <span style={{ ...T.title, ...tab }}>{x.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ ...T.title, color: x.done ? B.ink4 : B.ink }}>{x.title}</span>
                  <span style={{ ...T.meta, color: B.text3 }}>{x.clientName ?? "Без клиента"} · {x.durationMin} мин</span>
                </span>
                <span style={{ ...T.meta, color: B.text3 }}>{x.dateLabel}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 06 Чтение + заметка — black finale ───────────────────────────────── */}
      <Section id="reading" tone="dark">
        <SectionHead chip="База знаний" icon={PIX.chipBook} title="Чтение" tone="dark" />
        <div className="mt-12" style={grid4}>
          <div className="relative col-span-2 h-[440px] min-w-0 p-2" style={{ background: "#191919" }}>
            {m.reading ? (
              <Dither src={m.reading.coverUrl} className="h-full w-full" cell={4} color={B.lime} fallbackKind="stripes" seed={6} />
            ) : (
              <DitherField kind="stripes" seed={6} color={B.lime} className="h-full w-full" />
            )}
          </div>
          <div className="col-span-2 flex min-w-0 flex-col">
            <span style={{ ...T.meta, color: B.text3 }}>Прочитать сегодня</span>
            {m.reading ? (
              <>
                <div className="mt-4" style={T.displayS}>{m.reading.title}</div>
                {m.reading.description && (
                  <p className="mt-4 line-clamp-3" style={{ ...T.body, color: B.text2 }}>
                    {m.reading.description.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim()}
                  </p>
                )}
                <div className="mt-6">
                  {[
                    ["Источник", m.reading.domain ?? "—"],
                    ["Автор", m.reading.author ?? "—"],
                    ["Статус", m.reading.status === "doing" ? "Читаю" : "В очереди"],
                  ].map(([k, v], i, arr) => (
                    <div key={k} className="flex justify-between py-3" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${B.l10}` : undefined, ...T.body }}>
                      <span style={{ color: B.text3 }}>{k}</span>
                      <span className="truncate pl-4">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4" style={T.displayS}>Очередь чтения пуста</div>
            )}

            <form
              className="mt-auto flex flex-col gap-2 pt-10"
              onSubmit={(e) => {
                e.preventDefault();
                m.actions.saveNote(note);
                setNote("");
              }}
            >
              <span style={{ ...T.title }}>Быстрая заметка</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Мысль, цитата, итог созвона…"
                className="mt-2 w-full resize-none p-4 outline-none transition-colors duration-200 placeholder:text-white/70 focus:!border-[#ADFB0C]"
                style={{ background: "rgba(255,255,255,.01)", border: "1px solid rgba(240,240,240,.2)", backdropFilter: "blur(16px)", ...T.body, color: B.text }}
              />
              <Button variant="lime" size="lg" type="submit" full>Сохранить заметку</Button>
            </form>
          </div>
        </div>

        {/* footer */}
        <div className="mt-28 pb-24" style={grid4}>
          <div className="min-w-0">
            <span style={{ ...T.meta, color: B.text3 }}>Навигация</span>
            <ul className="mt-5 flex flex-col gap-3">
              {m.nav.map((n, i) => (
                <li key={n.id}>
                  <a href="#" onClick={(e) => e.preventDefault()} className="group inline-flex items-baseline gap-3 outline-none" style={{ ...T.title, fontSize: 18, color: n.id === "dashboard" ? B.text : B.text2 }}>
                    <span style={{ ...T.num, color: B.text3 }}>{i + 1}.0</span>
                    <span className="transition-colors duration-200 group-hover:text-white">{n.label}</span>
                    {n.badge ? <span style={{ ...T.num, color: B.lime }}>{n.badge}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="col-span-2" />
          <div className="flex min-w-0 flex-col items-end text-right">
            <span style={{ ...T.meta, color: B.text3 }}>Уровень</span>
            <span className="mt-5" style={{ ...T.displayL, ...tab }}>{pad2(m.kpi.level)}</span>
            <span className="mt-2" style={{ ...T.bodyL, color: B.text2 }}>{m.kpi.levelTitle}</span>
            <div className="mt-4 w-full max-w-[220px]"><Cells pct={m.kpi.levelPct} count={20} on={B.lime} stretch /></div>
          </div>
        </div>
        <div className="flex justify-between pb-20" style={{ ...T.meta, color: B.text3 }}>
          <span>©2026 Рабочий стол</span>
          <span>{m.dateLabel}</span>
        </div>
      </Section>

      {/* ── Floating dock ─────────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-5">
        <DockPlate className="pointer-events-auto flex items-center gap-[2px] p-2">
          <nav className="flex items-center gap-[2px]">
            {m.nav.map((n, i) => {
              const active = n.id === "dashboard";
              return (
                <a
                  key={n.id}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-current={active ? "page" : undefined}
                  className="group relative flex h-10 items-center gap-[6px] px-3 outline-none transition-colors duration-200 hover:bg-[#1C1C1C] focus-visible:bg-[#1C1C1C]"
                  style={{ background: active ? B.s3 : B.s1 }}
                >
                  <span className="max-[1399px]:hidden" style={{ ...T.num, fontSize: 11, color: active ? B.lime : B.text3 }}>{i + 1}.0</span>
                  <span className="whitespace-nowrap transition-colors duration-200 group-hover:text-white" style={{ ...T.body, fontSize: 13, color: active ? B.text : B.text2 }}>
                    {n.label}
                  </span>
                  {n.badge ? <span style={{ ...T.num, fontSize: 11, color: B.lime }}>{n.badge}</span> : null}
                  {active && <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: B.lime }} />}
                </a>
              );
            })}
          </nav>
          <span className="mx-2 h-6 w-px" style={{ background: B.lineInset }} />
          <form
            className="flex items-center gap-[2px]"
            onSubmit={(e) => {
              e.preventDefault();
              m.actions.add(dockDraft);
              setDockDraft("");
            }}
          >
            <input
              id="b5-dock-add"
              value={dockDraft}
              onChange={(e) => setDockDraft(e.target.value)}
              placeholder="Быстрая задача…"
              className="h-10 w-[200px] px-3 outline-none transition-colors duration-200 placeholder:text-[#7F7F7F] focus:bg-[#1C1C1C] max-[1399px]:w-[160px]"
              style={{ background: B.s1, ...T.body, fontSize: 13, color: B.text }}
            />
            <Button size="md" type="submit">Добавить</Button>
          </form>
        </DockPlate>
      </div>
    </div>
  );
}

const PROJ = "32px minmax(0,1.4fr) 240px minmax(0,1fr) 80px 80px";
