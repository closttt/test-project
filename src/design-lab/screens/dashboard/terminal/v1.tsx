/**
 * Dashboard · Data Terminal · v1 «Stuudio»
 * Left: a sticky column with a live clock, an LED dot-matrix wordmark «РАБОЧИЙ СТОЛ», greeting,
 * two CTAs and two services-style mono lists (sections · today's readings). Right: one big panel
 * with folder tabs (Сегодня / Ритм / Проекты / Деньги) whose content is a hairline cell grid with
 * hatched filler rows — every block is a cell of the same grid, never a floating card.
 */
import { useRef, useState, type ReactNode } from "react";

import { useDashboardModel, rub, type DashboardModel } from "@/design-lab/screens/dashboardModel";
import {
  T,
  mono,
  sans,
  pad2,
  MonoLabel,
  CellGrid,
  Cell,
  CellHead,
  Hatch,
  StatusSquare,
  Glyph,
  NAV_GLYPH,
  useNow,
  stamp,
  TermCheck,
  PriorityBars,
  Cells,
  BarCode,
  Dial,
  LineChart,
  YearMatrix,
  AddLine,
  NoteBox,
  TermButton,
  Empty,
  healthSignal,
  DotWord,
  hm,
} from "@/design-lab/screens/_kit/terminal";

type Tab = "today" | "rhythm" | "projects" | "money";

export default function TerminalV1() {
  const m = useDashboardModel();
  const now = useNow();
  const st = stamp(now);
  const [tab, setTab] = useState<Tab>("today");
  const noteRef = useRef<HTMLDivElement>(null);

  const goAdd = () => {
    setTab("today");
    setTimeout(() => document.getElementById("t1-add")?.focus(), 30);
  };
  const goNote = () => {
    setTab("today");
    setTimeout(() => noteRef.current?.querySelector("textarea")?.focus(), 30);
  };

  const tabs: { id: Tab; label: string; icon: string; count: string }[] = [
    { id: "today", label: "Сегодня", icon: "tasks", count: `${m.kpi.todayDone}/${m.plan.length}` },
    { id: "rhythm", label: "Ритм", icon: "pulse", count: String(m.closed14) },
    { id: "projects", label: "Проекты", icon: "projects", count: String(m.projects.length) },
    { id: "money", label: "Деньги", icon: "money", count: m.followUps.length ? `${m.followUps.length}!` : "₽" },
  ];

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(340px,400px)_minmax(0,1fr)] gap-10 px-8 xl:gap-14">
        {/* ── Left column ─────────────────────────────────────────────────────── */}
        <aside className="sticky top-0 flex h-screen min-h-[820px] flex-col justify-between py-6">
          <div>
            <div className="flex h-4 items-center justify-between">
              <span className="flex items-center gap-2">
                <StatusSquare blink />
                <MonoLabel color={T.ink2}>Личный терминал</MonoLabel>
              </span>
              <span style={mono(10, { color: T.ink3 }, true)}>
                {st.date} · <span style={{ color: T.ink }}>{st.time}</span>
              </span>
            </div>

            <div className="mt-10 flex flex-col gap-[7px]">
              <DotWord text="Рабочий" dot={6} />
              <DotWord text="стол" dot={6} accentIndex={3} />
            </div>

            <h1 className="mt-9" style={sans(34, 500, { color: T.ink })}>
              {m.greeting}.
              <br />
              <span style={{ color: T.ink3 }}>{m.dateLabel}</span>
            </h1>
            <p className="mt-4" style={sans(14, 400, { color: T.ink2, lineHeight: 1.5 })}>
              В плане {m.plan.length} {plural(m.plan.length, "задача", "задачи", "задач")}, закрыто {m.kpi.todayDone}.
              {m.kpi.overdueToday > 0 ? (
                <>
                  {" "}
                  <span style={{ color: T.orange }}>Просрочено {m.kpi.overdueToday}</span> — начни с них.
                </>
              ) : (
                " Просрочек нет."
              )}
            </p>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={goAdd}
                className="flex h-9 items-center gap-2 px-3.5 outline-none transition-[filter] hover:brightness-110 focus-visible:ring-1 focus-visible:ring-white"
                style={{ background: T.lime, color: "#000", borderRadius: 2, ...mono(11, {}, true), lineHeight: 1 }}
              >
                <Glyph name="plus" size={12} /> Новая задача
              </button>
              <button
                type="button"
                onClick={goNote}
                className="flex h-9 items-center gap-2 px-3.5 outline-none transition-colors hover:bg-[#1c1c1c] focus-visible:ring-1 focus-visible:ring-white"
                style={{ background: T.raised, color: T.ink, borderRadius: 2, ...mono(11, {}, true), lineHeight: 1 }}
              >
                <Glyph name="notes" size={12} /> Заметка
              </button>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <MonoLabel color={T.ink}>Разделы</MonoLabel>
                <nav className="mt-4 flex flex-col">
                  {m.nav.map((n) => {
                    const active = n.id === "dashboard";
                    return (
                      <a
                        key={n.id}
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="group flex h-[26px] items-center gap-2.5 outline-none focus-visible:text-white"
                        style={{ ...mono(11, {}, true), color: active ? T.ink : T.ink2 }}
                      >
                        <span style={{ color: active ? T.lime : T.ink4 }} className="transition-colors group-hover:text-[#C8FF00]">
                          <Glyph name={NAV_GLYPH[n.id] ?? "dots"} size={12} />
                        </span>
                        <span className="truncate transition-colors group-hover:text-white">{n.label}</span>
                        {n.badge ? <span style={{ color: T.lime }}>{n.badge}</span> : null}
                        {active && <StatusSquare size={4} />}
                      </a>
                    );
                  })}
                </nav>
              </div>
              <div>
                <MonoLabel color={T.ink}>Показания</MonoLabel>
                <dl className="mt-4 flex flex-col">
                  {[
                    { k: "Сегодня", v: `${m.kpi.todayDone}/${m.kpi.todayTotal}` },
                    { k: "Просрочено", v: String(m.kpi.overdueToday), hot: m.kpi.overdueToday > 0 },
                    { k: "Время", v: m.kpi.timeLabel },
                    { k: "Открыто", v: String(m.kpi.openCount) },
                    { k: "За неделю", v: String(m.kpi.weekDone) },
                    { k: "Серия", v: `${m.kpi.streak} дн` },
                    { k: "Цель дня", v: `${m.kpi.closedToday}/${m.kpi.dailyGoal}` },
                    { k: "Встречи", v: String(m.meetings.filter((x) => !x.done).length) },
                  ].map((r) => (
                    <div key={r.k} className="flex h-[26px] items-center justify-between gap-2" style={mono(11, {}, true)}>
                      <dt style={{ color: T.ink3 }}>{r.k}</dt>
                      <dd style={{ color: r.hot ? T.orange : T.ink }}>{r.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            {m.kpi.gamification && (
              <div className="mt-8 flex flex-col gap-2.5 pt-4" style={{ borderTop: `1px solid ${T.line}` }}>
                <div className="flex items-center justify-between">
                  <MonoLabel color={T.ink2}>
                    Уровень {pad2(m.kpi.level)} · {m.kpi.levelTitle}
                  </MonoLabel>
                  <MonoLabel color={T.ink3}>{m.kpi.xpToNext} xp до {pad2(m.kpi.level + 1)}</MonoLabel>
                </div>
                <Cells pct={m.kpi.levelPct} cells={40} color={T.lime} h={4} gap={2} />
              </div>
            )}
          </div>
        </aside>

        {/* ── Panel with folder tabs ──────────────────────────────────────────── */}
        <main className="min-w-0 py-6">
          <div role="tablist" className="grid grid-cols-4">
            {tabs.map((t, i) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="group relative flex h-12 items-center justify-center gap-2.5 outline-none focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#C8FF00]"
                  style={{
                    background: active ? T.panel : T.sunk,
                    color: active ? T.ink : "#555555",
                    borderTop: `1px solid ${T.line2}`,
                    borderLeft: `1px solid ${active || i === 0 ? T.line2 : T.line}`,
                    borderRight: `1px solid ${active || i === 3 ? T.line2 : "transparent"}`,
                    borderBottom: active ? "1px solid transparent" : `1px solid ${T.line2}`,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    marginBottom: -1,
                    zIndex: active ? 2 : 1,
                  }}
                >
                  <span className={active ? "" : "transition-colors group-hover:text-[#9a9a9a]"} style={{ color: active ? T.lime : undefined }}>
                    <Glyph name={t.icon} size={13} />
                  </span>
                  <span className={active ? "" : "transition-colors group-hover:text-[#9a9a9a]"} style={mono(12, { fontWeight: 500 }, true)}>
                    {t.label}
                  </span>
                  <span style={mono(10, { color: active ? T.ink3 : T.ink4 })}>{t.count}</span>
                </button>
              );
            })}
          </div>
          <div
            className="relative min-h-[calc(100vh-96px)] px-6 pb-6 pt-8"
            style={{ background: T.panel, border: `1px solid ${T.line2}`, borderRadius: "0 0 4px 4px" }}
          >
            {tab === "today" && <TodayTab m={m} noteRef={noteRef} />}
            {tab === "rhythm" && <RhythmTab m={m} />}
            {tab === "projects" && <ProjectsTab m={m} />}
            {tab === "money" && <MoneyTab m={m} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function PanelHead({ title, count, children }: { title: string; count: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h2 style={sans(28, 500)}>
          {title} <span style={{ color: T.ink4 }}>({count})</span>
        </h2>
        {children && <p className="mt-2 max-w-[640px]" style={sans(13, 400, { color: T.ink2, lineHeight: 1.5 })}>{children}</p>}
      </div>
    </header>
  );
}

/** Stuudio "illustration cell + caption" pair: caption sits under the art with its own hairline. */
function Caption({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.line}` }}>
      <div style={sans(16, 500)}>{title}</div>
      {children && <div className="mt-1.5" style={sans(13, 400, { color: T.ink2, lineHeight: 1.45 })}>{children}</div>}
    </div>
  );
}

// ── Сегодня ─────────────────────────────────────────────────────────────────────────────────
function TodayTab({ m, noteRef }: { m: DashboardModel; noteRef: React.RefObject<HTMLDivElement> }) {
  const kpis = [
    { k: "Сегодня", v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`, sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просрочено` : "без просрочек", hot: m.kpi.overdueToday > 0 },
    { k: "Время", v: m.kpi.timeLabel, sub: `${m.kpi.closedToday} из ${m.kpi.dailyGoal} к цели` },
    { k: "Открыто", v: String(m.kpi.openCount), sub: `${m.status.overdueAll} с просрочкой` },
    { k: "За неделю", v: String(m.kpi.weekDone), sub: `серия ${m.kpi.streak} дн` },
  ];
  const meetings = m.meetings.slice(0, 4);
  return (
    <>
      <PanelHead title="План дня" count={`${m.plan.filter((r) => r.done).length}/${m.plan.length}`}>
        Фокус-лимит {m.focusLimit || "—"}: в плане только то, что реально закрыть сегодня. Остальное уходит в «Сверх плана».
      </PanelHead>
      <CellGrid className="grid-cols-2">
        <Cell className="col-span-2 grid grid-cols-4" bg={T.line} style={{ gap: 1 }}>
          {kpis.map((s) => (
            <div key={s.k} className="flex flex-col gap-3 px-5 py-4" style={{ background: T.cell }}>
              <MonoLabel>{s.k}</MonoLabel>
              <span style={mono(30, { color: T.ink, letterSpacing: "-0.04em", lineHeight: 1 })}>{s.v}</span>
              <span style={mono(10, { color: s.hot ? T.orange : T.ink3 }, true)}>{s.sub}</span>
            </div>
          ))}
        </Cell>

        <Cell className="col-span-2">
          <CellHead
            label={`План · ${m.plan.length}`}
            icon={<Glyph name="list" size={12} />}
            right={<MonoLabel>приор · срок · время</MonoLabel>}
          />
          {m.plan.length === 0 ? (
            <Empty title="План пуст" hint="Добавь первую задачу строкой ниже" icon="tasks" className="h-[120px]" />
          ) : (
            m.plan.map((r, i) => (
              <div
                key={r.id}
                className="grid h-12 grid-cols-[14px_28px_minmax(0,1fr)_32px_72px_48px] items-center gap-3 px-4 transition-colors hover:bg-[#101010]"
                style={{ borderBottom: `1px solid ${T.line}` }}
              >
                <TermCheck done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
                <span style={mono(11, { color: T.ink4 })}>{pad2(i + 1)}</span>
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="truncate" style={sans(14, 400, { color: r.done ? T.ink4 : T.ink, textDecoration: r.done ? "line-through" : undefined })}>
                    {r.title}
                  </span>
                  {r.projectName && <span className="shrink-0" style={mono(10, { color: T.ink3 }, true)}>{r.projectName}</span>}
                </span>
                <PriorityBars priority={r.priority} />
                <span className="flex items-center justify-end gap-1.5" style={mono(11, { color: r.overdue ? T.orange : T.ink2 })}>
                  {r.overdue && <StatusSquare color={T.orange} size={5} />}
                  {r.dueLabel}
                </span>
                <span className="text-right" style={mono(11, { color: r.spentMin ? T.ink : T.ink4 })}>{hm(r.spentMin)}</span>
              </div>
            ))
          )}
          <AddLine id="t1-add" onAdd={m.actions.add} placeholder="Добавить на сегодня — «созвон завтра 15:00 !важно»" className="h-12 px-4" />
        </Cell>

        <Hatch className="col-span-2 h-14" />

        <Cell className="flex flex-col">
          <CellHead
            label={`Сверх плана · ${m.overPlan.length}`}
            icon={<Glyph name="forward" size={12} />}
            right={m.overPlan.length > 0 && <TermButton icon="forward" onClick={m.actions.moveOverPlanToTomorrow}>на завтра</TermButton>}
          />
          {m.overPlan.length === 0 ? (
            <Empty title="Ничего лишнего" hint="Всё помещается в план" icon="check" className="flex-1" style={{ minHeight: 180 }} />
          ) : (
            <ul className="flex-1">
              {m.overPlan.slice(0, 6).map((r) => (
                <li key={r.id} className="flex h-9 items-center gap-3 px-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <TermCheck done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={12} />
                  <span className="min-w-0 flex-1 truncate" style={sans(13, 400, { color: T.ink2 })}>{r.title}</span>
                  <span style={mono(10, { color: r.overdue ? T.orange : T.ink3 })}>{r.dueLabel}</span>
                </li>
              ))}
              {m.overPlan.length > 6 && (
                <li className="flex h-9 items-center px-4">
                  <MonoLabel color={T.ink4}>+ ещё {m.overPlan.length - 6}</MonoLabel>
                </li>
              )}
            </ul>
          )}
        </Cell>

        <Cell className="flex flex-col">
          <CellHead label={`Встречи · ${m.meetings.filter((x) => !x.done).length}`} icon={<Glyph name="meeting" size={12} />} />
          {meetings.length === 0 ? (
            <div className="flex flex-1 flex-col">
              <MeetingsEmpty />
            </div>
          ) : (
            <ul className="flex-1">
              {meetings.map((x) => (
                <li key={x.id} className="grid h-11 grid-cols-[12px_44px_minmax(0,1fr)_auto] items-center gap-3 px-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <TermCheck done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} size={12} />
                  <span style={mono(12, { color: x.done ? T.ink4 : T.ink })}>{x.time}</span>
                  <span className="truncate" style={sans(13, 400, { color: x.done ? T.ink4 : T.ink })}>
                    {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="hover:underline">{x.title}</a> : x.title}
                  </span>
                  <span style={mono(10, { color: T.ink3 }, true)}>{x.dateLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </Cell>

        <Cell className="flex flex-col">
          <div ref={noteRef} className="flex h-[150px] flex-col">
            <NoteBox onSave={m.actions.saveNote} rows={4} />
          </div>
          <Caption title="Быстрая заметка">Мысль не теряется: сохраняется в «Заметки» одной кнопкой.</Caption>
        </Cell>

        <Cell className="flex flex-col">
          <ReadingArt m={m} />
          <Caption title={m.reading ? m.reading.title : "Чтение дня"}>
            {m.reading ? (
              <span className="flex items-center gap-2">
                <MonoLabel color={T.ink3}>{m.reading.domain ?? m.reading.type}</MonoLabel>
                {m.reading.url && (
                  <a href={m.reading.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white" style={mono(10, { color: T.lime }, true)}>
                    открыть <Glyph name="arrowUR" size={10} />
                  </a>
                )}
              </span>
            ) : (
              "Очередь библиотеки пуста."
            )}
          </Caption>
        </Cell>

        <Hatch className="col-span-2 h-14" />
      </CellGrid>
    </>
  );
}

function MeetingsEmpty() {
  // a tiny timeline illustration (Stuudio 31): ruler + the "now" pointer, nothing booked
  const now = new Date();
  const pos = ((now.getHours() * 60 + now.getMinutes() - 8 * 60) / (12 * 60)) * 100;
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 px-5 py-6">
      <div className="relative h-10">
        <div className="absolute inset-x-0 bottom-0 flex justify-between">
          {Array.from({ length: 25 }, (_, i) => (
            <span key={i} style={{ width: 1, height: i % 2 ? 6 : 12, background: i % 2 ? T.ink5 : T.ink4 }} />
          ))}
        </div>
        <span className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${Math.max(2, Math.min(98, pos))}%` }}>
          <span style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `6px solid ${T.lime}` }} />
          <span style={{ width: 1, height: 34, background: T.lime }} />
        </span>
      </div>
      <div className="flex justify-between" style={mono(9, { color: T.ink4 })}>
        <span>08:00</span>
        <span>14:00</span>
        <span>20:00</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusSquare color={T.ink3} hollow />
        <MonoLabel color={T.ink2}>Встреч нет — день свободен</MonoLabel>
      </div>
    </div>
  );
}

function ReadingArt({ m }: { m: DashboardModel }) {
  return (
    <div className="relative h-[150px] overflow-hidden" style={{ background: T.sunk }}>
      {m.reading?.coverUrl ? (
        <>
          <img src={m.reading.coverUrl} alt="" className="h-full w-full object-cover" style={{ filter: "grayscale(1) contrast(1.3) brightness(0.55)" }} />
          <div className="absolute inset-0" style={{ backgroundImage: `repeating-linear-gradient(90deg, rgba(0,0,0,.55) 0 2px, transparent 2px 4px)` }} />
        </>
      ) : (
        <Hatch className="h-full" />
      )}
      <span className="absolute left-4 top-4 flex items-center gap-2 px-2 py-1" style={{ background: "#000", boxShadow: `inset 0 0 0 1px ${T.line2}` }}>
        <Glyph name="book" size={12} color={T.lime} />
        <MonoLabel color={T.ink}>Чтение дня</MonoLabel>
      </span>
    </div>
  );
}

// ── Ритм ────────────────────────────────────────────────────────────────────────────────────
function RhythmTab({ m }: { m: DashboardModel }) {
  const total = m.status.doneAll + m.status.inProgress + m.status.overdueAll;
  const maxW = Math.max(1, ...m.week.map((d) => d.done));
  const maxP = Math.max(1, ...m.status.openByPriority.map((p) => p.count));
  return (
    <>
      <PanelHead title="Ритм" count={`${m.closed14} за 14 дней`}>
        Сколько закрыто по дням, пик {m.peak14}. Наведи на график — перекрестие покажет день.
      </PanelHead>
      <CellGrid className="grid-cols-2">
        <Cell className="col-span-2">
          <CellHead
            label="Закрыто по дням · 14д"
            icon={<Glyph name="pulse" size={12} />}
            right={
              <>
                <MonoLabel>сегодня</MonoLabel>
                <span style={mono(12, { color: T.lime })}>{m.kpi.closedToday}</span>
              </>
            }
          />
          <div className="px-5 pb-3 pt-4">
            <LineChart data={m.dynamics} height={250} initialIndex={m.dynamics.length - 1} />
          </div>
        </Cell>

        <Cell className="flex flex-col">
          <div className="flex h-[210px] items-center justify-center gap-8 px-5">
            <Dial value={m.status.doneAll} max={Math.max(1, total)} size={150} ticks={48}>
              <span style={mono(26, { letterSpacing: "-0.04em" })}>{total ? Math.round((m.status.doneAll / total) * 100) : 0}%</span>
              <MonoLabel className="mt-1.5">выполнено</MonoLabel>
            </Dial>
            <dl className="flex flex-col gap-3">
              {[
                { k: "Выполнено", v: m.status.doneAll, c: T.lime },
                { k: "В работе", v: m.status.inProgress, c: T.ink },
                { k: "Просрочено", v: m.status.overdueAll, c: T.orange },
              ].map((s) => (
                <div key={s.k} className="flex items-center gap-2.5">
                  <StatusSquare color={s.c} />
                  <dt className="w-[86px]" style={mono(10, { color: T.ink3 }, true)}>{s.k}</dt>
                  <dd style={mono(13, { color: s.c === T.ink ? T.ink : s.c })}>{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Caption title="Статус задач">
            <span className="mt-1 flex flex-col gap-1.5">
              {m.status.openByPriority.map((p) => (
                <span key={p.priority} className="grid grid-cols-[110px_minmax(0,1fr)_28px] items-center gap-3">
                  <span style={mono(10, { color: T.ink3 }, true)}>{p.label}</span>
                  <Cells pct={(p.count / maxP) * 100} cells={24} h={4} color={p.priority === 1 ? T.ink : T.ink2} />
                  <span className="text-right" style={mono(11, { color: T.ink })}>{p.count}</span>
                </span>
              ))}
            </span>
          </Caption>
        </Cell>

        <Cell className="flex flex-col">
          <div className="flex h-[210px] items-end gap-3 px-6 pb-6 pt-8">
            {m.week.map((d) => (
              <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span style={mono(11, { color: d.isToday ? T.lime : d.done ? T.ink : T.ink4 })}>{d.done}</span>
                <span
                  className="w-full"
                  style={{
                    height: `${Math.max(2, (d.done / maxW) * 100)}%`,
                    maxHeight: 120,
                    background: d.isToday ? T.lime : d.done ? T.ink2 : T.ink5,
                    backgroundImage: d.isToday ? undefined : `repeating-linear-gradient(0deg, transparent 0 3px, ${T.cell} 3px 4px)`,
                  }}
                />
                <MonoLabel color={d.isToday ? T.lime : T.ink3}>{d.label}</MonoLabel>
              </div>
            ))}
          </div>
          <Caption title={`Неделя · ${m.kpi.weekDone}`}>Закрыто с понедельника. Серия {m.kpi.streak} дн, лучшая {m.kpi.bestStreak}.</Caption>
        </Cell>

        <Hatch className="col-span-2 h-12" />

        <Cell className="col-span-2">
          <div className="flex items-center justify-between gap-6 overflow-hidden px-5 py-6">
            <YearMatrix year={m.year} cell={16} gap={4} />
            <div className="flex shrink-0 flex-col gap-2" style={mono(10, { color: T.ink3 }, true)}>
              <span className="flex items-center gap-2"><StatusSquare color={T.ink5} /> 0</span>
              <span className="flex items-center gap-2"><StatusSquare color="#4F6300" /> мало</span>
              <span className="flex items-center gap-2"><StatusSquare color="#8FB300" /> средне</span>
              <span className="flex items-center gap-2"><StatusSquare color={T.lime} /> пик</span>
            </div>
          </div>
          <Caption title="Полгода по дням">Каждая точка — день, колонка — неделя. Белая — сегодня.</Caption>
        </Cell>
      </CellGrid>
    </>
  );
}

// ── Проекты ─────────────────────────────────────────────────────────────────────────────────
function ProjectsTab({ m }: { m: DashboardModel }) {
  const list = m.projects;
  return (
    <>
      <PanelHead title="Проекты" count={list.length}>
        Отсортированы по здоровью: сначала сорванные и с риском. Штрихкод — задачи проекта, оранжевые — просрочены.
      </PanelHead>
      <CellGrid className="grid-cols-2">
        {list.length === 0 && <Empty title="Проектов нет" icon="projects" className="col-span-2 h-[200px]" />}
        {list.map((p, i) => {
          const hs = healthSignal(p.health);
          return (
            <Cell key={p.id} className="flex flex-col">
              <div className="flex h-[150px] items-center gap-6 px-5">
                <Dial value={p.pct} max={100} size={112} ticks={40} color={p.health === "off-track" ? T.orange : T.lime}>
                  <span style={mono(20, { letterSpacing: "-0.04em" })}>{Math.round(p.pct)}%</span>
                </Dial>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <span className="flex items-center justify-between">
                    <MonoLabel>PRJ-{pad2(i + 1)}</MonoLabel>
                    <span className="flex items-center gap-1.5">
                      <StatusSquare color={hs.color} hollow={hs.hollow} />
                      <MonoLabel color={hs.color === T.ink4 ? T.ink3 : hs.color}>{p.healthLabel}</MonoLabel>
                    </span>
                  </span>
                  <div className="overflow-hidden">
                    <BarCode done={p.done} total={p.total} overdue={p.overdue} height={26} />
                  </div>
                  <dl className="grid grid-cols-3" style={mono(10, {}, true)}>
                    {[
                      { k: "Готово", v: `${p.done}/${p.total}` },
                      { k: "Время", v: p.spentLabel },
                      { k: "Просроч", v: String(p.overdue), hot: p.overdue > 0 },
                    ].map((s) => (
                      <div key={s.k} className="flex flex-col gap-1">
                        <dt style={{ color: T.ink4 }}>{s.k}</dt>
                        <dd style={{ ...mono(12), color: s.hot ? T.orange : T.ink }}>{s.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <Caption title={p.name}>{p.clientName ?? "Без клиента"}</Caption>
            </Cell>
          );
        })}
        {list.length % 2 === 1 && <Hatch />}
        <Hatch className="col-span-2 h-12" />
      </CellGrid>
    </>
  );
}

// ── Деньги ──────────────────────────────────────────────────────────────────────────────────
function MoneyTab({ m }: { m: DashboardModel }) {
  const rows = [
    { k: "Оплачено · месяц", v: m.money.paidThisMonth, c: m.money.paidThisMonth ? T.lime : T.ink },
    { k: "Ожидается", v: m.money.pending, c: T.ink },
    { k: "Просрочено", v: m.money.overdue, c: m.money.overdue ? T.orange : T.ink },
    { k: "Получено всего", v: m.money.paidTotal, c: T.ink2 },
  ];
  const sum = Math.max(1, m.money.paidThisMonth + m.money.pending + m.money.overdue);
  return (
    <>
      <PanelHead title="Деньги" count="месяц">
        Оплаты клиентов: что пришло, что ждём и что уже просрочено. Ниже — кому пора напомнить.
      </PanelHead>
      <CellGrid className="grid-cols-2">
        {rows.map((r) => (
          <Cell key={r.k} className="flex flex-col gap-4 px-5 py-5">
            <MonoLabel>{r.k}</MonoLabel>
            <span style={mono(36, { color: r.c, letterSpacing: "-0.05em", lineHeight: 1 })}>{rub(r.v)}</span>
          </Cell>
        ))}
        <Cell className="col-span-2 px-5 py-5">
          <div className="mb-3 flex items-center justify-between">
            <MonoLabel>Структура месяца</MonoLabel>
            <MonoLabel color={T.ink2}>{rub(sum)}</MonoLabel>
          </div>
          <div className="flex h-3 w-full" style={{ gap: 2 }}>
            <span style={{ flex: m.money.paidThisMonth, background: T.lime }} />
            <span style={{ flex: m.money.pending, background: T.ink2 }} />
            <span style={{ flex: m.money.overdue, background: T.orange }} />
          </div>
          <div className="mt-3 flex gap-6" style={mono(10, { color: T.ink3 }, true)}>
            <span className="flex items-center gap-2"><StatusSquare /> оплачено</span>
            <span className="flex items-center gap-2"><StatusSquare color={T.ink2} /> ожидается</span>
            <span className="flex items-center gap-2"><StatusSquare color={T.orange} /> просрочено</span>
          </div>
        </Cell>
        <Hatch className="col-span-2 h-12" />
        <Cell className="col-span-2">
          <CellHead label={`Напомнить · ${m.followUps.length}`} icon={<Glyph name="clients" size={12} />} />
          {m.followUps.length === 0 ? (
            <Empty title="Напоминаний нет" hint="Все клиенты на связи" icon="clients" className="h-[120px]" />
          ) : (
            m.followUps.map((f) => (
              <div key={f.id} className="flex h-11 items-center justify-between px-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                <span className="flex items-center gap-3">
                  <StatusSquare color={T.orange} />
                  <span style={sans(14)}>{f.name}</span>
                </span>
                <span style={mono(11, { color: T.ink2 })}>{f.date}</span>
              </div>
            ))
          )}
        </Cell>
      </CellGrid>
    </>
  );
}
