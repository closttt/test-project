/**
 * «Индекс» · Фокус — full-screen, outside the shell (parity with pages/FocusPage.tsx).
 *
 * Left: the stage — a dotted halo that fills with the pomodoro phase (the screen's one graphic),
 * a huge clock inside it, the current task under the clock, three quiet controls below.
 * Right: «Сегодня» — overdue + due-today tasks (snoozed hidden), open first, check to close,
 * click to open the shared task card, «Фокус ↳» to start a pomodoro on a task.
 * One lime element: «Начать» while idle, the live marker while the clock runs.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { usePomodoro, phaseLabel, formatClock } from "@/store/PomodoroProvider";
import { isToday, isOverdue, dueLabel, localDayStr } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import { B, T, tab, pad2, display, Mark, Check, Button, Hook, Line, Empty, plural } from "@/design-lab/screens/_kit/index";
import { useTaskActions, useTaskPanel } from "@/design-lab/screens/_kit/index-ui";
import { PomodoroSettingsButton } from "../overlays/PomodoroMenu";
import { RoundMarks, usePomodoroView } from "../overlays/Pomodoro";

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Halo — concentric rings of square dots; the lit arc is the phase progress
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const RINGS = 7;
const R0 = 228;
const GAP = 11;

function Halo({ pct, running, full }: { pct: number; running: boolean; full: boolean }) {
  const dots = useMemo(() => {
    const out: { x: number; y: number; a: number; k: number }[] = [];
    for (let k = 0; k < RINGS; k++) {
      const r = R0 + k * GAP;
      const n = Math.round((2 * Math.PI * r) / 10);
      for (let i = 0; i < n; i++) {
        const a = i / n; // 0..1 clockwise from 12 o'clock
        const t = a * Math.PI * 2 - Math.PI / 2;
        out.push({ x: Math.cos(t) * r, y: Math.sin(t) * r, a, k });
      }
    }
    return out;
  }, []);
  const size = (R0 + RINGS * GAP) * 2 + 8;
  const p = full ? 1 : pct;
  // Outer rings fade out — the halo dissolves into the black instead of ending on a hard edge.
  const fade = (k: number) => 1 - k / (RINGS + 0.5);
  // Head of the arc: the few dots at the progress angle on the inner ring.
  const head = p > 0 && p < 1;
  return (
    <svg aria-hidden viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2">
      {dots.map((d, i) => {
        const lit = d.a < p;
        const isHead = head && running && d.k < 3 && d.a <= p && p - d.a < 0.01;
        const s = d.k === 0 ? 2.6 : 2.2;
        return (
          <rect
            key={i}
            x={d.x - s / 2}
            y={d.y - s / 2}
            width={s}
            height={s}
            fill={isHead ? B.lime : "#fff"}
            opacity={isHead ? 1 : lit ? 0.85 * fade(d.k) : 0.16 * fade(d.k)}
            style={{ transition: "opacity .6s linear" }}
          />
        );
      })}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const ctl =
  "h-9 outline-none transition-colors duration-150 hover:!text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-30";

export default function Focus() {
  const navigate = useNavigate();
  const { tasks, settings } = useData();
  const pomodoro = usePomodoro();
  const v = usePomodoroView();
  const act = useTaskActions();
  const panel = useTaskPanel();
  const [celebrated, setCelebrated] = useState(false);

  // Same set as the real page (overdue + due today, snoozed hidden), except that a task closed on
  // an earlier day no longer counts as «today» — otherwise every old overdue-then-done task piles up.
  const focusTasks = tasks
    .filter((t) => t.dueDate && !isSnoozed(t) && (isToday(t.dueDate) || isOverdue(t.dueDate)))
    .filter((t) => !t.done || isToday(t.dueDate!) || (t.completedAt ? isToday(localDayStr(new Date(t.completedAt))) : false))
    .sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  const total = focusTasks.length;
  const done = focusTasks.filter((t) => t.done).length;
  const open = total - done;
  const nextUp = focusTasks.find((t) => !t.done);
  /** The task under the clock: the pomodoro's own, else the next open one of the day. */
  const current = v.task ?? (v.active ? undefined : nextUp);

  // Esc leaves focus — unless a menu / the task card is open (they take Esc first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("[data-float-menu], [role=dialog]")) return;
      navigate("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  function toggle(id: string, wasOpen: boolean) {
    const t = focusTasks.find((x) => x.id === id);
    if (!t) return;
    act.toggle(t);
    if (wasOpen && open === 1) {
      setCelebrated(true);
      setTimeout(() => setCelebrated(false), 1600);
    }
  }

  const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const clock = v.active ? v.remaining : settings.pomodoro.workMin * 60;
  const phaseLine = v.active ? `${phaseLabel(v.phase)}${v.running ? "" : " · пауза"}` : "Готов к фокусу";

  return (
    <div className="relative flex h-screen min-h-[640px] flex-col overflow-hidden antialiased" style={{ background: B.bg, color: B.text, fontFamily: B.font }}>
      {/* ── rail ─────────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex h-16 shrink-0 items-center justify-between px-10" style={{ borderBottom: `1px solid ${B.l7}` }}>
        <div className="flex items-center gap-4">
          <Mark />
          <span style={T.bodyStrong}>Фокус</span>
          <span className="first-letter:uppercase" style={{ ...T.meta, color: B.text3 }}>
            {today}
          </span>
        </div>
        <button type="button" onClick={() => navigate("/")} className={`flex items-center gap-3 ${ctl}`} style={{ ...T.body, color: B.text2 }} title="Выйти из фокуса">
          Выйти <span style={{ ...T.meta, color: B.off }}>Esc</span>
        </button>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "minmax(0,1fr) clamp(360px, 32vw, 460px)" }}>
        {/* ── stage ──────────────────────────────────────────────────────── */}
        <section className="relative flex min-w-0 flex-col items-center justify-center px-10 pb-10">
          <div className="relative flex aspect-square w-[min(100%,calc(100vh-200px),600px)] items-center justify-center">
            <Halo pct={v.active ? v.pct : 0} running={v.running} full={celebrated} />
            <div className="relative flex w-[72%] flex-col items-center text-center">
              <div className="flex items-center gap-3">
                {v.active && (
                  <span
                    aria-hidden
                    className={`h-[6px] w-[6px] ${v.running ? "animate-pulse" : ""}`}
                    style={{ background: v.running ? B.text : B.text3 }}
                  />
                )}
                <span style={{ ...T.caps, color: v.active ? B.text2 : B.text3 }}>{celebrated ? "День закрыт" : phaseLine}</span>
                {v.active && <RoundMarks rounds={v.rounds} done={v.doneInCycle} />}
              </div>
              <div
                className="mt-5"
                style={{
                  ...display(160, { lineHeight: 0.86, letterSpacing: "-0.06em", fontWeight: 400 }),
                  ...tab,
                  fontSize: "clamp(96px, 11vw, 168px)",
                  color: v.active && v.running ? B.text : v.active ? B.text2 : B.text,
                }}
              >
                {formatClock(clock)}
              </div>
              <div className="mt-7 min-h-[52px] max-w-full">
                {current ? (
                  <button
                    type="button"
                    onClick={() => panel.open(current.id)}
                    className="line-clamp-2 outline-none transition-colors hover:text-white"
                    style={{ ...T.title, fontSize: 22, color: B.text2 }}
                    title="Открыть задачу"
                  >
                    {current.title}
                  </button>
                ) : (
                  <span style={{ ...T.title, fontSize: 22, color: B.text3 }}>{v.phase === "work" || !v.active ? "Без задачи" : "Отдохни"}</span>
                )}
                <div className="mt-2" style={{ ...T.meta, color: B.text3, ...tab }}>
                  {v.active
                    ? v.elapsedMin > 0
                      ? `${v.elapsedMin} мин в фокусе`
                      : v.phase === "work"
                        ? "фокус начался"
                        : "перерыв"
                    : current
                      ? "следующая задача дня"
                      : `${settings.pomodoro.workMin} / ${settings.pomodoro.shortBreakMin} мин`}
                </div>
              </div>
            </div>
          </div>

          {/* controls */}
          <div className="relative mt-4 flex items-center gap-8">
            {v.active ? (
              <>
                <Button variant="outline" onClick={() => (v.running ? v.pause() : v.resume())}>
                  {v.running ? "Пауза" : "Продолжить"}
                </Button>
                <button type="button" onClick={v.skip} className={ctl} style={{ ...T.body, color: B.text3 }} title="Пропустить фазу">
                  Пропустить
                </button>
                <button type="button" onClick={v.finishEarly} className={`${ctl} hover:!text-[#FF5A36]`} style={{ ...T.body, color: B.text3 }} title={v.finishTitle}>
                  Завершить
                </button>
              </>
            ) : (
              <Button size="lg" onClick={() => pomodoro.start(current?.id)}>
                Начать фокус
              </Button>
            )}
            <PomodoroSettingsButton size={36} />
          </div>
        </section>

        {/* ── today ──────────────────────────────────────────────────────── */}
        <aside className="flex min-h-0 flex-col" style={{ borderLeft: `1px solid ${B.l10}` }}>
          <div className="shrink-0 px-8 pt-8">
            <div className="flex items-end justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <span style={{ ...T.num, color: B.off }}>01</span>
                <h2 style={T.displayS}>Сегодня</h2>
              </div>
              <span style={{ ...T.meta, color: B.text3, ...tab }}>
                {total === 0 ? "задач нет" : `${done} из ${total} · осталось ${open}`}
              </span>
            </div>
            {total > 0 && (
              <div className="mt-5">
                <Line pct={(done / total) * 100} color={B.text2} />
              </div>
            )}
          </div>

          {total === 0 || open === 0 ? (
            <div className="flex flex-1 flex-col justify-center px-8 pb-16">
              <Empty
                seed={total === 0 ? 7 : 19}
                height={120}
                title={total === 0 ? "На сегодня чисто" : "Все задачи дня закрыты"}
                text={total === 0 ? "Ничего не горит. Можно спланировать день или отдохнуть." : "Отличная работа. Наслаждайся ощущением пустого списка."}
              />
              <div className="mt-6">
                <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                  На дашборд
                </Button>
              </div>
            </div>
          ) : (
            <ol className="mt-6 min-h-0 flex-1 overflow-y-auto px-8 pb-10">
              {focusTasks.map((t, i) => {
                const overdue = !t.done && isOverdue(t.dueDate);
                const live = pomodoro.activeTaskId === t.id && pomodoro.phase === "work";
                return (
                  <li
                    key={t.id}
                    className="group grid min-h-[56px] items-center gap-4 py-2"
                    style={{ gridTemplateColumns: "20px 16px minmax(0,1fr) auto", borderBottom: `1px solid ${B.l7}` }}
                  >
                    <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                    <Check done={t.done} onClick={() => toggle(t.id, !t.done)} label={t.title} />
                    <button type="button" onClick={() => panel.open(t.id)} className="min-w-0 text-left outline-none">
                      <span
                        className="block truncate transition-colors group-hover:text-white"
                        style={{ ...T.body, color: t.done ? B.text4 : live ? B.text : B.text2, textDecoration: t.done ? "line-through" : undefined }}
                      >
                        {t.title}
                      </span>
                      {overdue && (
                        <span className="mt-0.5 block" style={{ ...T.meta, color: B.danger, ...tab }}>
                          {dueLabel(t.dueDate!)}
                        </span>
                      )}
                    </button>
                    {!t.done &&
                      (live ? (
                        <span style={{ ...T.meta, color: B.text }}>идёт</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => pomodoro.start(t.id)}
                          className="flex items-center gap-1.5 opacity-0 outline-none transition-opacity duration-150 hover:!text-white focus-visible:opacity-100 group-hover:opacity-100"
                          style={{ ...T.meta, color: B.text3 }}
                          title="Помодоро на эту задачу"
                        >
                          <Hook size={11} /> Фокус
                        </button>
                      ))}
                  </li>
                );
              })}
              <li className="pt-4" style={{ ...T.meta, color: B.off }}>
                {open} {plural(open, "задача", "задачи", "задач")} до конца дня
              </li>
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
