/**
 * Dashboard · Soft Instrument · v2 «Аналитика» (ref 8 Celoci)
 * Composition: an analytics console. The sidebar is a rounded panel with a company-style brand
 * card and a 3px accent indicator glued to the window edge for the active item. The page lives in
 * one inset main panel where cards are drawn by outline, not by fill: a single KPI group-card
 * (4 cells through hairlines, delta chips vs the previous week, «Подробнее →» footers), a big
 * hatched area chart with today's capsule + tooltip next to a two-arc daily-goal gauge, a
 * half-year heatmap beside the plan of the day, a projects table with hairline columns, and a
 * bottom row of meetings / money / reading / note.
 */
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  Clock3,
  Flame,
  FolderKanban,
  Grid3x3,
  MoreHorizontal,
  NotebookPen,
  SlidersHorizontal,
  Target,
  Wallet,
} from "lucide-react";

import { useDashboardModel, rub, type DashboardModel } from "@/design-lab/screens/dashboardModel";
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
  Btn,
  SegmentBar,
  HatchedArea,
  HalfRing,
  Heatmap,
  DeltaChip,
  EmptyState,
  AddInline,
  NoteBox,
  ViewTabs,
  SearchField,
  plural,
  weekDelta,
  type Tone,
} from "@/design-lab/screens/_kit/soft";

const HEALTH_TONE: Record<string, Tone> = { "off-track": "red", "at-risk": "orange", "on-track": "green", done: "blue", empty: "neutral" };

/** Celoci: the card is an outline on the panel tone, not a lighter fill. */
const card = { background: S.s1, boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.065)` };
const hatch = "repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0 1.5px, transparent 1.5px 7px), rgba(255,255,255,0.02)";

export default function SoftV2() {
  const m = useDashboardModel();
  const wd = weekDelta(m.dynamics);
  const yesterday = m.dynamics[m.dynamics.length - 2]?.value ?? 0;
  const goalPct = m.kpi.dailyGoal ? m.kpi.closedToday / m.kpi.dailyGoal : 0;
  const planPct = m.kpi.todayTotal ? m.kpi.todayDone / m.kpi.todayTotal : 0;

  return (
    <div className="flex min-h-screen" style={rootStyle}>
      <Sidebar m={m} />

      <main className="my-3 mr-3 min-w-0 flex-1 rounded-[16px] px-7 pb-8 pt-5" style={{ background: "#121213", boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.05)` }}>
        {/* top row */}
        <div className="flex items-center justify-between gap-4">
          <SearchField placeholder="Поиск" width={300} kbd="F ⌘" />
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[13px]" style={{ ...card, color: S.ink2 }}>
              <CalendarDays size={15} strokeWidth={1.75} />
              {m.dateLabel}
            </span>
          </div>
        </div>

        <header className="mt-6 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.015em]">Аналитика дня</h1>
            <p className="mt-1 text-[14.5px]" style={{ color: S.ink3 }}>
              {m.greeting}. План, ритм и проекты — с динамикой к прошлой неделе.
            </p>
          </div>
          <Btn kind="soft" icon={SlidersHorizontal}>
            Фильтры
          </Btn>
        </header>

        {/* KPI group card — 4 cells through hairlines */}
        <section className="mt-5 grid grid-cols-4 overflow-hidden rounded-[14px]" style={card}>
          <KpiCell label="План на сегодня" foot="Открыть план" first>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-medium leading-none tabular-nums tracking-[-0.02em]">
                {m.kpi.todayDone}
                <span style={{ color: S.ink4 }}>/{m.kpi.todayTotal}</span>
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between text-[12.5px]" style={{ color: S.ink3 }}>
              <span>Разбивка дня</span>
              <span className="tabular-nums">сверх плана: {m.overPlan.length}</span>
            </div>
            <SplitBar
              parts={[
                { v: m.kpi.todayDone, label: "Готово", bg: S.accent },
                { v: m.plan.filter((r) => !r.done).length, label: "План", bg: "#4A3A8F" },
              ]}
              total={Math.max(1, m.today.length)}
            />
          </KpiCell>
          <KpiCell label="Закрыто за 7 дней" foot="Вся динамика">
            <div className="flex items-start justify-between">
              <span className="text-[28px] font-medium leading-none tabular-nums tracking-[-0.02em]">{wd.cur}</span>
              <Capsules values={m.dynamics.slice(-7).map((d) => d.value)} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: S.ink3 }}>
              <DeltaChip value={wd.diff} />
              vs прошлая неделя
            </div>
          </KpiCell>
          <KpiCell label="Время сегодня" foot="Таймер задач">
            <span className="text-[28px] font-medium leading-none tabular-nums tracking-[-0.02em]">{m.kpi.timeLabel}</span>
            <div className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: S.ink3 }}>
              <DeltaChip value={m.kpi.closedToday - yesterday} />
              закрытий к вчера
            </div>
          </KpiCell>
          <KpiCell label="Открыто задач" foot="Все задачи">
            <span className="text-[28px] font-medium leading-none tabular-nums tracking-[-0.02em]">{m.kpi.openCount}</span>
            <div className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: S.ink3 }}>
              <Chip tone="red">{m.status.overdueAll} просрочено</Chip>
              <span className="tabular-nums">{m.status.inProgress} в работе</span>
            </div>
          </KpiCell>
        </section>

        {/* hatched area + gauge */}
        <section className="mt-3 grid grid-cols-[minmax(0,1fr)_340px] gap-3 max-[1360px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-[14px] p-5" style={card}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[15px] font-medium">Динамика закрытий</div>
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="text-[28px] font-medium leading-none tabular-nums tracking-[-0.02em]">+{m.closed14}</span>
                  <Chip tone="green">пик {m.peak14} в день</Chip>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-3 pr-2 text-[12px] min-[1360px]:flex" style={{ color: S.ink3 }}>
                  <span className="flex items-center gap-1.5">
                    <span className="h-[8px] w-[12px] rounded-[2px]" style={{ background: hatch, boxShadow: `inset 0 0 0 1px ${S.line2}` }} />
                    за день
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0 w-3 border-t border-dashed" style={{ borderColor: S.accent }} />
                    среднее 7 дн.
                  </span>
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px]" style={{ background: S.s3, color: S.ink }}>
                  14 дней <ChevronDown size={14} strokeWidth={1.75} style={{ color: S.ink3 }} />
                </span>
              </div>
            </div>
            <div className="mt-3">
              <HatchedArea
                values={m.dynamics.map((d) => d.value)}
                labels={m.dynamics.map((d, i) => (i === m.dynamics.length - 1 ? "сегодня" : d.label))}
                highlight={m.dynamics.length - 1}
                height={276}
                tooltip={(i) => `${m.dynamics[i].value} ${plural(m.dynamics[i].value, "задача", "задачи", "задач")}`}
              />
            </div>
          </div>

          <div className="flex flex-col rounded-[14px] p-5" style={card}>
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium">Цель дня</span>
              <IconBtn icon={MoreHorizontal} label="Ещё" />
            </div>
            <div className="mt-6 flex justify-center">
              <HalfRing value={goalPct} inner={planPct} size={236} stroke={13}>
                <span className="text-[32px] font-medium leading-none tabular-nums tracking-[-0.02em]">{Math.round(goalPct * 100)}%</span>
                <span className="mt-1.5 text-[13px]" style={{ color: S.ink3 }}>
                  {m.kpi.closedToday} из {m.kpi.dailyGoal} закрыто
                </span>
              </HalfRing>
            </div>
            <div className="mt-6 flex flex-col gap-3 rounded-[10px] p-3.5" style={{ background: "#1D1D1F" }}>
              <Legend color={S.accent} label="Закрыто сегодня" value={`${m.kpi.closedToday}/${m.kpi.dailyGoal}`} />
              <Legend color={S.blue} label="План дня выполнен" value={`${m.kpi.todayDone}/${m.kpi.todayTotal}`} />
            </div>
            <div className="mt-auto flex items-center justify-between border-t pt-3.5 text-[13px]" style={{ borderColor: S.line, color: S.ink3 }}>
              <span className="flex items-center gap-1.5">
                <Flame size={14} strokeWidth={1.75} style={{ color: S.orange }} />
                серия {m.kpi.streak} · лучшая {m.kpi.bestStreak}
              </span>
              <span className="flex items-center gap-1">
                Подробнее <ArrowRight size={14} strokeWidth={1.75} />
              </span>
            </div>
          </div>
        </section>

        {/* heatmap + plan */}
        <section className="mt-3 grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-3">
          <HeatCard m={m} />
          <PlanCard m={m} />
        </section>

        {/* projects table */}
        <section className="mt-3 overflow-hidden rounded-[14px]" style={card}>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-[15px] font-medium">Проекты</span>
            <span className="text-[13px]" style={{ color: S.ink3 }}>
              {m.projects.filter((p) => p.health === "off-track" || p.health === "at-risk").length} требуют внимания
            </span>
          </div>
          <table className="w-full table-fixed border-collapse text-[13.5px]">
            <colgroup>
              <col />
              <col className="w-[16%]" />
              <col className="w-[24%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[12.5px]" style={{ color: S.ink3, background: "rgba(255,255,255,0.015)" }}>
                {["Проект", "Клиент", "Прогресс", "Статус", "Просрочено", "Время"].map((h, i) => (
                  <th key={h} className="h-10 px-5 font-normal" style={{ borderTop: `1px solid ${S.line}`, borderLeft: i ? `1px solid ${S.line}` : undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.projects.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-white/[0.02]">
                  <Td first>
                    <span className="flex items-center gap-2.5">
                      <span className="size-2 shrink-0 rounded-[3px]" style={{ background: p.health === "off-track" ? S.red : p.health === "at-risk" ? S.orange : S.accent }} />
                      <span className="truncate font-medium">{p.name}</span>
                    </span>
                  </Td>
                  <Td>
                    <span className="truncate" style={{ color: p.clientName ? S.ink2 : S.ink4 }}>
                      {p.clientName ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-3">
                      <SegmentBar value={p.done} total={p.total} segments={16} label={false} h={11} w={3} tone={p.health === "off-track" ? "red" : "accent"} />
                      <span className="tabular-nums" style={{ color: S.ink2 }}>
                        {Math.round(p.pct)}%
                      </span>
                    </span>
                  </Td>
                  <Td>
                    <Chip tone={HEALTH_TONE[p.health]} dot>
                      {p.healthLabel}
                    </Chip>
                  </Td>
                  <Td>
                    <span className="tabular-nums" style={{ color: p.overdue ? S.red : S.ink4 }}>
                      {p.overdue || "—"}
                    </span>
                  </Td>
                  <Td>
                    <span className="tabular-nums" style={{ color: S.ink2 }}>
                      {p.spentLabel}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* bottom row */}
        <section className="mt-3 grid grid-cols-4 gap-3">
          <SmallCard icon={CalendarClock} tone="blue" title="Встречи" value={m.meetings.length ? String(m.meetings.length) : undefined}>
            {m.meetings.length ? (
              <div className="flex flex-col gap-1">
                {m.meetings.slice(0, 3).map((mt) => (
                  <div key={mt.id} className="flex items-center gap-2.5 py-1.5">
                    <Check done={!!mt.done} onClick={() => m.actions.toggleMeeting(mt.id)} label={mt.title} size={16} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{mt.title}</span>
                    <span className="text-[12px] tabular-nums" style={{ color: S.ink3 }}>
                      {mt.time}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CalendarCheck2} tone="blue" title="Встреч нет" text="Календарь свободен до конца дня." />
            )}
          </SmallCard>
          <SmallCard icon={Wallet} tone="green" title="Оплачено в месяце" value={rub(m.money.paidThisMonth)}>
            <div className="flex flex-col gap-2.5 text-[13px]">
              <Row k="Ожидается" v={rub(m.money.pending)} />
              <Row k="Просрочено" v={rub(m.money.overdue)} tone={m.money.overdue ? "red" : undefined} />
              <Row k="Всего получено" v={rub(m.money.paidTotal)} />
              {m.followUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.followUps.slice(0, 3).map((f) => (
                    <Chip key={f.id} tone="orange">
                      {f.name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </SmallCard>
          <SmallCard icon={BookOpen} tone="orange" title="Чтение дня">
            {m.reading ? (
              <a href={m.reading.url ?? "#"} target="_blank" rel="noreferrer" className="group flex flex-col gap-3">
                <span className="block h-[86px] overflow-hidden rounded-[10px]" style={{ background: S.s3 }}>
                  {m.reading.coverUrl ? (
                    <img src={m.reading.coverUrl} alt="" className="size-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : null}
                </span>
                <span className="line-clamp-2 text-[13px] font-medium leading-[1.4]">{m.reading.title}</span>
                <span className="truncate text-[12px]" style={{ color: S.ink3 }}>
                  {m.reading.domain ?? m.reading.author ?? ""}
                </span>
              </a>
            ) : (
              <EmptyState icon={BookOpen} title="Нечего читать" text="Добавьте материал в Библиотеку." />
            )}
          </SmallCard>
          <SmallCard icon={NotebookPen} tone="accent" title="Быстрая заметка">
            <NoteBox onSave={m.actions.saveNote} rows={5} />
          </SmallCard>
        </section>
      </main>
    </div>
  );
}

// ── Sidebar: rounded panel, indicator bar at the window edge ─────────────────────────────────
function Sidebar({ m }: { m: DashboardModel }) {
  const main = ["dashboard", "tasks", "projects", "clients", "planner"];
  const rest = ["analytics", "notes", "knowledge"];
  const byId = Object.fromEntries(m.nav.map((n) => [n.id, n]));
  const item = (id: string) => {
    const n = byId[id];
    if (!n) return null;
    const Icon = NAV_ICON[id] ?? FolderKanban;
    const active = id === "dashboard";
    return (
      <li key={id} className="relative">
        {active && <span className="absolute -left-3 top-1/2 h-[26px] w-[3px] -translate-y-1/2 rounded-r-full" style={{ background: S.accent, boxShadow: `0 0 12px ${alpha(S.accent, 0.6)}` }} />}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className={`flex h-[42px] items-center gap-3 rounded-[10px] px-3 text-[14.5px] transition-colors ${active ? "" : "hover:bg-white/[0.03] hover:text-white"}`}
          style={active ? { ...card, color: S.ink } : { color: S.ink2 }}
        >
          <Icon size={18} strokeWidth={1.75} style={{ color: active ? S.ink : S.ink3 }} />
          <span className="flex-1 truncate">{n.label}</span>
          {n.badge ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums" style={{ background: S.accent, color: "#fff" }}>
              {n.badge}
            </span>
          ) : null}
        </a>
      </li>
    );
  };
  return (
    <aside className="sticky top-0 flex h-screen w-[256px] shrink-0 flex-col px-3 py-3 max-[1360px]:w-[236px]">
      <div className="flex items-center gap-3 rounded-[12px] p-2.5" style={card}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px]" style={{ background: "#050505", boxShadow: `inset 0 0 0 1px ${S.line}` }}>
          <Grid3x3 size={18} strokeWidth={1.75} style={{ color: S.ink }} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">Рабочий стол</div>
          <div className="truncate text-[13px]" style={{ color: S.ink3 }}>
            Личный CRM
          </div>
        </div>
        <IconBtn icon={ChevronsLeft} label="Свернуть" size={26} style={{ background: S.s3 }} />
      </div>
      <nav className="mt-5 flex flex-1 flex-col">
        <ul className="flex flex-col gap-1">{main.map(item)}</ul>
        <div className="my-4 h-px" style={{ background: S.line }} />
        <ul className="flex flex-col gap-1">{rest.map(item)}</ul>
      </nav>
      <div className="rounded-[12px] p-3.5" style={card}>
        <div className="flex items-center gap-2.5">
          <IconBox icon={Target} tone="accent" size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">Уровень {m.kpi.level} · {m.kpi.levelTitle}</div>
            <div className="text-[12px] tabular-nums" style={{ color: S.ink3 }}>
              {m.kpi.xpToNext} XP до {m.kpi.level + 1}-го
            </div>
          </div>
        </div>
        <div className="mt-3 h-[6px] overflow-hidden rounded-full" style={{ background: hatch }}>
          <div className="h-full rounded-full" style={{ width: `${m.kpi.levelPct}%`, background: S.accent }} />
        </div>
      </div>
    </aside>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────
function KpiCell({ label, foot, first, children }: { label: string; foot: string; first?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" style={{ borderLeft: first ? undefined : `1px solid ${S.line}` }}>
      <div className="flex-1 px-5 pb-4 pt-4">
        <div className="mb-2.5 text-[14px]" style={{ color: S.ink2 }}>
          {label}
        </div>
        {children}
      </div>
      <button
        type="button"
        className="flex h-11 items-center justify-center gap-1.5 border-t text-[13px] transition-colors hover:bg-white/[0.02] hover:text-white"
        style={{ borderColor: S.line, color: S.ink3 }}
      >
        {foot} <ArrowRight size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Celoci product split: solid segments with inside labels, remainder hatched. */
function SplitBar({ parts, total }: { parts: { v: number; label: string; bg: string }[]; total: number }) {
  return (
    <div className="mt-2 flex h-[26px] w-full overflow-hidden rounded-[6px]" style={{ background: hatch, boxShadow: `inset 0 0 0 1px ${S.line}` }}>
      {parts.map((p) =>
        p.v > 0 ? (
          <span
            key={p.label}
            className="flex h-full min-w-0 items-center overflow-hidden whitespace-nowrap px-2 text-[11.5px] font-medium"
            style={{ width: `${(p.v / total) * 100}%`, background: p.bg, boxShadow: "inset -1px 0 0 rgba(0,0,0,.35)" }}
            title={`${p.label}: ${p.v}`}
          >
            <span className="truncate">{(p.v / total) * 100 > 30 ? p.label : ""}</span>
          </span>
        ) : null
      )}
    </div>
  );
}

/** Celoci mini 3-bar: capsules with lavender caps. */
function Capsules({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span className="flex h-[44px] items-end gap-[4px]" title="Последние 7 дней">
      {values.map((v, i) => (
        <span key={i} className="flex w-[8px] flex-col overflow-hidden rounded-full" style={{ height: Math.max(12, (v / max) * 44) }}>
          <span className="h-[5px] shrink-0" style={{ background: "#C3B6FF" }} />
          <span className="flex-1" style={{ background: i === values.length - 1 ? S.accent : alpha(S.accent, 0.55) }} />
        </span>
      ))}
    </span>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-[13.5px]">
      <span className="h-[6px] w-[14px] rounded-full" style={{ background: color }} />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums" style={{ color: S.ink2 }}>
        {value}
      </span>
    </div>
  );
}

function HeatCard({ m }: { m: DashboardModel }) {
  const total = m.year.reduce((s, d) => s + d.value, 0);
  const last = m.year.slice(-91).reduce((s, d) => s + d.value, 0);
  const prev = m.year.slice(-182, -91).reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col rounded-[14px] p-5" style={card}>
      <div className="flex items-start gap-3.5">
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[12px]" style={{ background: "#0E0E0F", boxShadow: `inset 0 0 0 1px ${S.line2}` }}>
          <CalendarCheck2 size={24} strokeWidth={1.5} style={{ color: S.accentText }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px]" style={{ color: S.ink2 }}>
            Закрыто за полгода
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="text-[26px] font-medium leading-none tabular-nums tracking-[-0.02em]">{total}</span>
            <DeltaChip value={last - prev} />
            <span className="text-[12px]" style={{ color: S.ink3 }}>
              квартал к кварталу
            </span>
          </div>
        </div>
        <IconBtn icon={MoreHorizontal} label="Ещё" size={32} style={{ background: S.s3 }} />
      </div>
      <div className="mt-5">
        <Heatmap values={m.year.map((d) => d.value)} dates={m.year.map((d) => d.date)} gap={3} radius={2} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px]" style={{ color: S.ink3 }}>
        <span>26 недель · сегодня в рамке</span>
        <span className="flex items-center gap-1.5">
          меньше
          {[0.05, 0.28, 0.5, 0.75, 1].map((a) => (
            <span key={a} className="size-[10px] rounded-[2px]" style={{ background: a === 0.05 ? "rgba(255,255,255,.05)" : alpha(S.accent, a) }} />
          ))}
          больше
        </span>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
        {[
          { k: "Активных дней", v: String(m.year.filter((d) => d.value > 0).length) },
          { k: "Лучшая серия", v: `${m.kpi.bestStreak} дн.` },
          { k: "Пик за 14 дней", v: String(m.peak14) },
        ].map((x) => (
          <div key={x.k} className="rounded-[10px] px-3 py-2.5" style={{ background: "#1D1D1F" }}>
            <div className="truncate text-[12px]" style={{ color: S.ink3 }}>
              {x.k}
            </div>
            <div className="mt-0.5 text-[16px] font-medium tabular-nums">{x.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanCard({ m }: { m: DashboardModel }) {
  const [tab, setTab] = useState<"plan" | "over">("plan");
  const rows = tab === "plan" ? m.plan : m.overPlan;
  return (
    <div className="flex min-h-0 flex-col rounded-[14px] p-5" style={card}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">План дня</span>
        <ViewTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "plan", label: "План", count: m.plan.length },
            { id: "over", label: "Сверх плана", count: m.overPlan.length },
          ]}
        />
      </div>
      <div className="mt-3 flex max-h-[262px] min-h-0 flex-col overflow-y-auto pr-1 [scrollbar-width:thin]">
        {rows.length === 0 && (
          <EmptyState icon={CalendarCheck2} tone="green" title={tab === "plan" ? "План пуст" : "Лимит не превышен"} text={tab === "plan" ? "Добавьте первую задачу на сегодня." : "Всё помещается в дневной фокус."} />
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex h-[46px] shrink-0 items-center gap-3 border-b last:border-0" style={{ borderColor: S.line }}>
            <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px]" style={{ color: r.done ? S.ink3 : S.ink, textDecoration: r.done ? "line-through" : undefined }}>
                {r.title}
              </div>
            </div>
            {r.projectName && (
              <span className="max-w-[110px] truncate text-[12px]" style={{ color: S.ink3 }}>
                {r.projectName}
              </span>
            )}
            <PriorityChip priority={r.priority} />
            <span className="w-[52px] text-right text-[12px] tabular-nums" style={{ color: r.overdue ? S.red : S.ink3 }}>
              {r.dueLabel}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <div className="flex-1">
          <AddInline onAdd={m.actions.add} label="Добавить на сегодня" />
        </div>
        {tab === "over" && m.overPlan.length > 0 && (
          <Btn kind="soft" icon={ArrowRight} onClick={m.actions.moveOverPlanToTomorrow}>
            На завтра
          </Btn>
        )}
      </div>
    </div>
  );
}

function Td({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <td className="h-[46px] overflow-hidden px-5" style={{ borderTop: `1px solid ${S.line}`, borderLeft: first ? undefined : `1px solid ${S.line}` }}>
      {children}
    </td>
  );
}

function SmallCard({ icon, tone, title, value, children }: { icon: typeof Clock3; tone: Tone; title: string; value?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] p-4" style={card}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <IconBox icon={icon} tone={tone} size={28} />
        <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: S.ink2 }}>
          {title}
        </span>
      </div>
      {value && <div className="mb-3.5 truncate text-[22px] font-medium tabular-nums tracking-[-0.02em]">{value}</div>}
      {children}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: S.ink3 }}>{k}</span>
      <span className="truncate font-medium tabular-nums" style={{ color: tone === "red" ? S.red : S.ink }}>
        {v}
      </span>
    </div>
  );
}
