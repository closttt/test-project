/**
 * Dashboard · Soft Instrument · v5 «Полосы статусов» (ref 11 Workspace orders)
 * Composition: a pure-black canvas with a cold mini-sidebar whose «Дашборд» item unfolds a
 * views sub-menu (Таблица / Карточки / Канбан, white indicator on the active one — it drives the
 * page). Top breadcrumb bar, a big «План дня» title with actions, underline view tabs, a toolbar
 * of outline pills (search, filter with a counter, sort) and KPI pills. Kanban lanes are tinted by
 * status — red / blue / amber / green — with pill headers (dot + count + ⋯ +), cards tinted in
 * the lane colour and «+ Задача» at the lane foot. Below, the same pill-header language carries
 * projects, rhythm, meetings, money, reading and the note. A «Space limit»-style card at the
 * bottom of the sidebar shows the daily goal.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  Folder,
  FolderKanban,
  Grid2x2,
  Home,
  Kanban,
  Layers,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Table2,
  Target,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

import { useDashboardModel, rub, type DashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";
import {
  S,
  alpha,
  rootStyle,
  NAV_ICON,
  Chip,
  PriorityChip,
  Check,
  IconBtn,
  Lane,
  Heatmap,
  SegmentBar,
  AddInline,
  NoteBox,
  BrandMark,
  plural,
  toneColor,
  useDoneToday,
  PRIORITY,
  type Tone,
} from "@/design-lab/screens/_kit/soft";

type View = "table" | "cards" | "kanban";
type Status = "overdue" | "today" | "over" | "done";

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  overdue: { label: "Просрочено", tone: "red" },
  today: { label: "Сегодня", tone: "blue" },
  over: { label: "Сверх плана", tone: "amber" },
  done: { label: "Готово", tone: "green" },
};

const SIDE = "#0E1013";
const PANEL = "#0F1012";

export default function SoftV5() {
  const m = useDashboardModel();
  const doneToday = useDoneToday();
  const [view, setView] = useState<View>("kanban");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [byDue, setByDue] = useState(false);
  const [moreOver, setMoreOver] = useState(false);
  const [sig, setSig] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const f = (rs: TodayRow[]) => {
      let x = onlyHigh ? rs.filter((r) => r.priority === 1) : rs;
      if (q.trim()) x = x.filter((r) => r.title.toLowerCase().includes(q.trim().toLowerCase()));
      return byDue ? [...x].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")) : x;
    };
    return {
      overdue: f(m.plan.filter((r) => r.overdue)),
      today: f(m.plan.filter((r) => !r.overdue && !r.done)),
      over: f(m.overPlan),
      done: f(doneToday),
    } as Record<Status, TodayRow[]>;
  }, [m.plan, m.overPlan, doneToday, onlyHigh, byDue, q]);

  const all = (Object.keys(groups) as Status[]).flatMap((s) => groups[s].map((r) => ({ r, s })));
  const bump = (k: string) => setSig((s) => ({ ...s, [k]: (s[k] ?? 0) + 1 }));
  const viewLabel = { table: "Таблица", cards: "Карточки", kanban: "Канбан" }[view];

  return (
    <div className="flex min-h-screen" style={{ ...rootStyle, background: "#000" }}>
      <Sidebar m={m} view={view} setView={setView} />

      <main className="min-w-0 flex-1 px-9 pb-12 max-[1360px]:px-7">
        {/* breadcrumb bar */}
        <div className="flex h-[68px] items-center gap-2 text-[14.5px]" style={{ color: "#9EA3A7" }}>
          <Home size={17} strokeWidth={1.75} />
          <ChevronRight size={14} strokeWidth={1.75} style={{ color: "#505255" }} />
          <span>Рабочий стол</span>
          <ChevronRight size={14} strokeWidth={1.75} style={{ color: "#505255" }} />
          <span>План дня</span>
          <ChevronRight size={14} strokeWidth={1.75} style={{ color: "#505255" }} />
          <span style={{ color: "#EFF1F3" }}>{viewLabel}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <label className="mr-2 flex h-[34px] w-[220px] items-center gap-2 rounded-full px-3.5" style={{ boxShadow: "inset 0 0 0 1px #393B3C" }}>
              <Search size={15} strokeWidth={1.75} />
              <input placeholder="Поиск" className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-[#6F7479]" />
            </label>
            <IconBtn icon={Grid2x2} label="Приложения" size={34} />
            <IconBtn icon={Settings} label="Настройки" size={34} />
            <span className="relative">
              <IconBtn icon={Bell} label="Уведомления" size={34} />
              {m.followUps.length > 0 && <span className="absolute right-[9px] top-[8px] size-[7px] rounded-full" style={{ background: "#E54C2C" }} />}
            </span>
          </div>
        </div>

        {/* title */}
        <div className="mt-4 flex items-center gap-3">
          <Layers size={28} strokeWidth={2} />
          <h1 className="text-[32px] font-bold tracking-[-0.025em]">План дня</h1>
          <span className="ml-1 mt-1.5 text-[14px]" style={{ color: "#6F7479" }}>
            {m.dateLabel}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <IconBtn icon={MoreHorizontal} label="Ещё" size={36} />
            <button
              type="button"
              onClick={m.actions.moveOverPlanToTomorrow}
              disabled={!m.overPlan.length}
              className="inline-flex h-10 items-center gap-2 rounded-[6px] px-3 text-[14.5px] transition-colors hover:bg-white/[0.05] disabled:opacity-40"
              style={{ color: "#C9CDD1" }}
            >
              <Upload size={17} strokeWidth={1.75} className="rotate-90" />
              Сверх плана → завтра
            </button>
            <button
              type="button"
              onClick={() => {
                setView("kanban");
                bump("today");
              }}
              className="inline-flex h-10 items-center gap-2 rounded-[6px] px-4 text-[14.5px] font-medium text-white transition-[filter] hover:brightness-110"
              style={{ background: S.accent, boxShadow: `inset 0 1px 0 rgba(255,255,255,.2), 0 8px 20px -10px ${alpha(S.accent, 0.9)}` }}
            >
              <Plus size={18} strokeWidth={2} />
              Задача
            </button>
          </div>
        </div>

        {/* underline tabs */}
        <div className="mt-5 flex items-center gap-1 border-b" style={{ borderColor: "#1F2123" }}>
          {(
            [
              { id: "table", label: "Таблица", icon: Table2 },
              { id: "cards", label: "Карточки", icon: Grid2x2 },
              { id: "kanban", label: "Канбан", icon: Kanban },
            ] as { id: View; label: string; icon: LucideIcon }[]
          ).map((t) => {
            const on = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(t.id)}
                className="relative flex h-11 items-center gap-2 px-3 text-[15px] font-medium transition-colors hover:text-white"
                style={{ color: on ? "#FCFBFD" : "#6F7479" }}
              >
                <t.icon size={17} strokeWidth={1.75} />
                {t.label}
                {on && <span className="absolute inset-x-1 -bottom-px h-[2px] rounded-full" style={{ background: S.accent }} />}
              </button>
            );
          })}
          <IconBtn icon={Plus} label="Новый вид" size={30} className="ml-1" />
        </div>

        {/* toolbar */}
        <div className="mt-5 flex items-center gap-2">
          <label className="flex h-8 w-[190px] items-center gap-2 rounded-full px-3" style={{ boxShadow: "inset 0 0 0 1px #393B3C", color: "#9EA3A7" }}>
            <Search size={14} strokeWidth={1.75} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти в плане" className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#6F7479]" />
          </label>
          <Pill icon={Filter} active={onlyHigh} onClick={() => setOnlyHigh((v) => !v)} badge={onlyHigh ? 1 : undefined}>
            {onlyHigh ? "Высокий" : "Фильтр"}
          </Pill>
          <Pill icon={ArrowDownUp} active={byDue} onClick={() => setByDue((v) => !v)}>
            {byDue ? "По сроку" : "Сортировка"}
          </Pill>
          <div className="ml-auto flex items-center gap-2">
            <KpiPill k="Сегодня" v={`${m.kpi.todayDone}/${m.kpi.todayTotal}`} tone={m.kpi.overdueToday ? "red" : undefined} />
            <KpiPill k="Время" v={m.kpi.timeLabel} />
            <KpiPill k="Открыто" v={String(m.kpi.openCount)} />
            <KpiPill k="Неделя" v={String(m.kpi.weekDone)} />
          </div>
        </div>

        {/* views */}
        {view === "kanban" && (
          <div className="mt-5 grid grid-cols-4 items-start gap-3">
            {(Object.keys(STATUS) as Status[]).map((s) => {
              const st = STATUS[s];
              const rows = s === "over" && !moreOver ? groups[s].slice(0, 5) : groups[s];
              const canAdd = s === "today" || s === "over";
              return (
                <Lane key={s} title={st.label} tone={st.tone} count={groups[s].length} onAdd={canAdd ? () => bump(s) : undefined}>
                  {rows.map((r) => (
                    <LaneCard key={r.id} r={r} tone={st.tone} onToggle={() => m.actions.toggle(r.id)} />
                  ))}
                  {s === "over" && groups.over.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setMoreOver((v) => !v)}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-medium transition-colors hover:bg-white/[0.04]"
                      style={{ color: alpha(S.amber, 0.85) }}
                    >
                      {moreOver ? "Свернуть" : `Ещё ${groups.over.length - 5}`}
                      <ChevronDown size={14} strokeWidth={1.75} className={moreOver ? "rotate-180" : ""} />
                    </button>
                  )}
                  {!groups[s].length && <LaneEmpty s={s} goal={m.kpi.dailyGoal} />}
                  {canAdd && <AddInline onAdd={m.actions.add} label="Задача" tone={st.tone} openSignal={sig[s]} />}
                </Lane>
              );
            })}
          </div>
        )}

        {view === "table" && (
          <div className="mt-5 overflow-hidden rounded-[16px]" style={{ background: PANEL, boxShadow: "inset 0 0 0 1px #1C1E20" }}>
            <div className="grid h-11 grid-cols-[150px_minmax(0,1fr)_160px_120px_90px] items-center gap-4 border-b px-5 text-[12.5px]" style={{ borderColor: "#1C1E20", color: "#6F7479" }}>
              <span>Статус</span>
              <span>Задача</span>
              <span>Проект</span>
              <span>Приоритет</span>
              <span className="text-right">Срок</span>
            </div>
            {all.map(({ r, s }) => (
              <div key={r.id} className="grid h-12 grid-cols-[150px_minmax(0,1fr)_160px_120px_90px] items-center gap-4 border-b px-5 transition-colors last:border-0 hover:bg-white/[0.02]" style={{ borderColor: "#17191B" }}>
                <StatusPill s={s} />
                <span className="flex min-w-0 items-center gap-3">
                  <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={17} />
                  <span className="truncate text-[14px]" style={{ color: r.done ? S.ink3 : "#EFF1F3", textDecoration: r.done ? "line-through" : undefined }}>
                    {r.title}
                  </span>
                </span>
                <span className="truncate text-[13px]" style={{ color: "#9EA3A7" }}>
                  {r.projectName ?? "—"}
                </span>
                <span>
                  <PriorityChip priority={r.priority} />
                </span>
                <span className="text-right text-[13px] tabular-nums" style={{ color: r.overdue ? S.red : "#9EA3A7" }}>
                  {r.dueLabel}
                </span>
              </div>
            ))}
            <div className="p-2">
              <AddInline onAdd={m.actions.add} label="Задача" />
            </div>
          </div>
        )}

        {view === "cards" && (
          <div className="mt-5 grid grid-cols-4 gap-3">
            {all.map(({ r, s }) => (
              <div key={r.id} className="flex flex-col gap-3 rounded-[14px] p-4" style={{ background: PANEL, boxShadow: "inset 0 0 0 1px #1C1E20" }}>
                <div className="flex items-center justify-between">
                  <StatusPill s={s} />
                  <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={17} />
                </div>
                <div className="line-clamp-2 min-h-[40px] text-[14.5px] font-medium leading-[1.35]" style={{ color: r.done ? S.ink3 : "#EFF1F3" }}>
                  {r.title}
                </div>
                <div className="flex items-center justify-between text-[12.5px]" style={{ color: "#6F7479" }}>
                  <span className="truncate">{r.projectName ?? "Без проекта"}</span>
                  <span className="tabular-nums" style={{ color: r.overdue ? S.red : undefined }}>
                    {r.dueLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* the rest of the day — same pill-header language */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          <Panel title="Проекты" tone="accent" count={m.projects.length}>
            {m.projects.slice(0, 5).map((p) => {
              const tone: Tone = p.health === "off-track" ? "red" : p.health === "at-risk" ? "amber" : p.health === "on-track" ? "green" : "neutral";
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-white/[0.03]">
                  <Folder size={15} strokeWidth={1.75} style={{ color: toneColor(tone) }} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.name}</span>
                  <SegmentBar value={p.done} total={p.total} segments={10} label={false} h={10} w={3} tone={tone === "neutral" ? "accent" : tone} />
                  <span className="w-[34px] text-right text-[12px] tabular-nums" style={{ color: "#6F7479" }}>
                    {Math.round(p.pct)}%
                  </span>
                </div>
              );
            })}
          </Panel>

          <Panel title="Ритм" tone="green" count={m.closed14} countHint="за 14 дн.">
            <div className="px-2.5 pb-1 pt-1">
              <Heatmap values={m.year.map((d) => d.value)} dates={m.year.map((d) => d.date)} color={S.green} gap={2} radius={2} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                {[
                  { k: "Готово", v: m.status.doneAll, t: "green" as Tone },
                  { k: "В работе", v: m.status.inProgress, t: "blue" as Tone },
                  { k: "Просроч.", v: m.status.overdueAll, t: "red" as Tone },
                ].map((x) => (
                  <div key={x.k} className="flex items-center gap-1.5">
                    <span className="size-[6px] rounded-full" style={{ background: toneColor(x.t) }} />
                    <span style={{ color: "#6F7479" }}>{x.k}</span>
                    <span className="ml-auto font-semibold tabular-nums">{x.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Встречи" tone="blue" count={m.meetings.length}>
            {m.meetings.length ? (
              m.meetings.slice(0, 4).map((mt) => (
                <div key={mt.id} className="flex items-center gap-3 rounded-[10px] px-2.5 py-2">
                  <Check done={!!mt.done} onClick={() => m.actions.toggleMeeting(mt.id)} label={mt.title} size={16} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{mt.title}</span>
                  <span className="text-[12px] tabular-nums" style={{ color: "#6F7479" }}>
                    {mt.dateLabel} {mt.time}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                <span className="flex size-10 items-center justify-center rounded-full" style={{ background: alpha(S.blue, 0.12), color: S.blue }}>
                  <CalendarCheck2 size={19} strokeWidth={1.75} />
                </span>
                <span className="text-[14px] font-medium">Сегодня без встреч</span>
                <span className="text-[12.5px]" style={{ color: "#6F7479" }}>
                  Звонки из Google Calendar появятся здесь сами.
                </span>
              </div>
            )}
          </Panel>

          <Panel title="Деньги" tone="green" count={m.followUps.length || undefined} countHint={m.followUps.length ? "связаться" : undefined}>
            <div className="px-2.5">
              <div className="text-[12.5px]" style={{ color: "#6F7479" }}>
                Оплачено в месяце
              </div>
              <div className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em]">{rub(m.money.paidThisMonth)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MoneyCell k="Ожидается" v={rub(m.money.pending)} tone="blue" />
                <MoneyCell k="Просрочено" v={rub(m.money.overdue)} tone={m.money.overdue ? "red" : "neutral"} />
              </div>
              {m.followUps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.followUps.map((f) => (
                    <Chip key={f.id} tone="amber" icon={CalendarClock}>
                      {f.name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Чтение" tone="amber">
            {m.reading ? (
              <a href={m.reading.url ?? "#"} target="_blank" rel="noreferrer" className="group flex gap-3 px-2.5">
                <span className="size-[64px] shrink-0 overflow-hidden rounded-[12px]" style={{ background: "#16181A" }}>
                  {m.reading.coverUrl && <img src={m.reading.coverUrl} alt="" className="size-full object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[14px] font-medium leading-[1.4] group-hover:underline">{m.reading.title}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: "#6F7479" }}>
                    <BookOpen size={13} strokeWidth={1.75} />
                    {m.reading.domain ?? m.reading.type}
                  </span>
                </span>
              </a>
            ) : (
              <span className="px-2.5 text-[13px]" style={{ color: "#6F7479" }}>
                Очередь чтения пуста.
              </span>
            )}
          </Panel>

          <Panel title="Заметка" tone="accent">
            <div className="px-1">
              <NoteBox onSave={m.actions.saveNote} rows={3} />
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────────────────────
function Sidebar({ m, view, setView }: { m: DashboardModel; view: View; setView: (v: View) => void }) {
  const [goalOpen, setGoalOpen] = useState(true);
  const pct = m.kpi.dailyGoal ? Math.min(1, m.kpi.closedToday / m.kpi.dailyGoal) : 0;
  const left = Math.max(0, m.kpi.dailyGoal - m.kpi.closedToday);
  return (
    <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col px-3 pb-4 max-[1360px]:w-[232px]" style={{ background: SIDE }}>
      <div className="flex h-[68px] items-center gap-2.5 px-1.5">
        <BrandMark size={28} />
        <span className="min-w-0 truncate whitespace-nowrap text-[15px] font-semibold">Рабочий стол</span>
        <ChevronDown size={15} strokeWidth={1.75} className="shrink-0" style={{ color: "#9EA3A7" }} />
        <IconBtn icon={Menu} label="Меню" className="ml-auto max-[1360px]:hidden" />
      </div>

      <nav className="mt-1 flex flex-col gap-0.5">
        {m.nav.map((n) => {
          const Icon = NAV_ICON[n.id] ?? FolderKanban;
          const active = n.id === "dashboard";
          return (
            <div key={n.id}>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className={`flex h-[38px] items-center gap-3 rounded-[8px] px-2.5 text-[14.5px] transition-colors ${active ? "" : "hover:bg-white/[0.04] hover:text-white"}`}
                style={{ background: active ? "#22272A" : undefined, color: active ? "#FCFBFD" : "#9EA3A7", boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,.06)" : undefined }}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="flex-1 truncate">{n.label}</span>
                {n.badge ? (
                  <span className="inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-semibold tabular-nums text-white" style={{ background: S.accent }}>
                    {n.badge}
                  </span>
                ) : null}
              </a>
              {active && (
                <div className="relative my-1 ml-[21px] flex flex-col pl-3">
                  <span className="absolute inset-y-1 left-0 w-px" style={{ background: "#2A2D30" }} />
                  {(
                    [
                      { id: "table", label: "Таблица", icon: Table2 },
                      { id: "cards", label: "Карточки", icon: Grid2x2 },
                      { id: "kanban", label: "Канбан", icon: Kanban },
                    ] as { id: View; label: string; icon: LucideIcon }[]
                  ).map((v) => {
                    const on = v.id === view;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setView(v.id)}
                        className="relative flex h-[34px] items-center gap-2 rounded-[7px] px-2 text-left text-[14px] transition-colors hover:text-white"
                        style={{ color: on ? "#FCFBFD" : "#9EA3A7" }}
                      >
                        {on && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[2px] rounded-full bg-white" />}
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        {goalOpen && (
          <div className="rounded-[12px] p-3" style={{ background: "#16191B", boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)" }}>
            <div className="flex items-center gap-2">
              <span className="size-[18px] rounded-full" style={{ background: `conic-gradient(#fff ${pct * 360}deg, #3A3D40 0)` }}>
                <span className="m-[4px] block size-[10px] rounded-full" style={{ background: "#16191B" }} />
              </span>
              <span className="text-[14px] font-medium">Дневная цель</span>
              <button type="button" onClick={() => setGoalOpen(false)} aria-label="Скрыть" className="ml-auto rounded p-0.5 transition-colors hover:bg-white/[0.06]" style={{ color: "#6F7479" }}>
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-2 text-[12.5px] leading-[1.5]" style={{ color: "#8A8F94" }}>
              Закрыто {m.kpi.closedToday} из {m.kpi.dailyGoal} задач сегодня.{" "}
              {left ? `Ещё ${left} — и цель выполнена.` : "Цель дня выполнена."}
            </p>
            <div className="mt-2.5 h-[5px] overflow-hidden rounded-full" style={{ background: "#262A2D" }}>
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: S.amber }} />
            </div>
            <button
              type="button"
              className="mt-3 inline-flex h-[28px] items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium transition-[filter] hover:brightness-110"
              style={{ background: "#67430B", color: "#FFE8C1" }}
            >
              <Target size={14} strokeWidth={1.75} />
              Открыть планер
            </button>
          </div>
        )}
        <div className="flex h-9 items-center gap-2.5 px-2.5 text-[13.5px]" style={{ color: "#9EA3A7" }}>
          <span className="inline-flex h-[20px] items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums" style={{ background: alpha(S.accent, 0.18), color: S.accentText }}>
            {m.kpi.level}
          </span>
          <span className="truncate">{m.kpi.levelTitle}</span>
          <span className="ml-auto text-[12px] tabular-nums" style={{ color: "#6F7479" }}>
            {Math.round(m.kpi.levelPct)}%
          </span>
        </div>
      </div>
    </aside>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────
function Pill({ icon: Icon, children, onClick, active, badge }: { icon: LucideIcon; children: ReactNode; onClick?: () => void; active?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] transition-colors hover:bg-white/[0.04]"
      style={{ boxShadow: `inset 0 0 0 1px ${active ? alpha(S.accent, 0.6) : "#393B3C"}`, color: active ? "#E4DCFF" : "#C9CDD1", background: active ? alpha(S.accent, 0.12) : undefined }}
    >
      <Icon size={15} strokeWidth={1.75} />
      {children}
      {badge != null && (
        <span className="ml-0.5 inline-flex size-[18px] items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: "#2B3031" }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function KpiPill({ k, v, tone }: { k: string; v: string; tone?: Tone }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px]" style={{ boxShadow: "inset 0 0 0 1px #24272A", color: "#6F7479" }}>
      {k}
      <span className="font-semibold tabular-nums" style={{ color: tone ? toneColor(tone) : "#EFF1F3" }}>
        {v}
      </span>
    </span>
  );
}

function StatusPill({ s }: { s: Status }) {
  const st = STATUS[s];
  const c = toneColor(st.tone);
  return (
    <span className="inline-flex h-[24px] w-fit items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold" style={{ background: alpha(c, 0.14), color: "#fff" }}>
      <span className="size-[6px] rounded-full" style={{ background: c }} />
      {st.label}
    </span>
  );
}

/** Workspace card tinted in the lane colour: category → title → footer. */
function LaneCard({ r, tone, onToggle }: { r: TodayRow; tone: Tone; onToggle: () => void }) {
  const c = toneColor(tone);
  const p = PRIORITY[r.priority] ?? PRIORITY[0];
  return (
    <article
      className="group flex flex-col gap-3 rounded-[12px] p-4 transition-all duration-150 hover:-translate-y-px"
      style={{ background: alpha(c, 0.075), boxShadow: `inset 0 0 0 1px ${alpha(c, 0.08)}, inset 0 1px 0 rgba(255,255,255,.04)` }}
    >
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: alpha(c, 0.85) }}>
        <Folder size={13} strokeWidth={2} />
        <span className="truncate">{r.projectName ?? "Без проекта"}</span>
      </div>
      <h4 className="line-clamp-2 text-[14.5px] font-medium leading-[1.4]" style={{ color: r.done ? "#7A7F84" : "#EFF1F3", textDecoration: r.done ? "line-through" : undefined }}>
        {r.title}
      </h4>
      <div className="flex items-center gap-2.5">
        <Check done={r.done} onClick={onToggle} label={r.title} size={18} />
        <span className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "#D5D8DB" }}>
          <span className="size-[6px] rounded-full" style={{ background: toneColor(p.tone) }} />
          {p.label}
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          {r.spentMin > 0 && (
            <span className="flex items-center gap-1 text-[12.5px] tabular-nums" style={{ color: alpha(c, 0.8) }}>
              <Clock3 size={13} strokeWidth={1.75} />
              {Math.round(r.spentMin)}м
            </span>
          )}
          {r.dueLabel && (
            <span className="flex items-center gap-1 text-[12.5px] tabular-nums" style={{ color: r.overdue ? S.red : alpha(c, 0.8) }}>
              <CalendarClock size={13} strokeWidth={1.75} />
              {r.dueLabel}
            </span>
          )}
        </span>
      </div>
    </article>
  );
}

function LaneEmpty({ s, goal }: { s: Status; goal: number }) {
  const t = {
    overdue: ["Просрочек нет", "Всё, что горело, уже закрыто."],
    today: ["Колонка свободна", "Закройте просроченное или добавьте задачу."],
    over: ["Лимит не превышен", "Всё помещается в дневной фокус."],
    done: ["Пока пусто", `Отметьте задачу — до цели дня ${goal} ${plural(goal, "задача", "задачи", "задач")}.`],
  }[s];
  const c = toneColor(STATUS[s].tone);
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[12px] px-4 py-6 text-center" style={{ boxShadow: `inset 0 0 0 1px ${alpha(c, 0.14)}`, background: `repeating-linear-gradient(135deg, ${alpha(c, 0.045)} 0 6px, transparent 6px 12px)` }}>
      <span className="text-[13.5px] font-semibold">{t[0]}</span>
      <span className="text-[12.5px] leading-[1.45]" style={{ color: "#8A8F94" }}>
        {t[1]}
      </span>
    </div>
  );
}

function Panel({ title, tone, count, countHint, children }: { title: string; tone: Tone; count?: number; countHint?: string; children: ReactNode }) {
  const c = toneColor(tone);
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-[18px] p-2.5" style={{ background: PANEL, boxShadow: "inset 0 0 0 1px #1A1C1E" }}>
      <header className="flex h-10 items-center gap-2 px-1.5">
        <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[13.5px] font-semibold" style={{ background: "#181B1D", boxShadow: "inset 0 1px 0 #2E3235" }}>
          <span className="size-[6px] rounded-full" style={{ background: c }} />
          {title}
        </span>
        {count != null && (
          <span className="text-[13px] tabular-nums" style={{ color: c }}>
            {count}
            {countHint && <span style={{ color: "#6F7479" }}> {countHint}</span>}
          </span>
        )}
        <span className="ml-auto flex items-center">
          <IconBtn icon={MoreHorizontal} label="Меню" />
          <IconBtn icon={ArrowRight} label="Открыть" />
        </span>
      </header>
      <div className="flex flex-1 flex-col pb-1.5">{children}</div>
    </section>
  );
}

function MoneyCell({ k, v, tone }: { k: string; v: string; tone: Tone }) {
  const c = toneColor(tone);
  return (
    <div className="rounded-[10px] px-3 py-2" style={{ background: tone === "neutral" ? "#16181A" : alpha(c, 0.08) }}>
      <div className="text-[12px]" style={{ color: "#6F7479" }}>
        {k}
      </div>
      <div className="truncate text-[14px] font-semibold tabular-nums" style={{ color: tone === "red" ? c : "#EFF1F3" }}>
        {v}
      </div>
    </div>
  );
}

