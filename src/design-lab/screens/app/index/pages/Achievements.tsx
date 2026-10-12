/**
 * «Индекс» · Достижения — the full version of Analytics § 05 «Уровень и достижения».
 * Header (orb) → Stats (уровень · серия · достижения · фокус) → 01 level: a huge numeral + KV →
 * 02 quests of the day · 03 month marathon → 04 records · 05 activity → 06 all achievements as a
 * numbered three-column index with a quiet filter.
 *
 * Numbers come from the same functions as Analytics (levelProgress, computeGameStats over
 * allTasks, questsForDay, seasonProgress), so both screens always agree. One lime element: the
 * level progress line — the «where am I now» marker.
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { ACHIEVEMENTS, levelProgress } from "@/lib/gamification";
import { computeGameStats } from "@/lib/gameStats";
import { questsForDay, seasonProgress } from "@/lib/quests";
import { formatDate, formatDuration, localDayStr, todayStr } from "@/lib/format";
import { LEVEL_TITLES, levelTitle, type AppData } from "@/types";
import { B, T, tab, pad2, display, Page, PageHeader, SectionHead, Stats, Line, KV, ThinCheck, plural } from "@/design-lab/screens/_kit/index";
import { Seg } from "@/design-lab/screens/_kit/index-ui";

type Filter = "all" | "got" | "ahead";
const days = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;

export default function Achievements() {
  const data = useData();
  const { gamification } = data;
  const appData = useMemo(() => ({ ...data, tasks: data.allTasks }) as AppData, [data]);
  const stats = useMemo(() => computeGameStats(appData), [appData]);
  const lvl = levelProgress(gamification.xp);
  const today = todayStr();
  const quests = questsForDay(today);
  const season = seasonProgress(appData);
  const unlocked = ACHIEVEMENTS.filter((a) => gamification.achievements.includes(a.id)).length;
  const [filter, setFilter] = useState<Filter>("all");
  const nextTitle = lvl.level < LEVEL_TITLES.length ? levelTitle(lvl.level + 1) : null;

  const shown = ACHIEVEMENTS.map((a, i) => ({ a, n: i + 1, got: gamification.achievements.includes(a.id) })).filter((x) =>
    filter === "all" ? true : filter === "got" ? x.got : !x.got
  );
  const third = Math.ceil(shown.length / 3);
  const cols = [shown.slice(0, third), shown.slice(third, third * 2), shown.slice(third * 2)];

  return (
    <Page>
      <PageHeader
        title="Достижения"
        deck={
          <>
            Уровень {lvl.level} · {levelTitle(lvl.level)}. {gamification.xp.toLocaleString("ru-RU")} XP, до уровня {lvl.level + 1} — {lvl.toNext} XP.
          </>
        }
        graphic="orb"
        seed={23}
      />

      {!gamification.enabled && (
        <p className="mb-8 py-4" style={{ ...T.body, color: B.text3, borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l7}` }}>
          Геймификация выключена — опыт и квесты сейчас не начисляются.{" "}
          <Link to="/settings" className="transition-colors hover:text-white" style={{ color: B.text2 }}>
            Включить в настройках ↳
          </Link>
        </p>
      )}

      <Stats
        items={[
          { k: "Уровень", v: lvl.level, sub: levelTitle(lvl.level) },
          { k: "Серия", v: days(stats.streak), sub: `рекорд ${days(gamification.bestStreak)}` },
          { k: "Достижения", v: `${unlocked}/${ACHIEVEMENTS.length}`, sub: `${Math.round((unlocked / ACHIEVEMENTS.length) * 100)}% открыто` },
          { k: "Фокус", v: formatDuration(stats.focusMinTotal), sub: `${stats.pomodoros} ${plural(stats.pomodoros, "помодоро", "помодоро", "помодоро")} за всё время` },
        ]}
      />

      {/* ── 01 Уровень ───────────────────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <SectionHead n="01" title="Уровень" meta={`${gamification.xp.toLocaleString("ru-RU")} XP`} />
        <div className="mt-8 grid grid-cols-4 gap-x-5">
          <div className="col-span-2 flex min-w-0 items-end gap-6 pr-5">
            <span style={{ ...display(168), ...tab, lineHeight: 0.8 }}>{lvl.level}</span>
            <span className="min-w-0 pb-2">
              <span className="block truncate" style={T.displayS}>
                {levelTitle(lvl.level)}
              </span>
              <span className="mt-2 block" style={{ ...T.meta, color: B.text3 }}>
                {nextTitle ? `дальше — «${nextTitle}»` : "высший титул"}
              </span>
            </span>
          </div>
          <div className="col-span-2 min-w-0">
            <div style={{ borderTop: `1px solid ${B.l10}` }}>
              <KV k="Опыт в уровне" v={`${lvl.inLevel.toLocaleString("ru-RU")} из ${lvl.span.toLocaleString("ru-RU")} XP`} py={10} />
              <KV k={`До уровня ${lvl.level + 1}`} v={`${lvl.toNext.toLocaleString("ru-RU")} XP`} py={10} />
              <KV k="За задачу" v="10–20 XP, по приоритету" py={10} />
            </div>
            <div className="pb-1 pt-5">
              <Line pct={lvl.pct} color={B.lime} />
              <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.text3, ...tab }}>
                <span>ур. {lvl.level}</span>
                <span>{Math.round(lvl.pct)}%</span>
                <span>ур. {lvl.level + 1}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 02 Квесты дня · 03 Марафон месяца ────────────────────────────────────────────── */}
      <div className="mt-20 grid grid-cols-4 gap-x-5">
        <section className="col-span-2 min-w-0 pr-5">
          <SectionHead n="02" title="Квесты дня" size="s" meta="обновляются каждый день" />
          <ol className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
            {quests.map((q, i) => {
              const progress = Math.min(q.progress(appData, today), q.target);
              const done = progress >= q.target;
              return (
                <li key={q.id} className="grid min-h-[64px] items-center gap-4 py-3" style={{ gridTemplateColumns: "28px 14px minmax(0,1fr) 88px 56px", borderBottom: `1px solid ${B.l7}` }}>
                  <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                  <span
                    className="flex h-3.5 w-3.5 items-center justify-center"
                    aria-label={done ? "Выполнен" : "Не выполнен"}
                    style={{ boxShadow: `inset 0 0 0 1px ${done ? B.text : B.l20}`, background: done ? B.text : undefined }}
                  >
                    {done && <ThinCheck size={9} color={B.bg} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate" style={{ ...T.bodyL, color: done ? B.text4 : B.text }}>
                      {q.title}
                    </span>
                    <span className="mt-0.5 block" style={{ ...T.meta, color: B.text3, ...tab }}>
                      {done ? "выполнен" : `${progress} из ${q.target}`}
                    </span>
                  </span>
                  <Line pct={(progress / q.target) * 100} color={done ? B.text2 : B.text3} />
                  <span className="text-right" style={{ ...T.num, color: done ? B.text : B.text3 }}>
                    +{q.xp} XP
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="col-span-2 min-w-0">
          <SectionHead n="03" title="Марафон месяца" size="s" meta={season.title.replace(/:.*/, "")} />
          <div className="mt-6 flex items-end justify-between gap-6 pb-5" style={{ borderTop: `1px solid ${B.l10}`, paddingTop: 20 }}>
            <span style={{ ...T.displayL, ...tab }}>
              {season.done}
              <span style={{ color: B.off }}>/{season.target}</span>
            </span>
            <span className="pb-1 text-right" style={{ ...T.meta, color: B.text3 }}>
              {season.done >= season.target ? "Цель месяца пройдена" : `до цели ${season.target - season.done} ${plural(season.target - season.done, "задача", "задачи", "задач")}`}
              <br />
              по 2 задачи на каждый день месяца
            </span>
          </div>
          <Line pct={Math.min(100, (season.done / season.target) * 100)} color={B.text2} />
          <MonthDays log={data.completionLog} />
        </section>
      </div>

      {/* ── 04 Рекорды · 05 Активность ───────────────────────────────────────────────────── */}
      <div className="mt-20 grid grid-cols-4 gap-x-5">
        <section className="col-span-2 min-w-0 pr-5">
          <SectionHead n="04" title="Рекорды" size="s" meta="за всё время" />
          <ol className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
            {[
              { k: "Лучшая серия", v: days(gamification.bestStreak) },
              { k: "Задач за день", v: stats.maxTasksInDay },
              { k: "Фокус за день", v: formatDuration(stats.maxFocusMinInDay) },
              { k: "Помодоро за день", v: stats.maxPomodorosInDay },
              { k: "Самая длинная сессия", v: formatDuration(stats.longestFocusSession) },
            ].map((r, i) => (
              <li key={r.k} className="grid h-12 items-center gap-4" style={{ gridTemplateColumns: "28px minmax(0,1fr) auto", borderBottom: `1px solid ${B.l7}` }}>
                <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                <span style={{ ...T.body, color: B.text2 }}>{r.k}</span>
                <span style={{ ...T.title, ...tab }}>{r.v}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="col-span-2 min-w-0">
          <SectionHead n="05" title="Активность" size="s" meta="закрытые задачи · 26 недель" />
          <div className="mt-6">
            <Heatmap log={data.completionLog} weeks={26} />
          </div>
        </section>
      </div>

      {/* ── 06 Все достижения ────────────────────────────────────────────────────────────── */}
      <section className="mt-20">
        <SectionHead n="06" title="Все достижения" meta={`${unlocked} из ${ACHIEVEMENTS.length} получено`} />
        <div className="mt-6">
          <Seg<Filter>
            label="Показать"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `Все · ${ACHIEVEMENTS.length}` },
              { value: "got", label: `Получены · ${unlocked}` },
              { value: "ahead", label: `Впереди · ${ACHIEVEMENTS.length - unlocked}` },
            ]}
          />
        </div>
        {shown.length === 0 ? (
          <p className="mt-6 py-5" style={{ ...T.body, color: B.text3, borderTop: `1px solid ${B.l10}` }}>
            {filter === "got" ? "Пока ни одного — закройте первую задачу." : "Все достижения получены."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-x-5">
            {cols.map((col, ci) => (
              <ol key={ci} className={`min-w-0 ${ci < 2 ? "pr-5" : ""}`} style={{ borderTop: col.length ? `1px solid ${B.l10}` : undefined }}>
                {col.map(({ a, n, got }) => (
                  <li key={a.id} className="grid min-h-[60px] items-center gap-3 py-2" style={{ gridTemplateColumns: "24px minmax(0,1fr) 14px", borderBottom: `1px solid ${B.l7}` }}>
                    <span style={{ ...T.num, color: B.off }}>{pad2(n)}</span>
                    <span className="min-w-0">
                      <span className="block truncate" style={{ ...T.bodyStrong, color: got ? B.text : B.text3 }}>
                        {a.title}
                      </span>
                      <span className="mt-0.5 block truncate" style={{ ...T.meta, color: got ? B.text3 : B.off }}>
                        {a.desc}
                      </span>
                    </span>
                    <span aria-label={got ? "Получено" : "Не получено"} style={{ color: B.text2 }}>
                      {got ? <ThinCheck size={12} /> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Local pieces
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** White-alpha shade for a closed-tasks count (same thresholds as the real ContributionGrid). */
function shade(count: number): string {
  if (count === 0) return B.l7;
  if (count <= 2) return "rgba(255,255,255,0.28)";
  if (count <= 4) return "rgba(255,255,255,0.55)";
  return "rgba(255,255,255,0.9)";
}

/** Month marathon by day: one cell per day, lit when the day kept the 2-a-day pace. */
function MonthDays({ log }: { log: Record<string, number> }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const n = new Date(y, m + 1, 0).getDate();
  const todayDate = now.getDate();
  return (
    <div className="mt-6">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
        {Array.from({ length: n }, (_, i) => {
          const day = i + 1;
          const key = localDayStr(new Date(y, m, day));
          const c = log[key] ?? 0;
          const future = day > todayDate;
          const isToday = day === todayDate;
          return (
            <span
              key={day}
              title={future ? formatDate(key) : `${formatDate(key)}: ${c} ${plural(c, "задача", "задачи", "задач")}`}
              className="h-6"
              style={{
                background: future ? "transparent" : c >= 2 ? B.text2 : c === 1 ? "rgba(255,255,255,0.28)" : B.l7,
                boxShadow: future ? `inset 0 0 0 1px ${B.l7}` : isToday ? `inset 0 0 0 1px ${B.text}` : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.off, ...tab }}>
        <span>1</span>
        <span>сегодня — {todayDate}</span>
        <span>{n}</span>
      </div>
    </div>
  );
}

/** Closed tasks per day, Monday-first columns ending with the current week. */
function Heatmap({ log, weeks }: { log: Record<string, number>; weeks: number }) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  const cols: { key: string; count: number; future: boolean; date: Date }[][] = [];
  for (let c = 0; c < weeks; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const d = new Date(end);
      d.setDate(end.getDate() - ((weeks - 1 - c) * 7 + (6 - r)));
      const key = localDayStr(d);
      col.push({ key, count: log[key] ?? 0, future: d > today, date: d });
    }
    cols.push(col);
  }
  const active = cols.flat().filter((d) => !d.future && d.count > 0).length;
  const months: ReactNode[] = cols.map((col, i) => {
    const first = col[0].date;
    const prev = i ? cols[i - 1][0].date : null;
    return !prev || prev.getMonth() !== first.getMonth() ? first.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "") : "";
  });

  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `20px repeat(${weeks}, minmax(0,1fr))` }}>
        <span />
        {months.map((m, i) => (
          <span key={i} className="h-5 overflow-visible whitespace-nowrap" style={{ ...T.meta, color: B.text3 }}>
            {m}
          </span>
        ))}
        {["Пн", "", "Ср", "", "Пт", "", ""].map((label, r) => (
          <Fragment key={r}>
            <span className="flex items-center" style={{ ...T.meta, fontSize: 10, color: B.off }}>
              {label}
            </span>
            {cols.map((col) => {
              const d = col[r];
              return (
                <span
                  key={d.key}
                  className="aspect-square"
                  title={d.future ? undefined : `${formatDate(d.key)}: ${d.count} ${plural(d.count, "задача", "задачи", "задач")}`}
                  style={{ background: d.future ? "transparent" : shade(d.count) }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between" style={{ ...T.meta, color: B.text3 }}>
        <span style={tab}>
          {active} {plural(active, "активный день", "активных дня", "активных дней")}
        </span>
        <span className="flex items-center gap-1.5">
          меньше
          {[0, 1, 3, 5].map((c) => (
            <span key={c} className="h-2.5 w-2.5" style={{ background: shade(c) }} />
          ))}
          больше
        </span>
      </div>
    </div>
  );
}
