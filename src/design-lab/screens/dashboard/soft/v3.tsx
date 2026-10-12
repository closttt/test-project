/**
 * Dashboard · Soft Instrument · v3 «Канбан-центр» (ref 6 Taskplus)
 * Composition: the plan IS the page. A 68px icon rail instead of a sidebar; a big folder-tile
 * title; KPIs squeezed into one slim bevelled strip; a Kanban / Список switcher with working
 * filter + sort; four sunken column wells (Просрочено / Сегодня / Сверх плана / Готово сегодня)
 * holding lifted gradient cards with dot-chips, meta rows and tick progress, «+ Добавить» at the
 * column foot. Projects, meetings, rhythm, money, reading and the note live in a right
 * drawer-like column.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  Clock3,
  CornerDownRight,
  Filter,
  Flame,
  FolderKanban,
  Inbox,
  Kanban,
  List,
  MoreVertical,
  NotebookPen,
  PanelRightClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useDashboardModel, rub, type DashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";
import {
  S,
  alpha,
  rootStyle,
  NAV_ICON,
  IconBox,
  Chip,
  Check,
  IconBtn,
  Btn,
  Meta,
  SegmentBar,
  MiniBars,
  EmptyState,
  AddInline,
  NoteBox,
  ViewTabs,
  BrandMark,
  plural,
  toneColor,
  PRIORITY,
  useDoneToday,
  type Tone,
} from "@/design-lab/screens/_kit/soft";
import { formatDuration } from "@/lib/format";

type View = "kanban" | "list";
type Sort = "priority" | "due";

const CANVAS = "#18181A";
const WELL = "#121213";

export default function SoftV3() {
  const m = useDashboardModel();
  const doneToday = useDoneToday();
  const [view, setView] = useState<View>("kanban");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [sort, setSort] = useState<Sort>("priority");
  const [overAll, setOverAll] = useState(false);
  const [sig, setSig] = useState<Record<string, number>>({});

  const cols = useMemo(() => {
    const f = (rs: TodayRow[]) => {
      const x = onlyHigh ? rs.filter((r) => r.priority === 1) : rs;
      return [...x].sort((a, b) =>
        sort === "priority" ? (a.priority || 9) - (b.priority || 9) || (a.due ?? "").localeCompare(b.due ?? "") : (a.due ?? "").localeCompare(b.due ?? "")
      );
    };
    return {
      overdue: f(m.plan.filter((r) => r.overdue)),
      today: f(m.plan.filter((r) => !r.overdue && !r.done)),
      over: f(m.overPlan),
      done: f(doneToday),
    };
  }, [m.plan, m.overPlan, doneToday, onlyHigh, sort]);

  const bump = (k: string) => setSig((s) => ({ ...s, [k]: (s[k] ?? 0) + 1 }));
  const weekday = m.dateLabel.split(",")[0];

  return (
    <div className="flex min-h-screen" style={{ ...rootStyle, background: CANVAS }}>
      <Rail m={m} />

      <main className="min-w-0 flex-1 px-7 pb-10 pt-5 max-[1360px]:px-5">
        {/* breadcrumbs */}
        <div className="flex h-9 items-center justify-between">
          <div className="flex items-center gap-3 text-[14px]">
            <IconBtn icon={ArrowLeft} label="Назад" size={28} />
            <span style={{ color: S.ink3 }}>Задачи</span>
            <span style={{ color: S.ink4 }}>/</span>
            <span>План на сегодня</span>
          </div>
          <span className="text-[13px]" style={{ color: S.ink3 }}>
            {m.dateLabel}
          </span>
        </div>

        {/* title */}
        <div className="mt-5 flex items-center gap-4">
          <FolderTile />
          <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em]">План · {weekday.toLowerCase()}</h1>
        </div>

        {/* slim KPI strip */}
        <div className="mt-5 flex w-fit max-w-full items-stretch overflow-hidden rounded-[11px]" style={{ background: "#1F1F21", boxShadow: S.bevel }}>
          <Stat icon={Target} tone="accent" k="Сегодня" v={`${m.kpi.todayDone}/${m.kpi.todayTotal}`} />
          <Stat icon={AlertTriangle} tone="red" k="Просрочено" v={String(m.kpi.overdueToday)} />
          <Stat icon={Clock3} tone="blue" k="Время" v={m.kpi.timeLabel} />
          <Stat icon={Inbox} tone="neutral" k="Открыто" v={String(m.kpi.openCount)} />
          <Stat icon={CheckCheck} tone="green" k="За неделю" v={String(m.kpi.weekDone)} />
          <Stat icon={Flame} tone="orange" k="Серия" v={`${m.kpi.streak} дн.`} last />
        </div>

        {/* switcher */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <ViewTabs<View>
            size="lg"
            value={view}
            onChange={setView}
            tabs={[
              { id: "kanban", label: "Канбан", icon: Kanban },
              { id: "list", label: "Список", icon: List },
            ]}
          />
          <div className="flex items-center gap-2">
            <BevelBtn icon={Filter} active={onlyHigh} onClick={() => setOnlyHigh((v) => !v)}>
              {onlyHigh ? "Только высокий" : "Фильтр"}
            </BevelBtn>
            <BevelBtn icon={ArrowDownUp} onClick={() => setSort((s) => (s === "priority" ? "due" : "priority"))}>
              {sort === "priority" ? "По приоритету" : "По сроку"}
            </BevelBtn>
          </div>
        </div>

        {view === "kanban" ? (
          <div className="mt-4 grid grid-cols-4 items-start gap-3">
            <Column title="Просрочено" bar={S.red} count={cols.overdue.length}>
              {cols.overdue.map((r) => (
                <Card key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />
              ))}
              {!cols.overdue.length && <EmptyState icon={CheckCheck} tone="green" title="Ничего не горит" text="Просроченных задач в плане нет." />}
            </Column>
            <Column title="Сегодня" bar={S.blue} count={cols.today.length} onAdd={() => bump("today")}>
              {cols.today.map((r) => (
                <Card key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />
              ))}
              {!cols.today.length && <EmptyState icon={Sparkles} tone="blue" title="Свободная колонка" text="Новые задачи на сегодня появятся здесь." />}
              <AddInline onAdd={m.actions.add} label="Добавить" openSignal={sig.today} />
            </Column>
            <Column
              title="Сверх плана"
              bar={S.amber}
              count={cols.over.length}
              onAdd={() => bump("over")}
            >
              {(overAll ? cols.over : cols.over.slice(0, 5)).map((r) => (
                <Card key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />
              ))}
              {cols.over.length > 5 && (
                <button
                  type="button"
                  onClick={() => setOverAll((v) => !v)}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] text-[13px] transition-colors hover:bg-white/[0.04]"
                  style={{ color: S.ink3 }}
                >
                  {overAll ? "Свернуть" : `Показать ещё ${cols.over.length - 5}`}
                  <ChevronDown size={14} strokeWidth={1.75} className={overAll ? "rotate-180" : ""} />
                </button>
              )}
              {!cols.over.length && <EmptyState icon={Target} title="В пределах лимита" text="Всё помещается в дневной фокус." />}
              <AddInline onAdd={m.actions.add} label="Добавить" openSignal={sig.over} />
              {cols.over.length > 0 && (
                <button
                  type="button"
                  onClick={m.actions.moveOverPlanToTomorrow}
                  className="flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors hover:bg-white/[0.04]"
                  style={{ color: S.amber }}
                >
                  <ArrowRight size={15} strokeWidth={1.75} />
                  Всё сверх плана — на завтра
                </button>
              )}
            </Column>
            <Column title="Готово сегодня" bar={S.green} count={cols.done.length}>
              {cols.done.map((r) => (
                <Card key={r.id} r={r} onToggle={() => m.actions.toggle(r.id)} />
              ))}
              {!cols.done.length && (
                <EmptyState icon={CheckCheck} tone="green" title="Пока ничего не закрыто" text={`Цель дня — ${m.kpi.dailyGoal} ${plural(m.kpi.dailyGoal, "задача", "задачи", "задач")}. Отметьте первую галочкой.`} />
              )}
            </Column>
          </div>
        ) : (
          <ListView m={m} rows={[...cols.overdue, ...cols.today, ...cols.over, ...cols.done]} />
        )}
      </main>

      <Drawer m={m} />
    </div>
  );
}

// ── Rail ─────────────────────────────────────────────────────────────────────────────────────
function Rail({ m }: { m: DashboardModel }) {
  return (
    <aside className="sticky top-0 flex h-screen w-[68px] shrink-0 flex-col items-center gap-1 py-4" style={{ background: "#141416", boxShadow: `inset -1px 0 0 ${S.line}` }}>
      <BrandMark size={34} />
      <div className="my-3 h-px w-8" style={{ background: S.line2 }} />
      <RailBtn icon={Search} label="Поиск" />
      <div className="my-2 h-px w-8" style={{ background: S.line2 }} />
      {m.nav.map((n) => {
        const Icon = NAV_ICON[n.id] ?? FolderKanban;
        return <RailBtn key={n.id} icon={Icon} label={n.label} active={n.id === "dashboard"} badge={n.badge} />;
      })}
      <div className="mt-auto flex flex-col items-center gap-2">
        <span
          className="relative flex size-10 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums"
          title={`Уровень ${m.kpi.level} · ${m.kpi.levelTitle}`}
          style={{ background: `conic-gradient(${S.accent} ${m.kpi.levelPct * 3.6}deg, rgba(255,255,255,.08) 0)` }}
        >
          <span className="flex size-[34px] items-center justify-center rounded-full" style={{ background: "#141416" }}>
            {m.kpi.level}
          </span>
        </span>
        <RailBtn icon={Settings} label="Настройки" />
      </div>
    </aside>
  );
}

function RailBtn({ icon: Icon, label, active, badge }: { icon: LucideIcon; label: string; active?: boolean; badge?: number }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      title={label}
      aria-label={label}
      className={`group relative flex size-10 items-center justify-center rounded-[10px] transition-colors ${active ? "" : "hover:bg-white/[0.05]"}`}
      style={active ? { background: "#29292B", boxShadow: S.bevel, color: S.ink } : { color: S.ink3 }}
    >
      <Icon size={19} strokeWidth={1.75} className={active ? "" : "group-hover:text-white"} />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9.5px] font-bold tabular-nums" style={{ background: S.accent, color: "#fff", boxShadow: `0 0 0 2px #141416` }}>
          {badge}
        </span>
      ) : null}
      <span
        className="pointer-events-none absolute left-[calc(100%+10px)] z-30 hidden whitespace-nowrap rounded-[7px] px-2 py-1 text-[12px] font-medium group-hover:block"
        style={{ background: "#2A2A2C", color: S.ink, boxShadow: S.bevel }}
      >
        {label}
      </span>
    </a>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────
function FolderTile() {
  return (
    <span className="relative inline-block h-[38px] w-[46px]" aria-hidden>
      <span className="absolute left-0 top-0 h-[12px] w-[20px] rounded-t-[5px]" style={{ background: "#5546C9" }} />
      <span
        className="absolute inset-x-0 bottom-0 top-[6px] rounded-[7px]"
        style={{ background: `linear-gradient(160deg, #A493FF 0%, ${S.accent} 48%, #4A3BC0 100%)`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 8px 18px -8px rgba(137,87,254,.8)" }}
      />
    </span>
  );
}

function Stat({ icon: Icon, tone, k, v, last }: { icon: LucideIcon; tone: Tone; k: string; v: string; last?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2" style={{ borderRight: last ? undefined : `1px solid rgba(0,0,0,.55)`, boxShadow: last ? undefined : `1px 0 0 rgba(255,255,255,.04)` }}>
      <Icon size={15} strokeWidth={1.75} style={{ color: toneColor(tone) }} />
      <span className="whitespace-nowrap text-[13px]" style={{ color: S.ink3 }}>
        {k}
      </span>
      <span className="whitespace-nowrap text-[13.5px] font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function BevelBtn({ icon: Icon, children, onClick, active }: { icon: LucideIcon; children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex h-9 items-center gap-2 rounded-[9px] px-3.5 text-[14px] font-medium transition-all hover:brightness-125"
      style={{ background: active ? alpha(S.accent, 0.22) : "#262628", boxShadow: S.bevel, color: active ? "#D6CCFF" : S.ink }}
    >
      <Icon size={16} strokeWidth={1.75} />
      {children}
    </button>
  );
}

function Column({
  title,
  bar,
  count,
  onAdd,
  children,
}: {
  title: string;
  bar: string;
  count: number;
  onAdd?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-[14px] p-2.5" style={{ background: WELL, boxShadow: "inset 0 1px 3px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.025)" }}>
      <header className="flex h-10 items-center gap-2.5 px-1.5">
        <span className="h-[18px] w-[3px] shrink-0 rounded-full" style={{ background: bar }} />
        <span className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em]">{title}</span>
        <span className="text-[13px] tabular-nums" style={{ color: S.ink3 }}>
          {count}
        </span>
        <span className="ml-auto flex shrink-0 items-center">
          {onAdd && (
            <span className="max-[1360px]:hidden">
              <IconBtn icon={Plus} label={`Добавить в «${title}»`} onClick={onAdd} />
            </span>
          )}
          <IconBtn icon={MoreVertical} label="Меню колонки" />
        </span>
      </header>
      {children}
    </section>
  );
}

/** Taskplus card: gradient body, light top rim; dot-chips → title → meta → tick progress. */
function Card({ r, onToggle }: { r: TodayRow; onToggle: () => void }) {
  const p = PRIORITY[r.priority] ?? PRIORITY[0];
  const c = toneColor(p.tone);
  return (
    <article
      className="group flex flex-col gap-2.5 rounded-[11px] p-3 transition-all duration-150 hover:-translate-y-px"
      style={{
        background: "linear-gradient(180deg, #252527 0%, #1C1C1E 100%)",
        boxShadow: "0 0 0 1px #2E2E30, inset 0 1px 0 rgba(255,255,255,.07), 0 6px 14px -8px rgba(0,0,0,.7)",
        opacity: r.done ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-[19px] shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[11.5px] font-medium" style={{ background: alpha(c, 0.12), color: c }}>
          <span className="size-[4px] rounded-full" style={{ background: c }} />
          {p.label}
        </span>
        {r.projectName && (
          <span className="inline-flex h-[19px] min-w-0 items-center truncate rounded-[4px] px-1.5 text-[11.5px] font-medium" style={{ background: "rgba(159,177,251,.12)", color: "#A9B8FB" }}>
            <span className="truncate">{r.projectName}</span>
          </span>
        )}
        <span className="ml-auto">
          <Check done={r.done} onClick={onToggle} label={r.title} size={18} />
        </span>
      </div>
      <h4 className="line-clamp-2 text-[14.5px] font-semibold leading-[1.35] tracking-[-0.01em]" style={{ color: r.done ? S.ink3 : S.ink, textDecoration: r.done ? "line-through" : undefined }}>
        {r.title}
      </h4>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {r.subtasksTotal > 0 && (
          <Meta icon={CornerDownRight} title="Подзадачи">
            {r.subtasksTotal}
          </Meta>
        )}
        {(r.spentMin > 0 || !!r.estimateMin) && (
          <Meta icon={Clock3} title="Время">
            {r.spentMin ? formatDuration(r.spentMin) : `~${formatDuration(r.estimateMin ?? 0)}`}
          </Meta>
        )}
        <Meta icon={CalendarClock} tone={r.overdue ? "red" : undefined} title="Срок">
          {r.dueLabel || "без срока"}
        </Meta>
      </div>
      {(r.subtasksTotal > 0 || r.done) && (
        <div className="pt-1">
          {r.done ? (
            <SegmentBar value={Math.max(1, r.subtasksTotal)} total={Math.max(1, r.subtasksTotal)} segments={10} h={11} w={2} tone="green" />
          ) : (
            <SegmentBar value={r.subtasksDone} total={r.subtasksTotal} segments={10} h={11} w={2} tone="blue" />
          )}
        </div>
      )}
    </article>
  );
}

function ListView({ m, rows }: { m: DashboardModel; rows: TodayRow[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[14px]" style={{ background: WELL, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.04)" }}>
      {rows.map((r) => {
        const p = PRIORITY[r.priority] ?? PRIORITY[0];
        return (
          <div key={r.id} className="flex h-12 items-center gap-3 border-b px-4 transition-colors last:border-0 hover:bg-white/[0.02]" style={{ borderColor: S.line }}>
            <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
            <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: r.done ? S.ink3 : S.ink, textDecoration: r.done ? "line-through" : undefined }}>
              {r.title}
            </span>
            {r.projectName && (
              <span className="max-w-[140px] truncate text-[12.5px]" style={{ color: S.ink3 }}>
                {r.projectName}
              </span>
            )}
            <Chip tone={p.tone} dot>
              {p.label}
            </Chip>
            <span className="w-[64px] text-right text-[12.5px] tabular-nums" style={{ color: r.overdue ? S.red : S.ink3 }}>
              {r.dueLabel}
            </span>
          </div>
        );
      })}
      <div className="p-2">
        <AddInline onAdd={m.actions.add} label="Добавить задачу" />
      </div>
    </div>
  );
}

// ── Right drawer ─────────────────────────────────────────────────────────────────────────────
function Drawer({ m }: { m: DashboardModel }) {
  return (
    <aside className="sticky top-0 flex h-screen w-[320px] shrink-0 flex-col overflow-y-auto max-[1360px]:w-[280px] [scrollbar-width:thin]" style={{ background: "#141416", boxShadow: `inset 1px 0 0 ${S.line}` }}>
      <div className="flex h-[60px] shrink-0 items-center justify-between px-5">
        <span className="text-[14px] font-semibold">Контекст дня</span>
        <IconBtn icon={PanelRightClose} label="Скрыть панель" />
      </div>

      <DrawerSection icon={CalendarClock} tone="blue" title="Встречи" count={m.meetings.length}>
        {m.meetings.length ? (
          m.meetings.slice(0, 4).map((mt) => (
            <div key={mt.id} className="flex items-center gap-2.5 py-1.5">
              <Check done={!!mt.done} onClick={() => m.actions.toggleMeeting(mt.id)} label={mt.title} size={16} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{mt.title}</span>
              <span className="text-[12px] tabular-nums" style={{ color: S.ink3 }}>
                {mt.dateLabel} {mt.time}
              </span>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-3 rounded-[10px] px-3 py-3" style={{ background: "#1B1B1D" }}>
            <CalendarCheck2 size={18} strokeWidth={1.75} style={{ color: S.blue }} />
            <div className="text-[12.5px] leading-[1.4]" style={{ color: S.ink3 }}>
              <span style={{ color: S.ink }}>Встреч нет.</span> День целиком под задачи.
            </div>
          </div>
        )}
      </DrawerSection>

      <DrawerSection icon={FolderKanban} tone="accent" title="Проекты" count={m.projects.length}>
        {m.projects.slice(0, 5).map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5 py-2">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="truncate font-medium">{p.name}</span>
              <span className="shrink-0 text-[12px]" style={{ color: p.health === "off-track" ? S.red : p.health === "at-risk" ? S.orange : S.ink3 }}>
                {p.healthLabel}
              </span>
            </div>
            <SegmentBar value={p.done} total={p.total} segments={18} h={10} w={3} tone={p.health === "off-track" ? "red" : p.pct >= 99 ? "green" : "blue"} />
          </div>
        ))}
      </DrawerSection>

      <DrawerSection icon={Flame} tone="orange" title="Ритм · 14 дней" count={m.closed14}>
        <div className="flex items-end justify-between gap-3">
          <MiniBars values={m.dynamics.map((d) => d.value)} height={44} barW={10} tone="accent" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            { k: "Готово", v: m.status.doneAll, t: "green" as Tone },
            { k: "В работе", v: m.status.inProgress, t: "orange" as Tone },
            { k: "Просроч.", v: m.status.overdueAll, t: "red" as Tone },
          ].map((x) => (
            <div key={x.k} className="rounded-[8px] px-2.5 py-2" style={{ background: "#1B1B1D" }}>
              <div className="text-[11.5px]" style={{ color: S.ink3 }}>
                {x.k}
              </div>
              <div className="text-[15px] font-semibold tabular-nums" style={{ color: toneColor(x.t) }}>
                {x.v}
              </div>
            </div>
          ))}
        </div>
      </DrawerSection>

      <DrawerSection icon={Wallet} tone="green" title="Деньги · месяц">
        <div className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]">{rub(m.money.paidThisMonth)}</div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] tabular-nums" style={{ color: S.ink3 }}>
          <span>
            ждём <span style={{ color: S.ink }}>{rub(m.money.pending)}</span>
          </span>
          <span>
            долг <span style={{ color: m.money.overdue ? S.red : S.ink }}>{rub(m.money.overdue)}</span>
          </span>
        </div>
      </DrawerSection>

      <DrawerSection icon={BookOpen} tone="orange" title="Чтение дня">
        {m.reading ? (
          <a href={m.reading.url ?? "#"} target="_blank" rel="noreferrer" className="group flex items-center gap-3">
            <span className="size-11 shrink-0 overflow-hidden rounded-[9px]" style={{ background: S.s3 }}>
              {m.reading.coverUrl && <img src={m.reading.coverUrl} alt="" className="size-full object-cover" />}
            </span>
            <span className="line-clamp-2 text-[13px] font-medium leading-[1.35] group-hover:underline">{m.reading.title}</span>
          </a>
        ) : (
          <span className="text-[12.5px]" style={{ color: S.ink3 }}>
            Очередь пуста — добавьте в Библиотеку.
          </span>
        )}
      </DrawerSection>

      <DrawerSection icon={NotebookPen} tone="accent" title="Заметка" last>
        <NoteBox onSave={m.actions.saveNote} rows={3} />
      </DrawerSection>
    </aside>
  );
}

function DrawerSection({ icon, tone, title, count, children, last }: { icon: LucideIcon; tone: Tone; title: string; count?: number; children: ReactNode; last?: boolean }) {
  return (
    <section className="px-5 py-4" style={{ borderTop: `1px solid ${S.line}`, paddingBottom: last ? 24 : undefined }}>
      <div className="mb-3 flex items-center gap-2.5">
        <IconBox icon={icon} tone={tone} size={26} />
        <span className="text-[13.5px] font-semibold">{title}</span>
        {count != null && (
          <span className="ml-auto text-[12px] tabular-nums" style={{ color: S.ink3 }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
