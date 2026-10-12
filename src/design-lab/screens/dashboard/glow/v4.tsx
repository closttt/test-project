/**
 * Dashboard · Graphite Glow · v4 «Верхняя навигация»
 * No sidebar. A blurred top bar carries the logo, ALL sections as horizontal pills in one
 * capsule, a «/» search hint and the white quick-add. Under it — a KPI ticker strip with
 * sparklines, then a two-column reading layout of lists; charts are thin glowing lines only.
 */
import { useDashboardModel } from "@/design-lab/screens/dashboardModel";
import {
  G,
  t,
  mono,
  display,
  rootStyle,
  Ambient,
  Surface,
  Head,
  Mark,
  Kbd,
  NAV_ICON,
  PrimaryBtn,
  GhostBtn,
  Chip,
  AreaGlow,
  Spark,
  HeatCells,
  Meter,
  StatusBar,
  Empty,
  TaskLine,
  AddTask,
  NoteBox,
  MeetingLine,
  ProjectLine,
  ReadingCard,
  Rub,
  N,
  PRIO_TONE,
  Dot,
  toneColor,
} from "@/design-lab/screens/_kit/glow";
import { Activity, BookOpen, CalendarArrowUp, CalendarClock, FolderKanban, Layers, ListTodo, NotebookPen, Plus, Search } from "lucide-react";

const ADD_ID = "g4-add";

export default function GlowV4() {
  const m = useDashboardModel();
  const k = m.kpi;
  const planDone = m.plan.filter((r) => r.done).length;
  const series = m.dynamics.map((d) => d.value);

  return (
    <div className="relative min-h-screen" style={rootStyle}>
      <Ambient pools={[{ x: "50%", y: "0%", size: 1300, o: 0.06 }]} />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 flex h-16 items-center gap-4 px-8"
        style={{
          background: "rgba(5,5,5,0.72)",
          backdropFilter: "blur(18px) saturate(140%)",
          WebkitBackdropFilter: "blur(18px) saturate(140%)",
          borderBottom: `1px solid ${G.line}`,
        }}
      >
        <div className="flex shrink-0 items-center gap-2.5">
          <Mark size={30} />
          <span className="hidden min-[1400px]:inline" style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Рабочий стол
          </span>
        </div>

        <nav className="mx-auto flex items-center gap-0.5 rounded-full p-1" aria-label="Разделы" style={{ background: G.c1, border: `1px solid ${G.line2}` }}>
          {m.nav.map((n) => {
            const active = n.id === "dashboard";
            const I = NAV_ICON[n.id] ?? Layers;
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-current={active ? "page" : undefined}
                className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors duration-150 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                style={
                  active
                    ? {
                        color: G.ink,
                        fontWeight: 500,
                        background: `linear-gradient(180deg, ${G.c7}, ${G.c5})`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 1px ${G.line2}, 0 0 18px -4px rgba(255,255,255,0.28)`,
                      }
                    : { color: G.ink2 }
                }
              >
                <I size={16} strokeWidth={1.5} aria-hidden />
                {n.label}
                {n.badge ? <span style={{ ...mono(11), color: G.ink3 }}>{n.badge}</span> : null}
              </a>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <label
            className="flex h-9 cursor-text items-center gap-2 rounded-full pl-3 pr-1.5 transition-colors focus-within:border-white/20"
            style={{ background: G.c1, border: `1px solid ${G.line2}` }}
          >
            <Search size={15} strokeWidth={1.5} color={G.ink3} aria-hidden />
            <input placeholder="Поиск" aria-label="Поиск" className="w-[52px] bg-transparent text-[13px] outline-none placeholder:text-[#6e6e6e] min-[1400px]:w-[92px]" />
            <Kbd>/</Kbd>
          </label>
          <PrimaryBtn size="sm" icon={Plus} onClick={() => document.getElementById(ADD_ID)?.focus()} className="!rounded-full">
            Задача
          </PrimaryBtn>
        </div>
      </header>

      <main className="relative px-8 pb-12 pt-8">
        {/* Greeting + level */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 style={display(32)}>{m.greeting}</h1>
            <div className="mt-1.5" style={t.small}>
              {m.dateLabel} · в плане <N size={13}>{m.plan.length - planDone}</N>, сверх плана <N size={13}>{m.overPlan.length}</N>
            </div>
          </div>
          <div className="flex w-[260px] flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                Уровень <N size={13} weight={500}>{k.level}</N> <span style={{ color: G.ink3, fontWeight: 400 }}>· {k.levelTitle}</span>
              </span>
              <span style={t.meta}>
                <N>{k.xpToNext}</N> XP
              </span>
            </div>
            <Meter pct={k.levelPct} h={3} />
          </div>
        </div>

        {/* KPI ticker */}
        <Surface kind="solid" r={18} className="mt-6 grid grid-cols-5">
          {[
            {
              l: "Сегодня",
              v: (
                <>
                  {k.todayDone}
                  <span style={{ color: G.ink3 }}>/{k.todayTotal}</span>
                </>
              ),
              s: k.overdueToday ? `${k.overdueToday} просрочено` : "без просрочек",
              hot: k.overdueToday > 0,
              viz: <Spark values={series} w={76} h={26} />,
            },
            {
              l: "Время сегодня",
              v: k.timeLabel,
              s: `закрыто ${k.closedToday} из ${k.dailyGoal}`,
              viz: (
                <div className="w-[64px]">
                  <Meter pct={k.dailyGoal ? (k.closedToday / k.dailyGoal) * 100 : 0} h={3} />
                </div>
              ),
            },
            {
              l: "Открыто",
              v: String(k.openCount),
              s: `${m.status.overdueAll} просрочено`,
              hot: m.status.overdueAll > 0,
              viz: (
                <div className="w-[64px]">
                  <StatusBar done={0} progress={m.status.inProgress} overdue={m.status.overdueAll} h={3} />
                </div>
              ),
            },
            {
              l: "За неделю",
              v: String(k.weekDone),
              s: `серия ${k.streak} дн. · лучшая ${k.bestStreak}`,
              viz: <Spark values={m.week.map((d) => d.done)} w={64} h={26} />,
            },
            {
              l: "Деньги · месяц",
              v: <Rub n={m.money.paidThisMonth} size={24} />,
              s: `ожидается ${Math.round(m.money.pending).toLocaleString("ru-RU")} ₽`,
              viz: null,
            },
          ].map((c, i) => (
            <div key={c.l} className="flex min-w-0 flex-col gap-2 px-5 py-4" style={{ borderLeft: i ? `1px solid ${G.line}` : undefined }}>
              <span style={t.meta}>{c.l}</span>
              <div className="flex items-end justify-between gap-3">
                <span style={mono(26)}>{c.v}</span>
                <span className="mb-1.5 shrink-0">{c.viz}</span>
              </div>
              <span className="truncate" style={{ fontSize: 12, color: c.hot ? toneColor("red") : G.ink3 }}>
                {c.s}
              </span>
            </div>
          ))}
        </Surface>

        {/* Two columns of lists */}
        <div className="mt-4 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4">
          <div className="flex min-w-0 flex-col gap-4">
            <Surface kind="solid" r={20} className="p-3">
              <div className="px-3 pb-2 pt-2">
                <Head title="План дня" count={`${planDone}/${m.plan.length}`} icon={ListTodo} right={m.focusLimit ? <span style={t.meta}>фокус {m.focusLimit} задач</span> : undefined} />
              </div>
              {m.plan.length ? (
                m.plan.map((r) => <TaskLine key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />)
              ) : (
                <Empty icon={ListTodo} title="План на сегодня пуст" text="Добавьте задачу — она встанет в фокус дня." />
              )}
              <div className="px-1 pt-2">
                <AddTask id={ADD_ID} onAdd={m.actions.add} />
              </div>
            </Surface>

            <Surface kind="solid" r={20} className="p-3">
              <div className="px-3 pb-1 pt-2">
                <Head
                  title="Сверх плана"
                  count={m.overPlan.length}
                  icon={Layers}
                  right={
                    <GhostBtn size="sm" icon={CalendarArrowUp} onClick={m.actions.moveOverPlanToTomorrow} disabled={!m.overPlan.length}>
                      Перенести на завтра
                    </GhostBtn>
                  }
                />
              </div>
              {m.overPlan.length ? (
                <div className="grid grid-cols-2 gap-x-1">
                  {m.overPlan.slice(0, 10).map((r) => (
                    <TaskLine key={r.id} r={r} dense chips="none" onToggle={() => m.actions.toggle(r.id)} />
                  ))}
                </div>
              ) : (
                <Empty compact icon={Layers} title="Всё влезло в план" />
              )}
              {m.overPlan.length > 10 && (
                <div className="px-3 pb-1 pt-1" style={t.meta}>
                  и ещё <N>{m.overPlan.length - 10}</N>
                </div>
              )}
            </Surface>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Surface kind="solid" r={20} className="p-3">
              <div className="px-3 pt-2">
                <Head title="Встречи" icon={CalendarClock} count={m.meetings.length || undefined} />
              </div>
              {m.meetings.length ? (
                <div className="mt-2">
                  {m.meetings.slice(0, 4).map((mt) => (
                    <MeetingLine key={mt.id} mt={mt} onToggle={() => m.actions.toggleMeeting(mt.id)} />
                  ))}
                </div>
              ) : (
                <Empty compact icon={CalendarClock} title="Встреч нет" text="В календаре пусто на ближайшие дни." />
              )}
            </Surface>

            <Surface kind="solid" r={20} className="p-3">
              <div className="px-3 pb-1 pt-2">
                <Head title="Проекты" count={m.projects.length} icon={FolderKanban} />
              </div>
              {m.projects.length ? m.projects.map((p) => <ProjectLine key={p.id} p={p} />) : <Empty compact icon={FolderKanban} title="Проектов нет" />}
            </Surface>
          </div>
        </div>

        {/* Rhythm — thin lines */}
        <Surface kind="solid" r={20} className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-10 p-5">
          <div className="min-w-0">
            <Head
              title="Ритм"
              count="14 дней"
              icon={Activity}
              right={
                <span style={t.meta}>
                  <N color={G.ink}>{m.closed14}</N> закрыто · пик <N color={G.ink}>{m.peak14}</N>
                </span>
              }
            />
            <div className="mt-3">
              <AreaGlow values={series} height={130} fill={false} lineWidth={1.25} padTop={22} grid={2} dotsAll />
            </div>
            <div className="mt-2 flex justify-between" style={{ ...mono(10.5), color: G.ink4 }}>
              <span>{m.dynamics[0].label}</span>
              <span>{m.dynamics[7].label}</span>
              <span style={{ color: G.ink }}>сегодня</span>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-l pl-10" style={{ borderColor: G.line }}>
            <div>
              <div className="mb-2.5" style={t.meta}>
                Полгода
              </div>
              <HeatCells cells={m.year} cell={10} gap={3} />
            </div>
            <div>
              <div className="flex items-baseline gap-4" style={t.meta}>
                <span>
                  <N size={14} color={G.ink}>{m.status.doneAll}</N> готово
                </span>
                <span>
                  <N size={14} color={G.ink}>{m.status.inProgress}</N> в работе
                </span>
                <span>
                  <N size={14} color={toneColor("red")}>{m.status.overdueAll}</N> просрочено
                </span>
              </div>
              <div className="mt-2.5">
                <StatusBar done={m.status.doneAll} progress={m.status.inProgress} overdue={m.status.overdueAll} h={4} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {m.status.openByPriority.map((p) => (
                  <span key={p.priority} className="mr-2.5 flex items-center gap-1.5" style={t.meta}>
                    <Dot tone={PRIO_TONE[p.priority]} size={5} />
                    {p.label} <N color={G.ink2}>{p.count}</N>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Surface>

        {/* Money · note · reading */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Surface kind="solid" r={20} className="p-5">
            <Head title="Деньги" count="месяц" />
            <div className="mt-4 flex flex-col gap-3">
              {[
                { l: "Оплачено", n: m.money.paidThisMonth, of: m.money.paidThisMonth + m.money.pending + m.money.overdue },
                { l: "Ожидается", n: m.money.pending, of: m.money.paidThisMonth + m.money.pending + m.money.overdue },
                { l: "Просрочено", n: m.money.overdue, of: m.money.paidThisMonth + m.money.pending + m.money.overdue, hot: true },
              ].map((x) => (
                <div key={x.l} className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span style={t.small}>{x.l}</span>
                    <Rub n={x.n} size={13} weight={500} color={x.hot && x.n > 0 ? toneColor("red") : undefined} />
                  </div>
                  <Meter pct={x.of ? (x.n / x.of) * 100 : 0} tone={x.hot ? "red" : "white"} h={2} />
                </div>
              ))}
            </div>
            <div className="mt-4">
              {m.followUps.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {m.followUps.map((f) => (
                    <Chip key={f.id} tone="amber" dot>
                      {f.name}
                    </Chip>
                  ))}
                </div>
              ) : (
                <span style={t.meta}>Напоминаний клиентам нет</span>
              )}
            </div>
          </Surface>
          <Surface kind="solid" r={20} className="p-5">
            <Head title="Заметка" icon={NotebookPen} />
            <div className="mt-4">
              <NoteBox onSave={m.actions.saveNote} rows={3} />
            </div>
          </Surface>
          <Surface kind="solid" r={20} className="p-5">
            <Head title="Прочитать сегодня" icon={BookOpen} />
            <div className="mt-4">{m.reading ? <ReadingCard item={m.reading} size={64} /> : <span style={t.small}>Очередь чтения пуста.</span>}</div>
          </Surface>
        </div>
      </main>
    </div>
  );
}
