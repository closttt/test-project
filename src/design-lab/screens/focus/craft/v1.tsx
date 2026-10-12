/**
 * Фокус · Craft Dark — the full-screen «Фокус на сегодня», reworked with more on one screen
 * (owner, 2026-10-12: «доработать функционал focus, расположить чуть больше информации»).
 *
 *   ┌ Фокус · date ──────────────────────── n из нормы · просрочено · фокус мин ·  [Выйти] ┐
 *   │ ┌ Сейчас ─────────────────────────────┐ ┌ Норма дня (ring) ───────────────────────┐ │
 *   │ │ title · chips · due                 │ │ closed / goal · осталось                │ │
 *   │ │ subtasks (tick, add)                │ ├ Таймер (pomodoro on this task) ─────────┤ │
 *   │ │ [Готово] [Следующая] [Открыть]      │ ├ Встречи сегодня (join) ─────────────────┤ │
 *   │ ├ Очередь · N (click → make current) ─┤ ├ Закрыто сегодня ────────────────────────┤ │
 *   └──────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Keys: Esc — exit, Enter — close the current task, ↓/↑ — next/previous in the queue.
 * Data: the same store and actions as everywhere (toggleTask, toggleSubtask, addSubtask,
 * toggleMeeting, pomodoro); nothing is written on open.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Check, Pause, Play, Plus, SkipForward, Square, Target, Video, X } from "lucide-react";

import { Btn, C, R, Ring, T, TONE, dashed, plural, rootStyle } from "@/design-lab/screens/_kit/craft";
import { TagChips } from "@/design-lab/screens/_kit/controls";
import { PrioChip, ProjectChip, RoundCheckBtn, SubCount, TaskEditor, TimeMeta, useTasksModel } from "@/design-lab/screens/tasks/craft/_parts";
import { useData } from "@/store/DataProvider";
import { usePomodoro } from "@/store/PomodoroProvider";
import { dueLabel, formatDuration, isOverdue, isToday, localDayStr, todayStr } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import { meetingStart } from "@/lib/meetingAlerts";
import type { Meeting, Task } from "@/types";

const MIN = 60 * 1000;
const PRIO_RANK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
const hhmm = (t: number) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Panel({ title, right, children, className = "" }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col p-6 ${className}`} style={{ background: C.card, borderRadius: R.card }}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 style={T.title}>{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// ── Сейчас — the current task, big ──────────────────────────────────────────────────────────

function Current({ t, projectName, onDone, onNext, onOpen, hasNext }: { t: Task; projectName?: string; onDone: () => void; onNext: () => void; onOpen: () => void; hasNext: boolean }) {
  const { toggleSubtask, addSubtask } = useData();
  const [sub, setSub] = useState("");
  const overdue = !t.done && isOverdue(t.dueDate);
  const subsDone = t.subtasks.filter((s) => s.done).length;
  return (
    <Panel>
      <div className="flex items-center gap-2" style={{ ...T.foot, color: C.text3 }}>
        <Target size={14} strokeWidth={1.75} color={C.accent} /> Сейчас в работе
      </div>
      <h1 className="mt-3" style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 500, letterSpacing: "-0.03em" }}>
        {t.title}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PrioChip p={t.priority} />
        {t.projectId && projectName && <ProjectChip id={t.projectId} name={projectName} />}
        <TagChips tags={t.tags} max={4} />
        <SubCount t={t} />
        <TimeMeta t={t} />
        {t.dueDate && (
          <span style={{ ...T.foot, color: overdue ? C.amber : C.text3 }}>{overdue ? `просрочено · ${dueLabel(t.dueDate)}` : dueLabel(t.dueDate)}</span>
        )}
      </div>
      {t.description && (
        <p className="mt-4 line-clamp-4 whitespace-pre-line" style={{ ...T.body, fontSize: 15, lineHeight: 1.5, color: C.text2 }}>
          {t.description}
        </p>
      )}

      <div className="mt-5">
          <div className="mb-1 flex items-center justify-between" style={{ ...T.foot, color: C.text3 }}>
            <span>Подзадачи</span>
            {t.subtasks.length > 0 && (
              <span style={T.num}>
                {subsDone}/{t.subtasks.length}
              </span>
            )}
          </div>
          {t.subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5" style={dashed}>
              <RoundCheckBtn size={18} done={s.done} onChange={() => toggleSubtask(t.id, s.id)} />
              <span style={{ fontSize: 15, color: s.done ? C.text3 : C.text, textDecoration: s.done ? "line-through" : undefined }}>{s.title}</span>
            </div>
          ))}
          <form
            className="flex items-center gap-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sub.trim()) return;
              addSubtask(t.id, sub.trim());
              setSub("");
            }}
          >
            <Plus size={16} strokeWidth={1.75} color={C.text3} className="ml-0.5 shrink-0" />
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="Подзадача"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
              style={{ fontSize: 15, color: C.text }}
            />
          </form>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Btn icon={<Check size={16} strokeWidth={2} />} onClick={onDone}>
          Готово
        </Btn>
        {hasNext && (
          <Btn kind="ghost" icon={<ArrowDown size={16} strokeWidth={1.75} />} onClick={onNext}>
            Следующая
          </Btn>
        )}
        <Btn kind="ghost" onClick={onOpen}>
          Открыть задачу
        </Btn>
      </div>
    </Panel>
  );
}

// ── Таймер — the pomodoro, bound to the current task ────────────────────────────────────────

function Timer({ taskId }: { taskId?: string }) {
  const p = usePomodoro();
  const { pomodoroSessions } = useData();
  const today = todayStr();
  const focusMin = pomodoroSessions.filter((s) => s.date === today && s.kind === "work").reduce((s, x) => s + x.minutes, 0);
  const active = p.phase !== "idle";
  const pct = active && p.total ? ((p.total - p.remaining) / p.total) * 100 : 0;
  const onThis = active && p.activeTaskId === taskId;
  const label = p.phase === "work" ? "Фокус" : p.phase === "short" ? "Перерыв" : p.phase === "long" ? "Большой перерыв" : "Таймер";
  return (
    <Panel title="Таймер" right={<span style={{ ...T.foot, color: C.text3 }}>сегодня {formatDuration(focusMin)}</span>}>
      <div className="flex items-center gap-5">
        <Ring pct={pct} size={92} stroke={6}>
          <span style={{ ...T.num, fontSize: 20 }}>{active ? mmss(p.remaining) : "25:00"}</span>
        </Ring>
        <div className="min-w-0">
          <div style={{ ...T.cell, fontWeight: 500 }}>{label}</div>
          <div className="mt-1" style={{ ...T.foot, color: C.text3 }}>
            {active ? (onThis ? "на текущую задачу" : "идёт по другой задаче") : "запусти на текущую задачу"}
            {p.round > 0 ? ` · раунд ${p.round}` : ""}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {!active ? (
              <Btn size={36} icon={<Play size={14} strokeWidth={2} />} onClick={() => p.start(taskId)}>
                Старт
              </Btn>
            ) : (
              <>
                <Btn size={36} icon={p.running ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />} onClick={() => (p.running ? p.pause() : p.resume())}>
                  {p.running ? "Пауза" : "Дальше"}
                </Btn>
                <Btn size={36} kind="ghost" icon={<SkipForward size={14} strokeWidth={1.75} />} onClick={p.skip}>
                  Пропустить
                </Btn>
                <Btn size={36} kind="ghost" icon={<Square size={12} strokeWidth={2} />} onClick={p.finishEarly}>
                  Стоп
                </Btn>
              </>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── Встречи сегодня ─────────────────────────────────────────────────────────────────────────

function Meetings({ list, now, onToggle }: { list: Meeting[]; now: number; onToggle: (id: string) => void }) {
  return (
    <Panel title="Встречи сегодня" right={<span style={{ ...T.foot, color: C.text3 }}>{list.length || "нет"}</span>}>
      {list.length === 0 ? (
        <div style={{ ...T.body, color: C.text3 }}>Встреч нет — весь день на фокус</div>
      ) : (
        list.map((mt) => {
          const start = meetingStart(mt);
          const end = start + (mt.durationMin || 30) * MIN;
          const live = !mt.done && now >= start && now < end;
          const soon = !mt.done && !live && start > now && start - now <= 15 * MIN;
          const past = mt.done || now >= end;
          return (
            <div key={mt.id} className="flex items-center gap-3 py-3" style={{ ...dashed, opacity: past && !live ? 0.5 : 1 }}>
              <RoundCheckBtn size={18} done={!!mt.done} onChange={() => onToggle(mt.id)} />
              <div className="min-w-0 flex-1">
                <div style={{ ...T.foot, ...T.num, color: live ? "#5AA9FF" : soon ? C.amber : C.text3 }}>
                  {mt.time ? `${hhmm(start)}–${hhmm(end)}` : "весь день"}
                  {live ? " · идёт" : soon ? ` · через ${Math.max(1, Math.ceil((start - now) / MIN))} мин` : ""}
                </div>
                <div className="truncate" style={{ fontSize: 15, color: C.text, textDecoration: mt.done ? "line-through" : undefined }}>
                  {mt.title}
                </div>
              </div>
              {mt.url && !past && (
                <a
                  href={mt.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1.5 px-3 transition-[filter] hover:brightness-110"
                  style={{ height: 32, borderRadius: 999, fontSize: 13, background: live || soon ? C.accent : "rgba(10,132,255,0.14)", color: live || soon ? "#fff" : "#5AA9FF" }}
                >
                  <Video size={14} strokeWidth={1.75} /> Подключиться
                </a>
              )}
            </div>
          );
        })
      )}
    </Panel>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────

export default function FocusCraft() {
  const navigate = useNavigate();
  const m = useTasksModel();
  const { tasks, projects, meetings, toggleTask, toggleMeeting, gamification, completionLog } = useData();
  const now = useNow();
  const today = todayStr();
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  // Today's work: due today or overdue, not snoozed. Open ones by priority, then by date.
  const open = useMemo(
    () =>
      tasks
        .filter((t) => !t.done && !t.archivedAt && t.dueDate && !isSnoozed(t) && (isToday(t.dueDate) || isOverdue(t.dueDate)))
        .sort((a, b) => PRIO_RANK[a.priority ?? 0] - PRIO_RANK[b.priority ?? 0] || (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [tasks]
  );
  const closedToday = useMemo(
    () => tasks.filter((t) => t.done && t.completedAt && localDayStr(new Date(t.completedAt)) === today).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [tasks, today]
  );
  const todaysMeetings = useMemo(() => meetings.filter((mt) => mt.date === today).sort((a, b) => (a.time || "").localeCompare(b.time || "")), [meetings, today]);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = open.find((t) => t.id === currentId) ?? open[0];
  const idx = current ? open.indexOf(current) : -1;
  const queue = open.filter((t) => t.id !== current?.id);
  const [editId, setEditId] = useState<string | null>(null);

  const goal = Math.max(1, gamification.dailyGoal || 5);
  const closedCount = completionLog[today] ?? closedToday.length;
  const pct = Math.min(100, (closedCount / goal) * 100);
  const overdueCount = open.filter((t) => isOverdue(t.dueDate)).length;

  const next = () => open.length > 1 && setCurrentId(open[(idx + 1) % open.length].id);
  const prev = () => open.length > 1 && setCurrentId(open[(idx - 1 + open.length) % open.length].id);
  const done = () => {
    if (!current) return;
    const after = open[idx + 1] ?? open[idx - 1];
    toggleTask(current.id);
    setCurrentId(after?.id ?? null);
  };

  const keys = useRef({ next, prev, done });
  keys.current = { next, prev, done };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (editId || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") navigate("/");
      else if (e.key === "Enter") {
        e.preventDefault();
        keys.current.done();
      } else if (e.key === "ArrowDown" || e.key === "j") keys.current.next();
      else if (e.key === "ArrowUp" || e.key === "k") keys.current.prev();
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [editId, navigate]);

  const dateLabel = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen px-4 py-5 lg:px-8 lg:py-8" style={rootStyle}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 px-1 pb-2">
          <div className="flex items-center gap-4">
            <span className="grid place-items-center" style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(180deg,#3D9DFF 0%,#0A6CF0 100%)" }}>
              <Target size={22} strokeWidth={1.9} color="#fff" />
            </span>
            <div>
              <h1 style={{ fontSize: 32, lineHeight: 1.05, fontWeight: 500, letterSpacing: "-0.035em" }}>Фокус на сегодня</h1>
              <div className="mt-1" style={{ ...T.body, color: C.text3 }}>
                {dateLabel} · {open.length ? `${open.length} ${plural(open.length, "задача", "задачи", "задач")} в работе` : "всё закрыто"}
                {overdueCount > 0 && <span style={{ color: C.amber }}> · {overdueCount} просрочено</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline" style={{ ...T.foot, color: C.text3 }}>
              Enter — готово · ↓↑ — следующая · Esc — выйти
            </span>
            <Btn kind="ghost" icon={<X size={16} strokeWidth={1.75} />} onClick={() => navigate("/")}>
              Выйти
            </Btn>
          </div>
        </header>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          {/* Left: now + queue */}
          <div className="flex min-w-0 flex-col gap-3">
            {current ? (
              <Current
                key={current.id}
                t={current}
                projectName={current.projectId ? projectName.get(current.projectId) : undefined}
                onDone={done}
                onNext={next}
                onOpen={() => setEditId(current.id)}
                hasNext={open.length > 1}
              />
            ) : (
              <Panel>
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <span className="grid place-items-center" style={{ width: 56, height: 56, borderRadius: 999, background: TONE.green.bg, color: TONE.green.fg }}>
                    <Check size={26} strokeWidth={2} />
                  </span>
                  <div style={{ fontSize: 22, fontWeight: 500 }}>{closedToday.length ? "Все задачи дня закрыты" : "На сегодня чисто"}</div>
                  <div style={{ ...T.body, color: C.text3 }}>{closedToday.length ? `Закрыто сегодня: ${closedToday.length}` : "Ничего не горит"}</div>
                  <Btn kind="ghost" onClick={() => navigate("/tasks")}>
                    К задачам
                  </Btn>
                </div>
              </Panel>
            )}

            {queue.length > 0 && (
              <Panel title={`Очередь · ${queue.length}`}>
                {queue.map((t) => {
                  const overdue = isOverdue(t.dueDate);
                  return (
                    <div key={t.id} className="group flex items-center gap-3 py-3" style={dashed}>
                      <RoundCheckBtn size={18} done={t.done} onChange={() => toggleTask(t.id)} />
                      <button type="button" onClick={() => setCurrentId(t.id)} className="min-w-0 flex-1 text-left" title="Сделать текущей">
                        <div className="truncate transition-colors group-hover:text-white" style={{ fontSize: 15, color: C.text }}>
                          {t.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <PrioChip p={t.priority} />
                          {t.projectId && projectName.get(t.projectId) && (
                            <span style={{ ...T.foot, color: C.text3 }}>{projectName.get(t.projectId)}</span>
                          )}
                          <TagChips tags={t.tags} />
                          <SubCount t={t} />
                        </div>
                      </button>
                      {t.dueDate && (
                        <span className="shrink-0" style={{ ...T.foot, color: overdue ? C.amber : C.text3 }}>
                          {dueLabel(t.dueDate)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </Panel>
            )}
          </div>

          {/* Right: norm, timer, meetings, closed */}
          <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-5">
            <Panel title="Норма дня">
              <div className="flex items-center gap-5">
                <Ring pct={pct} size={92} stroke={6}>
                  <span style={{ ...T.num, fontSize: 20 }}>{Math.round(pct)}%</span>
                </Ring>
                <div>
                  <div style={{ ...T.num, fontSize: 28 }}>
                    {closedCount} <span style={{ color: C.text3, fontWeight: 400, fontSize: 18 }}>из {goal}</span>
                  </div>
                  <div className="mt-1" style={{ ...T.foot, color: C.text3 }}>
                    {closedCount >= goal ? "норма выполнена" : `осталось ${goal - closedCount} до нормы`}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-1.5" style={{ height: 8 }}>
                {Array.from({ length: goal }, (_, i) => (
                  <span key={i} className="flex-1" style={{ borderRadius: 999, background: i < closedCount ? C.accent : C.line2 }} />
                ))}
              </div>
            </Panel>

            <Timer taskId={current?.id} />

            <Meetings list={todaysMeetings} now={now} onToggle={toggleMeeting} />

            <Panel title="Закрыто сегодня" right={<span style={{ ...T.foot, ...T.num, color: C.text3 }}>{closedToday.length}</span>}>
              {closedToday.length === 0 ? (
                <div style={{ ...T.body, color: C.text3 }}>Пока ничего — первая задача ждёт</div>
              ) : (
                closedToday.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-2.5" style={dashed}>
                    <RoundCheckBtn size={16} done onChange={() => toggleTask(t.id)} />
                    <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14, color: C.text3, textDecoration: "line-through" }}>
                      {t.title}
                    </span>
                    <span className="shrink-0" style={{ ...T.foot, ...T.num, color: C.text3 }}>
                      {t.completedAt ? hhmm(new Date(t.completedAt).getTime()) : ""}
                    </span>
                  </div>
                ))
              )}
              {closedToday.length > 8 && <div className="pt-2" style={{ ...T.foot, color: C.text3 }}>и ещё {closedToday.length - 8}</div>}
            </Panel>
          </div>
        </div>
      </div>

      {editId && <TaskEditor taskId={editId} m={m} onClose={() => setEditId(null)} />}
    </div>
  );
}
