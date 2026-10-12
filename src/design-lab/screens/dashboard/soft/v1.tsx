/**
 * Dashboard · Soft Instrument · v1 «Отчёт» (ref 5 Relatel)
 * Composition: a «tasks report». Sidebar in the same tone as the widgets, with collapsible groups
 * (Обзор / Работа / Инструменты), counters and a status sub-tree under «Задачи». Page head =
 * breadcrumbs + search + white CTA, title + description, KPI stat group on the right. A strip of
 * widgets of different widths (Статус задач with a spectrum bar | Динамика + Неделя stacked |
 * open-tasks burndown), then a segmented switcher Доска / Список / Ритм over today's plan as a
 * board (Просрочено / Сегодня / Сверх плана) with a side column of meetings, projects, money,
 * reading and a quick note.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronsLeft,
  ChevronRight,
  Clock3,
  CornerDownRight,
  EyeOff,
  Flame,
  FolderKanban,
  Kanban,
  Layers,
  List,
  ListChecks,
  MoreVertical,
  NotebookPen,
  Plus,
  Sun,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useDashboardModel, rub, type TodayRow, type DashboardModel } from "@/design-lab/screens/dashboardModel";
import {
  S,
  alpha,
  rootStyle,
  NAV_ICON,
  IconBox,
  Chip,
  PriorityChip,
  Check,
  IconBtn,
  Widget,
  Btn,
  Meta,
  SegmentBar,
  SpectrumBar,
  StepLine,
  Heatmap,
  MiniBars,
  DotScatter,
  DeltaChip,
  EmptyState,
  AddInline,
  NoteBox,
  ViewTabs,
  SearchField,
  BrandMark,
  weekDelta,
  openBurn,
  plural,
  toneColor,
  useDoneToday,
  type Tone,
} from "@/design-lab/screens/_kit/soft";
import { formatDuration } from "@/lib/format";

type View = "board" | "list" | "rhythm";

const HEALTH_TONE: Record<string, Tone> = { "off-track": "red", "at-risk": "orange", "on-track": "green", done: "blue", empty: "neutral" };

export default function SoftV1() {
  const m = useDashboardModel();
  const doneToday = useDoneToday();
  const [view, setView] = useState<View>("board");
  const [hideDone, setHideDone] = useState(false);
  const [moreOver, setMoreOver] = useState(false);
  const [addSignal, setAddSignal] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);

  const lanes = useMemo(() => {
    const overdue = m.plan.filter((r) => r.overdue);
    const open = m.plan.filter((r) => !r.overdue && !r.done);
    const today = hideDone ? open : [...open, ...doneToday];
    const over = m.overPlan;
    return { overdue, today, over };
  }, [m.plan, m.overPlan, hideDone, doneToday]);

  const wd = weekDelta(m.dynamics);
  const burn = openBurn(m.kpi.openCount, m.dynamics);

  const openNewTask = () => {
    setView("board");
    setAddSignal((n) => n + 1);
  };

  return (
    <div className="flex min-h-screen" style={rootStyle}>
      <Sidebar m={m} lanes={{ overdue: lanes.overdue.length, today: m.plan.filter((r) => !r.overdue && !r.done).length, over: lanes.over.length, done: doneToday.length }} />

      <main className="min-w-0 flex-1 px-6 pb-12">
        {/* ── Top bar ───────────────────────────────────────────────────── */}
        <div className="flex h-16 items-center gap-3 border-b" style={{ borderColor: S.line }}>
          <IconBtn icon={ArrowLeft} label="Назад" size={28} />
          <span className="h-4 w-px" style={{ background: S.line2 }} />
          <nav className="flex min-w-0 items-center gap-2 text-[13.5px]" aria-label="Хлебные крошки">
            <span className="flex items-center gap-1.5" style={{ color: S.ink3 }}>
              <FolderKanban size={15} strokeWidth={1.75} />
              Рабочий стол
            </span>
            <ChevronRight size={14} strokeWidth={1.75} style={{ color: S.ink4 }} />
            <span className="flex items-center gap-1.5 font-medium">
              <Activity size={15} strokeWidth={1.75} style={{ color: S.accentText }} />
              Отчёт дня
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SearchField placeholder="Поиск задач и проектов" width={280} />
            <span className="mx-1 h-4 w-px" style={{ background: S.line2 }} />
            <div className="relative">
              <Btn icon={NotebookPen} onClick={() => setNoteOpen((v) => !v)}>
                Заметка
              </Btn>
              {noteOpen && (
                <div onKeyDown={(e) => e.key === "Escape" && setNoteOpen(false)} className="absolute right-0 top-10 z-20 w-[340px] rounded-2xl p-3" style={{ background: S.s2, boxShadow: `${S.lift}, 0 24px 48px -12px rgba(0,0,0,.7)` }}>
                  <div className="mb-2 flex items-center justify-between px-1 text-[13px] font-semibold">
                    Быстрая заметка
                    <span className="text-[11.5px] font-normal" style={{ color: S.ink3 }}>
                      Esc — закрыть
                    </span>
                  </div>
                  <NoteBox
                    rows={4}
                    onSave={(t) => {
                      m.actions.saveNote(t);
                      setNoteOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
            <Btn kind="primary" icon={Plus} onClick={openNewTask}>
              Новая задача
            </Btn>
          </div>
        </div>

        {/* ── Title ─────────────────────────────────────────────────────── */}
        <header className="flex items-end justify-between gap-8 pb-6 pt-7">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{m.greeting}, вот отчёт дня</h1>
            <p className="mt-2 max-w-[600px] text-[14px] leading-[1.6]" style={{ color: S.ink3 }}>
              {m.dateLabel}. В плане {m.plan.length} {plural(m.plan.length, "задача", "задачи", "задач")}
              {lanes.overdue.length > 0 && <>, {lanes.overdue.length} из них с просроченным сроком</>}. Сверх лимита фокуса ещё {m.overPlan.length}.
              Закрыто сегодня {m.kpi.closedToday} из дневной цели {m.kpi.dailyGoal}.
            </p>
          </div>
          <dl className="flex shrink-0 items-stretch rounded-[12px] p-1" style={{ background: S.s1, boxShadow: S.lift }}>
            {[
              { k: "Сегодня", v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`, tone: m.kpi.overdueToday ? ("red" as Tone) : undefined },
              { k: "Время", v: m.kpi.timeLabel },
              { k: "Открыто", v: String(m.kpi.openCount) },
              { k: "За неделю", v: String(m.kpi.weekDone) },
            ].map((s, i) => (
              <div key={s.k} className="flex flex-col gap-0.5 px-3.5 py-1.5" style={{ borderLeft: i ? `1px solid ${S.line}` : undefined }}>
                <dt className="text-[11.5px]" style={{ color: S.ink3 }}>
                  {s.k}
                </dt>
                <dd className="text-[16px] font-semibold tabular-nums tracking-[-0.01em]" style={{ color: s.tone ? toneColor(s.tone) : S.ink }}>
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {/* ── Widget strip: 3 | 2 stacked | burndown ───────────────────── */}
        <section className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)_minmax(0,1.6fr)] gap-4">
          <Widget icon={ListChecks} tone="accent" title="Статус задач" className="min-h-[244px]">
            <div className="flex flex-1 flex-col px-4 pb-4">
              <div className="grid grid-cols-3 gap-3 pt-1">
                <StatusNum n={m.status.doneAll} label="Готово" icon={CheckCircle2} tone="green" />
                <StatusNum n={m.status.inProgress} label="В работе" icon={Zap} tone="orange" />
                <StatusNum n={m.status.overdueAll} label="Просрочка" icon={AlertTriangle} tone="red" />
              </div>
              <div className="mt-auto pt-4">
                <SpectrumBar
                  h={64}
                  parts={[
                    { value: m.status.doneAll, color: "#4B6FE9" },
                    { value: m.status.inProgress, color: "#9F83D8" },
                    { value: m.status.overdueAll, color: "#F38AA9" },
                  ]}
                />
                <div className="mt-2.5 flex items-center gap-3 whitespace-nowrap text-[11.5px] tabular-nums max-[1400px]:gap-2 max-[1400px]:text-[11px]" style={{ color: S.ink3 }}>
                  {(() => {
                    const t = Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll);
                    return [
                      { c: "#4B6FE9", k: "готово", v: m.status.doneAll },
                      { c: "#9F83D8", k: "в работе", v: m.status.inProgress },
                      { c: "#F38AA9", k: "просрочено", v: m.status.overdueAll },
                    ].map((x) => (
                      <span key={x.k} className="flex items-center gap-1.5">
                        <span className="h-[6px] w-[10px] rounded-full" style={{ background: x.c }} />
                        {x.k} <span style={{ color: S.ink2 }}>{Math.round((x.v / t) * 100)}%</span>
                      </span>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </Widget>

          <div className="flex min-w-0 flex-col gap-4">
            <Widget icon={Activity} tone="blue" title="Динамика" className="flex-1">
              <div className="flex items-end gap-4 px-4 pb-4">
                <div className="shrink-0">
                  <div className="text-[24px] font-semibold leading-none tabular-nums">{m.closed14}</div>
                  <div className="mt-2 flex items-center gap-1.5 text-[12px]" style={{ color: S.ink3 }}>
                    <DeltaChip value={wd.pct ?? wd.diff} suffix={wd.pct != null ? "%" : ""} /> 7 дн.
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <DotScatter values={m.dynamics.map((d) => d.value)} height={46} cap={7} />
                </div>
              </div>
            </Widget>
            <Widget icon={CalendarDays} tone="orange" title="Неделя" className="flex-1">
              <div className="flex items-end gap-4 px-4 pb-4">
                <div className="shrink-0">
                  <div className="text-[24px] font-semibold leading-none tabular-nums">{m.kpi.weekDone}</div>
                  <div className="mt-2 flex items-center gap-1 text-[12px]" style={{ color: S.ink3 }}>
                    <Flame size={13} strokeWidth={1.75} style={{ color: S.orange }} />
                    серия {m.kpi.streak} дн.
                  </div>
                </div>
                <div className="ml-auto flex flex-col items-end gap-1.5">
                  <MiniBars values={m.week.map((d) => d.done)} height={40} tone="orange" barW={14} highlight={m.week.findIndex((d) => d.isToday)} />
                  <span className="flex gap-[3px] text-[10px]" style={{ color: S.ink4 }}>
                    {m.week.map((d) => (
                      <span key={d.key} className="w-[14px] text-center" style={{ color: d.isToday ? S.orange : undefined }}>
                        {d.label.slice(0, 2)}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </Widget>
          </div>

          <Widget
            icon={Layers}
            tone="accent"
            title="Открытые задачи"
            hint={<span className="max-[1400px]:hidden">(14 дней)</span>}
            actions={
              <span className="mr-1 hidden items-center gap-3 text-[11.5px] min-[1400px]:flex" style={{ color: S.ink3 }}>
                <span className="flex items-center gap-1.5">
                  <span className="h-[2px] w-3 rounded" style={{ background: S.accent }} />
                  факт
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-[2px] w-3 rounded" style={{ background: S.orange }} />
                  темп
                </span>
              </span>
            }
          >
            <div className="flex-1 px-4 pb-3">
              <StepLine
                height={176}
                xLabels={[m.dynamics[0].label, "сегодня"]}
                series={[
                  { values: burn.actual, color: S.accent },
                  { values: burn.ideal, color: S.orange },
                ]}
              />
            </div>
          </Widget>
        </section>

        {/* ── View switcher ─────────────────────────────────────────────── */}
        <div className="mt-8 flex items-center justify-between gap-4">
          <ViewTabs<View>
            value={view}
            onChange={setView}
            tabs={[
              { id: "board", label: "Доска", icon: Kanban },
              { id: "list", label: "Список", icon: List, count: m.today.length },
              { id: "rhythm", label: "Ритм", icon: Activity },
            ]}
          />
          <div className="flex items-center gap-1">
            <Btn icon={EyeOff} onClick={() => setHideDone((v) => !v)} className={hideDone ? "!text-white" : ""}>
              {hideDone ? "Показать готовые" : "Скрыть готовые"}
            </Btn>
            <Btn icon={ArrowRight} onClick={m.actions.moveOverPlanToTomorrow} disabled={!m.overPlan.length}>
              Сверх плана → завтра
            </Btn>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_300px] gap-5 max-[1360px]:grid-cols-[minmax(0,1fr)_272px]">
          <div className="min-w-0">
            {view === "board" && (
              <div className="grid grid-cols-3 items-start gap-4">
                <BoardLane title="Просрочено" icon={AlertTriangle} tone="red" count={lanes.overdue.length}>
                  {lanes.overdue.length ? (
                    lanes.overdue.map((r) => <TaskCard key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />)
                  ) : (
                    <EmptyState icon={CheckCircle2} tone="green" title="Просрочек нет" text="Всё, что горело, закрыто. Так держать." />
                  )}
                </BoardLane>
                <BoardLane title="Сегодня" icon={Sun} tone="accent" count={lanes.today.length} onAdd={() => setAddSignal((n) => n + 1)}>
                  {lanes.today.map((r) => (
                    <TaskCard key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />
                  ))}
                  {!lanes.today.length && (
                    <EmptyState icon={Sun} tone="accent" title="На сегодня чисто" text="Закройте просроченное — оно переедет сюда. Или добавьте новую задачу." />
                  )}
                  <AddInline onAdd={m.actions.add} label="Добавить задачу" openSignal={addSignal} />
                </BoardLane>
                <BoardLane
                  title="Сверх плана"
                  icon={Layers}
                  tone="amber"
                  count={lanes.over.length}
                  extra={
                    lanes.over.length > 0 && (
                      <button
                        type="button"
                        onClick={m.actions.moveOverPlanToTomorrow}
                        title="Перенести всё сверх плана на завтра"
                        className="inline-flex h-[26px] items-center rounded-[6px] px-1.5 text-[11.5px] font-medium transition-colors hover:bg-white/[0.06]"
                        style={{ color: S.amber }}
                      >
                        <span className="max-[1400px]:hidden">→ завтра</span>
                        <ArrowRight size={14} strokeWidth={1.75} className="min-[1401px]:hidden" />
                      </button>
                    )
                  }
                >
                  {lanes.over.length ? (
                    <>
                      {(moreOver ? lanes.over : lanes.over.slice(0, 4)).map((r) => (
                        <TaskCard key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} muted />
                      ))}
                      {lanes.over.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setMoreOver((v) => !v)}
                          className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] text-[12.5px] font-medium transition-colors hover:bg-white/[0.04]"
                          style={{ color: S.ink3, boxShadow: `inset 0 0 0 1px ${S.line}` }}
                        >
                          {moreOver ? "Свернуть" : `Ещё ${lanes.over.length - 4} ${plural(lanes.over.length - 4, "задача", "задачи", "задач")}`}
                          <ChevronDown size={14} strokeWidth={1.75} className={moreOver ? "rotate-180" : ""} />
                        </button>
                      )}
                    </>
                  ) : (
                    <EmptyState icon={Layers} title="Лимит не превышен" text="Всё помещается в дневной фокус." />
                  )}
                </BoardLane>
              </div>
            )}

            {view === "list" && <ListView m={m} hideDone={hideDone} />}
            {view === "rhythm" && <RhythmView m={m} />}
          </div>

          {/* ── Side column ───────────────────────────────────────────── */}
          <aside className="flex min-w-0 flex-col gap-4">
            <SideMeetings m={m} />
            <SideProjects m={m} />
            <SideMoney m={m} />
            <SideReading m={m} />
          </aside>
        </div>
      </main>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────────────────────
function Sidebar({ m, lanes }: { m: DashboardModel; lanes: { overdue: number; today: number; over: number; done: number } }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ overview: true, work: true, tools: true });
  const nav = Object.fromEntries(m.nav.map((n) => [n.id, n]));
  const groups: { id: string; label: string; items: { id: string; count?: number; hot?: boolean }[] }[] = [
    { id: "overview", label: "Обзор", items: [{ id: "dashboard" }, { id: "analytics" }, { id: "planner" }] },
    {
      id: "work",
      label: "Работа",
      items: [
        { id: "tasks", count: nav.tasks?.badge },
        { id: "projects", count: m.projects.length },
        { id: "clients", count: m.followUps.length || undefined, hot: m.followUps.length > 0 },
      ],
    },
    { id: "tools", label: "Инструменты", items: [{ id: "notes" }, { id: "knowledge" }] },
  ];
  const sub = [
    { label: "Просрочено", n: lanes.overdue, icon: AlertTriangle, tone: "red" as Tone },
    { label: "Сегодня", n: lanes.today, icon: Sun, tone: "accent" as Tone },
    { label: "Сверх плана", n: lanes.over, icon: Layers, tone: "amber" as Tone },
    { label: "Готово", n: lanes.done, icon: CheckCircle2, tone: "green" as Tone },
  ];
  return (
    <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 max-[1360px]:w-[228px] flex-col px-3 pb-3" style={{ background: S.s1, boxShadow: `inset -1px 0 0 ${S.line}` }}>
      <div className="flex h-16 items-center gap-2.5 border-b px-1.5" style={{ borderColor: S.line }}>
        <BrandMark size={32} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold">Рабочий стол</div>
          <div className="truncate text-[12px]" style={{ color: S.ink3 }}>
            личный CRM
          </div>
        </div>
        <IconBtn icon={ChevronsLeft} label="Свернуть панель" />
      </div>

      <nav className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.id}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
              className="flex h-7 items-center gap-1 px-2 text-[13px] transition-colors hover:text-white"
              style={{ color: S.ink3 }}
              aria-expanded={open[g.id]}
            >
              {g.label}
              <ChevronDown size={13} strokeWidth={1.75} className={`transition-transform ${open[g.id] ? "" : "-rotate-90"}`} />
            </button>
            {open[g.id] && (
              <ul className="mt-0.5 flex flex-col gap-px">
                {g.items.map((it) => {
                  const n = nav[it.id];
                  if (!n) return null;
                  const Icon = NAV_ICON[it.id] ?? FolderKanban;
                  const active = it.id === "dashboard";
                  return (
                    <li key={it.id}>
                      <a
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className={`flex h-8 items-center gap-2.5 rounded-[7px] px-2 text-[14px] transition-colors ${active ? "" : "hover:bg-white/[0.04]"}`}
                        style={{ background: active ? S.s4 : undefined, color: active ? S.ink : "#D9D9DC", boxShadow: active ? S.bevel : undefined }}
                      >
                        <Icon size={16} strokeWidth={1.75} style={{ color: active ? S.accentText : S.ink3 }} />
                        <span className="flex-1 truncate">{n.label}</span>
                        {it.count != null && it.count > 0 && (
                          <span
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] px-1 text-[11.5px] font-medium tabular-nums"
                            style={it.hot ? { background: S.red, color: "#fff" } : { color: S.ink3 }}
                          >
                            {it.count}
                          </span>
                        )}
                      </a>
                      {it.id === "tasks" && (
                        <ul className="relative ml-[17px] mt-px flex flex-col gap-px pl-3">
                          <span className="absolute bottom-4 left-0 top-0 w-px" style={{ background: S.line2 }} />
                          {sub.map((s) => (
                            <li key={s.label} className="relative">
                              <span className="absolute -left-3 top-1/2 h-px w-2.5" style={{ background: S.line2 }} />
                              <a
                                href="#"
                                onClick={(e) => e.preventDefault()}
                                className="flex h-8 items-center gap-2 rounded-[7px] px-2 text-[13.5px] transition-colors hover:bg-white/[0.04]"
                                style={{ color: "#D9D9DC" }}
                              >
                                <s.icon size={15} strokeWidth={1.75} style={{ color: toneColor(s.tone) }} />
                                <span className="flex-1 truncate">{s.label}</span>
                                <span className="text-[12px] tabular-nums" style={{ color: S.ink3 }}>
                                  {s.n}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </nav>

      <div className="rounded-[12px] p-3" style={{ background: S.s2, boxShadow: S.lift }}>
        <div className="flex items-center gap-2.5">
          <IconBox icon={Zap} tone="accent" size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-semibold">Уровень {m.kpi.level}</div>
            <div className="truncate text-[12px]" style={{ color: S.ink3 }}>
              {m.kpi.levelTitle}
            </div>
          </div>
          <span className="text-[12px] tabular-nums" style={{ color: S.ink2 }}>
            {Math.round(m.kpi.levelPct)}%
          </span>
        </div>
        <div className="mt-3">
          <SegmentBar value={Math.round(m.kpi.levelPct)} total={100} segments={24} label={false} h={10} w={4} />
        </div>
        <div className="mt-2 text-[11.5px]" style={{ color: S.ink3 }}>
          {m.kpi.xpToNext} XP до следующего уровня
        </div>
      </div>
    </aside>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────
function StatusNum({ n, label, icon: Icon, tone }: { n: number; label: string; icon: LucideIcon; tone: Tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[24px] font-semibold leading-none tabular-nums tracking-[-0.02em]">{n}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[12.5px]" style={{ color: S.ink3 }}>
        <span className="truncate">{label}</span>
        <Icon size={14} strokeWidth={1.75} className="shrink-0" style={{ color: toneColor(tone) }} />
      </div>
    </div>
  );
}

function BoardLane({
  title,
  icon: Icon,
  tone,
  count,
  onAdd,
  extra,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: Tone;
  count: number;
  onAdd?: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <header className="flex h-9 items-center gap-2 px-1">
        <Icon size={16} strokeWidth={1.75} style={{ color: toneColor(tone) }} />
        <span className="truncate whitespace-nowrap text-[14px] font-medium">{title}</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1 text-[11.5px] font-semibold tabular-nums" style={{ background: S.s4, color: S.ink2 }}>
          {count}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          {extra}
          {onAdd && <IconBtn icon={Plus} label={`Добавить в «${title}»`} onClick={onAdd} />}
          <IconBtn icon={MoreVertical} label="Меню колонки" />
        </span>
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Relatel card anatomy: chips → title → «└ проект» → due chip → divider → meta footer. */
function TaskCard({ r, onToggle, muted }: { r: TodayRow; onToggle: () => void; muted?: boolean }) {
  return (
    <article
      className="group flex flex-col rounded-[12px] p-3.5 transition-all duration-150 hover:-translate-y-px"
      style={{
        background: "linear-gradient(180deg, #1E1E20, #19191B)",
        boxShadow: S.lift,
        opacity: r.done ? 0.62 : 1,
      }}
    >
      <div className="flex items-center gap-1.5">
        <PriorityChip priority={r.priority} />
        <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn icon={MoreVertical} label="Действия" size={22} />
        </span>
      </div>
      <div className="mt-3 flex items-start gap-2.5">
        <span className="pt-px">
          <Check done={r.done} onClick={onToggle} label={r.title} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-[14px] font-semibold leading-[1.35] tracking-[-0.01em]" style={{ textDecoration: r.done ? "line-through" : undefined, color: r.done ? S.ink3 : S.ink }}>
            {r.title}
          </h4>
          <div className="mt-1 flex items-center gap-1 text-[12.5px]" style={{ color: S.ink3 }}>
            <CornerDownRight size={13} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{r.projectName ?? "Без проекта"}</span>
          </div>
        </div>
      </div>
      {r.dueLabel && (
        <span
          className="mt-3 inline-flex h-[26px] w-fit items-center gap-1.5 rounded-[6px] px-2 text-[12px]"
          style={{ background: r.overdue ? alpha(S.red, 0.12) : S.s4, color: r.overdue ? S.red : S.ink2 }}
        >
          <CalendarClock size={13} strokeWidth={1.75} />
          <span style={{ color: r.overdue ? undefined : S.ink3 }}>Срок:</span>
          <span className="tabular-nums">{r.dueLabel}</span>
        </span>
      )}
      {(r.subtasksTotal > 0 || r.spentMin > 0 || !!r.estimateMin) && (
        <div className="mt-3 flex items-center justify-between border-t pt-2.5" style={{ borderColor: S.line }}>
          {r.subtasksTotal > 0 ? (
            <SegmentBar value={r.subtasksDone} total={r.subtasksTotal} segments={8} h={10} w={3} tone={r.subtasksDone === r.subtasksTotal ? "green" : "accent"} />
          ) : (
            <Meta icon={ListChecks}>без подзадач</Meta>
          )}
          <Meta icon={Clock3}>{r.spentMin > 0 ? formatDuration(r.spentMin) : r.estimateMin ? `~${formatDuration(r.estimateMin)}` : "—"}</Meta>
        </div>
      )}
    </article>
  );
}

function ListView({ m, hideDone }: { m: DashboardModel; hideDone: boolean }) {
  const rows = m.today.filter((r) => !hideDone || !r.done);
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: S.s1, boxShadow: S.lift }}>
      <div className="grid h-10 grid-cols-[36px_minmax(0,1fr)_110px_130px_90px_90px] items-center gap-3 border-b px-4 text-[12px]" style={{ borderColor: S.line, color: S.ink3 }}>
        <span />
        <span>Задача</span>
        <span>Приоритет</span>
        <span>Срок</span>
        <span>Время</span>
        <span>Группа</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid h-12 grid-cols-[36px_minmax(0,1fr)_110px_130px_90px_90px] items-center gap-3 border-b px-4 transition-colors last:border-0 hover:bg-white/[0.02]"
          style={{ borderColor: S.line }}
        >
          <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium" style={{ color: r.done ? S.ink3 : S.ink, textDecoration: r.done ? "line-through" : undefined }}>
              {r.title}
            </div>
            {r.projectName && (
              <div className="truncate text-[12px]" style={{ color: S.ink3 }}>
                {r.projectName}
              </div>
            )}
          </div>
          <span>
            <PriorityChip priority={r.priority} />
          </span>
          <span className="text-[12.5px] tabular-nums" style={{ color: r.overdue ? S.red : S.ink2 }}>
            {r.dueLabel || "—"}
          </span>
          <span className="text-[12.5px] tabular-nums" style={{ color: S.ink2 }}>
            {r.spentMin ? formatDuration(r.spentMin) : "—"}
          </span>
          <span>{r.overLimit ? <Chip tone="amber">Сверх</Chip> : <Chip tone="accent">План</Chip>}</span>
        </div>
      ))}
      <div className="px-3 py-2">
        <AddInline onAdd={m.actions.add} label="Добавить задачу" />
      </div>
    </div>
  );
}

function RhythmView({ m }: { m: DashboardModel }) {
  const total = m.year.reduce((s, d) => s + d.value, 0);
  const active = m.year.filter((d) => d.value > 0).length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
      <Widget icon={CalendarCheck2} tone="accent" title="Полгода закрытий" hint={`${total} задач · ${active} активных дней`}>
        <div className="px-4 pb-4">
          <Heatmap values={m.year.map((d) => d.value)} dates={m.year.map((d) => d.date)} gap={3} />
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[11.5px]" style={{ color: S.ink3 }}>
            меньше
            {[0.05, 0.28, 0.5, 0.75, 1].map((a) => (
              <span key={a} className="size-[10px] rounded-[2px]" style={{ background: a === 0.05 ? "rgba(255,255,255,.05)" : alpha(S.accent, a) }} />
            ))}
            больше
          </div>
        </div>
      </Widget>
      <Widget icon={Flame} tone="orange" title="Серии" toolbar={false}>
        <div className="flex flex-col gap-3 px-4 pb-4">
          {[
            { k: "Текущая серия", v: `${m.kpi.streak} дн.` },
            { k: "Лучшая серия", v: `${m.kpi.bestStreak} дн.` },
            { k: "Пик за 14 дней", v: `${m.peak14} задач` },
            { k: "Закрыто за 14 дней", v: String(m.closed14) },
          ].map((s) => (
            <div key={s.k} className="flex items-center justify-between border-b pb-3 text-[13px] last:border-0 last:pb-0" style={{ borderColor: S.line }}>
              <span style={{ color: S.ink3 }}>{s.k}</span>
              <span className="font-semibold tabular-nums">{s.v}</span>
            </div>
          ))}
        </div>
      </Widget>
    </div>
  );
}

function SideHead({ icon, tone, title, action }: { icon: LucideIcon; tone: Tone; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <IconBox icon={icon} tone={tone} size={26} />
      <span className="text-[13.5px] font-semibold">{title}</span>
      <span className="ml-auto">{action}</span>
    </div>
  );
}

const sideCard = "rounded-2xl p-4";

function SideMeetings({ m }: { m: DashboardModel }) {
  return (
    <section className={sideCard} style={{ background: S.s1, boxShadow: S.lift }}>
      <SideHead icon={CalendarClock} tone="blue" title="Встречи" action={<span className="text-[12px] tabular-nums" style={{ color: S.ink3 }}>{m.meetings.length}</span>} />
      <div className="mt-3 flex flex-col gap-1">
        {m.meetings.length ? (
          m.meetings.slice(0, 4).map((mt) => (
            <div key={mt.id} className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-2 transition-colors hover:bg-white/[0.03]">
              <Check done={!!mt.done} onClick={() => m.actions.toggleMeeting(mt.id)} label={mt.title} size={16} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium" style={{ color: mt.done ? S.ink3 : S.ink, textDecoration: mt.done ? "line-through" : undefined }}>
                  {mt.title}
                </div>
                <div className="truncate text-[12px]" style={{ color: S.ink3 }}>
                  {mt.dateLabel} · {mt.time}
                  {mt.clientName ? ` · ${mt.clientName}` : ""}
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState icon={CalendarCheck2} tone="blue" title="Встреч не запланировано" text="Свободный день — хорошее время для глубокой работы." />
        )}
      </div>
    </section>
  );
}

function SideProjects({ m }: { m: DashboardModel }) {
  return (
    <section className={sideCard} style={{ background: S.s1, boxShadow: S.lift }}>
      <SideHead icon={FolderKanban} tone="accent" title="Проекты" action={<span className="text-[12px] tabular-nums" style={{ color: S.ink3 }}>{m.projects.length}</span>} />
      <div className="mt-3 flex flex-col">
        {m.projects.slice(0, 5).map((p) => (
          <div key={p.id} className="flex flex-col gap-2 border-b py-2.5 last:border-0 last:pb-0" style={{ borderColor: S.line }}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{p.name}</span>
              <Chip tone={HEALTH_TONE[p.health]} dot>
                {p.healthLabel}
              </Chip>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="mr-auto"><SegmentBar value={p.done} total={p.total} segments={14} h={10} w={3} tone={HEALTH_TONE[p.health] === "neutral" ? "accent" : HEALTH_TONE[p.health]} /></span>
              <span className="text-[11.5px] tabular-nums" style={{ color: S.ink3 }}>
                {p.spentLabel}
              </span>
              {p.overdue > 0 && (
                <Meta icon={AlertTriangle} tone="red" title="Просрочено">
                  {p.overdue}
                </Meta>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SideMoney({ m }: { m: DashboardModel }) {
  return (
    <section className={sideCard} style={{ background: S.s1, boxShadow: S.lift }}>
      <SideHead icon={Wallet} tone="green" title="Деньги · месяц" />
      <div className="mt-3 text-[24px] font-semibold tabular-nums tracking-[-0.02em]">{rub(m.money.paidThisMonth)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[10px] px-2.5 py-2" style={{ background: S.s2 }}>
          <div className="text-[11.5px]" style={{ color: S.ink3 }}>
            Ожидается
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums">{rub(m.money.pending)}</div>
        </div>
        <div className="rounded-[10px] px-2.5 py-2" style={{ background: m.money.overdue ? alpha(S.red, 0.08) : S.s2 }}>
          <div className="text-[11.5px]" style={{ color: S.ink3 }}>
            Просрочено
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums" style={{ color: m.money.overdue ? S.red : S.ink }}>
            {rub(m.money.overdue)}
          </div>
        </div>
      </div>
      {m.followUps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.followUps.slice(0, 4).map((f) => (
            <Chip key={f.id} tone="orange" icon={CalendarClock}>
              {f.name}
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}

function SideReading({ m }: { m: DashboardModel }) {
  const r = m.reading;
  return (
    <section className={sideCard} style={{ background: S.s1, boxShadow: S.lift }}>
      <SideHead icon={BookOpen} tone="orange" title="Чтение дня" />
      {r ? (
        <a href={r.url ?? "#"} target="_blank" rel="noreferrer" className="group mt-3 flex gap-3">
          <span className="size-[56px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: S.s3 }}>
            {r.coverUrl ? <img src={r.coverUrl} alt="" className="size-full object-cover" /> : <BookOpen size={20} className="m-[18px]" style={{ color: S.ink4 }} />}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 text-[13px] font-medium leading-[1.4] group-hover:underline">{r.title}</span>
            <span className="mt-1 block truncate text-[12px]" style={{ color: S.ink3 }}>
              {r.author ?? r.domain ?? ""}
            </span>
          </span>
        </a>
      ) : (
        <EmptyState className="mt-3" icon={BookOpen} title="Очередь чтения пуста" text="Добавьте материал в Библиотеку." />
      )}
    </section>
  );
}
