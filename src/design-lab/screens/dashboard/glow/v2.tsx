/**
 * Dashboard · Graphite Glow · v2 «Парящие слои»
 * A floating rounded sidebar; the canvas is open, lit by a broad ambient light from above with a
 * fading dot grid. Widgets are translucent glass. The hero is a full-width area chart drawn as
 * light (14 days) with a tooltip-style marker on today, KPIs riding along its header.
 */
import { useState } from "react";

import { useDashboardModel } from "@/design-lab/screens/dashboardModel";
import {
  G,
  t,
  mono,
  bigNum,
  display,
  rootStyle,
  Ambient,
  Bloom,
  DotGrid,
  Surface,
  Head,
  IconBox,
  Mark,
  Kbd,
  NAV_ICON,
  PrimaryBtn,
  GhostBtn,
  Chip,
  Dot,
  AreaGlow,
  HeatCells,
  Meter,
  StatusBar,
  Empty,
  TaskLine,
  AddTask,
  NoteBox,
  MeetingLine,
  ReadingCard,
  Rub,
  Segmented,
  HEALTH_TONE,
  PRIO_TONE,
  toneColor,
} from "@/design-lab/screens/_kit/glow";
import { BookOpen, CalendarArrowUp, CalendarClock, FolderKanban, Layers, ListTodo, NotebookPen, Plus, Search, Wallet } from "lucide-react";

const ADD_ID = "g2-add";

export default function GlowV2() {
  const m = useDashboardModel();
  const k = m.kpi;
  const [tab, setTab] = useState<"plan" | "over">("plan");
  const today = m.dynamics[m.dynamics.length - 1];
  const planDone = m.plan.filter((r) => r.done).length;

  return (
    <div className="relative min-h-screen overflow-hidden" style={rootStyle}>
      <Ambient
        pools={[
          { x: "58%", y: "-8%", size: 1500, o: 0.085 },
          { x: "96%", y: "62%", size: 760, o: 0.035 },
          { x: "22%", y: "92%", size: 700, o: 0.03 },
        ]}
      />
      <DotGrid step={24} opacity={0.08} mask="radial-gradient(60% 45% at 58% 0%, #000 0%, transparent 80%)" />

      {/* ── Floating sidebar ─────────────────────────────────────────────── */}
      <aside className="fixed bottom-4 left-4 top-4 z-10 w-[224px]">
        <Surface kind="glass" r={24} className="flex h-full flex-col p-3" edgeStrength={0.35}>
          <div className="flex items-center gap-3 px-2 pt-2">
            <Mark size={30} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>Рабочий стол</span>
          </div>
          <nav className="mt-7 flex flex-col gap-0.5" aria-label="Разделы">
            {m.nav.map((n) => {
              const active = n.id === "dashboard";
              const I = NAV_ICON[n.id] ?? Layers;
              return (
                <a
                  key={n.id}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-current={active ? "page" : undefined}
                  className="relative flex h-10 items-center gap-3 rounded-[12px] px-1.5 transition-colors duration-150 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                  style={active ? { background: "rgba(255,255,255,0.07)", boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 1px ${G.line2}` } : undefined}
                >
                  <IconBox icon={I} size={28} active={active} />
                  <span className="flex-1 text-[14px]" style={{ color: active ? G.ink : G.ink2, fontWeight: active ? 500 : 400 }}>
                    {n.label}
                  </span>
                  {n.badge ? (
                    <span className="mr-1.5" style={{ ...mono(12), color: G.ink3 }}>
                      {n.badge}
                    </span>
                  ) : null}
                </a>
              );
            })}
          </nav>
          <div className="mt-auto rounded-[16px] p-3.5" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${G.line}` }}>
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 13, fontWeight: 500 }}>Уровень {k.level}</span>
              <span style={t.meta}>{k.levelTitle}</span>
            </div>
            <div className="mt-2.5">
              <Meter pct={k.levelPct} h={3} />
            </div>
            <div className="mt-2" style={t.meta}>
              <span style={mono(12)}>{k.xpToNext}</span> XP до следующего
            </div>
          </div>
        </Surface>
      </aside>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <main className="relative ml-[256px] px-8 pb-12 pt-9">
        <header className="flex items-end justify-between gap-6">
          <div>
            <div style={t.small}>{m.dateLabel}</div>
            <h1 className="mt-2" style={display(44, 600)}>
              {m.greeting}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <GhostBtn icon={Search} className="!h-10 !px-3.5">
              <span className="mr-6">Поиск</span>
              <Kbd>/</Kbd>
            </GhostBtn>
            <PrimaryBtn icon={Plus} onClick={() => document.getElementById(ADD_ID)?.focus()}>
              Новая задача
            </PrimaryBtn>
          </div>
        </header>

        {/* HERO — full-width chart drawn as light */}
        <Surface kind="glass" r={28} className="mt-7 overflow-hidden px-7 pb-5 pt-6" edgeStrength={0.45}>
          <Bloom x="88%" y="70%" size={420} opacity={0.08} blur={30} />
          <div className="relative flex items-start justify-between gap-8">
            <div>
              <div style={t.eyebrow}>Ритм · 14 дней</div>
              <div className="mt-3 flex items-baseline gap-3">
                <span style={bigNum(60, { textShadow: "0 0 36px rgba(255,255,255,0.22)" })}>{m.closed14}</span>
                <span style={t.small}>задач закрыто</span>
                <Chip pill>пик {m.peak14} в день</Chip>
              </div>
            </div>
            <div className="flex">
              {[
                {
                  l: "Сегодня",
                  v: `${k.todayDone}/${k.todayTotal}`,
                  s: k.overdueToday ? `${k.overdueToday} просрочено` : "без просрочек",
                  hot: k.overdueToday > 0,
                },
                { l: "Время", v: k.timeLabel, s: `цель ${k.closedToday}/${k.dailyGoal}` },
                { l: "Открыто", v: String(k.openCount), s: `${m.status.overdueAll} просрочено`, hot: m.status.overdueAll > 0 },
                { l: "За неделю", v: String(k.weekDone), s: `серия ${k.streak} дн.` },
              ].map((s, i) => (
                <div key={s.l} className="flex w-[140px] flex-col gap-1.5 px-5" style={{ borderLeft: i ? `1px solid ${G.line2}` : undefined }}>
                  <span style={t.meta}>{s.l}</span>
                  <span style={mono(24)}>{s.v}</span>
                  <span className="truncate" style={{ fontSize: 12, color: s.hot ? toneColor("red") : G.ink3 }}>
                    {s.s}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-4">
            <AreaGlow
              values={m.dynamics.map((d) => d.value)}
              height={220}
              padTop={48}
              dotsAll
              tooltip={
                <span className="flex items-center gap-2">
                  <Dot tone="white" size={6} />
                  <span style={{ color: G.ink2 }}>Сегодня</span>
                  <span style={mono(12, 500)}>{today.value} закрыто</span>
                </span>
              }
            />
            <div className="mt-2 flex justify-between px-[2px]">
              {m.dynamics.map((d, i) => (
                <span key={d.date} style={{ ...mono(10.5), color: i === m.dynamics.length - 1 ? G.ink : G.ink4, width: 0, display: "flex", justifyContent: "center" }}>
                  {i === m.dynamics.length - 1 ? "сегодня" : d.label}
                </span>
              ))}
            </div>
          </div>
        </Surface>

        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* PLAN / OVER PLAN */}
          <Surface kind="glass" r={24} className="col-span-7 row-span-2 flex flex-col p-3">
            <div className="flex items-center justify-between px-3 pb-2 pt-2">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { id: "plan", label: "План дня", count: m.plan.length },
                  { id: "over", label: "Сверх плана", count: m.overPlan.length },
                ]}
              />
              {tab === "plan" ? (
                <span style={t.meta}>
                  {planDone} из {m.plan.length} готово
                </span>
              ) : (
                <GhostBtn size="sm" icon={CalendarArrowUp} onClick={m.actions.moveOverPlanToTomorrow} disabled={!m.overPlan.length}>
                  Перенести на завтра
                </GhostBtn>
              )}
            </div>
            <div className="flex flex-col">
              {tab === "plan" ? (
                m.plan.length ? (
                  m.plan.map((r) => <TaskLine key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />)
                ) : (
                  <Empty icon={ListTodo} title="План на сегодня пуст" text="Добавьте задачу — она встанет в фокус дня." />
                )
              ) : m.overPlan.length ? (
                <div className="max-h-[300px] overflow-y-auto" style={{ maskImage: "linear-gradient(180deg,#000 80%,transparent)", WebkitMaskImage: "linear-gradient(180deg,#000 80%,transparent)" }}>
                  {m.overPlan.map((r) => (
                    <TaskLine key={r.id} r={r} dense chips="due" onToggle={() => m.actions.toggle(r.id)} />
                  ))}
                </div>
              ) : (
                <Empty icon={Layers} title="Всё влезло в план" text="Лишних задач на сегодня нет." />
              )}
            </div>
            <div className="mt-auto px-1 pt-3">
              <AddTask id={ADD_ID} onAdd={m.actions.add} />
            </div>
          </Surface>

          {/* MEETINGS */}
          <Surface kind="glass" r={24} className="col-span-5 p-3">
            <div className="px-3 pt-2">
              <Head title="Встречи" count={m.meetings.length || undefined} icon={CalendarClock} />
            </div>
            {m.meetings.length ? (
              <div className="mt-2">
                {m.meetings.slice(0, 3).map((mt) => (
                  <MeetingLine key={mt.id} mt={mt} onToggle={() => m.actions.toggleMeeting(mt.id)} />
                ))}
              </div>
            ) : (
              <Empty compact icon={CalendarClock} title="Встреч нет" text="Ближайшие дни свободны — хорошее время для фокуса." />
            )}
          </Surface>

          {/* MONEY */}
          <Surface kind="glass" r={24} className="col-span-5 overflow-hidden p-5">
            <Head title="Деньги" count="месяц" icon={Wallet} />
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { l: "Оплачено", n: m.money.paidThisMonth },
                { l: "Ожидается", n: m.money.pending },
                { l: "Просрочено", n: m.money.overdue, hot: m.money.overdue > 0 },
              ].map((x) => (
                <div key={x.l} className="rounded-[14px] p-3" style={{ background: "rgba(0,0,0,0.22)", border: `1px solid ${G.line}` }}>
                  <div style={t.meta}>{x.l}</div>
                  <div className="mt-1.5">
                    <Rub n={x.n} size={17} color={x.hot ? toneColor("red") : undefined} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3" style={t.meta}>
              {m.followUps.length ? `Напомнить: ${m.followUps.map((f) => f.name).join(", ")}` : "Напоминаний клиентам на сегодня нет"}
            </div>
          </Surface>

          {/* PROJECTS — glass tiles */}
          <Surface kind="glass" r={24} className="col-span-7 p-5">
            <Head title="Проекты" count={m.projects.length} icon={FolderKanban} />
            {m.projects.length ? (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {m.projects.slice(0, 6).map((p) => {
                  const tone = HEALTH_TONE[p.health];
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col gap-3 rounded-[16px] p-3.5 transition-colors hover:bg-white/[0.03]"
                      style={{ background: "rgba(0,0,0,0.22)", border: `1px solid ${G.line}` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>
                          {p.name}
                        </span>
                        <Dot tone={tone} />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span style={mono(22)}>
                          {Math.round(p.pct)}
                          <span style={{ ...mono(13), color: G.ink3 }}>%</span>
                        </span>
                        <span style={{ ...mono(11.5), color: G.ink3 }}>
                          {p.done}/{p.total}
                        </span>
                      </div>
                      <Meter pct={p.pct} tone={tone === "red" ? "red" : "white"} h={3} />
                      <span style={{ fontSize: 12, color: tone === "neutral" ? G.ink3 : toneColor(tone) }}>
                        {p.healthLabel}
                        {p.overdue ? <span style={{ color: G.ink3 }}> · {p.overdue} просроч.</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty compact icon={FolderKanban} title="Проектов нет" />
            )}
          </Surface>

          {/* STATUS + YEAR */}
          <Surface kind="glass" r={24} className="col-span-5 p-5">
            <Head title="Статус задач" />
            <div className="mt-4 flex items-baseline gap-6">
              {[
                { l: "выполнено", v: m.status.doneAll },
                { l: "в работе", v: m.status.inProgress },
                { l: "просрочено", v: m.status.overdueAll, hot: m.status.overdueAll > 0 },
              ].map((s) => (
                <span key={s.l} className="flex items-baseline gap-1.5">
                  <span style={{ ...mono(22), color: s.hot ? toneColor("red") : G.ink }}>{s.v}</span>
                  <span style={t.meta}>{s.l}</span>
                </span>
              ))}
            </div>
            <div className="mt-3">
              <StatusBar done={m.status.doneAll} progress={m.status.inProgress} overdue={m.status.overdueAll} h={6} />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {m.status.openByPriority.map((p) => (
                <Chip key={p.priority} tone={PRIO_TONE[p.priority]} dot={p.priority !== 0}>
                  {p.label} <span style={mono(11.5)}>{p.count}</span>
                </Chip>
              ))}
            </div>
            <div className="mt-5 border-t pt-4" style={{ borderColor: G.line }}>
              <div className="mb-2.5 flex justify-between" style={t.meta}>
                <span>Полгода активности</span>
                <span>
                  лучшая серия <span style={mono(12)}>{k.bestStreak}</span>
                </span>
              </div>
              <HeatCells cells={m.year} cell={11} gap={3} />
            </div>
          </Surface>

          {/* NOTE */}
          <Surface kind="glass" r={24} className="col-span-7 p-5">
            <Head title="Быстрая заметка" icon={NotebookPen} />
            <div className="mt-4">
              <NoteBox onSave={m.actions.saveNote} rows={2} />
            </div>
          </Surface>

          {/* READING */}
          <Surface kind="glass" r={24} className="col-span-5 p-5">
            <Head title="Прочитать сегодня" icon={BookOpen} />
            <div className="mt-4">
              {m.reading ? (
                <ReadingCard item={m.reading} size={72} />
              ) : (
                <div style={t.small}>Очередь чтения пуста — добавьте ссылку в Библиотеку.</div>
              )}
            </div>
          </Surface>
        </div>
      </main>
    </div>
  );
}
