/**
 * «Индекс» · Дашборд — the owner's pick («Редакционный индекс»), made minimal:
 * no «Сверх плана», no money; plan + rhythm + projects up top, then status · meetings · note ·
 * reading as four quiet cells on the four columns. One lime element: «Новая задача».
 *
 * Parity with pages/Dashboard.tsx: dated subtasks in the plan, every task title opens the shared
 * task card, «Открыто» / «За неделю» open their lists, meetings can be added, and the real
 * «Фокус / Виджеты» switch flips the page into one ranked list.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useDashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";
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
  Empty,
  Check,
  Button,
  Hook,
  Signal,
  KV,
  Dither,
  CtaBar,
  PRIORITY_BARS,
  plural,
} from "@/design-lab/screens/_kit/index";
import {
  CasePanel,
  FieldInput,
  FloatMenu,
  Modal,
  PriorityMenuBody,
  Prop,
  Seg,
  useFloat,
  useTaskPanel,
} from "@/design-lab/screens/_kit/index-ui";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { todaySubtaskRows, subPriority } from "@/lib/subtasks";
import { dueLabel, isOverdue, isToday, localDayStr, todayStr } from "@/lib/format";
import { PRIORITY_META, type Priority, type Subtask, type Task } from "@/types";

const FOCUS_MODE_KEY = "crm-dashboard-focus-v1";
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const PLAN_COLS = "28px 16px minmax(0,1fr) 40px 72px";

function readFocus(): boolean {
  try {
    return localStorage.getItem(FOCUS_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Dashboard() {
  const m = useDashboardModel();
  const { tasks, toggleSubtask, updateSubtask, updateTask, addMeeting } = useData();
  const { toast } = useToast();
  const panel = useTaskPanel();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [list, setList] = useState<null | "open" | "week">(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(readFocus);
  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_MODE_KEY, focusMode ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [focusMode]);

  const subs = useMemo(() => todaySubtaskRows(tasks), [tasks]);
  const maxDay = Math.max(1, ...m.dynamics.map((d) => d.value));
  const planDone = m.plan.filter((r) => r.done).length;
  const planTotal = m.plan.length + subs.length;
  const statusTotal = Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll);
  const late = m.plan.filter((r) => r.overdue).length;

  // Same ranking as the real «Фокус»: overdue first, then priority, then the soonest due.
  const ranked = useMemo(
    () =>
      [...m.plan].sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.priority !== b.priority) return (a.priority || 9) - (b.priority || 9);
        return (a.due ?? "").localeCompare(b.due ?? "");
      }),
    [m.plan]
  );

  const toggleTask = (r: TodayRow) => m.actions.toggle(r.id);
  const setPriority = (id: string, p: Priority) => updateTask(id, { priority: p });

  const addForm = (
    <form
      className="flex h-14 items-center gap-4"
      style={{ borderBottom: `1px solid ${B.l7}` }}
      onSubmit={(e) => {
        e.preventDefault();
        m.actions.add(draft);
        setDraft("");
      }}
    >
      <span className="w-7" style={{ color: B.text3 }}>
        <Hook size={14} />
      </span>
      <input
        id="ix-add"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Добавить — «созвон завтра 15:00 !важно»"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
        style={{ ...T.body, color: B.text }}
      />
    </form>
  );

  const meetingRows = (limit: number) =>
    m.meetings.length === 0 ? (
      <Empty title="Встреч нет" text="День целиком под план." seed={11} />
    ) : (
      <ul>
        {m.meetings.slice(0, limit).map((mt) => (
          <li key={mt.id} className="flex h-11 min-w-0 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
            <Check done={!!mt.done} onClick={() => m.actions.toggleMeeting(mt.id)} label={`Встреча: ${mt.title}`} size={14} />
            <span className="shrink-0" style={{ ...T.num, color: B.text2 }}>
              {isToday(mt.date) ? mt.time : `${mt.dateLabel} · ${mt.time}`}
            </span>
            {mt.url && !mt.done ? (
              <a
                href={mt.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
                style={{ ...T.body, color: B.text }}
                title="Открыть ссылку на созвон"
              >
                {mt.title}
              </a>
            ) : (
              <span
                className="min-w-0 flex-1 truncate"
                style={{ ...T.body, color: mt.done ? B.text4 : B.text, textDecoration: mt.done ? "line-through" : undefined }}
              >
                {mt.title}
              </span>
            )}
          </li>
        ))}
      </ul>
    );

  const addMeetingLink = (
    <button type="button" onClick={() => setMeetingOpen(true)} className="transition-colors hover:text-white" style={{ ...T.meta, color: B.text3 }}>
      + встреча
    </button>
  );

  return (
    <Page>
      <PageHeader
        chip={m.dateLabel}
        title={m.greeting}
        deck={
          <>
            В плане {planTotal} {plural(planTotal, "задача", "задачи", "задач")}
            {late ? <>, {late} с просрочкой</> : null}. {m.meetings.length ? `Встреч: ${m.meetings.length}.` : "Встреч нет."}
          </>
        }
        graphic="orb"
        seed={11}
        size={80}
        actions={
          <div className="flex items-center gap-8">
            <Seg
              label="Вид дашборда"
              value={focusMode ? "focus" : "widgets"}
              onChange={(v) => setFocusMode(v === "focus")}
              options={[
                { value: "focus", label: "Фокус", title: "Ключевые задачи и все встречи" },
                { value: "widgets", label: "Виджеты", title: "Все блоки дашборда" },
              ]}
            />
            <Button size="lg" onClick={() => document.getElementById("ix-add")?.focus()}>
              Новая задача
            </Button>
          </div>
        }
      />

      {focusMode ? (
        /* ── Фокус: one ranked list instead of competing blocks ─────────────────── */
        <div className="mx-auto max-w-[760px]">
          <section>
            <SectionHead n="01" title="Ключевые задачи · по порядку" meta={`${m.kpi.todayDone}/${m.kpi.todayTotal}`} />
            <ol className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
              {ranked.map((r, i) => (
                <PlanTaskRow key={r.id} r={r} n={i + 1} onToggle={() => toggleTask(r)} onOpen={() => panel.open(r.id)} onPriority={setPriority} />
              ))}
            </ol>
            {ranked.length === 0 && (
              <div className="py-6" style={{ ...T.body, color: B.text3 }}>
                На сегодня ничего не горит. Хороший день, чтобы взять что-то из «Позже».
              </div>
            )}
            {addForm}
          </section>
          <section className="mt-16">
            <SectionHead n="02" title="Встречи" size="s" meta={addMeetingLink} />
            <div className="mt-6">{meetingRows(50)}</div>
          </section>
        </div>
      ) : (
        <>
          <div className="relative">
            <Stats
              items={[
                {
                  k: "Сегодня",
                  v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`,
                  sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просрочено` : "без просрочек",
                  hot: m.kpi.overdueToday > 0,
                },
                { k: "Время сегодня", v: m.kpi.timeLabel, sub: `цель ${m.kpi.closedToday} из ${m.kpi.dailyGoal}` },
                { k: "Открыто", v: m.kpi.openCount, sub: `${m.status.overdueAll} с просрочкой · список ↳` },
                { k: "За неделю", v: m.kpi.weekDone, sub: `серия ${m.kpi.streak} ${plural(m.kpi.streak, "день", "дня", "дней")} · по дням ↳` },
              ]}
            />
            {/* Click targets over the two list-backed KPIs (the strip itself stays the kit's Stats). */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-4">
              <span />
              <span />
              <KpiHit label="Открытые задачи — список" onClick={() => setList("open")} />
              <KpiHit label="Закрыто за неделю — по дням" onClick={() => setList("week")} />
            </div>
          </div>

          {/* ── Plan · rhythm · projects ───────────────────────────────────────────── */}
          <div className="mt-16 grid grid-cols-4 gap-x-5">
            <section className="col-span-3 min-w-0 pr-5">
              <SectionHead n="01" title="План дня" meta={`${planDone} из ${planTotal}`} />
              <ol className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
                {/* Subtasks with their own date land here one by one (lib/subtasks), first — as in the real dashboard. */}
                {subs.map(({ parent, sub }, i) => (
                  <PlanSubRow
                    key={`${parent.id}:${sub.id}`}
                    parent={parent}
                    sub={sub}
                    n={i + 1}
                    onToggle={() => toggleSubtask(parent.id, sub.id)}
                    onOpen={() => panel.openSubtask(parent.id, sub.id)}
                    onOpenParent={() => panel.open(parent.id)}
                    onPriority={(p) => updateSubtask(parent.id, sub.id, { priority: p })}
                  />
                ))}
                {m.plan.map((r, i) => (
                  <PlanTaskRow
                    key={r.id}
                    r={r}
                    n={subs.length + i + 1}
                    onToggle={() => toggleTask(r)}
                    onOpen={() => panel.open(r.id)}
                    onPriority={setPriority}
                  />
                ))}
              </ol>
              {planTotal === 0 && (
                <div className="py-6" style={{ ...T.body, color: B.text3 }}>
                  План пуст — добавьте первую задачу.
                </div>
              )}
              {m.plan.length > 0 && m.plan.every((r) => r.done) && subs.length === 0 && (
                <div className="flex h-12 items-center" style={{ ...T.meta, color: B.text2, borderBottom: `1px solid ${B.l7}` }}>
                  Все задачи дня закрыты.
                </div>
              )}
              {addForm}
            </section>

            <aside className="min-w-0 space-y-14">
              <section>
                <SectionHead n="02" title="Ритм" size="s" meta={`${m.closed14} за 14 дн.`} />
                <div className="mt-6 flex h-[96px] items-end gap-[4px]">
                  {m.dynamics.map((d, i) => {
                    const dots = Math.round((d.value / maxDay) * 10);
                    const today = i === m.dynamics.length - 1;
                    return (
                      <div key={d.date} className="flex flex-1 flex-col-reverse gap-[3px]" title={`${d.label}: ${d.value}`}>
                        {Array.from({ length: 10 }, (_, j) => (
                          <span key={j} className="h-[6.6px] w-full" style={{ background: j < dots ? (today ? B.text : B.text2) : B.l5 }} />
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.off }}>
                  <span style={tab}>{m.dynamics[0].label}</span>
                  <span>пик {m.peak14}</span>
                </div>
              </section>

              <section>
                <SectionHead n="03" title="Проекты" size="s" meta={<Link to="/projects" className="hover:text-white">все ↳</Link>} />
                <ul className="mt-5">
                  {m.projects.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <Link to={`/projects/${p.id}`} className="group flex flex-col gap-2 py-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate transition-colors group-hover:text-white" style={{ ...T.body, color: B.text2 }}>
                            {p.name}
                          </span>
                          {p.health === "off-track" && <span style={{ ...T.meta, color: B.danger }}>{p.healthLabel}</span>}
                          <span className="w-9 text-right" style={{ ...T.num, color: B.text3 }}>
                            {Math.round(p.pct)}%
                          </span>
                        </span>
                        <Line pct={p.pct} color={p.health === "off-track" ? B.danger : B.text3} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>

          {/* ── Four quiet cells: status · meetings · note · reading ───────────────── */}
          <div className="mt-20 grid grid-cols-4 gap-x-5" style={{ borderTop: `1px solid ${B.l10}` }}>
            <section className="min-w-0 pr-5 pt-6">
              <SectionHead n="04" title="Статус" size="s" />
              <div className="mt-6 flex items-baseline gap-6">
                <Num v={m.status.doneAll} k="готово" />
                <Num v={m.status.inProgress} k="в работе" />
                <Num v={m.status.overdueAll} k="просрочено" hot />
              </div>
              <div className="mt-5 flex h-[3px] w-full gap-[2px]">
                <span style={{ flex: m.status.doneAll / statusTotal, background: B.text2 }} />
                <span style={{ flex: m.status.inProgress / statusTotal, background: B.off }} />
                <span style={{ flex: m.status.overdueAll / statusTotal, background: B.danger }} />
              </div>
              <div className="mt-5">
                {m.status.openByPriority.map((p, i) => (
                  <KV key={p.priority} k={p.label} v={p.count} py={7} last={i === m.status.openByPriority.length - 1} />
                ))}
              </div>
            </section>

            <section className="min-w-0 pr-5 pt-6">
              <SectionHead n="05" title="Встречи" size="s" meta={addMeetingLink} />
              <div className="mt-6">{meetingRows(5)}</div>
            </section>

            <section className="min-w-0 pr-5 pt-6">
              <SectionHead n="06" title="Заметка" size="s" />
              <form
                className="mt-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  m.actions.saveNote(note);
                  setNote("");
                }}
              >
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      m.actions.saveNote(note);
                      setNote("");
                    }
                  }}
                  placeholder="Мысль, ссылка, итог созвона…"
                  rows={5}
                  className="w-full resize-none bg-transparent py-2 outline-none placeholder:text-[#454545]"
                  style={{ ...T.body, color: B.text, borderTop: `1px solid ${B.l7}`, borderBottom: `1px solid ${B.l7}` }}
                />
                <div className="mt-3 flex items-center justify-between">
                  <span style={{ ...T.meta, color: B.off }}>Ctrl + Enter</span>
                  <Button variant="outline" size="sm" type="submit" disabled={!note.trim()}>
                    Сохранить
                  </Button>
                </div>
              </form>
            </section>

            <section className="min-w-0 pt-6">
              <SectionHead n="07" title="Чтение" size="s" />
              <div className="mt-6">
                {m.reading ? (
                  <a href={m.reading.url} target="_blank" rel="noreferrer" className="group block">
                    <Dither src={m.reading.coverUrl} className="h-[120px] w-full" fallbackKind="stripes" seed={4} />
                    <div className="mt-4 line-clamp-2 transition-colors group-hover:text-white" style={{ ...T.bodyStrong, color: B.text2 }}>
                      {m.reading.title}
                    </div>
                    {m.reading.domain && (
                      <div className="mt-1" style={{ ...T.meta, color: B.text3 }}>
                        {m.reading.domain}
                      </div>
                    )}
                  </a>
                ) : (
                  <Empty title="Очередь пуста" text="Добавьте материал в Базу знаний." seed={4} />
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <OpenTasksPanel open={list === "open"} onClose={() => setList(null)} tasks={tasks} onOpenTask={panel.open} />
      <WeekPanel open={list === "week"} onClose={() => setList(null)} tasks={tasks} onOpenTask={panel.open} />
      <MeetingModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        onAdd={(mt) => {
          addMeeting(mt);
          toast("Встреча добавлена");
          setMeetingOpen(false);
        }}
      />
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Plan rows
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function PrioritySignal({ value, onPick, label }: { value: Priority; onPick: (p: Priority) => void; label: string }) {
  const f = useFloat();
  return (
    <span className="flex justify-center">
      <button
        type="button"
        data-float-trigger
        onClick={(e) => f.toggle(e.currentTarget, "right")}
        aria-label={`Приоритет: ${PRIORITY_META[value].label} — ${label}`}
        title={`Приоритет: ${PRIORITY_META[value].label}`}
        className="flex h-8 w-8 items-center justify-center opacity-90 outline-none transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
      >
        <Signal value={PRIORITY_BARS[value]} on={B.text2} off={value ? B.off : B.l10} />
      </button>
      {f.at && (
        <FloatMenu at={f.at} onClose={f.close} width={220}>
          <PriorityMenuBody value={value} onPick={onPick} />
        </FloatMenu>
      )}
    </span>
  );
}

function PlanTaskRow({
  r,
  n,
  onToggle,
  onOpen,
  onPriority,
}: {
  r: TodayRow;
  n: number;
  onToggle: () => void;
  onOpen: () => void;
  onPriority: (id: string, p: Priority) => void;
}) {
  return (
    <li
      className="group grid min-h-[60px] items-center gap-4 transition-colors duration-200 hover:bg-white/[0.02]"
      style={{ gridTemplateColumns: PLAN_COLS, borderBottom: `1px solid ${B.l7}` }}
    >
      <span style={{ ...T.num, color: B.off }}>{pad2(n)}</span>
      <Check done={r.done} onClick={onToggle} label={r.title} />
      <button type="button" onClick={onOpen} className="min-w-0 py-2 text-left outline-none focus-visible:underline" title="Открыть задачу">
        <span
          className="block truncate transition-colors group-hover:text-white"
          style={{ ...T.bodyL, color: r.done ? B.text4 : B.text, textDecoration: r.done ? "line-through" : undefined }}
        >
          {r.title}
        </span>
        {r.projectName && (
          <span className="mt-0.5 block truncate" style={{ ...T.meta, color: B.text3 }}>
            {r.projectName}
          </span>
        )}
      </button>
      <PrioritySignal value={r.priority} onPick={(p) => onPriority(r.id, p)} label={r.title} />
      <span className="text-right" style={{ ...T.meta, color: r.overdue ? B.danger : B.text3, ...tab }}>
        {r.dueLabel}
      </span>
    </li>
  );
}

function PlanSubRow({
  parent,
  sub,
  n,
  onToggle,
  onOpen,
  onOpenParent,
  onPriority,
}: {
  parent: Task;
  sub: Subtask;
  n: number;
  onToggle: () => void;
  onOpen: () => void;
  onOpenParent: () => void;
  onPriority: (p: Priority) => void;
}) {
  const overdue = !sub.done && isOverdue(sub.dueDate);
  return (
    <li
      className="group grid min-h-[60px] items-center gap-4 transition-colors duration-200 hover:bg-white/[0.02]"
      style={{ gridTemplateColumns: PLAN_COLS, borderBottom: `1px solid ${B.l7}` }}
    >
      <span style={{ ...T.num, color: B.off }}>{pad2(n)}</span>
      <Check done={sub.done} onClick={onToggle} label={sub.title} />
      <span className="min-w-0 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate text-left outline-none transition-colors group-hover:text-white focus-visible:underline"
          style={{ ...T.bodyL, color: B.text }}
          title="Открыть карточку подзадачи"
        >
          {sub.title}
        </button>
        <button
          type="button"
          onClick={onOpenParent}
          className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-left outline-none transition-colors hover:text-white focus-visible:underline"
          style={{ ...T.meta, color: B.text3 }}
          title="Открыть родительскую задачу"
        >
          <Hook size={10} /> <span className="truncate">{parent.title}</span>
        </button>
      </span>
      <PrioritySignal value={subPriority(sub)} onPick={onPriority} label={sub.title} />
      <span className="text-right" style={{ ...T.meta, color: overdue ? B.danger : B.text3, ...tab }}>
        {sub.dueDate ? dueLabel(sub.dueDate) : ""}
      </span>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * KPI click targets + list panels (the real dashboard's two popups)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function KpiHit({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pointer-events-auto outline-none transition-colors duration-200 hover:bg-white/[0.025] focus-visible:shadow-[inset_0_0_0_1px_#ADFB0C]"
    />
  );
}

function ListRow({ t, onOpen, right }: { t: Task; onOpen: () => void; right: ReactNode }) {
  const { toggleTask } = useData();
  return (
    <li
      className="group grid min-h-[48px] items-center gap-4"
      style={{ gridTemplateColumns: "16px minmax(0,1fr) 32px 88px", borderBottom: `1px solid ${B.l7}` }}
    >
      <Check done={t.done} onClick={() => toggleTask(t.id)} label={t.title} size={14} />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 truncate text-left outline-none transition-colors hover:text-white focus-visible:underline"
        style={{ ...T.body, color: t.done ? B.text2 : B.text }}
      >
        {t.title}
      </button>
      <span className="flex justify-center">{t.priority ? <Signal value={PRIORITY_BARS[t.priority]} on={B.text3} off={B.l15} w={4} h={9} /> : null}</span>
      {right}
    </li>
  );
}

function OpenTasksPanel({ open, onClose, tasks, onOpenTask }: { open: boolean; onClose: () => void; tasks: Task[]; onOpenTask: (id: string) => void }) {
  const openAll = useMemo(
    () => tasks.filter((t) => !t.done).sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿")),
    [tasks]
  );
  const overdue = openAll.filter((t) => isOverdue(t.dueDate)).length;
  return (
    <CasePanel
      open={open}
      onClose={onClose}
      eyebrow="Открыто · по сроку"
      title={`${openAll.length} ${plural(openAll.length, "задача", "задачи", "задач")}`}
      deck={overdue ? `${overdue} с просрочкой — они сверху.` : "Просрочек нет."}
    >
      <ul className="mt-8" style={{ borderTop: `1px solid ${B.l10}` }}>
        {openAll.map((t) => (
          <ListRow
            key={t.id}
            t={t}
            onOpen={() => onOpenTask(t.id)}
            right={
              <span className="truncate text-right" style={{ ...T.meta, ...tab, color: isOverdue(t.dueDate) ? B.danger : t.dueDate ? B.text3 : B.off }}>
                {t.dueDate ? dueLabel(t.dueDate) : "без срока"}
              </span>
            }
          />
        ))}
      </ul>
      {openAll.length === 0 && (
        <p className="py-6" style={{ ...T.body, color: B.text3 }}>
          Открытых задач нет.
        </p>
      )}
    </CasePanel>
  );
}

function WeekPanel({ open, onClose, tasks, onOpenTask }: { open: boolean; onClose: () => void; tasks: Task[]; onOpenTask: (id: string) => void }) {
  // Monday–Sunday of the current calendar week, same as the real popup.
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
        const key = localDayStr(d);
        return {
          key,
          label: WEEKDAYS[i],
          date: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
          list: tasks.filter((t) => t.done && t.completedAt && localDayStr(new Date(t.completedAt)) === key),
        };
      }),
    [tasks]
  );
  const total = days.reduce((s, d) => s + d.list.length, 0);
  return (
    <CasePanel
      open={open}
      onClose={onClose}
      eyebrow="Закрыто · эта неделя"
      title={`${total} ${plural(total, "задача", "задачи", "задач")}`}
      deck={total ? "По дням, с понедельника." : "На этой неделе пока ничего не закрыто."}
    >
      <div className="mt-6">
        {days.map((d) => {
          const today = d.key === todayStr();
          return (
            <section key={d.key} className="pt-6">
              <div className="flex items-baseline justify-between pb-2" style={{ borderBottom: `1px solid ${today ? B.l40 : B.l10}` }}>
                <span className="flex items-baseline gap-3">
                  <span style={{ ...T.bodyStrong, color: today ? B.text : B.text2 }}>{d.label}</span>
                  <span style={{ ...T.meta, color: B.text3, ...tab }}>{d.date}</span>
                </span>
                <span style={{ ...T.num, color: d.list.length ? B.text2 : B.off }}>{d.list.length}</span>
              </div>
              {d.list.length > 0 && (
                <ul>
                  {d.list.map((t) => (
                    <ListRow
                      key={t.id}
                      t={t}
                      onOpen={() => onOpenTask(t.id)}
                      right={
                        <span className="text-right" style={{ ...T.meta, ...tab, color: B.text3 }}>
                          {t.completedAt ? new Date(t.completedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </CasePanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * New meeting — title · date · time · link (same fields as the real dialog)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function MeetingModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (m: { title: string; date: string; time: string; url?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("12:00");
  const [url, setUrl] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(todayStr());
    setTime("12:00");
    setUrl("");
    const r = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(r);
  }, [open]);
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), date: date || todayStr(), time, url: url.trim() || undefined });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новая встреча"
      width={520}
      footer={
        <CtaBar tone="lime" onClick={submit} disabled={!title.trim()} height={56}>
          Добавить встречу
        </CtaBar>
      }
    >
      <div className="px-5 py-2">
        <Prop k="Название">
          <FieldInput inputRef={titleRef} value={title} onChange={setTitle} placeholder="Созвон с клиентом" onEnter={submit} />
        </Prop>
        <Prop k="Дата">
          <FieldInput type="date" value={date} onChange={setDate} width={160} />
        </Prop>
        <Prop k="Время">
          <FieldInput type="time" value={time} onChange={setTime} width={110} />
        </Prop>
        <Prop k="Ссылка" last>
          <FieldInput type="url" value={url} onChange={setUrl} placeholder="https://meet.google.com/…" onEnter={submit} />
        </Prop>
      </div>
    </Modal>
  );
}

function Num({ v, k, hot }: { v: number; k: string; hot?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ ...T.displayS, ...tab, color: hot ? B.danger : B.text }}>{v}</span>
      <span style={{ ...T.meta, color: B.text3 }}>{k}</span>
    </div>
  );
}
