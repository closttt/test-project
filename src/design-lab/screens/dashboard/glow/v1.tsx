/**
 * Dashboard · Graphite Glow · v1 «Рамка · бенто»
 * Sidebar lives on the black canvas; the workspace is ONE inset rounded panel lit from the top.
 * Inside: an asymmetric bento — a tall hero tile (today as a glowing ring + KPI quartet), the
 * plan beside it, a narrow stack of meetings + money, then rhythm / projects, over-plan / status
 * / note + reading tiles of different widths.
 */
import { useDashboardModel, rub } from "@/design-lab/screens/dashboardModel";
import {
  G,
  t,
  mono,
  bigNum,
  display,
  rootStyle,
  Ambient,
  Bloom,
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
  Ring,
  BarsGlow,
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
  KV,
  Rub,
  N,
  PRIO_TONE,
  plural,
  toneColor,
} from "@/design-lab/screens/_kit/glow";
import {
  CalendarClock,
  CalendarArrowUp,
  Flame,
  ListTodo,
  NotebookPen,
  Plus,
  Search,
  Wallet,
  Activity,
  FolderKanban,
  Layers,
  BookOpen,
  Settings,
} from "lucide-react";

const ADD_ID = "g1-add";

export default function GlowV1() {
  const m = useDashboardModel();
  const k = m.kpi;
  const pct = k.todayTotal ? (k.todayDone / k.todayTotal) * 100 : 0;
  const planDone = m.plan.filter((r) => r.done).length;

  return (
    <div className="relative flex min-h-screen" style={rootStyle}>
      <Ambient pools={[{ x: "8%", y: "0%", size: 520, o: 0.05 }]} />

      {/* ── Sidebar on the canvas ─────────────────────────────────────────── */}
      <aside className="sticky top-0 flex h-screen w-[228px] shrink-0 flex-col px-3.5 pb-4 pt-5">
        <div className="flex items-center gap-3 px-2">
          <Mark size={32} />
          <div className="min-w-0">
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>Рабочий стол</div>
            <div style={t.meta}>Личный CRM</div>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-0.5" aria-label="Разделы">
          {m.nav.map((n) => {
            const active = n.id === "dashboard";
            const I = NAV_ICON[n.id] ?? Layers;
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-current={active ? "page" : undefined}
                className="group relative flex h-10 items-center gap-3 rounded-[12px] px-1.5 transition-colors duration-150 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                style={
                  active
                    ? {
                        background: `linear-gradient(180deg, ${G.c6}, ${G.c4})`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 1px ${G.line2}`,
                      }
                    : undefined
                }
              >
                <IconBox icon={I} size={28} active={active} />
                <span className="flex-1 text-[14px]" style={{ color: active ? G.ink : G.ink2, fontWeight: active ? 500 : 400 }}>
                  {n.label}
                </span>
                {n.badge ? (
                  <span className="mr-1.5 rounded-full px-1.5" style={{ ...mono(11.5, 500), color: G.ink2, background: "rgba(255,255,255,0.06)" }}>
                    {n.badge}
                  </span>
                ) : null}
              </a>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex h-10 items-center gap-3 rounded-[12px] px-1.5 text-[14px] transition-colors hover:bg-white/[0.035]"
            style={{ color: G.ink2 }}
          >
            <IconBox icon={Settings} size={28} />
            Настройки
          </a>
          <Surface kind="solid" r={16} className="p-4">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                Уровень {k.level}
                <span style={{ color: G.ink3, fontWeight: 400 }}> · {k.levelTitle}</span>
              </span>
              <span style={{ ...mono(12), color: G.ink2 }}>{Math.round(k.levelPct)}%</span>
            </div>
            <div className="mt-3">
              <Meter pct={k.levelPct} h={3} />
            </div>
            <div className="mt-2.5 flex items-center justify-between" style={t.meta}>
              <span>
                <span style={mono(12)}>{k.xpToNext}</span> XP до {k.level + 1}
              </span>
              <span className="flex items-center gap-1">
                <Flame size={12} strokeWidth={1.5} aria-hidden /> <span style={mono(12)}>{k.streak}</span> дн.
              </span>
            </div>
          </Surface>
        </div>
      </aside>

      {/* ── Workspace: one inset panel with top light ─────────────────────── */}
      <div className="min-w-0 flex-1 py-2 pr-2">
        <main
          className="relative min-h-[calc(100vh-16px)] overflow-hidden rounded-[24px] px-8 pb-8 pt-7"
          style={{
            background: `linear-gradient(180deg, ${G.c2} 0%, ${G.c1} 420px)`,
            border: `1px solid ${G.line2}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px #000",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[-1px] h-px"
            style={{ background: "linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.4) 50%, transparent 95%)" }}
          />
          <Bloom x="50%" y="-60px" size={900} opacity={0.07} blur={40} />

          {/* header */}
          <header className="relative flex items-end justify-between gap-6">
            <div className="min-w-0">
              <div style={t.eyebrow}>{m.dateLabel}</div>
              <h1 className="mt-2" style={display(30)}>
                {m.greeting}
                <span style={{ color: G.ink3, fontWeight: 500 }}>
                  {" "}
                  · {m.plan.length - planDone} {plural(m.plan.length - planDone, "задача", "задачи", "задач")} в плане
                </span>
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <label
                className="flex h-10 w-[260px] cursor-text items-center gap-2.5 rounded-[12px] px-3 transition-colors focus-within:border-white/20"
                style={{ background: G.c1, border: `1px solid ${G.line2}` }}
              >
                <Search size={16} strokeWidth={1.5} color={G.ink3} aria-hidden />
                <input placeholder="Поиск" aria-label="Поиск" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#6e6e6e]" />
                <Kbd>/</Kbd>
              </label>
              <PrimaryBtn icon={Plus} onClick={() => document.getElementById(ADD_ID)?.focus()}>
                Новая задача
              </PrimaryBtn>
            </div>
          </header>

          {/* bento */}
          <div className="relative mt-7 grid grid-cols-12 gap-3">
            {/* HERO — today */}
            <Surface kind="raised" r={22} className="col-span-4 row-span-2 flex flex-col overflow-hidden p-5">
              <Bloom x="50%" y="44%" size={340} opacity={0.11} blur={30} />
              <div className="relative flex items-center justify-between">
                <span style={t.eyebrow}>Сегодня</span>
                {k.overdueToday > 0 ? (
                  <Chip tone="red" dot pill>
                    {k.overdueToday} просрочено
                  </Chip>
                ) : (
                  <Chip pill>без просрочек</Chip>
                )}
              </div>
              <div className="relative mt-3 flex justify-center">
                <Ring pct={pct} size={232} stroke={10}>
                  <div className="flex items-baseline">
                    <span style={bigNum(64, { textShadow: "0 0 30px rgba(255,255,255,0.3)" })}>{k.todayDone}</span>
                    <span style={bigNum(26, { color: G.ink3, fontWeight: 400 })}>/{k.todayTotal}</span>
                  </div>
                  <span className="mt-2" style={t.small}>
                    закрыто за день
                  </span>
                </Ring>
              </div>
              <div className="relative mt-auto grid grid-cols-2 pt-5">
                {[
                  { l: "В работе сегодня", v: k.timeLabel },
                  { l: "Цель дня", v: `${k.closedToday}/${k.dailyGoal}` },
                  { l: "Открыто всего", v: String(k.openCount) },
                  { l: "Закрыто за неделю", v: String(k.weekDone) },
                ].map((s, i) => (
                  <div
                    key={s.l}
                    className="flex flex-col gap-1.5 py-3"
                    style={{
                      borderTop: `1px solid ${G.line}`,
                      paddingLeft: i % 2 ? 16 : 0,
                      borderLeft: i % 2 ? `1px solid ${G.line}` : undefined,
                    }}
                  >
                    <span style={t.meta}>{s.l}</span>
                    <span style={mono(22)}>{s.v}</span>
                  </div>
                ))}
              </div>
            </Surface>

            {/* PLAN */}
            <Surface kind="solid" r={22} className="col-span-5 row-span-2 flex flex-col p-3">
              <div className="px-3 pb-2 pt-2">
                <Head
                  title="План дня"
                  count={`${planDone} из ${m.plan.length}`}
                  icon={ListTodo}
                  right={m.focusLimit ? <span style={t.meta}>лимит фокуса {m.focusLimit}</span> : undefined}
                />
              </div>
              <div className="flex flex-col">
                {m.plan.length === 0 ? (
                  <Empty icon={ListTodo} title="План на сегодня пуст" text="Добавьте задачу ниже — она встанет в фокус дня." />
                ) : (
                  m.plan.map((r) => <TaskLine key={r.id} r={r} chips="compact" onToggle={() => m.actions.toggle(r.id)} />)
                )}
              </div>
              <div className="mt-auto px-1 pt-3">
                <AddTask id={ADD_ID} onAdd={m.actions.add} />
              </div>
            </Surface>

            {/* MEETINGS */}
            <Surface kind="solid" r={22} className="col-span-3 flex flex-col p-3">
              <div className="px-3 pt-2">
                <Head title="Встречи" count={m.meetings.length || undefined} icon={CalendarClock} />
              </div>
              {m.meetings.length === 0 ? (
                <Empty compact icon={CalendarClock} title="Встреч нет" text="День свободен для глубокой работы." />
              ) : (
                <div className="mt-2 flex flex-col">
                  {m.meetings.slice(0, 3).map((mt) => (
                    <MeetingLine key={mt.id} mt={mt} onToggle={() => m.actions.toggleMeeting(mt.id)} />
                  ))}
                </div>
              )}
            </Surface>

            {/* MONEY */}
            <Surface kind="solid" r={22} className="col-span-3 flex flex-col overflow-hidden p-5">
              <Bloom x="85%" y="0%" size={200} opacity={0.06} blur={20} />
              <div className="relative flex items-center gap-2.5">
                <IconBox icon={Wallet} size={28} />
                <span style={t.section}>Деньги</span>
                
              </div>
              <div className="relative mt-4 flex items-baseline gap-1.5">
                <Rub n={m.money.paidThisMonth} size={34} />
              </div>
              <div className="relative mt-1" style={t.meta}>
                оплачено · всего {rub(m.money.paidTotal)}
              </div>
              <div className="relative mt-4 border-t pt-2" style={{ borderColor: G.line }}>
                <KV k="Ожидается" v={<Rub n={m.money.pending} size={13} weight={500} />} />
                <KV k="Просрочено" v={<Rub n={m.money.overdue} size={13} weight={500} />} tone={m.money.overdue > 0 ? "red" : undefined} />
                <KV plain k="Напомнить" v={m.followUps.length ? m.followUps.map((f) => f.name).join(", ") : "никого"} tone={m.followUps.length ? "amber" : undefined} />
              </div>
            </Surface>

            {/* RHYTHM */}
            <Surface kind="solid" r={22} className="col-span-7 p-5">
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
              <div className="mt-5">
                <BarsGlow values={m.dynamics.map((d) => d.value)} labels={m.dynamics.map((d) => d.label.split(".")[0])} height={112} />
              </div>
              <div className="mt-5 flex items-end justify-between gap-6 border-t pt-4" style={{ borderColor: G.line }}>
                <div className="min-w-0">
                  <div style={t.meta}>Полгода</div>
                  <div className="mt-2.5">
                    <HeatCells cells={m.year} cell={11} gap={3} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span style={t.meta}>серия</span>
                  <span style={mono(28)}>
                    {k.streak}
                    <span style={{ ...mono(14), color: G.ink3 }}> дн.</span>
                  </span>
                  <span style={t.meta}>лучшая {k.bestStreak}</span>
                </div>
              </div>
            </Surface>

            {/* PROJECTS */}
            <Surface kind="solid" r={22} className="col-span-5 flex flex-col p-3">
              <div className="px-3 pb-1 pt-2">
                <Head title="Проекты" count={m.projects.length} icon={FolderKanban} />
              </div>
              {m.projects.length === 0 ? (
                <Empty compact icon={FolderKanban} title="Проектов нет" />
              ) : (
                <div className="flex flex-col">
                  {m.projects.slice(0, 6).map((p) => (
                    <ProjectLine key={p.id} p={p} dense />
                  ))}
                </div>
              )}
            </Surface>

            {/* OVER PLAN */}
            <Surface kind="solid" r={22} className="col-span-5 flex flex-col p-3">
              <div className="px-3 pb-1 pt-2">
                <Head
                  title="Сверх плана"
                  count={m.overPlan.length}
                  icon={Layers}
                  right={
                    <GhostBtn size="sm" icon={CalendarArrowUp} onClick={m.actions.moveOverPlanToTomorrow} disabled={!m.overPlan.length}>
                      На завтра
                    </GhostBtn>
                  }
                />
              </div>
              {m.overPlan.length === 0 ? (
                <Empty compact icon={Layers} title="Всё влезло в план" text="Лишних задач на сегодня нет." />
              ) : (
                <div className="relative flex flex-col">
                  {m.overPlan.slice(0, 5).map((r, i) => (
                    <div key={r.id} style={{ opacity: 1 - i * 0.14 }}>
                      <TaskLine r={r} dense chips="due" onToggle={() => m.actions.toggle(r.id)} />
                    </div>
                  ))}
                  {m.overPlan.length > 5 && (
                    <div className="px-3 pb-1 pt-2" style={t.meta}>
                      и ещё {m.overPlan.length - 5}
                    </div>
                  )}
                </div>
              )}
            </Surface>

            {/* STATUS */}
            <Surface kind="solid" r={22} className="col-span-4 flex flex-col p-5">
              <Head title="Статус задач" />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { l: "Выполнено", v: m.status.doneAll, c: G.ink },
                  { l: "В работе", v: m.status.inProgress, c: G.ink },
                  { l: "Просрочено", v: m.status.overdueAll, c: m.status.overdueAll ? toneColor("red") : G.ink },
                ].map((s) => (
                  <div key={s.l}>
                    <div style={t.meta}>{s.l}</div>
                    <div className="mt-1" style={{ ...mono(24), color: s.c }}>
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <StatusBar done={m.status.doneAll} progress={m.status.inProgress} overdue={m.status.overdueAll} />
              </div>
              <div className="mt-5 flex flex-col gap-2.5 border-t pt-4" style={{ borderColor: G.line }}>
                {m.status.openByPriority.map((p) => {
                  const max = Math.max(1, ...m.status.openByPriority.map((x) => x.count));
                  return (
                    <div key={p.priority} className="grid grid-cols-[120px_1fr_32px] items-center gap-3">
                      <span className="flex items-center gap-2" style={t.small}>
                        <Dot tone={PRIO_TONE[p.priority]} />
                        {p.label}
                      </span>
                      <Meter pct={(p.count / max) * 100} tone={PRIO_TONE[p.priority] === "neutral" ? "white" : PRIO_TONE[p.priority]} h={3} />
                      <span className="text-right" style={{ ...mono(12), color: G.ink2 }}>
                        {p.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Surface>

            {/* NOTE + READING */}
            <Surface kind="solid" r={22} className="col-span-3 flex flex-col p-5">
              <Head title="Заметка" icon={NotebookPen} />
              <div className="mt-4">
                <NoteBox onSave={m.actions.saveNote} rows={3} />
              </div>
              <div className="mt-5 border-t pt-4" style={{ borderColor: G.line }}>
                <div className="mb-3" style={t.eyebrow}>
                  Прочитать сегодня
                </div>
                {m.reading ? (
                  <ReadingCard item={m.reading} size={56} />
                ) : (
                  <div className="flex items-center gap-3" style={t.small}>
                    <IconBox icon={BookOpen} size={28} />
                    Очередь чтения пуста
                  </div>
                )}
              </div>
            </Surface>
          </div>
        </main>
      </div>
    </div>
  );
}
