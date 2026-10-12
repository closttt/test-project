/**
 * «Индекс» · Аналитика — Analytics and Achievements merged into one editorial report.
 * Stats strip → 01 rhythm (dot-matrix + thin line) → 02 year matrix → 03 focus → 04 tasks →
 * 05 level & achievements as a quiet KV section (only when gamification is on).
 *
 * Every number appears once (audit 2.3 / §5 p.9): no second «Закрыто за 7/30/90» row, the level
 * lives only in 05, the year matrix replaces both heatmaps (Analytics «Карта фокуса» + Achievements
 * «Активность»). One lime element: the «today» tick under the rhythm chart.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { computeAnalytics, peakWeekday, type RangeDays } from "@/lib/analytics";
import { computeGameStats } from "@/lib/gameStats";
import { ACHIEVEMENTS, levelProgress } from "@/lib/gamification";
import { questsForDay, seasonProgress } from "@/lib/quests";
import { formatDuration, formatDate, dueLabel, isOverdue, todayStr } from "@/lib/format";
import { levelTitle, type AppData, type Task } from "@/types";
import {
  B,
  T,
  tab,
  pad2,
  Page,
  PageHeader,
  SectionHead,
  Stats,
  Line,
  Cells,
  Signal,
  KV,
  ThinCheck,
  Empty,
  PRIORITY_BARS,
  plural,
} from "@/design-lab/screens/_kit/index";

import { Seg } from "./Settings.parts";
import { useTaskPanel } from "@/design-lab/screens/_kit/index-ui";
import { DotColumns, ThinLine, YearMatrix, ShadeLegend, Panel } from "./Analytics.parts";

const RANGE_WORD: Record<RangeDays, string> = { 7: "7 дн.", 30: "30 дн.", 90: "90 дн." };
const WEEKDAY_LONG: Record<string, string> = { Пн: "понедельникам", Вт: "вторникам", Ср: "средам", Чт: "четвергам", Пт: "пятницам", Сб: "субботам", Вс: "воскресеньям" };
const PRIORITY_NAME: Record<number, string> = { 1: "Высокий", 2: "Средний", 3: "Низкий", 0: "Без приоритета" };

type PanelState = { kind: "closed" } | { kind: "open"; priority?: number } | null;

export default function Analytics() {
  const ctx = useData();
  const { toggleTask, gamification } = ctx;
  const [range, setRange] = useState<RangeDays>(30);
  const [yearOf, setYearOf] = useState<"tasks" | "focus">("tasks");
  const [panel, setPanel] = useState<PanelState>(null);

  const appData = useMemo(() => ({ ...ctx, tasks: ctx.allTasks, projects: ctx.allProjects }) as AppData, [ctx]);
  const r = useMemo(() => computeAnalytics(appData, range), [appData, range]);
  const stats = useMemo(() => computeGameStats(appData), [appData]);
  const peak = peakWeekday(r);

  // Tasks — closed in range (newest first) and open (by due date).
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - range);
    return d.toISOString();
  }, [range]);
  const closed = ctx.allTasks
    .filter((t) => t.done && t.completedAt && t.completedAt >= cutoff)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const open = ctx.allTasks.filter((t) => !t.done && !t.archivedAt).sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
  const overdue = open.filter((t) => isOverdue(t.dueDate)).length;
  const byPriority = [1, 2, 3, 0].map((p) => {
    const list = open.filter((t) => t.priority === p);
    return { p, count: list.length, late: list.filter((t) => isOverdue(t.dueDate)).length };
  });
  const maxPriority = Math.max(1, ...byPriority.map((x) => x.count));

  // Year matrix: closed tasks per day, or focus minutes per day.
  const focusByDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of ctx.pomodoroSessions ?? []) if (s.kind === "work") m[s.date] = (m[s.date] ?? 0) + s.minutes;
    return m;
  }, [ctx.pomodoroSessions]);
  const yearValues = yearOf === "tasks" ? ctx.completionLog : focusByDay;
  const yearActive = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 364);
    const key = since.toISOString().slice(0, 10);
    return Object.entries(yearValues).filter(([d, v]) => d >= key && v > 0).length;
  }, [yearValues]);

  const maxWeekday = Math.max(1, ...r.byWeekday.map((w) => w.value));
  const panelTasks =
    panel?.kind === "closed" ? closed : panel?.kind === "open" ? open.filter((t) => panel.priority === undefined || t.priority === panel.priority) : [];

  return (
    <Page>
      <PageHeader
        title="Аналитика"
        deck={
          <>
            Ритм, фокус и прогресс — из ваших данных.
            {peak ? <> Больше всего фокуса — по {WEEKDAY_LONG[peak] ?? peak}.</> : null}
          </>
        }
        graphic="ridge"
        seed={14}
        actions={
          <Seg<RangeDays>
            label="Период"
            value={range}
            onChange={setRange}
            options={[7, 30, 90].map((d) => ({ value: d as RangeDays, label: RANGE_WORD[d as RangeDays] }))}
          />
        }
      />

      <Stats
        items={[
          { k: `Закрыто · ${RANGE_WORD[range]}`, v: r.totalClosed, sub: `${r.activeDays} ${plural(r.activeDays, "активный день", "активных дня", "активных дней")}` },
          { k: `Фокус · ${RANGE_WORD[range]}`, v: formatDuration(r.totalFocusMin), sub: `≈ ${formatDuration(r.avgFocusMin)} в день` },
          { k: "Открыто", v: open.length, sub: overdue ? `${overdue} с просрочкой` : "без просрочек", hot: overdue > 0 },
          {
            k: "Точность оценок",
            v: r.estimateAccuracy === null ? "—" : `${r.estimateAccuracy}%`,
            sub: r.estimateAccuracy === null ? "нет закрытых задач с оценкой" : "факт к оценке, в среднем",
          },
        ]}
      />

      {/* ── 01 Ритм ──────────────────────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <SectionHead n="01" title="Ритм" meta={RANGE_WORD[range]} />
        <div className="mt-8 grid grid-cols-2 gap-x-5">
          <div className="min-w-0 pr-5">
            <ChartHead title="Закрыто по дням" meta={`пик ${Math.max(0, ...r.completionsSeries.map((d) => d.value))}`} />
            <DotColumns data={r.completionsSeries} marker format={(v) => `${v} ${plural(v, "задача", "задачи", "задач")}`} />
          </div>
          <div className="min-w-0 pl-5" style={{ borderLeft: `1px solid ${B.l7}` }}>
            <ChartHead title="Фокус по дням" meta={`пик ${formatDuration(Math.max(0, ...r.focusSeries.map((d) => d.value)))}`} />
            <ThinLine data={r.focusSeries} format={formatDuration} />
          </div>
        </div>
      </section>

      {/* ── 02 Год ───────────────────────────────────────────────────────────────────────── */}
      <section className="mt-20">
        <SectionHead
          n="02"
          title="Год"
          meta={`${yearActive} ${plural(yearActive, "активный день", "активных дня", "активных дней")} из 365`}
        />
        <div className="mt-6 flex items-center justify-between">
          <Seg
            label="Что показывать"
            value={yearOf}
            onChange={setYearOf}
            options={[
              { value: "tasks", label: "Закрытые задачи" },
              { value: "focus", label: "Минуты фокуса" },
            ]}
          />
          <ShadeLegend />
        </div>
        <div className="mt-6">
          <YearMatrix
            values={yearValues}
            format={yearOf === "tasks" ? (v) => `${v} ${plural(v, "задача", "задачи", "задач")}` : formatDuration}
          />
        </div>
      </section>

      {/* ── 03 Фокус ─────────────────────────────────────────────────────────────────────── */}
      <section className="mt-20">
        <SectionHead n="03" title="Фокус" meta="помодоро-сессии" />
        <div className="mt-8 grid grid-cols-4 gap-x-5">
          <div className="min-w-0 pr-5">
            <SubTitle>По дням недели · {RANGE_WORD[range]}</SubTitle>
            <ul style={{ borderTop: `1px solid ${B.l10}` }}>
              {r.byWeekday.map((w) => {
                const top = peak === w.label && w.value > 0;
                return (
                  <li key={w.label} className="grid h-10 items-center gap-3" style={{ gridTemplateColumns: "22px minmax(0,1fr) 52px", borderBottom: `1px solid ${B.l7}` }}>
                    <span style={{ ...T.meta, color: top ? B.text : B.text3 }}>{w.label}</span>
                    <Cells pct={(w.value / maxWeekday) * 100} count={16} size={6} on={top ? B.text : B.text3} off={B.l7} stretch />
                    <span className="text-right" style={{ ...T.num, color: top ? B.text : B.text3 }}>{formatDuration(w.value)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="min-w-0 pr-5">
            <SubTitle>Проекты · доля фокуса</SubTitle>
            {r.topProjects.length === 0 ? (
              <Empty title="Нет сессий по проектам" text="Запускайте помодоро из задачи — здесь появится доля проекта." seed={14} height={64} />
            ) : (
              <ul style={{ borderTop: `1px solid ${B.l10}` }}>
                {r.topProjects.map((p) => (
                  <li key={p.label} className="flex flex-col gap-2 py-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: B.text2 }}>{p.label}</span>
                      <span style={{ ...T.num, color: B.text3 }}>{p.value}%</span>
                    </span>
                    <Line pct={p.value} color={B.text3} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-x-5">
            <div className="min-w-0 pr-5">
              <SubTitle>За всё время</SubTitle>
              <div style={{ borderTop: `1px solid ${B.l10}` }}>
                <KV k="Помодоро-сессий" v={stats.pomodoros} py={10} />
                <KV k="Фокус" v={formatDuration(stats.focusMinTotal)} py={10} />
                <KV k="Трекнуто таймером" v={formatDuration(r.lifetimeTrackedMin)} py={10} />
                <KV k="Задач закрыто" v={stats.lifetimeDone} py={10} last />
              </div>
            </div>
            <div className="min-w-0">
              <SubTitle>Рекорды</SubTitle>
              <div style={{ borderTop: `1px solid ${B.l10}` }}>
                <KV k="Задач за день" v={stats.maxTasksInDay} py={10} />
                <KV k="Фокус за день" v={formatDuration(stats.maxFocusMinInDay)} py={10} />
                <KV k="Помодоро за день" v={stats.maxPomodorosInDay} py={10} />
                <KV k="Самая длинная сессия" v={formatDuration(stats.longestFocusSession)} py={10} last />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 04 Задачи ────────────────────────────────────────────────────────────────────── */}
      <section className="mt-20">
        <SectionHead n="04" title="Задачи" />
        <div className="mt-8 grid grid-cols-4 gap-x-5">
          <div className="col-span-2 min-w-0 pr-5">
            <SubTitle right={<RowLink onClick={() => setPanel({ kind: "open" })}>все открытые ↳</RowLink>}>Открытые по приоритету</SubTitle>
            <ul style={{ borderTop: `1px solid ${B.l10}` }}>
              {byPriority.map((x) => (
                <li key={x.p}>
                  <button
                    type="button"
                    disabled={x.count === 0}
                    onClick={() => setPanel({ kind: "open", priority: x.p })}
                    className="group grid h-12 w-full items-center gap-4 text-left outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.04] disabled:cursor-default"
                    style={{ gridTemplateColumns: "22px 120px minmax(0,1fr) 88px 32px", borderBottom: `1px solid ${B.l7}` }}
                  >
                    <span className="flex">{PRIORITY_BARS[x.p] ? <Signal value={PRIORITY_BARS[x.p]} on={B.text2} w={4} h={10} /> : null}</span>
                    <span className="transition-colors group-hover:text-white" style={{ ...T.body, color: x.count ? B.text2 : B.text4 }}>{PRIORITY_NAME[x.p]}</span>
                    <Line pct={(x.count / maxPriority) * 100} color={B.text3} />
                    <span className="text-right" style={{ ...T.meta, color: x.late ? B.danger : B.off, ...tab }}>
                      {x.late ? `${x.late} просрочено` : ""}
                    </span>
                    <span className="text-right" style={{ ...T.num, color: x.count ? B.text : B.off }}>{x.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-2 min-w-0">
            <SubTitle right={closed.length > 0 ? <RowLink onClick={() => setPanel({ kind: "closed" })}>все за {RANGE_WORD[range]} ↳</RowLink> : undefined}>
              Последние закрытые
            </SubTitle>
            {closed.length === 0 ? (
              <Empty title="За период ничего не закрыто" text="Выберите период длиннее." seed={7} height={64} />
            ) : (
              <ul style={{ borderTop: `1px solid ${B.l10}` }}>
                {closed.slice(0, 4).map((t) => (
                  <TaskRow key={t.id} t={t} onToggle={() => toggleTask(t.id)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── 05 Уровень и достижения ──────────────────────────────────────────────────────── */}
      <section className="mt-20">
        <SectionHead
          n="05"
          title="Уровень и достижения"
          meta={
            <>
              {gamification.enabled ? `${ACHIEVEMENTS.filter((a) => gamification.achievements.includes(a.id)).length} из ${ACHIEVEMENTS.length} достижений · ` : null}
              <Link to="/achievements" className="transition-colors hover:text-white">
                все достижения ↳
              </Link>
            </>
          }
        />
        {gamification.enabled ? (
          <Progression />
        ) : (
          <p className="mt-6 py-5" style={{ ...T.body, color: B.text3, borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l7}` }}>
            Геймификация выключена.{" "}
            <Link to="/settings" className="transition-colors hover:text-white" style={{ color: B.text2 }}>
              Включить в настройках ↳
            </Link>
          </p>
        )}
      </section>

      <Panel
        open={!!panel}
        onClose={() => setPanel(null)}
        eyebrow={
          panel?.kind === "closed"
            ? `Закрыто за ${RANGE_WORD[range]}`
            : panel?.kind === "open" && panel.priority !== undefined
              ? `Открытые · ${PRIORITY_NAME[panel.priority].toLowerCase()} приоритет`
              : "Открытые задачи"
        }
        title={`${panelTasks.length} ${plural(panelTasks.length, "задача", "задачи", "задач")}`}
      >
        {panelTasks.length === 0 ? (
          <Empty title="Пусто" text={panel?.kind === "closed" ? "За этот период ничего не закрыто." : "Открытых задач нет."} seed={3} />
        ) : (
          <ul style={{ borderTop: `1px solid ${B.l10}` }}>
            {panelTasks.map((t) => (
              <TaskRow key={t.id} t={t} onToggle={() => toggleTask(t.id)} />
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * 05 — level, month, quests, achievements (quiet KV)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function Progression() {
  const data = useData();
  const { gamification } = data;
  const lvl = levelProgress(gamification.xp);
  const appData = { ...data, tasks: data.allTasks } as AppData;
  const streak = computeGameStats(appData).streak;
  const today = todayStr();
  const quests = questsForDay(today);
  const season = seasonProgress(appData);
  const half = Math.ceil(ACHIEVEMENTS.length / 2);

  return (
    <div className="mt-8 grid grid-cols-4 gap-x-5">
      <div className="min-w-0 pr-5">
        <SubTitle>Уровень</SubTitle>
        <div style={{ borderTop: `1px solid ${B.l10}` }}>
          <KV k="Уровень" v={`${lvl.level} · ${levelTitle(lvl.level)}`} py={10} />
          <KV k="Опыт" v={`${gamification.xp.toLocaleString("ru-RU")} XP`} py={10} />
          <KV k={`До уровня ${lvl.level + 1}`} v={`${lvl.toNext} XP`} py={10} />
          <div className="py-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
            <Line pct={lvl.pct} color={B.text2} />
          </div>
          <KV k="Серия" v={`${streak} ${plural(streak, "день", "дня", "дней")}`} py={10} />
          <KV k="Рекорд серии" v={`${gamification.bestStreak} ${plural(gamification.bestStreak, "день", "дня", "дней")}`} py={10} last />
        </div>
      </div>

      <div className="min-w-0 pr-5">
        <SubTitle>Сегодня и месяц</SubTitle>
        <ul style={{ borderTop: `1px solid ${B.l10}` }}>
          {quests.map((q) => {
            const progress = Math.min(q.progress(appData, today), q.target);
            const done = progress >= q.target;
            return (
              <li key={q.id} className="flex flex-col gap-2 py-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
                <span className="flex items-center gap-3">
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" style={{ boxShadow: `inset 0 0 0 1px ${done ? B.text : B.l20}`, background: done ? B.text : undefined }}>
                    {done && <ThinCheck size={9} color={B.bg} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: done ? B.text4 : B.text }}>{q.title}</span>
                  <span style={{ ...T.meta, color: B.text3, ...tab }}>+{q.xp} XP</span>
                </span>
                <span className="flex items-center gap-3 pl-[26px]">
                  <Line pct={(progress / q.target) * 100} color={B.text3} />
                  <span className="shrink-0" style={{ ...T.num, color: B.text3 }}>{progress}/{q.target}</span>
                </span>
              </li>
            );
          })}
          <li className="flex flex-col gap-2 py-3">
            <span className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: B.text }}>{season.title.replace(/:.*/, "")} — марафон</span>
              <span style={{ ...T.num, color: B.text3 }}>{season.done}/{season.target}</span>
            </span>
            <Line pct={Math.min(100, (season.done / season.target) * 100)} color={B.text2} />
            <span style={{ ...T.meta, color: B.text3 }}>
              {season.done >= season.target ? "Цель месяца пройдена" : `До цели месяца: ${season.target - season.done}`}
            </span>
          </li>
        </ul>
      </div>

      <div className="col-span-2 grid min-w-0 grid-cols-2 gap-x-5">
        {[ACHIEVEMENTS.slice(0, half), ACHIEVEMENTS.slice(half)].map((col, ci) => (
          <div key={ci} className={`min-w-0 ${ci === 0 ? "pr-5" : ""}`}>
            <SubTitle>{ci === 0 ? "Достижения" : " "}</SubTitle>
            <ol style={{ borderTop: `1px solid ${B.l10}` }}>
              {col.map((a, i) => {
                const unlocked = gamification.achievements.includes(a.id);
                return (
                  <li key={a.id} className="grid h-9 items-center gap-3" title={a.desc} style={{ gridTemplateColumns: "20px minmax(0,1fr) 12px", borderBottom: `1px solid ${B.l7}` }}>
                    <span style={{ ...T.num, color: B.off }}>{pad2(ci * half + i + 1)}</span>
                    <span className="min-w-0 truncate" style={{ ...T.body, color: unlocked ? B.text : B.text3 }}>
                      {a.title}
                    </span>
                    <span style={{ color: B.text2 }}>{unlocked ? <ThinCheck size={12} /> : null}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Local pieces
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function ChartHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between">
      <span style={{ ...T.bodyStrong, color: B.text2 }}>{title}</span>
      <span style={{ ...T.meta, color: B.text3, ...tab }}>{meta}</span>
    </div>
  );
}

function SubTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex h-5 items-baseline justify-between gap-4">
      <span className="whitespace-pre" style={{ ...T.meta, color: B.text3 }}>{children}</span>
      {right}
    </div>
  );
}

function RowLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="outline-none transition-colors duration-200 hover:text-white focus-visible:text-white" style={{ ...T.meta, color: B.text3 }}>
      {children}
    </button>
  );
}

function TaskRow({ t, onToggle }: { t: Task; onToggle: () => void }) {
  const late = !t.done && isOverdue(t.dueDate);
  const card = useTaskPanel();
  return (
    <li className="grid min-h-12 items-center gap-4" style={{ gridTemplateColumns: "16px minmax(0,1fr) 22px 64px", borderBottom: `1px solid ${B.l7}` }}>
      <QuietCheck done={t.done} onClick={onToggle} label={t.title} />
      <button
        type="button"
        onClick={() => card.open(t.id)}
        title="Открыть задачу"
        className="min-w-0 truncate text-left outline-none underline-offset-4 decoration-white/30 hover:underline focus-visible:underline"
        style={{ ...T.body, color: t.done ? B.text4 : B.text, textDecoration: t.done ? "line-through" : undefined }}
      >
        {t.title}
      </button>
      <span className="flex justify-end">{PRIORITY_BARS[t.priority] ? <Signal value={PRIORITY_BARS[t.priority]} on={B.text3} w={4} h={10} /> : null}</span>
      <span className="text-right" style={{ ...T.meta, color: late ? B.danger : B.text3, ...tab }}>
        {t.done ? (t.completedAt ? formatDate(t.completedAt) : "") : t.dueDate ? dueLabel(t.dueDate) : "без срока"}
      </span>
    </li>
  );
}

/** Task checkbox without the lime fill (lime is reserved for «today» on this screen): done = white. */
function QuietCheck({ done, onClick, label }: { done: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `Вернуть в работу: ${label}` : `Готово: ${label}`}
      className="flex h-4 w-4 shrink-0 items-center justify-center outline-none transition-colors duration-200 hover:!shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)] focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
      style={{ background: done ? B.text2 : "transparent", boxShadow: done ? undefined : `inset 0 0 0 1px ${B.l20}` }}
    >
      {done && <ThinCheck size={10} color={B.bg} />}
    </button>
  );
}
