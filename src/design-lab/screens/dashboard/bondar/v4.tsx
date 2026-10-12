/**
 * Dashboard · Bondar Editorial · v4 «Три панели»
 * Shell: a 64px rail of pixel icons (active white with a 4px lime dot under it, the rest #7F7F7F).
 * Composition: mail-client triad. Middle pane = today as a selectable list behind numbered tabs
 * «01 План · 02 Сверх плана · 03 Встречи» with KPI cells on top. Right pane = the selected task
 * laid out like the site's case page (270 / 693 / 270 zones): 40px title, «О задаче», key–value table
 * Проект / Срок / Приоритет / Время / Подзадачи, an ASCII-dither «cover» under a card-plate, and a
 * full-width lime «↳ Готово» CTA bar wired to toggle. Below it the day's context as stitched cells
 * sharing 1px #303030 borders (rhythm, status, projects, money, reading, note).
 */
import { useMemo, useState, type ReactNode } from "react";

import { useDashboardModel, rub, type TodayRow } from "@/design-lab/screens/dashboardModel";
import { formatDuration } from "@/lib/format";
import {
  B,
  T,
  tab,
  pad2,
  Signal,
  Matrix,
  Chip,
  Pixel,
  PIX,
  NAV_PIX,
  PRIORITY_BARS,
  Cells,
  Check,
  ThinCheck,
  Dither,
  DitherField,
  AsciiField,
  Button,
  CtaBar,
  KV,
  Hook,
  NumTabs,
  hashSeed,
  bars,
  healthColor,
  plural,
} from "@/design-lab/screens/_kit/bondar";

type TabId = "plan" | "over" | "meet";

export default function BondarV4() {
  const m = useDashboardModel();
  const [tabId, setTabId] = useState<TabId>("plan");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  const all = useMemo(() => [...m.plan, ...m.overPlan], [m.plan, m.overPlan]);
  const selected: TodayRow | undefined = all.find((r) => r.id === selectedId) ?? m.plan[0] ?? m.overPlan[0];
  const list = tabId === "plan" ? m.plan : m.overPlan;
  const selIndex = selected ? all.findIndex((r) => r.id === selected.id) : -1;
  const maxDay = Math.max(1, ...m.dynamics.map((d) => d.value));
  const statusTotal = Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll);

  const go = (d: number) => {
    if (!all.length) return;
    const next = all[(selIndex + d + all.length) % all.length];
    setSelectedId(next.id);
    setTabId(m.plan.some((r) => r.id === next.id) ? "plan" : "over");
  };

  return (
    <div className="flex h-screen min-h-screen overflow-hidden antialiased" style={{ background: B.bg, color: B.text, fontFamily: B.font }}>
      {/* ── Rail 64 ────────────────────────────────────────────────────────────── */}
      <aside className="flex w-16 shrink-0 flex-col items-center py-5" style={{ borderRight: `1px solid ${B.l10}` }}>
        <Matrix value={5} cell={6} />
        <nav className="mt-8 flex flex-col items-center gap-1">
          {m.nav.map((n, i) => {
            const active = n.id === "dashboard";
            return (
              <a
                key={n.id}
                href="#"
                onClick={(e) => e.preventDefault()}
                title={`${i + 1}.0 ${n.label}`}
                aria-label={n.label}
                aria-current={active ? "page" : undefined}
                className="group relative flex h-12 w-12 flex-col items-center justify-center outline-none transition-colors duration-200 hover:bg-[#101010] focus-visible:bg-[#101010]"
              >
                <span className="transition-colors duration-200 group-hover:!text-white" style={{ color: active ? B.text : B.text3 }}>
                  <Pixel map={NAV_PIX[n.id] ?? PIX.dashboard} px={2} />
                </span>
                <span className="mt-[6px] h-1 w-1" style={{ background: active ? B.lime : "transparent" }} />
                {n.badge ? (
                  <span className="absolute right-[2px] top-[2px]" style={{ ...T.num, fontSize: 10, color: B.lime }}>{n.badge}</span>
                ) : null}
              </a>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-4">
          <span title={`Ур. ${m.kpi.level} · ${m.kpi.levelTitle} — ${m.kpi.xpToNext} XP до следующего`}>
            <Signal value={bars(m.kpi.levelPct / 100)} />
          </span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: B.s4, boxShadow: `0 0 0 2px ${B.bg}, 0 0 0 3px ${B.l20}`, ...T.num, fontSize: 11 }}
          >
            {pad2(m.kpi.level)}
          </span>
        </div>
      </aside>

      {/* ── Middle pane: today's list ──────────────────────────────────────────── */}
      <section className="flex w-[440px] shrink-0 flex-col max-[1360px]:w-[420px]" style={{ borderRight: `1px solid ${B.l10}` }}>
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between">
            <Chip icon={PIX.chipCal}>{m.dateLabel}</Chip>
            <span style={{ ...T.caps, color: B.text3 }}>1.0 Дашборд</span>
          </div>
          <h1 className="mt-5" style={T.displayM}>{m.greeting}</h1>
        </div>

        <div className="mt-6 grid grid-cols-4" style={{ borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l10}` }}>
          {[
            { k: "Сегодня", v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`, sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просроч.` : "в срок", hot: m.kpi.overdueToday > 0 },
            { k: "Время", v: m.kpi.timeLabel, sub: `цель ${m.kpi.dailyGoal}` },
            { k: "Открыто", v: String(m.kpi.openCount), sub: `${m.status.overdueAll} просроч.` },
            { k: "Неделя", v: String(m.kpi.weekDone), sub: `серия ${m.kpi.streak}` },
          ].map((s, i) => (
            <div key={s.k} className="min-w-0 px-3 py-4 first:pl-6" style={{ borderLeft: i ? `1px solid ${B.l10}` : undefined }}>
              <div style={{ ...T.caps, color: B.text3 }}>{s.k}</div>
              <div className="mt-3 truncate" style={{ ...T.displayS, fontSize: 26, ...tab }}>{s.v}</div>
              <div className="mt-1 truncate" style={{ ...T.meta, color: s.hot ? B.danger : B.text3 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="px-6 pt-5">
          <NumTabs<TabId>
            items={[
              { id: "plan", label: "План" },
              { id: "over", label: "Сверх плана" },
              { id: "meet", label: "Встречи" },
            ]}
            value={tabId}
            onChange={setTabId}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tabId !== "meet" ? (
            <ul>
              {list.map((r, i) => {
                const on = selected?.id === r.id;
                return (
                  <li
                    key={r.id}
                    className="relative transition-colors duration-200 hover:bg-[#101010]"
                    style={{ background: on ? B.s3 : undefined, borderBottom: `1px solid ${B.l10}` }}
                  >
                    {on && <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: B.lime }} />}
                    <div className="flex min-h-[56px] items-center gap-3 px-6 py-2">
                      <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        aria-pressed={on}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:underline"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate"
                            style={{ ...T.bodyStrong, color: r.done ? B.text4 : B.text, textDecoration: r.done ? "line-through" : undefined }}
                          >
                            {r.title}
                          </span>
                          <span className="mt-[2px] block truncate" style={{ ...T.meta, color: B.text3 }}>
                            {pad2(i + 1)}
                            {r.projectName ? ` · ${r.projectName}` : ""} ·{" "}
                            <span style={{ color: r.overdue ? B.danger : B.text3 }}>{r.dueLabel}</span>
                          </span>
                        </span>
                        <Signal value={PRIORITY_BARS[r.priority]} on={r.priority === 1 ? B.lime : B.text} w={4} h={10} />
                      </button>
                    </div>
                  </li>
                );
              })}
              {tabId === "plan" && m.overPlan.length > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setTabId("over")}
                    className="group flex h-12 w-full items-center gap-2 px-6 text-left outline-none transition-colors duration-200 hover:bg-[#101010]"
                    style={{ ...T.meta, color: B.text3 }}
                  >
                    <Hook size={12} />
                    <span className="transition-colors duration-200 group-hover:text-white">
                      Ещё {m.overPlan.length} {plural(m.overPlan.length, "задача", "задачи", "задач")} сверх плана — вкладка 02
                    </span>
                  </button>
                </li>
              )}
              {list.length === 0 && (
                <li className="px-6 py-10" style={{ ...T.body, color: B.text3 }}>
                  {tabId === "plan" ? "План пуст — добавьте задачу ниже." : "Сверх плана ничего нет."}
                </li>
              )}
            </ul>
          ) : m.meetings.length === 0 ? (
            <div className="flex flex-col px-6 py-8">
              <DitherField kind="orb" seed={31} color={B.text} accent={B.lime} accentShare={0.1} className="h-[140px] w-full" />
              <div className="mt-6" style={T.displayS}>Встреч нет</div>
              <p className="mt-2" style={{ ...T.body, color: B.text2 }}>Ни сегодня, ни в ближайшие дни. Весь день — под план.</p>
            </div>
          ) : (
            <ul>
              {m.meetings.map((x) => (
                <li key={x.id} className="flex min-h-[56px] items-center gap-3 px-6" style={{ borderBottom: `1px solid ${B.l10}` }}>
                  <Check done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ ...T.bodyStrong, color: x.done ? B.text4 : B.text }}>{x.title}</span>
                    <span className="block truncate" style={{ ...T.meta, color: B.text3 }}>{x.clientName ?? "Без клиента"} · {x.durationMin} мин</span>
                  </span>
                  <span className="text-right" style={{ ...T.num, color: B.lime }}>{x.time}<br /><span style={{ color: B.text3 }}>{x.dateLabel}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {tabId === "over" && m.overPlan.length > 0 ? (
          <CtaBar tone="dark" onClick={m.actions.moveOverPlanToTomorrow}>Перенести {m.overPlan.length} на завтра</CtaBar>
        ) : (
          <form
            className="flex h-14 shrink-0 items-center gap-3 px-6 transition-colors duration-200 focus-within:bg-[#101010]"
            style={{ borderTop: `1px solid ${B.l15}` }}
            onSubmit={(e) => {
              e.preventDefault();
              m.actions.add(draft);
              setDraft("");
              setTabId("plan");
            }}
          >
            <span style={{ color: B.lime }}><Hook size={16} /></span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Новая задача на сегодня…"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7F7F7F]"
              style={{ ...T.body, color: B.text }}
            />
            <span className="px-2 py-1" style={{ ...T.caps, color: B.text3, background: B.s4, borderRadius: 4 }}>Enter</span>
          </form>
        )}
      </section>

      {/* ── Right pane: detail as a case page + context ─────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between px-6" style={{ background: B.bg, borderBottom: `1px solid ${B.l10}` }}>
          <span style={{ ...T.caps, color: B.text3 }}>
            Задача {selIndex >= 0 ? `${pad2(selIndex + 1)} / ${pad2(all.length)}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <IconBtn label="Предыдущая" onClick={() => go(-1)} dir={-1} />
            <IconBtn label="Следующая" onClick={() => go(1)} dir={1} />
          </div>
        </div>

        {selected ? (
          <article>
            <div className="grid gap-6 px-6 pb-8 pt-8" style={{ gridTemplateColumns: "minmax(0,300px) minmax(0,1fr) minmax(0,190px)" }}>
              {/* zone 1 — info */}
              <div className="min-w-0">
                <h2
                  className="line-clamp-3"
                  style={{ fontSize: 40, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.05em", color: selected.done ? B.text4 : B.text }}
                >
                  {selected.title}
                </h2>
                <div className="mt-8" style={{ ...T.bodyL, fontWeight: 500 }}>О задаче</div>
                <p className="mt-3 line-clamp-4" style={{ ...T.meta, fontSize: 13, color: B.text2 }}>
                  {selected.task.description?.trim() ||
                    `Без описания. ${selected.overdue ? `Срок прошёл ${selected.dueLabel} — перенесите или закройте.` : "Срок — сегодня."}`}
                </p>
                <div className="mt-6">
                  <KV k="Проект" v={selected.projectName ?? "—"} />
                  <KV k="Срок" v={selected.dueLabel || "—"} valueColor={selected.overdue ? B.danger : undefined} />
                  <KV
                    k="Приоритет"
                    v={
                      <span className="inline-flex items-center gap-2">
                        <Signal value={PRIORITY_BARS[selected.priority]} on={selected.priority === 1 ? B.lime : B.text} w={4} h={10} />
                        {selected.priorityLabel}
                      </span>
                    }
                  />
                  <KV
                    k="Время"
                    v={`${formatDuration(selected.spentMin)}${selected.estimateMin ? ` из ${formatDuration(selected.estimateMin)}` : ""}`}
                  />
                  <KV k="Подзадачи" v={selected.subtasksTotal ? `${selected.subtasksDone} / ${selected.subtasksTotal}` : "нет"} last />
                </div>
              </div>

              {/* zone 2 — cover */}
              <div className="relative min-h-[380px] min-w-0" style={{ background: B.raised }}>
                <AsciiField
                  key={selected.id}
                  kind={(["stripes", "orb", "wave", "blob"] as const)[hashSeed(selected.id) % 4]}
                  seed={hashSeed(selected.id) % 997}
                  accent={selected.priority === 1 ? B.lime : undefined}
                  className="absolute inset-0"
                />
                <div
                  className="absolute inset-x-4 bottom-4 p-5"
                  style={{ background: "rgba(0,0,0,.95)", backdropFilter: "blur(32px)", border: `1px solid ${B.lineStrong}` }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ ...T.caps, color: B.text3 }}>Подзадачи</span>
                    <Signal value={bars(selected.subtasksTotal ? selected.subtasksDone / selected.subtasksTotal : selected.done ? 1 : 0)} />
                  </div>
                  {selected.task.subtasks.length ? (
                    <ul className="mt-3">
                      {selected.task.subtasks.slice(0, 4).map((st, i, arr) => (
                        <li key={st.id} className="flex items-center gap-2 py-2" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${B.l20}` : undefined, ...T.body }}>
                          <span style={{ color: st.done ? B.lime : "rgba(255,255,255,.4)" }}><ThinCheck /></span>
                          <span className="truncate" style={{ color: st.done ? B.text4 : B.text }}>{st.title}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3" style={{ ...T.body, color: B.text2 }}>Задача цельная — без подзадач. Один заход, одна галочка.</p>
                  )}
                  <div className="mt-4">
                    <Cells
                      pct={selected.estimateMin ? (selected.spentMin / selected.estimateMin) * 100 : selected.done ? 100 : 0}
                      count={30}
                      on={B.lime}
                      stretch
                    />
                  </div>
                </div>
              </div>

              {/* zone 3 — side */}
              <div className="flex min-w-0 flex-col gap-6">
                <div>
                  <div style={{ ...T.bodyL, fontWeight: 500 }}>Статус</div>
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      className="inline-flex h-5 items-center px-2"
                      style={{
                        ...T.caps,
                        borderRadius: 4,
                        background: selected.done ? B.limeTint : selected.overdue ? B.dangerTint : B.s4,
                        color: selected.done ? B.lime : selected.overdue ? B.danger : B.text2,
                      }}
                    >
                      {selected.done ? "Готово" : selected.overdue ? "Просрочено" : "В работе"}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ ...T.bodyL, fontWeight: 500 }}>Где в плане</div>
                  <p className="mt-3" style={{ ...T.meta, fontSize: 13, color: B.text2 }}>
                    {selected.overLimit ? "Сверх лимита фокуса — можно перенести на завтра." : `В фокусе дня: ${pad2(m.plan.findIndex((r) => r.id === selected.id) + 1)} из ${pad2(m.plan.length)}.`}
                  </p>
                </div>
                <Button variant="outline" hookRight full onClick={() => go(1)}>Следующая</Button>
              </div>
            </div>

            <CtaBar tone={selected.done ? "dark" : "lime"} height={59} onClick={() => {
                // closing a task moves the cursor to the next one (the closed one may leave «today»)
                if (!selected.done && all.length > 1) setSelectedId(all[(selIndex + 1) % all.length].id);
                m.actions.toggle(selected.id);
              }}
            >
              {selected.done ? "Вернуть в работу" : "Готово"}
            </CtaBar>
          </article>
        ) : (
          <div className="flex flex-col items-start px-6 py-16">
            <DitherField kind="blob" seed={2} accent={B.lime} className="h-[200px] w-[240px]" />
            <div className="mt-6" style={T.displayL}>Всё закрыто</div>
            <p className="mt-3" style={{ ...T.bodyL, color: B.text2 }}>На сегодня задач нет. Добавьте новую слева.</p>
          </div>
        )}

        {/* ── Context: stitched cells ─────────────────────────────────────────── */}
        <div className="px-6 pb-10 pt-12">
          <div className="flex items-baseline gap-3">
            <span style={{ ...T.num, color: B.text3 }}>02</span>
            <h3 style={T.displayS}>Контекст дня</h3>
          </div>
          <div className="mt-6 grid grid-cols-3" style={{ borderTop: `1px solid ${B.lineStrong}`, borderLeft: `1px solid ${B.lineStrong}` }}>
            <Cell title="Ритм · 14 дней" aside={`${m.closed14} · пик ${m.peak14}`}>
              <div className="flex h-[88px] items-end gap-[3px]">
                {m.dynamics.map((d, i) => (
                  <span
                    key={d.date}
                    title={`${d.label}: ${d.value}`}
                    className="min-w-[6px] flex-1"
                    style={{ height: `${Math.max(3, (d.value / maxDay) * 100)}%`, background: i === m.dynamics.length - 1 ? B.lime : d.value ? B.text : B.off }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.text3 }}>
                <span style={tab}>{m.dynamics[0].label}</span>
                <span>сегодня</span>
              </div>
            </Cell>

            <Cell title="Статус задач" aside={`${m.status.doneAll + m.status.inProgress + m.status.overdueAll}`}>
              <div className="flex h-2 gap-[2px]">
                <span style={{ flex: m.status.doneAll / statusTotal, background: B.text }} />
                <span style={{ flex: m.status.inProgress / statusTotal, background: B.off }} />
                <span style={{ flex: m.status.overdueAll / statusTotal, background: B.danger }} />
              </div>
              <div className="mt-3">
                <KV k="Выполнено" v={m.status.doneAll} py={6} />
                <KV k="В работе" v={m.status.inProgress} py={6} />
                <KV k="Просрочено" v={m.status.overdueAll} valueColor={B.danger} py={6} last />
              </div>
              <div className="mt-3 flex gap-3" style={{ ...T.meta, color: B.text3 }}>
                {m.status.openByPriority.map((p) => (
                  <span key={p.priority} className="flex items-center gap-1" title={p.label}>
                    <Signal value={PRIORITY_BARS[p.priority]} w={3} h={8} />
                    <span style={tab}>{p.count}</span>
                  </span>
                ))}
              </div>
            </Cell>

            <Cell title="Деньги · месяц" aside={m.money.overdue ? "есть долг" : "чисто"}>
              <div className="truncate" style={{ ...T.kpiNum, color: B.lime }}>{rub(m.money.paidThisMonth)}</div>
              <div className="mt-1" style={{ ...T.meta, color: B.text3 }}>получено</div>
              <div className="mt-3">
                <KV k="Ожидается" v={rub(m.money.pending)} py={6} />
                <KV k="Просрочено" v={rub(m.money.overdue)} py={6} last />
              </div>
              <div className="mt-2 flex items-center gap-2" style={{ ...T.meta, color: B.text3 }}>
                <Hook size={12} />
                {m.followUps.length ? `Напомнить: ${m.followUps.map((f) => f.name).join(", ")}` : "Фоллоу-апов нет"}
              </div>
            </Cell>

            <Cell title="Проекты" aside={String(m.projects.length)} span={2}>
              {m.projects.slice(0, 5).map((p, i, arr) => (
                <div key={p.id} className="grid h-9 items-center gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) auto 40px 72px", borderBottom: i < arr.length - 1 ? `1px solid ${B.l10}` : undefined }}>
                  <span className="truncate" style={T.body}>{p.name}</span>
                  <Cells pct={p.pct} count={14} on={p.health === "off-track" ? B.danger : B.text} />
                  <span className="text-right" style={{ ...T.num, color: B.text3 }}>{Math.round(p.pct)}%</span>
                  <span className="text-right" style={{ ...T.meta, color: healthColor(p.health) }}>{p.healthLabel}</span>
                </div>
              ))}
            </Cell>

            <Cell title="Чтение" aside={m.reading?.domain ?? ""}>
              {m.reading ? (
                <div className="flex gap-3">
                  <Dither src={m.reading.coverUrl} className="h-16 w-16 shrink-0" cell={2} />
                  <div className="line-clamp-4 min-w-0" style={T.bodyStrong}>{m.reading.title}</div>
                </div>
              ) : (
                <p style={{ ...T.body, color: B.text3 }}>Очередь чтения пуста.</p>
              )}
            </Cell>

            <Cell title="Быстрая заметка" span={3}>
              <form
                className="flex items-stretch gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  m.actions.saveNote(note);
                  setNote("");
                }}
              >
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Мысль, ссылка, итог созвона…"
                  className="h-10 min-w-0 flex-1 bg-white/[0.02] px-3 outline-none transition-colors duration-200 placeholder:text-[#7F7F7F] focus:!border-[#ADFB0C]"
                  style={{ border: `1px solid ${B.l20}`, ...T.body, color: B.text }}
                />
                <Button variant="outline" size="md" type="submit">Сохранить</Button>
              </form>
            </Cell>
          </div>
        </div>
      </main>
    </div>
  );
}

function Cell({ title, aside, children, span = 1 }: { title: string; aside?: string; children: ReactNode; span?: number }) {
  return (
    <section
      className="min-w-0 p-5"
      style={{ gridColumn: `span ${span}`, borderRight: `1px solid ${B.lineStrong}`, borderBottom: `1px solid ${B.lineStrong}` }}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span style={{ ...T.caps, color: B.text3 }}>{title}</span>
        {aside && <span className="truncate" style={{ ...T.num, color: B.text3 }}>{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function IconBtn({ label, onClick, dir }: { label: string; onClick: () => void; dir: 1 | -1 }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center outline-none transition-colors duration-200 hover:bg-[#101010] focus-visible:bg-[#101010]"
      style={{ color: B.text2 }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ transform: dir < 0 ? "scaleX(-1)" : undefined }}>
        <path d="M1 7H12.5M8.5 3L12.5 7L8.5 11" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    </button>
  );
}
