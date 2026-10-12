/**
 * Планер · Craft Dark · v4 «Бэклог и неделя» — the backlog on the left, the week as seven rows on
 * the right (ref 11, Workspace orders: a working list beside the board). Each row is one day: its
 * name and norm ring on the left, the day's meetings, routines and tasks as pills that wrap. Drag a
 * backlog task or a routine onto a row to plan it, drag pills between rows to move them, drag a
 * pill back onto the backlog to take its date off.
 */
import { useMemo, useRef, useState } from "react";
import { Inbox, Pin, Plus, Search, Video } from "lucide-react";

import { Btn, C, R, Ring, RoundCheck, T, TONE, dashed } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { useData } from "@/store/DataProvider";
import { parseNaturalInput } from "@/lib/nlp";
import type { PlanTemplate, Task } from "@/types";
import {
  DayAdd,
  DragGhost,
  ItemMark,
  PLAN_HEX,
  PRIO_DOT,
  PlannerDialogs,
  WeekNav,
  countLabel,
  dayShort,
  dropLabel,
  dropOver,
  formatDuration,
  itemTime,
  tint,
  useDayDrag,
  usePlanner,
  type DayItem,
  type Planner,
  type WeekDay,
} from "./_parts";

type Carry = { kind: "item"; it: DayItem } | { kind: "task"; t: Task } | { kind: "tpl"; tpl: PlanTemplate };

function Pill({ p, it, onPointerDown, dragging }: { p: Planner; it: DayItem; onPointerDown: (e: React.PointerEvent) => void; dragging: boolean }) {
  const late = it.overdue && !it.done && it.task?.dueDate !== it.date;
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => e.key === "Enter" && p.actions.open(it)}
      className="group relative flex min-w-0 max-w-full cursor-grab touch-none items-center gap-2 pl-2 pr-3.5 outline-none transition-colors duration-150 hover:bg-[#25252A] focus-visible:bg-[#25252A]"
      style={{
        height: 40,
        borderRadius: 12,
        background: it.kind === "meeting" ? "rgba(10,132,255,0.10)" : it.kind === "routine" ? tint(PLAN_HEX[it.color], 0.12) : C.raise,
        opacity: dragging ? 0.35 : it.done ? 0.5 : 1,
      }}
    >
      {it.kind === "meeting" ? (
        <span className="grid h-6 w-6 shrink-0 place-items-center">
          <Video size={15} strokeWidth={1.75} color="#5AA9FF" />
        </span>
      ) : (
        <span className="grid h-6 w-6 shrink-0 place-items-center">
          <RoundCheck done={it.done} onChange={() => p.actions.toggle(it)} size={18} />
        </span>
      )}
      {it.kind !== "meeting" && <ItemMark it={it} />}
      <span className="min-w-0 truncate" style={{ fontSize: 14, color: it.done ? C.text3 : C.text, textDecoration: it.done ? "line-through" : undefined, maxWidth: 260 }}>
        {it.title}
      </span>
      {(it.startMin !== undefined || late) && (
        <span className="shrink-0" style={{ ...T.foot, color: late ? TONE.amber.fg : it.kind === "meeting" ? "#5AA9FF" : C.text3, fontVariantNumeric: "tabular-nums" }}>
          {late ? "просрочено" : itemTime(it)}
        </span>
      )}
    </div>
  );
}

function DayRowLine({
  p,
  d,
  begin,
  drag,
}: {
  p: Planner;
  d: WeekDay;
  begin: (e: React.PointerEvent, c: Carry) => void;
  drag: { p: Carry; over: string | null } | null;
}) {
  const items = p.byDay.get(d.date) ?? [];
  const s = p.stats(d.date);
  const [adding, setAdding] = useState(false);
  const from = drag?.p.kind === "item" ? drag.p.it.date : undefined;
  const hot = drag?.over === d.date && from !== d.date;
  return (
    <div
      data-drop-day={d.date}
      className="grid items-start gap-5 px-6 py-4 transition-[background,box-shadow] duration-150"
      style={{ gridTemplateColumns: "148px minmax(0,1fr)", minHeight: 80, ...dashed, ...(hot ? dropOver : {}), background: hot ? dropOver.background : d.isToday ? "rgba(10,132,255,0.04)" : undefined }}
    >
      <div className="flex items-center gap-3 pt-1">
        <Ring pct={(s.done / p.goal) * 100} size={36} stroke={3}>
          <span style={{ ...T.num, fontSize: 13, color: d.isToday ? "#5AA9FF" : C.text }}>{d.short.split(" ")[0]}</span>
        </Ring>
        <div className="min-w-0">
          <div className="truncate" style={{ ...T.body, color: d.isToday ? C.text : C.text2 }}>
            {d.isToday ? "Сегодня" : d.label}
          </div>
          <div className="truncate" style={{ ...T.foot, color: s.tasks > p.goal ? TONE.amber.fg : C.text3, marginTop: 2 }}>
            {s.done}/{p.goal} · {s.minutes ? formatDuration(s.minutes) : "свободно"}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {items.map((it) => (
          <Pill key={it.key} p={p} it={it} onPointerDown={(e) => begin(e, { kind: "item", it })} dragging={drag?.p.kind === "item" && drag.p.it.key === it.key} />
        ))}
        {adding ? (
          <div className="w-[300px] max-w-full">
            <AutoAdd
              onAdd={(v) => p.actions.addToDay(v, d.date)}
              onDone={() => setAdding(false)}
              placeholder={`Задача на ${dayShort(d.date).toLowerCase()}`}
            />
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Добавить задачу на ${d.label}`}
            onClick={() => setAdding(true)}
            className={`grid h-10 w-10 place-items-center rounded-xl transition-[opacity,background,color] hover:bg-[#1E1E22] hover:text-[#F4F5F7] ${items.length ? "opacity-60 hover:opacity-100" : ""}`}
            style={{ color: C.text3, boxShadow: `inset 0 0 0 1px ${C.line}` }}
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Inline add that focuses itself and closes on Escape / blur when empty. */
function AutoAdd({ onAdd, onDone, placeholder }: { onAdd: (v: string) => void; onDone: () => void; placeholder: string }) {
  const [v, setV] = useState("");
  return (
    <form
      data-no-drag
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
      className="flex items-center gap-2 px-3"
      style={{ height: 40, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${C.line2}` }}
    >
      <Plus size={15} strokeWidth={2} color={C.text3} />
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        onBlur={() => !v.trim() && onDone()}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
    </form>
  );
}

export default function PlannerBacklogWeek() {
  const p = usePlanner();
  const { addTask } = useData();
  const [q, setQ] = useState("");
  const addRef = useRef<HTMLInputElement>(null);
  const { drag, begin } = useDayDrag<Carry>(
    (c, day) => {
      if (c.kind === "item") p.actions.move(c.it, day);
      else if (day === "backlog") return;
      else if (c.kind === "task") p.actions.schedule(c.t, day);
      else p.actions.placeRoutine(c.tpl.id, day);
    },
    (c) => {
      if (c.kind === "item") p.actions.open(c.it);
      else if (c.kind === "task") p.setEditTaskId(c.t.id);
    }
  );
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return p.backlog.filter((t) => !s || t.title.toLowerCase().includes(s));
  }, [p.backlog, q]);

  const addBacklog = (raw: string) => {
    const parsed = parseNaturalInput(raw);
    addTask({
      title: parsed.title.trim() || raw.trim(),
      done: false,
      dueDate: parsed.dueDate,
      priority: 0,
      tags: parsed.tags,
      important: parsed.important,
      remindAt: parsed.remindAt,
      estimateMin: parsed.estimateMin,
      recurrence: parsed.recurrence,
    });
  };

  const ghostTitle = drag ? (drag.p.kind === "item" ? drag.p.it.title : drag.p.kind === "task" ? drag.p.t.title : drag.p.tpl.title) : "";
  const ghostTarget = drag
    ? (drag.p.kind === "item" && drag.over === drag.p.it.date) || (drag.p.kind !== "item" && drag.over === "backlog")
      ? null
      : dropLabel(drag.over)
    : null;

  return (
    <CraftShell
      active="planner"
      crumb="Планер"
      title="Планер"
      subtitle={`${countLabel(p.week.tasks)} на неделе · ${p.backlog.length} без даты`}
      actions={
        <Btn
          icon={<Plus size={16} strokeWidth={2} />}
          onClick={() => {
            addRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            addRef.current?.focus({ preventScroll: true });
          }}
        >
          Новая задача
        </Btn>
      }
      titleRight={<WeekNav p={p} />}
    >
      <div className={`mt-6 grid items-start gap-3 ${drag ? "cursor-grabbing select-none" : ""}`} style={{ gridTemplateColumns: "320px minmax(0,1fr)" }}>
        <aside className="sticky top-5 flex flex-col gap-3">
          <section
            data-lab-block="backlog"
            data-drop-day="backlog"
            className="flex flex-col overflow-hidden transition-[background,box-shadow] duration-150"
            style={{ background: C.card, borderRadius: R.card, ...(drag?.over === "backlog" && drag.p.kind === "item" ? dropOver : {}) }}
          >
            <div className="flex flex-col gap-3 p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <Inbox size={18} strokeWidth={1.75} color={C.text2} />
                <h2 style={T.title}>Бэклог</h2>
                <span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>{p.backlog.length}</span>
              </div>
              <label className="flex items-center gap-2.5 px-3.5" style={{ height: 40, borderRadius: 999, background: C.raise }}>
                <Search size={16} strokeWidth={1.75} color={C.text2} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти в бэклоге" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]" style={{ fontSize: 14, color: C.text }} />
              </label>
            </div>
            <div className="overflow-y-auto [scrollbar-width:thin]" style={{ maxHeight: "calc(100vh - 520px)", minHeight: 160, scrollbarColor: `${C.line2} transparent` }}>
              {list.length === 0 ? (
                <div className="px-5 py-6" style={{ ...T.body, color: C.text3 }}>
                  {q ? "Ничего не найдено" : "Бэклог пуст — всё разложено по дням"}
                </div>
              ) : (
                list.map((t) => (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => begin(e, { kind: "task", t })}
                    onKeyDown={(e) => e.key === "Enter" && p.setEditTaskId(t.id)}
                    className="flex cursor-grab touch-none items-center gap-2.5 px-5 outline-none transition-colors hover:bg-[#1C1C20]"
                    style={{ minHeight: 48, ...dashed, opacity: drag?.p.kind === "task" && drag.p.t.id === t.id ? 0.35 : 1 }}
                  >
                    <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[t.priority] }} />
                    <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                      {t.title}
                    </span>
                    <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
                      {t.estimateMin ? formatDuration(t.estimateMin) : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="p-4">
              <DayAdd inputRef={addRef} onAdd={addBacklog} placeholder="В бэклог — без даты" />
            </div>
          </section>

          <section data-lab-block="routines" className="flex flex-col gap-3 p-5" style={{ background: C.card, borderRadius: R.card }}>
            <div className="flex items-center gap-2.5">
              <Pin size={18} strokeWidth={1.75} color={C.text2} />
              <h2 style={T.title}>Закреплённые</h2>
            </div>
            {p.templates.length === 0 ? (
              <div style={{ ...T.body, color: C.text3 }}>Ритуалов пока нет</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {p.templates.map((t) => (
                  <div
                    key={t.id}
                    onPointerDown={(e) => begin(e, { kind: "tpl", tpl: t })}
                    className="flex cursor-grab touch-none items-center gap-2 px-3.5 transition-colors hover:brightness-125"
                    style={{ height: 36, borderRadius: 999, background: tint(PLAN_HEX[t.color], 0.14), fontSize: 14, color: C.text }}
                    title="Перетащите на день"
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 9, background: PLAN_HEX[t.color] }} />
                    {t.title}
                    <span style={{ ...T.foot, color: C.text2 }}>{formatDuration(t.durationMin)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section data-lab-block="week" className="flex min-w-0 flex-col overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
          <header className="flex items-center justify-between gap-4 px-6" style={{ height: 64, ...dashed }}>
            <h2 style={T.title}>Неделя · {p.rangeLabel}</h2>
            <span style={{ ...T.body, color: C.text3 }}>
              закрыто <span style={{ color: C.text }}>{p.week.done}</span> из {p.week.tasks} · {formatDuration(p.week.minutes)}
            </span>
          </header>
          {p.days.map((d) => (
            <DayRowLine key={d.date} p={p} d={d} begin={begin} drag={drag} />
          ))}
        </section>
      </div>
      {drag && <DragGhost x={drag.x} y={drag.y} title={ghostTitle} target={ghostTarget} />}
      <PlannerDialogs p={p} />
    </CraftShell>
  );
}
