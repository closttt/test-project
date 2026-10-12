/**
 * Dashboard · Graphite Glow · v5 «Wallet»
 * Refs 1/2/17: a black window frame holding two inset panels (gap 4). Today's progress is a
 * balance-style hero number with a secondary line and a glowing sparkline; four action tiles
 * (the first white-filled) are all wired. Lists read like wallet assets. One task detail floats
 * on the right over a dimmed + blurred app — open for the first plan task by default, Esc/✕ closes.
 */
import { useEffect, useState, type ReactNode } from "react";

import { useDashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";
import {
  G,
  t,
  mono,
  bigNum,
  display,
  rootStyle,
  Bloom,
  TopLight,
  Surface,
  Head,
  IconBox,
  Mark,
  Kbd,
  NAV_ICON,
  GhostBtn,
  Chip,
  PrioChip,
  DueChip,
  CheckDot,
  Spark,
  BarsGlow,
  HeatCells,
  Meter,
  StatusBar,
  Empty,
  AddTask,
  NoteBox,
  MeetingLine,
  ReadingCard,
  KV,
  Rub,
  N,
  HEALTH_TONE,
  toneColor,
  plural,
} from "@/design-lab/screens/_kit/glow";
import {
  ArrowRight,
  CalendarArrowUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListTodo,
  NotebookPen,
  Plus,
  RotateCcw,
  Search,
  Settings,
  X,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";

const ADD_ID = "g5-add";
const NOTE_ID = "g5-note";

type Panel = { kind: "task"; id: string } | { kind: "note" } | { kind: "meet" } | null;

export default function GlowV5() {
  const m = useDashboardModel();
  const k = m.kpi;
  // Closed by default so the composition reads at a glance; a row click opens the floating detail.
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (panel?.kind === "note") document.getElementById(NOTE_ID)?.focus();
  }, [panel]);

  const openTask = (id: string) => setPanel({ kind: "task", id });
  const pct = k.todayTotal ? Math.round((k.todayDone / k.todayTotal) * 100) : 0;

  return (
    <div className="relative min-h-screen p-3" style={{ ...rootStyle, background: "#030303" }}>
      {/* ── Window frame ─────────────────────────────────────────────────── */}
      <div className="relative flex min-h-[calc(100vh-24px)] flex-col rounded-[24px] p-1" style={{ background: G.c1, border: `1px solid ${G.line}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
        {/* frame status row */}
        <div className="flex h-10 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Mark size={22} />
            <span style={{ fontSize: 13, fontWeight: 500, color: G.ink2 }}>Рабочий стол</span>
          </div>
          <div className="flex items-center gap-4" style={t.meta}>
            {k.overdueToday > 0 && (
              <span className="flex items-center gap-2" style={{ color: G.ink2 }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor("red"), boxShadow: `0 0 8px ${toneColor("red")}` }} />
                <N color={toneColor("red")}>{k.overdueToday}</N> просрочено
              </span>
            )}
            <span className="h-3 w-px" style={{ background: G.line2 }} />
            <span className="flex items-center gap-1.5" style={{ color: G.ink2 }}>
              Уровень <N color={G.ink}>{k.level}</N> · {k.levelTitle}
              <ArrowRight size={13} strokeWidth={1.5} aria-hidden />
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-1">
          {/* ── Sidebar panel ──────────────────────────────────────────── */}
          <aside className="flex w-[232px] shrink-0 flex-col rounded-[18px] p-3" style={{ background: G.c2, border: `1px solid ${G.line}` }}>
            <nav className="flex flex-col gap-0.5" aria-label="Разделы">
              {m.nav.map((n) => {
                const active = n.id === "dashboard";
                const I = NAV_ICON[n.id] ?? Layers;
                return (
                  <a
                    key={n.id}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    aria-current={active ? "page" : undefined}
                    className="flex h-10 items-center gap-3 rounded-[11px] px-1.5 transition-colors duration-150 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                    style={active ? { background: G.c4, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px ${G.line}` } : undefined}
                  >
                    <IconBox icon={I} size={28} active={active} />
                    <span className="flex-1 text-[14px]" style={{ color: active ? G.ink : G.ink2, fontWeight: active ? 500 : 400 }}>
                      {n.label}
                    </span>
                    {n.badge ? (
                      <span className="mr-1.5 h-2 w-2 rounded-full" title={`${n.badge} на сегодня`} style={{ background: G.ink2, boxShadow: "0 0 8px rgba(255,255,255,0.5)" }} />
                    ) : null}
                  </a>
                );
              })}
            </nav>
            <a href="#" onClick={(e) => e.preventDefault()} className="mt-auto flex h-10 items-center gap-3 rounded-[11px] px-1.5 text-[14px] transition-colors hover:bg-white/[0.035]" style={{ color: G.ink2 }}>
              <IconBox icon={Settings} size={28} />
              Настройки
            </a>
            {/* week promo card */}
            <div className="mt-3 border-t pt-4" style={{ borderColor: G.line }}>
              <div className="flex items-baseline justify-between px-1">
                <span style={{ fontSize: 13, fontWeight: 500 }}>Неделя</span>
                <span style={t.meta}>
                  <N color={G.ink}>{k.weekDone}</N> закрыто
                </span>
              </div>
              <div className="mt-3 px-1">
                <BarsGlow values={m.week.map((d) => d.done)} labels={m.week.map((d) => d.label)} highlight={m.week.findIndex((d) => d.isToday)} height={44} gap={5} radius={3} />
              </div>
              <div className="mt-3 px-1" style={t.meta}>
                Серия <N>{k.streak}</N> дн. · лучшая <N>{k.bestStreak}</N>
              </div>
            </div>
          </aside>

          {/* ── Content panel ──────────────────────────────────────────── */}
          <main className="relative min-w-0 flex-1 overflow-hidden rounded-[18px] px-8 pb-10 pt-6" style={{ background: "#111111", border: `1px solid ${G.line}` }}>
            <TopLight strength={0.18} inset="18px" />
            {/* search row */}
            <div className="flex items-center gap-3">
              <label className="flex h-11 flex-1 cursor-text items-center gap-3 rounded-[12px] px-4 transition-colors focus-within:bg-[#1a1a1a]" style={{ background: G.c4 }}>
                <Search size={18} strokeWidth={1.5} color={G.ink3} aria-hidden />
                <input placeholder="Поиск по задачам, клиентам и заметкам…" aria-label="Поиск" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#6e6e6e]" />
                <Kbd>/</Kbd>
              </label>
              <span style={t.small}>{m.dateLabel}</span>
            </div>

            {/* HERO balance */}
            <section className="relative mt-9 flex items-end justify-between gap-8">
              <Bloom x="90px" y="50%" size={340} opacity={0.08} blur={30} />
              <div className="relative">
                <div style={t.small}>{m.greeting} · сегодня закрыто</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span style={bigNum(92, { textShadow: "0 0 44px rgba(255,255,255,0.28)" })}>{k.todayDone}</span>
                  <span style={bigNum(40, { color: G.ink3, fontWeight: 400 })}>/ {k.todayTotal}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" style={t.small}>
                  <span>
                    ≈ <N size={13} color={G.ink}>{k.timeLabel}</N> в работе
                  </span>
                  <span style={{ color: G.ink4 }}>·</span>
                  {k.overdueToday > 0 ? (
                    <span style={{ color: toneColor("red") }}>
                      <N size={13}>{k.overdueToday}</N> просрочено
                    </span>
                  ) : (
                    <span style={{ color: toneColor("green") }}>без просрочек</span>
                  )}
                  <span style={{ color: G.ink4 }}>·</span>
                  <span>
                    <N size={13} color={G.ink}>{k.openCount}</N> открыто всего
                  </span>
                </div>
              </div>
              <div className="relative flex flex-col items-end gap-2">
                <Spark values={m.dynamics.map((d) => d.value)} w={260} h={64} />
                <span style={t.meta}>
                  <N color={G.ink2}>{m.closed14}</N> за 14 дней · пик <N color={G.ink2}>{m.peak14}</N> · {pct}% дня
                </span>
              </div>
            </section>

            {/* ACTION tiles */}
            <section className="mt-8 grid grid-cols-4 gap-3">
              <ActionTile primary icon={Plus} label="Новая задача" hint="Enter — в план" onClick={() => document.getElementById(ADD_ID)?.focus()} />
              <ActionTile icon={NotebookPen} label="Заметка" hint="Быстрая запись" onClick={() => setPanel({ kind: "note" })} />
              <ActionTile icon={CalendarClock} label="Встреча" hint={m.meetings.length ? `${m.meetings.length} впереди` : "встреч нет"} onClick={() => setPanel({ kind: "meet" })} />
              <ActionTile
                icon={CalendarArrowUp}
                label="Перенести сверх плана"
                hint={m.overPlan.length ? `${m.overPlan.length} ${plural(m.overPlan.length, "задача", "задачи", "задач")} → завтра` : "нечего переносить"}
                disabled={!m.overPlan.length}
                onClick={m.actions.moveOverPlanToTomorrow}
              />
            </section>

            {/* PLAN — asset-style rows */}
            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 style={display(20, 500)}>
                  План дня <span style={{ color: G.ink3 }}>{m.plan.filter((r) => r.done).length}/{m.plan.length}</span>
                </h2>
                <a href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-1.5 text-[13px] transition-colors hover:text-white" style={{ color: G.ink3 }}>
                  Все задачи <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
                </a>
              </div>
              <div className="mt-3">
                {m.plan.length ? (
                  m.plan.map((r) => <AssetRow key={r.id} r={r} active={panel?.kind === "task" && panel.id === r.id} onOpen={() => openTask(r.id)} onToggle={() => m.actions.toggle(r.id)} />)
                ) : (
                  <Empty icon={ListTodo} title="План на сегодня пуст" text="Нажмите «Новая задача» — она встанет в фокус дня." />
                )}
              </div>
              <div className="mt-3">
                <AddTask id={ADD_ID} onAdd={m.actions.add} />
              </div>
            </section>

            {/* OVER PLAN — fading tail */}
            {m.overPlan.length > 0 && (
              <section className="mt-10">
                <h2 style={display(20, 500)}>
                  Сверх плана <span style={{ color: G.ink3 }}>{m.overPlan.length}</span>
                </h2>
                <div className="mt-3">
                  {m.overPlan.slice(0, 4).map((r, i) => (
                    <div key={r.id} style={{ opacity: 1 - i * 0.22 }}>
                      <AssetRow r={r} active={panel?.kind === "task" && panel.id === r.id} onOpen={() => openTask(r.id)} onToggle={() => m.actions.toggle(r.id)} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* PROJECTS table + side column */}
            <section className="mt-10 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-8">
              <div className="min-w-0">
                <h2 style={display(20, 500)}>
                  Проекты <span style={{ color: G.ink3 }}>{m.projects.length}</span>
                </h2>
                <div className="mt-3 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_56px_92px] gap-x-4 border-b pb-2" style={{ ...t.meta, borderColor: G.line }}>
                  <span>Проект</span>
                  <span>Прогресс</span>
                  <span className="text-right">Задачи</span>
                  <span className="text-right">Здоровье</span>
                </div>
                {m.projects.map((p) => {
                  const tone = HEALTH_TONE[p.health];
                  return (
                    <div key={p.id} className="grid h-[52px] grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_56px_92px] items-center gap-x-4 border-b transition-colors hover:bg-white/[0.02]" style={{ borderColor: G.line }}>
                      <div className="min-w-0">
                        <div className="truncate" style={{ fontSize: 14 }}>
                          {p.name}
                        </div>
                        <div className="truncate" style={t.meta}>
                          {[p.clientName, p.spentLabel].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Meter pct={p.pct} tone={tone === "red" ? "red" : "white"} h={3} />
                        <span className="w-9 shrink-0 text-right" style={{ ...mono(12), color: G.ink2 }}>
                          {Math.round(p.pct)}%
                        </span>
                      </div>
                      <span className="text-right" style={{ ...mono(13), color: G.ink }}>
                        {p.done}
                        <span style={{ color: G.ink3 }}>/{p.total}</span>
                      </span>
                      <span className="flex justify-end">
                        <Chip tone={tone} dot={tone !== "neutral"} pill>
                          {p.healthLabel}
                        </Chip>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <Surface kind="solid" r={18} className="p-5">
                  <div className="flex items-baseline justify-between">
                    <span style={t.section}>Деньги</span>
                    <span style={t.meta}>этот месяц</span>
                  </div>
                  <div className="mt-3">
                    <Rub n={m.money.paidThisMonth} size={30} />
                  </div>
                  <div className="mt-2 border-t pt-1.5" style={{ borderColor: G.line }}>
                    <KV k="Ожидается" v={<Rub n={m.money.pending} size={13} weight={500} />} />
                    <KV k="Просрочено" v={<Rub n={m.money.overdue} size={13} weight={500} />} tone={m.money.overdue > 0 ? "red" : undefined} />
                    <KV plain k="Напомнить" v={m.followUps.length ? m.followUps.map((f) => f.name).join(", ") : "никого"} tone={m.followUps.length ? "amber" : undefined} />
                  </div>
                </Surface>
                <Surface kind="solid" r={18} className="p-5">
                  <div className="flex items-baseline justify-between">
                    <span style={t.section}>Ритм</span>
                    <span style={t.meta}>
                      <N color={G.ink2}>{m.status.doneAll}</N> готово · <N color={G.ink2}>{m.status.inProgress}</N> в работе ·{" "}
                      <N color={toneColor("red")}>{m.status.overdueAll}</N>
                    </span>
                  </div>
                  <div className="mt-3">
                    <StatusBar done={m.status.doneAll} progress={m.status.inProgress} overdue={m.status.overdueAll} h={4} />
                  </div>
                  <div className="mt-4 overflow-hidden">
                    <HeatCells cells={m.year.slice(-7 * 22)} cell={10} gap={3} />
                  </div>
                </Surface>
                {m.reading && (
                  <Surface kind="solid" r={18} className="p-4">
                    <div className="mb-3" style={t.eyebrow}>
                      Прочитать сегодня
                    </div>
                    <ReadingCard item={m.reading} size={52} />
                  </Surface>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* ── Floating detail over a dimmed + blurred app ─────────────────── */}
      {panel && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Закрыть панель"
            onClick={() => setPanel(null)}
            className="absolute inset-0 cursor-default"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2.5px)", WebkitBackdropFilter: "blur(2.5px)" }}
          />
          <div className="absolute right-10 top-[68px] w-[400px]">
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px]" style={{ boxShadow: "0 0 80px -16px rgba(255,255,255,0.22)" }} />
            <Surface kind="raised" r={22} edgeStrength={0.5} className="overflow-hidden" style={{ background: `linear-gradient(180deg, ${G.c6} 0%, ${G.c5} 100%)`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 40px 80px -20px rgba(0,0,0,0.9)" }}>
              {panel.kind === "task" ? (
                <TaskPanel m={m} id={panel.id} onClose={() => setPanel(null)} onNav={openTask} />
              ) : panel.kind === "note" ? (
                <PanelFrame icon={NotebookPen} title="Заметка" sub="сохранится в «Заметки»" onClose={() => setPanel(null)}>
                  <div className="px-5 pb-5">
                    <NoteBox id={NOTE_ID} rows={7} onSave={(v) => {
                      m.actions.saveNote(v);
                      if (v.trim()) setPanel(null);
                    }} />
                  </div>
                </PanelFrame>
              ) : (
                <PanelFrame icon={CalendarClock} title="Встречи" sub={m.meetings.length ? `${m.meetings.length} впереди` : "ничего не запланировано"} onClose={() => setPanel(null)}>
                  <div className="px-2 pb-3">
                    {m.meetings.length ? (
                      m.meetings.slice(0, 6).map((mt) => <MeetingLine key={mt.id} mt={mt} onToggle={() => m.actions.toggleMeeting(mt.id)} />)
                    ) : (
                      <Empty icon={CalendarClock} title="Встреч нет" text="Календарь чист — встречи из Google Calendar появятся здесь сами." />
                    )}
                  </div>
                </PanelFrame>
              )}
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Local pieces ──────────────────────────────────────────────────────────────────────────────

function ActionTile({
  icon: I,
  label,
  hint,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative flex h-[104px] flex-col justify-between rounded-[16px] p-4 text-left transition-[transform,background,box-shadow] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-40"
      style={
        primary
          ? {
              background: "linear-gradient(180deg,#f4f4f4 0%,#dedede 100%)",
              color: "#0a0a0a",
              boxShadow: "inset 0 1px 0 #fff, 0 0 0 1px rgba(255,255,255,0.4), 0 0 36px -6px rgba(255,255,255,0.4), 0 14px 34px -14px rgba(255,255,255,0.4)",
            }
          : {
              background: G.c2,
              color: G.ink,
              border: `1px solid ${G.line2}`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            }
      }
    >
      <I size={18} strokeWidth={1.5} aria-hidden />
      <span>
        <span className="block text-[14px] font-medium leading-tight">{label}</span>
        <span className="mt-1 block truncate text-[12px]" style={{ color: primary ? "#555" : G.ink3 }}>
          {hint}
        </span>
      </span>
      {!primary && <span className="pointer-events-none absolute inset-0 rounded-[16px] opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: "rgba(255,255,255,0.03)", boxShadow: `inset 0 0 0 1px ${G.line3}` }} />}
    </button>
  );
}

function AssetRow({ r, active, onOpen, onToggle }: { r: TodayRow; active: boolean; onOpen: () => void; onToggle: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="grid h-[62px] cursor-pointer grid-cols-[28px_minmax(0,1fr)_110px_120px] items-center gap-4 border-b px-3 transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
      style={{ borderColor: G.line, background: active ? "rgba(255,255,255,0.04)" : undefined }}
    >
      <CheckDot done={r.done} onClick={onToggle} label={r.title} size={22} />
      <div className="min-w-0">
        <div className="truncate" style={{ fontSize: 14, color: r.done ? G.ink3 : G.ink, textDecoration: r.done ? "line-through" : undefined }}>
          {r.title}
        </div>
        <div className="truncate" style={t.meta}>
          {[r.projectName ?? "Без проекта", r.subtasksTotal ? `${r.subtasksDone}/${r.subtasksTotal} подзадач` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="text-right">
        <div style={{ fontSize: 13, color: r.overdue ? toneColor("red") : G.ink }}>{r.dueLabel || "—"}</div>
        <div style={t.meta}>{r.overdue ? "просрочено" : "срок"}</div>
      </div>
      <div className="flex justify-end">
        {r.priority ? <PrioChip r={r} /> : <span style={t.meta}>без приоритета</span>}
      </div>
    </div>
  );
}

function PanelFrame({ icon, title, sub, onClose, children }: { icon: ComponentType<LucideProps>; title: string; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <IconBox icon={icon} size={36} />
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
          {sub && (
            <div className="truncate" style={t.meta}>
              {sub}
            </div>
          )}
        </div>
        <GhostBtn size="sm" icon={X} title="Закрыть" onClick={onClose} />
      </div>
      {children}
    </>
  );
}

function TaskPanel({ m, id, onClose, onNav }: { m: ReturnType<typeof useDashboardModel>; id: string; onClose: () => void; onNav: (id: string) => void }) {
  const r = m.today.find((x) => x.id === id);
  if (!r) {
    return (
      <PanelFrame icon={ListTodo} title="Задача" onClose={onClose}>
        <Empty icon={ListTodo} title="Задача ушла из дня" text="Её перенесли или удалили." />
      </PanelFrame>
    );
  }
  const list = r.overLimit ? m.overPlan : m.plan;
  const i = list.indexOf(r);
  return (
    <PanelFrame icon={ListTodo} title={r.overLimit ? "Сверх плана" : "План дня"} sub={`${r.projectName ?? "Без проекта"} · ${i + 1} из ${list.length}`} onClose={onClose}>
      <div className="relative px-6 pb-2 pt-6 text-center">
        <Bloom x="50%" y="40%" size={260} opacity={0.08} blur={24} />
        <h3 className="relative mx-auto line-clamp-3 max-w-[320px]" style={display(26, 600, { lineHeight: 1.18 })}>
          {r.title}
        </h3>
        <div className="relative mt-4 flex flex-wrap justify-center gap-1.5">
          <PrioChip r={r} />
          <DueChip r={r} />
          {r.done && (
            <Chip tone="green" icon={Check}>
              готово
            </Chip>
          )}
        </div>
      </div>
      <div className="mx-5 mt-6 border-t pt-2" style={{ borderColor: G.line }}>
        <KV plain k="Проект" v={r.projectName ?? "—"} />
        <KV plain k="Срок" v={r.dueLabel || "—"} tone={r.overdue ? "red" : undefined} />
        <KV plain k="Приоритет" v={r.priorityLabel} />
        <KV
          plain
          k="В работе"
          v={
            <>
              <N size={13} weight={500}>
                {r.spentMin}
                {r.estimateMin ? ` / ${r.estimateMin}` : ""}
              </N>{" "}
              мин
            </>
          }
        />
        <KV k="Подзадачи" v={r.subtasksTotal ? `${r.subtasksDone} / ${r.subtasksTotal}` : "—"} />
      </div>
      <div className="flex items-center gap-2 px-5 pb-5 pt-4">
        <GhostBtn icon={r.done ? RotateCcw : Check} onClick={() => m.actions.toggle(r.id)} className="flex-1 !text-[13px]" >
          {r.done ? "Вернуть в работу" : "Отметить готовой"}
        </GhostBtn>
        <GhostBtn icon={ChevronLeft} title="Предыдущая" disabled={i <= 0} onClick={() => onNav(list[i - 1].id)} />
        <GhostBtn icon={ChevronRight} title="Следующая" disabled={i >= list.length - 1} onClick={() => onNav(list[i + 1].id)} />
      </div>
    </PanelFrame>
  );
}
