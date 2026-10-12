/**
 * Dashboard · Bondar Editorial · v3 «Бенто»
 * Shell: no sidebar and no top bar — navigation is itself a bento tile (black, numbered 01–08,
 * level and an ASCII-dither panel under it).
 * Composition: a square-cornered bento on the 4-column grid (20px gutters = the site's), alternating
 * black (#000 + #303030 border) / white (#F7F7F7, dark text) / lime tiles — the «С чем ко мне
 * приходят?» pair turned into a dashboard: a white greeting strip with KPI numerals, the big black
 * «План дня» card (star glyph, title|description row, «label | check-list» with thin checks and 20%
 * hairlines, CTA bar), the lime money tile, a white projects key–value table, black pixel-art tiles
 * for rhythm, reading and meetings.
 */
import { useState, type CSSProperties, type ReactNode } from "react";

import { useDashboardModel, rub } from "@/design-lab/screens/dashboardModel";
import {
  B,
  T,
  tab,
  pad2,
  ColumnGrid,
  Signal,
  Matrix,
  Pixel,
  PIX,
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
  StarGlyph,
  Bullet,
  bars,
  deck,
  healthColor,
  plural,
} from "@/design-lab/screens/_kit/bondar";

type Tone = "black" | "white" | "lime";

function Tile({ tone, area, children, className = "", style }: { tone: Tone; area: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const p: Record<Tone, CSSProperties> = {
    black: { background: B.bg, color: B.text },
    white: { background: B.paper, color: B.ink },
    lime: { background: B.lime, color: B.onLime },
  };
  return (
    <section className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden ${className}`} style={{ gridArea: area, ...p[tone], ...style }}>
      {children}
      {tone === "black" && (
        <span aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: `inset 0 0 0 1px ${B.lineStrong}` }} />
      )}
    </section>
  );
}

/** Top row of a bento card: «01» number left, pixel indicator right (site «Обо мне»). */
function TileHead({ n, right, tone = "black" }: { n: string; right?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-start justify-between">
      <span style={{ ...T.num, color: tone === "lime" ? "rgba(0,0,0,.55)" : B.text3 }}>{n}</span>
      {right}
    </div>
  );
}

export default function BondarV3() {
  const m = useDashboardModel();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const planDone = m.plan.filter((r) => r.done).length;
  const planLate = m.plan.filter((r) => r.overdue).length;
  const maxDay = Math.max(1, ...m.dynamics.map((d) => d.value));
  const statusTotal = Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll);

  const kpis = [
    {
      k: "Сегодня",
      v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`,
      sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просрочено` : "без просрочек",
      hot: m.kpi.overdueToday > 0,
    },
    { k: "Время", v: m.kpi.timeLabel, sub: `${m.kpi.closedToday} из ${m.kpi.dailyGoal} по цели` },
    { k: "Открыто", v: String(m.kpi.openCount), sub: `${m.status.overdueAll} просрочено` },
    { k: "За неделю", v: String(m.kpi.weekDone), sub: `серия ${m.kpi.streak} ${plural(m.kpi.streak, "день", "дня", "дней")}` },
  ];

  return (
    <div className="relative min-h-screen antialiased" style={{ background: B.bg, color: B.text, fontFamily: B.font }}>
      <ColumnGrid />
      <div
        className="relative grid p-5"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridTemplateRows: "232px 548px 372px 352px",
          gap: 20,
          gridTemplateAreas: `"nav hello hello hello" "nav plan plan money" "rhythm plan plan projects" "read status meet note"`,
        }}
      >
        {/* ── Navigation tile ──────────────────────────────────────────────────── */}
        <Tile tone="black" area="nav">
          <div className="p-6 pb-0">
            <TileHead n="01" right={<Matrix value={Math.max(1, Math.round((m.kpi.levelPct / 100) * 6))} cell={9} />} />
            <div className="mt-6" style={T.displayS}>Рабочий стол</div>
            <div className="mt-8" style={{ ...T.caps, color: B.text3 }}>Навигация</div>
          </div>
          <nav className="mt-2 px-6">
            {m.nav.map((n, i) => {
              const active = n.id === "dashboard";
              return (
                <a
                  key={n.id}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-current={active ? "page" : undefined}
                  className="group flex h-10 items-center gap-3 outline-none transition-colors duration-200 focus-visible:bg-white/[0.04]"
                  style={{ borderBottom: `1px solid ${B.l10}` }}
                >
                  <span className="w-5" style={{ ...T.num, color: active ? B.lime : B.text3 }}>{pad2(i + 1)}</span>
                  <span
                    className="flex-1 truncate transition-[color,transform] duration-200 group-hover:translate-x-1 group-hover:text-white"
                    style={{ ...T.bodyL, color: active ? B.text : B.text2 }}
                  >
                    {n.label}
                  </span>
                  {active && <Bullet size={8} color={B.lime} />}
                  {n.badge ? <span style={{ ...T.num, color: B.lime }}>{n.badge}</span> : null}
                </a>
              );
            })}
          </nav>
          <div className="relative mt-auto h-[300px]">
            <AsciiField kind="wave" seed={9} className="absolute inset-0" accent={B.lime} />
            <div className="absolute inset-x-0 bottom-0 p-6" style={{ background: "linear-gradient(transparent, #000 45%)" }}>
              <div className="flex items-center justify-between pt-10">
                <span style={T.title}>Ур. {m.kpi.level} · {m.kpi.levelTitle}</span>
                <Signal value={bars(m.kpi.levelPct / 100)} />
              </div>
              <div className="mt-3">
                <Cells pct={m.kpi.levelPct} count={24} size={6} on={B.lime} stretch />
              </div>
              <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.text3 }}>
                <span style={tab}>{m.kpi.xpToNext} XP до следующего</span>
                <span style={tab}>{Math.round(m.kpi.levelPct)}%</span>
              </div>
            </div>
          </div>
        </Tile>

        {/* ── Hello / KPI strip (white) ────────────────────────────────────────── */}
        <Tile tone="white" area="hello" className="p-6">
          <TileHead n="02" tone="white" right={<span style={{ ...T.meta, color: B.text3 }}>{m.dateLabel}</span>} />
          <div className="mt-auto flex items-end justify-between gap-8">
            <div className="min-w-0 max-w-[400px]">
              <h1 style={T.displayL}>{m.greeting}</h1>
              <p className="mt-4" style={{ ...T.body, color: B.ink2 }}>{deck(m)}</p>
            </div>
            <div className="grid shrink-0 grid-cols-4">
              {kpis.map((s, i) => (
                <div key={s.k} className="flex w-[140px] flex-col px-5 max-[1360px]:w-[124px] max-[1360px]:px-4" style={{ borderLeft: i ? `1px solid ${B.d10}` : `1px solid ${B.d10}` }}>
                  <span style={{ ...T.caps, color: B.text3 }}>{s.k}</span>
                  <span className="mt-6 truncate" style={{ ...T.kpiNum }}>{s.v}</span>
                  <span className="mt-3 truncate" style={{ ...T.meta, color: s.hot ? B.danger : B.text3 }}>{s.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </Tile>

        {/* ── Plan (big black card) ────────────────────────────────────────────── */}
        <Tile tone="black" area="plan">
          <div className="px-8 pt-6">
            <TileHead n="03" right={<StarGlyph size={40} color={B.text} />} />
            <div className="mt-6 grid grid-cols-2 gap-8">
              <h2 style={T.displayL}>План дня</h2>
              <p style={{ ...T.bodyL, fontWeight: 500, color: B.text }}>
                {m.plan.length
                  ? `${m.plan.length} ${plural(m.plan.length, "задача", "задачи", "задач")} в фокусе, ${planDone} готово.`
                  : "План пуст."}{" "}
                <span style={{ color: B.text4 }}>
                  {planLate ? `${planLate} с просрочкой — начните с высокого приоритета.` : "Без просрочек — держим темп."}
                </span>
              </p>
            </div>
          </div>
          <div className="mx-8 mt-6 grid grid-cols-2 gap-8 pt-6" style={{ borderTop: `1px solid ${B.l20}` }}>
            <div className="flex flex-col gap-2">
              <span style={{ ...T.body, color: B.text }}>Основные задачи</span>
              <span style={{ ...T.meta, color: B.text3, ...tab }}>{planDone} из {m.plan.length}</span>
              <div className="mt-3 flex gap-[2px]">
                {m.plan.map((r) => (
                  <span key={r.id} className="h-2 w-2" style={{ background: r.done ? B.lime : B.off }} />
                ))}
              </div>
            </div>
            <ul className="-mt-1 flex flex-col">
              {m.plan.map((r, i) => (
                <li
                  key={r.id}
                  className="flex gap-2 pb-3 pt-3"
                  style={{ borderBottom: i < m.plan.length - 1 ? `1px solid ${B.l20}` : undefined }}
                >
                  <button
                    type="button"
                    onClick={() => m.actions.toggle(r.id)}
                    aria-pressed={r.done}
                    aria-label={r.done ? `Вернуть в работу: ${r.title}` : `Готово: ${r.title}`}
                    className="group flex min-w-0 flex-1 items-start gap-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
                  >
                    <span className="mt-[3px] transition-colors duration-200 group-hover:!text-white" style={{ color: r.done ? B.lime : "rgba(255,255,255,.4)" }}>
                      <ThinCheck size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate"
                        style={{ ...T.body, letterSpacing: "-0.05em", color: r.done ? B.text4 : B.text, textDecoration: r.done ? "line-through" : undefined }}
                      >
                        {r.title}
                      </span>
                      <span className="block truncate" style={{ ...T.meta, color: B.text3 }}>
                        {r.projectName ? `${r.projectName} · ` : ""}
                        <span style={{ color: r.overdue ? B.danger : B.text3 }}>{r.dueLabel}</span>
                      </span>
                    </span>
                  </button>
                  <span className="mt-[3px]"><Signal value={PRIORITY_BARS[r.priority]} on={r.priority === 1 ? B.lime : B.text} w={4} h={10} /></span>
                </li>
              ))}
              {m.plan.length === 0 && <li style={{ ...T.body, color: B.text3 }}>Нечего отмечать — добавьте задачу.</li>}
            </ul>
          </div>

          <div className="mx-8 mt-4 grid grid-cols-2 gap-8">
            <span style={{ ...T.body, color: B.text }}>Добавить</span>
            <form
              className="flex h-10 items-center gap-2 px-3 transition-colors duration-200 focus-within:!border-[#ADFB0C]"
              style={{ border: `1px solid ${B.l20}`, background: "rgba(255,255,255,.01)" }}
              onSubmit={(e) => {
                e.preventDefault();
                m.actions.add(draft);
                setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Задача на сегодня…"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7F7F7F]"
                style={{ ...T.body, color: B.text }}
              />
              <button type="submit" aria-label="Добавить" className="outline-none transition-colors hover:text-white" style={{ color: B.lime }}>
                <Hook size={14} />
              </button>
            </form>
          </div>

          {m.overPlan.length > 0 && (
            <div className="mx-8 mt-6 grid grid-cols-2 gap-8 pt-5" style={{ borderTop: `1px solid ${B.l20}` }}>
              <div className="flex flex-col gap-2">
                <span style={{ ...T.body, color: B.text }}>Сверх плана</span>
                <span style={{ ...T.meta, color: B.text3, ...tab }}>{m.overPlan.length} {plural(m.overPlan.length, "задача", "задачи", "задач")} за лимитом фокуса</span>
              </div>
              <ul className="flex flex-col">
                {m.overPlan.slice(0, 4).map((r) => (
                  <li key={r.id} className="flex h-8 min-w-0 items-center gap-2" style={{ borderBottom: `1px solid ${B.l10}` }}>
                    <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={12} />
                    <span className="min-w-0 flex-1 truncate" style={{ ...T.meta, color: B.text2 }}>{r.title}</span>
                    <span style={{ ...T.meta, color: r.overdue ? B.danger : B.text3, ...tab }}>{r.dueLabel}</span>
                  </li>
                ))}
                {m.overPlan.length > 4 && <li className="pt-2" style={{ ...T.meta, color: B.text3 }}>и ещё {m.overPlan.length - 4}</li>}
              </ul>
            </div>
          )}
          <div className="mt-auto">
            <CtaBar tone="invert" onClick={m.actions.moveOverPlanToTomorrow} disabled={!m.overPlan.length}>
              Перенести сверх плана на завтра
            </CtaBar>
          </div>
        </Tile>

        {/* ── Money (lime) ─────────────────────────────────────────────────────── */}
        <Tile tone="lime" area="money" className="p-6">
          <TileHead n="04" tone="lime" right={<Signal value={m.money.overdue > 0 ? 1 : 3} on={B.onLime} off="rgba(0,0,0,.18)" />} />
          <div className="mt-6"><Pixel map={PIX.chipCoin} px={5} color={B.onLime} /></div>
          <div className="mt-6" style={T.displayS}>Деньги</div>
          <div className="mt-1" style={{ ...T.body, opacity: 0.7 }}>получено в этом месяце</div>
          <div className="mt-auto truncate" style={{ ...T.displayXl, ...tab }}>{rub(m.money.paidThisMonth)}</div>
          <div className="mt-6" style={{ borderTop: "1px solid rgba(0,0,0,.2)" }}>
            <KV tone="lime" k="Ожидается" v={rub(m.money.pending)} />
            <KV tone="lime" k="Просрочено" v={rub(m.money.overdue)} />
            <KV tone="lime" k="Всего получено" v={rub(m.money.paidTotal)} last />
          </div>
          <div className="mt-2 flex items-center gap-2 pt-3" style={{ ...T.meta, borderTop: "1px solid rgba(0,0,0,.2)" }}>
            <Hook size={12} />
            {m.followUps.length ? `Напомнить: ${m.followUps.map((f) => f.name).join(", ")}` : "Фоллоу-апов на сегодня нет"}
          </div>
        </Tile>

        {/* ── Rhythm (black, pixel art) ────────────────────────────────────────── */}
        <Tile tone="black" area="rhythm" className="p-6">
          <TileHead n="05" right={<Signal value={bars(m.kpi.weekDone / (m.kpi.dailyGoal * 7))} />} />
          <div className="mt-4 flex items-baseline justify-between">
            <span style={T.title}>Ритм</span>
            <span style={{ ...T.meta, color: B.text3, ...tab }}>{m.closed14} за 14 дн. · пик {m.peak14}</span>
          </div>
          <div className="mt-auto flex h-[150px] items-end gap-[3px]">
            {m.dynamics.map((d, i) => {
              const dots = Math.round((d.value / maxDay) * 14);
              const isToday = i === m.dynamics.length - 1;
              return (
                <div key={d.date} className="flex flex-1 flex-col-reverse gap-[2px]" title={`${d.label}: ${d.value}`}>
                  {Array.from({ length: 14 }, (_, j) => (
                    <span key={j} className="h-[8.6px] w-full" style={{ background: j < dots ? (isToday ? B.lime : B.text) : B.l7 }} />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 pt-3" style={{ borderTop: `1px solid ${B.l15}` }}>
            {m.week.map((d) => (
              <div key={d.key} className="flex flex-col items-center gap-1">
                <span style={{ ...T.num, color: d.isToday ? B.lime : B.text }}>{d.done}</span>
                <span style={{ ...T.meta, fontSize: 11, color: d.isToday ? B.text : B.text3 }}>{d.label}</span>
              </div>
            ))}
          </div>
        </Tile>

        {/* ── Projects (white, key–value) ──────────────────────────────────────── */}
        <Tile tone="white" area="projects" className="p-6">
          <TileHead n="06" tone="white" right={<span style={{ ...T.num, color: B.text3 }}>{m.projects.length}</span>} />
          <div className="mt-4" style={T.title}>Проекты</div>
          <div className="mt-auto">
            {m.projects.slice(0, 5).map((p, i, arr) => (
              <div key={p.id} className="flex min-w-0 items-center gap-3 py-[10px]" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${B.d10}` : undefined }}>
                <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: B.ink }}>{p.name}</span>
                <span className="max-[1360px]:hidden">
                  <Cells pct={p.pct} count={8} size={6} on={p.health === "off-track" ? B.danger : B.ink} off={B.pixOffLight} />
                </span>
                <span className="w-9 text-right" style={{ ...T.num, color: B.ink }}>{Math.round(p.pct)}%</span>
                <span className="w-[62px] truncate text-right" style={{ ...T.meta, color: healthColor(p.health, "light") }}>{p.healthLabel}</span>
              </div>
            ))}
          </div>
        </Tile>

        {/* ── Reading (black, dithered cover + card-plate) ─────────────────────── */}
        <Tile tone="black" area="read">
          {m.reading ? (
            <>
              <Dither src={m.reading.coverUrl} className="absolute inset-0" cell={3} fallbackKind="stripes" seed={3} />
              <div className="relative p-6"><TileHead n="07" right={<Signal value={1} />} /></div>
              <div
                className="relative mx-4 mb-4 mt-auto p-5"
                style={{ background: "rgba(0,0,0,.95)", backdropFilter: "blur(32px)", border: `1px solid ${B.lineStrong}` }}
              >
                <span style={{ ...T.caps, color: B.text3 }}>Прочитать сегодня</span>
                <div className="mt-2 line-clamp-2" style={T.title}>{m.reading.title}</div>
                {m.reading.domain && <div className="mt-2" style={{ ...T.meta, color: B.text3 }}>{m.reading.domain}</div>}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col p-6">
              <TileHead n="07" />
              <DitherField kind="stripes" seed={3} className="mt-4 flex-1" />
              <div className="mt-4" style={T.title}>Очередь чтения пуста</div>
            </div>
          )}
        </Tile>

        {/* ── Status (white) ───────────────────────────────────────────────────── */}
        <Tile tone="white" area="status" className="p-6">
          <TileHead n="08" tone="white" />
          <div className="mt-4" style={T.title}>Статус задач</div>
          <div className="mt-6 grid grid-cols-3">
            {[
              { k: "Готово", v: m.status.doneAll, c: B.ink },
              { k: "В работе", v: m.status.inProgress, c: B.ink },
              { k: "Просрочено", v: m.status.overdueAll, c: B.danger },
            ].map((s, i) => (
              <div key={s.k} className="flex flex-col gap-2 px-3 first:pl-0" style={{ borderLeft: i ? `1px solid ${B.d10}` : undefined }}>
                <span style={{ ...T.displayS, ...tab, color: s.c }}>{s.v}</span>
                <span style={{ ...T.meta, color: B.text3 }}>{s.k}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex h-2 gap-[2px]">
            <span style={{ flex: m.status.doneAll / statusTotal, background: B.ink }} />
            <span style={{ flex: m.status.inProgress / statusTotal, background: B.pixOffLight }} />
            <span style={{ flex: m.status.overdueAll / statusTotal, background: B.danger }} />
          </div>
          <div className="mt-auto">
            {m.status.openByPriority.map((p, i, arr) => (
              <KV
                key={p.priority}
                tone="light"
                py={7}
                k={<span className="flex items-center gap-2"><Signal value={PRIORITY_BARS[p.priority]} on={B.ink} off={B.pixOffLight} w={4} h={8} />{p.label}</span>}
                v={p.count}
                last={i === arr.length - 1}
              />
            ))}
          </div>
        </Tile>

        {/* ── Meetings (black) ─────────────────────────────────────────────────── */}
        <Tile tone="black" area="meet" className="p-6">
          <TileHead n="09" right={<span style={{ ...T.num, color: B.text3 }}>{m.meetings.length}</span>} />
          <div className="mt-4" style={T.title}>Встречи</div>
          {m.meetings.length === 0 ? (
            <>
              <DitherField kind="orb" seed={14} color={B.text} accent={B.lime} accentShare={0.1} className="mt-2 min-h-0 flex-1" cell={4} dot={2} />
              <div style={T.displayS}>Встреч нет</div>
              <p className="mt-2" style={{ ...T.body, color: B.text2 }}>Календарь чист — весь день под план.</p>
            </>
          ) : (
            <ul className="mt-auto">
              {m.meetings.slice(0, 5).map((x, i, arr) => (
                <li key={x.id} className="flex h-11 min-w-0 items-center gap-3" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${B.l10}` : undefined }}>
                  <Check done={!!x.done} onClick={() => m.actions.toggleMeeting(x.id)} label={x.title} size={14} />
                  <span style={{ ...T.num, color: B.lime }}>{x.time}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: x.done ? B.text4 : B.text }}>{x.title}</span>
                  <span style={{ ...T.meta, color: B.text3 }}>{x.dateLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        {/* ── Note (white) ─────────────────────────────────────────────────────── */}
        <Tile tone="white" area="note" className="p-6">
          <TileHead n="10" tone="white" />
          <div className="mt-4" style={T.title}>Быстрая заметка</div>
          <form
            className="mt-auto flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              m.actions.saveNote(note);
              setNote("");
            }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="Мысль, ссылка, итог созвона…"
              className="w-full resize-none bg-white p-3 outline-none transition-colors duration-200 placeholder:text-[#7F7F7F] focus:!border-black"
              style={{ border: `1px solid ${B.d20}`, ...T.body, color: B.ink }}
            />
            <Button variant="black" size="md" type="submit" full>Сохранить</Button>
          </form>
        </Tile>
      </div>
    </div>
  );
}
