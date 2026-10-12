/**
 * Dashboard · Graphite Glow · v3 «Фокус»
 * A 64 px icon rail (refs 28/29). The centre holds ONE thing — the next task as a large glowing
 * card with a white «Готово» that really closes it; the rest of the plan waits as a numbered
 * queue below (click a row to bring it into focus). The right column carries KPIs, rhythm,
 * status, meetings, money, note and reading.
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
  Surface,
  Head,
  IconBox,
  Mark,
  NAV_ICON,
  PrimaryBtn,
  GhostBtn,
  Chip,
  PrioChip,
  DueChip,
  Ring,
  BarsGlow,
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
  toneColor,
} from "@/design-lab/screens/_kit/glow";
import {
  Activity,
  BookOpen,
  CalendarArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  FolderKanban,
  Layers,
  ListTodo,
  NotebookPen,
  Plus,
  Search,
  SkipForward,
  Wallet,
  Settings,
} from "lucide-react";

const ADD_ID = "g3-add";

export default function GlowV3() {
  const m = useDashboardModel();
  const k = m.kpi;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [overOpen, setOverOpen] = useState(false);

  const open = m.plan.filter((r) => !r.done);
  const focus = open.find((r) => r.id === focusId) ?? open[0];
  const queue = m.plan.filter((r) => r.id !== focus?.id);
  const focusPos = focus ? m.plan.indexOf(focus) + 1 : 0;
  const skip = () => {
    if (!focus || open.length < 2) return;
    const i = open.indexOf(focus);
    setFocusId(open[(i + 1) % open.length].id);
  };

  return (
    <div className="relative flex min-h-screen" style={rootStyle}>
      <Ambient pools={[{ x: "40%", y: "18%", size: 1100, o: 0.06 }]} />

      {/* ── 64 px icon rail ──────────────────────────────────────────────── */}
      <aside className="relative z-10 w-16 shrink-0" style={{ background: G.c1, borderRight: `1px solid ${G.line}` }}>
      <div className="sticky top-0 flex h-screen flex-col items-center py-4" style={{ background: `linear-gradient(180deg, ${G.c2}, ${G.c1})` }}>
        <Mark size={36} />
        <span className="my-4 h-px w-6" style={{ background: G.line2 }} />
        <nav className="flex flex-col items-center gap-1.5" aria-label="Разделы">
          {m.nav.map((n) => {
            const active = n.id === "dashboard";
            const I = NAV_ICON[n.id] ?? Layers;
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-label={n.label}
                aria-current={active ? "page" : undefined}
                className="group relative flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors duration-150 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                style={
                  active
                    ? {
                        background: `linear-gradient(180deg, ${G.c7}, ${G.c5})`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 1px ${G.line2}, 0 0 22px -4px rgba(255,255,255,0.3)`,
                        color: G.ink,
                      }
                    : { color: G.ink3 }
                }
              >
                <I size={18} strokeWidth={1.5} aria-hidden />
                {n.badge ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1"
                    style={{ ...mono(10, 500), background: G.c7, color: G.ink, boxShadow: `0 0 0 2px ${G.c1}` }}
                  >
                    {n.badge}
                  </span>
                ) : null}
                <span
                  className="pointer-events-none absolute left-[52px] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-[8px] px-2.5 py-1 text-[12px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ background: G.c6, border: `1px solid ${G.line3}`, color: G.ink }}
                >
                  {n.label}
                </span>
              </a>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-3">
          <a href="#" onClick={(e) => e.preventDefault()} aria-label="Настройки" className="flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors hover:bg-white/[0.05]" style={{ color: G.ink3 }}>
            <Settings size={18} strokeWidth={1.5} aria-hidden />
          </a>
          <div title={`Уровень ${k.level} · ${k.levelTitle} — ${k.xpToNext} XP до следующего`}>
            <Ring pct={k.levelPct} size={40} stroke={2.5} ticks={0} pad={2}>
              <span style={mono(12, 500)}>{k.level}</span>
            </Ring>
          </div>
        </div>
      </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-8 px-10 pb-12 pt-8">
        {/* Centre */}
        <main className="relative min-w-0">
          <header className="flex items-center justify-between gap-6">
            <div>
              <div style={t.small}>{m.dateLabel}</div>
              <h1 className="mt-1.5" style={display(26)}>
                {m.greeting}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <GhostBtn icon={Search} title="Поиск" className="!h-9 !w-9" />
              <GhostBtn icon={Plus} onClick={() => document.getElementById(ADD_ID)?.focus()}>
                Задача
              </GhostBtn>
            </div>
          </header>

          {/* THE next task */}
          <div className="mt-8 flex items-center justify-between">
            <span style={t.eyebrow}>Следующая задача</span>
            {focus && (
              <span style={t.meta}>
                <span style={mono(12)}>{focusPos}</span> из <span style={mono(12)}>{m.plan.length}</span> в плане
              </span>
            )}
          </div>
          <div className="relative mt-3">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[28px]"
              style={{ boxShadow: "0 0 90px -18px rgba(255,255,255,0.28)" }}
            />
            <Surface kind="raised" r={28} edgeStrength={0.55} className="overflow-hidden px-9 pb-8 pt-8">
              <Bloom x="18%" y="0%" size={620} opacity={0.12} blur={40} />
              <Bloom x="100%" y="100%" size={360} opacity={0.05} blur={30} />
              {focus && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-6 right-6 select-none"
                  style={bigNum(220, { color: "rgba(255,255,255,0.028)", letterSpacing: "-0.06em" })}
                >
                  {String(focusPos).padStart(2, "0")}
                </span>
              )}
              {focus ? (
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2">
                    <PrioChip r={focus} />
                    <DueChip r={focus} />
                    {focus.projectName && <Chip icon={FolderKanban}>{focus.projectName}</Chip>}
                    {focus.overdue && (
                      <span className="ml-auto" style={{ fontSize: 12, color: toneColor("red") }}>
                        срок прошёл
                      </span>
                    )}
                  </div>
                  <h2 className="mt-6 line-clamp-2 max-w-[640px]" style={display(34, 600, { lineHeight: 1.12 })}>
                    {focus.title}
                  </h2>
                  <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2" style={t.small}>
                    <span className="flex items-center gap-2">
                      <Clock size={14} strokeWidth={1.5} aria-hidden />
                      <span style={mono(13)}>{focus.spentMin}</span> мин в работе
                      {focus.estimateMin ? (
                        <>
                          {" "}
                          из <span style={mono(13)}>{focus.estimateMin}</span>
                        </>
                      ) : null}
                    </span>
                    {focus.subtasksTotal > 0 && (
                      <span className="flex w-[220px] items-center gap-3">
                        <span className="shrink-0">
                          <span style={mono(13)}>
                            {focus.subtasksDone}/{focus.subtasksTotal}
                          </span>{" "}
                          подзадач
                        </span>
                        <Meter pct={(focus.subtasksDone / focus.subtasksTotal) * 100} h={3} />
                      </span>
                    )}
                  </div>
                  <div className="mt-8 flex items-center gap-3">
                    <PrimaryBtn size="lg" icon={Check} onClick={() => m.actions.toggle(focus.id)}>
                      Готово
                    </PrimaryBtn>
                    <GhostBtn icon={SkipForward} onClick={skip} disabled={open.length < 2} className="!h-[52px] !rounded-[16px] !px-5 !text-[14px]">
                      Следующая
                    </GhostBtn>
                  </div>
                </div>
              ) : (
                <div className="relative flex items-center gap-8 py-4">
                  <Ring pct={100} size={140} stroke={6} ticks={40} pad={10}>
                    <Check size={28} strokeWidth={1.5} aria-hidden />
                  </Ring>
                  <div>
                    <h2 style={display(30)}>План дня закрыт</h2>
                    <p className="mt-2 max-w-[360px]" style={t.small}>
                      Всё из фокуса сделано. Возьмите задачу из «Сверх плана» или добавьте новую.
                    </p>
                  </div>
                </div>
              )}
            </Surface>
          </div>

          {/* Queue */}
          <section className="mt-9">
            <Head title="Дальше в плане" count={queue.length} icon={ListTodo} right={<span style={t.meta}>клик — взять в фокус</span>} />
            <div className="mt-3 flex flex-col gap-0.5">
              {queue.length ? (
                queue.map((r, i) => (
                  <TaskLine key={r.id} r={r} index={i} onToggle={() => m.actions.toggle(r.id)} onOpen={r.done ? undefined : () => setFocusId(r.id)} />
                ))
              ) : (
                <div className="px-3 py-4" style={t.small}>
                  Очередь пуста.
                </div>
              )}
            </div>
            <div className="mt-2">
              <AddTask id={ADD_ID} onAdd={m.actions.add} />
            </div>
          </section>

          {/* Over plan — collapsible */}
          <section className="mt-7 rounded-[18px]" style={{ border: `1px solid ${G.line}`, background: "rgba(255,255,255,0.015)" }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setOverOpen((v) => !v)}
                aria-expanded={overOpen}
                className="flex items-center gap-2.5 rounded-[8px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              >
                <IconBox icon={Layers} size={28} />
                <span style={t.section}>
                  Сверх плана <span style={{ color: G.ink3, fontWeight: 400 }}>{m.overPlan.length}</span>
                </span>
                <ChevronDown size={16} strokeWidth={1.5} color={G.ink3} className={`transition-transform ${overOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
              <GhostBtn size="sm" icon={CalendarArrowUp} onClick={m.actions.moveOverPlanToTomorrow} disabled={!m.overPlan.length}>
                Перенести на завтра
              </GhostBtn>
            </div>
            {overOpen && (
              <div className="grid grid-cols-2 gap-x-2 px-1 pb-2">
                {m.overPlan.map((r) => (
                  <TaskLine key={r.id} r={r} dense chips="none" onToggle={() => m.actions.toggle(r.id)} />
                ))}
              </div>
            )}
          </section>

          {/* Projects */}
          <section className="mt-9">
            <Head title="Проекты" count={m.projects.length} icon={FolderKanban} />
            {m.projects.length ? (
              <div className="mt-3 grid grid-cols-2 gap-x-4">
                {m.projects.map((p) => (
                  <ProjectLine key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <Empty compact icon={FolderKanban} title="Проектов нет" />
            )}
          </section>
        </main>

        {/* Right column */}
        <aside className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Сегодня", v: `${k.todayDone}/${k.todayTotal}`, s: k.overdueToday ? `${k.overdueToday} просрочено` : "в плане", hot: k.overdueToday > 0 },
              { l: "Время", v: k.timeLabel, s: `цель ${k.closedToday}/${k.dailyGoal}` },
              { l: "Открыто", v: String(k.openCount), s: `${m.status.overdueAll} просрочено`, hot: m.status.overdueAll > 0 },
              { l: "За неделю", v: String(k.weekDone), s: `серия ${k.streak} дн.` },
            ].map((s) => (
              <Surface key={s.l} kind="solid" r={16} className="px-4 py-3.5">
                <div style={t.meta}>{s.l}</div>
                <div className="mt-1.5" style={mono(24)}>
                  {s.v}
                </div>
                <div className="mt-1 truncate" style={{ fontSize: 12, color: s.hot ? toneColor("red") : G.ink3 }}>
                  {s.s}
                </div>
              </Surface>
            ))}
          </div>

          <Surface kind="solid" r={18} className="p-4">
            <Head
              title="Ритм"
              icon={Activity}
              right={
                <span style={t.meta}>
                  <N color={G.ink}>{m.closed14}</N> · пик <N color={G.ink}>{m.peak14}</N>
                </span>
              }
            />
            <div className="mt-4">
              <BarsGlow values={m.dynamics.map((d) => d.value)} labels={m.dynamics.map((d, i) => (i % 2 === 1 ? d.label.split(".")[0] : ""))} height={72} gap={4} radius={3} />
            </div>
            <div className="mt-4 border-t pt-3.5" style={{ borderColor: G.line }}>
              <div className="flex justify-between" style={t.meta}>
                <span>Статус задач</span>
                <span>
                  <span style={{ ...mono(12), color: G.ink }}>{m.status.doneAll}</span> · {m.status.inProgress} ·{" "}
                  <span style={{ ...mono(12), color: toneColor("red") }}>{m.status.overdueAll}</span>
                </span>
              </div>
              <div className="mt-2.5">
                <StatusBar done={m.status.doneAll} progress={m.status.inProgress} overdue={m.status.overdueAll} h={5} />
              </div>
            </div>
          </Surface>

          <Surface kind="solid" r={18} className="p-2">
            <div className="px-2 pt-2">
              <Head title="Встречи" icon={CalendarClock} />
            </div>
            {m.meetings.length ? (
              m.meetings.slice(0, 3).map((mt) => <MeetingLine key={mt.id} mt={mt} onToggle={() => m.actions.toggleMeeting(mt.id)} />)
            ) : (
              <div className="flex items-center gap-3 px-2 pb-2 pt-3">
                <span className="h-9 w-px" style={{ background: G.line2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Встреч нет</div>
                  <div style={t.meta}>Можно держать фокус весь день</div>
                </div>
              </div>
            )}
          </Surface>

          <Surface kind="solid" r={18} className="p-4">
            <Head title="Деньги" icon={Wallet} right={<span style={t.meta}>месяц</span>} />
            <div className="mt-3.5">
              <Rub n={m.money.paidThisMonth} size={28} />
            </div>
            <div className="mt-2 border-t pt-1.5" style={{ borderColor: G.line }}>
              <KV k="Ожидается" v={<Rub n={m.money.pending} size={13} weight={500} />} />
              <KV k="Просрочено" v={<Rub n={m.money.overdue} size={13} weight={500} />} tone={m.money.overdue > 0 ? "red" : undefined} />
              {m.followUps.length > 0 && <KV plain k="Напомнить" v={m.followUps.map((f) => f.name).join(", ")} tone="amber" />}
            </div>
          </Surface>

          <Surface kind="solid" r={18} className="p-4">
            <Head title="Заметка" icon={NotebookPen} />
            <div className="mt-3">
              <NoteBox onSave={m.actions.saveNote} rows={2} />
            </div>
          </Surface>

          <Surface kind="solid" r={18} className="p-4">
            <Head title="Прочитать" icon={BookOpen} />
            <div className="mt-3">
              {m.reading ? <ReadingCard item={m.reading} size={52} /> : <div style={t.small}>Очередь чтения пуста.</div>}
            </div>
          </Surface>

        </aside>
      </div>
    </div>
  );
}
