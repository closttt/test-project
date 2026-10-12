/**
 * Планер · Craft Dark · v3 «День в фокусе» — one day at a time with the week as a strip on top
 * (ref 1, Wallet: a row of big tiles, then a calm list). Each tile shows the day, its count against
 * the norm and a load capsule; the chosen day opens below as a plain agenda — timed items first,
 * then the day's tasks — with a solid add. Rows are dragged onto another tile to move them; the
 * right column holds «Без даты» and pinned routines to put on the chosen day.
 */
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Clock, Inbox, Pin, Plus } from "lucide-react";

import { Btn, C, Empty, R, Ring, T, TONE, dashed } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import type { Task } from "@/types";
import {
  DayAdd,
  DragGhost,
  HoverAct,
  ItemRow,
  PLAN_HEX,
  PRIO_DOT,
  PlannerDialogs,
  WeekNav,
  countLabel,
  dayLong,
  dayShort,
  dropLabel,
  dropOver,
  formatDuration,
  useDayDrag,
  usePlanner,
  type DayItem,
  type Planner,
} from "./_parts";

type Carry = { kind: "item"; it: DayItem } | { kind: "task"; t: Task };

function WeekStrip({ p, sel, onSel, over, from }: { p: Planner; sel: string; onSel: (d: string) => void; over: string | null; from?: string }) {
  const maxMin = Math.max(60, ...p.days.map((d) => p.stats(d.date).minutes));
  return (
    <div data-lab-block="strip" className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
      {p.days.map((d) => {
        const s = p.stats(d.date);
        const on = d.date === sel;
        const hot = over === d.date && from !== d.date;
        return (
          <button
            key={d.date}
            type="button"
            data-drop-day={d.date}
            onClick={() => onSel(d.date)}
            className={`flex min-w-0 flex-col gap-3 p-4 text-left transition-[background,box-shadow] duration-150 ${on ? "" : "hover:bg-[#1C1C20]"}`}
            style={{ borderRadius: R.card, background: on ? "rgba(10,132,255,0.14)" : C.card, ...(hot ? dropOver : {}) }}
          >
            <div className="flex items-center justify-between gap-2">
              <span style={{ ...T.body, color: on ? C.text : C.text2 }}>{dayShort(d.date)}</span>
              {d.isToday && <span style={{ ...T.foot, color: "#5AA9FF" }}>сегодня</span>}
            </div>
            <span style={{ ...T.num, fontSize: 32, lineHeight: 1, color: on ? C.text : C.text }}>{d.short.split(" ")[0]}</span>
            <div className="flex flex-col gap-2">
              <span className="block overflow-hidden" style={{ height: 4, borderRadius: 99, background: on ? "rgba(10,132,255,0.22)" : C.raise }}>
                <span className="block h-full" style={{ width: `${(s.minutes / maxMin) * 100}%`, borderRadius: 99, background: on ? C.accent : "#3A3A42" }} />
              </span>
              <span className="truncate" style={{ ...T.foot, color: on ? C.text2 : C.text3 }}>
                {s.tasks || s.meetings ? `${countLabel(s.tasks)}${s.meetings ? ` · ${s.meetings} встр.` : ""}` : "свободно"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function PlannerDayFocus() {
  const p = usePlanner();
  const [sel, setSel] = useState(() => p.todayCol ?? p.days[0].date);
  useEffect(() => {
    if (!p.days.some((d) => d.date === sel)) setSel(p.todayCol ?? p.days[0].date);
  }, [p.days, p.todayCol, sel]);
  const addRef = useRef<HTMLInputElement>(null);

  const { drag, begin } = useDayDrag<Carry>(
    (c, day) => {
      if (c.kind === "item") p.actions.move(c.it, day);
      else if (day !== "backlog") p.actions.schedule(c.t, day);
    },
    (c) => (c.kind === "item" ? p.actions.open(c.it) : p.setEditTaskId(c.t.id))
  );

  const items = p.byDay.get(sel) ?? [];
  const timed = items.filter((x) => x.startMin !== undefined && !x.done);
  const rest = items.filter((x) => x.startMin === undefined && !x.done);
  const closed = items.filter((x) => x.done);
  const s = p.stats(sel);
  const day = p.days.find((d) => d.date === sel);
  const pct = (s.done / p.goal) * 100;

  return (
    <CraftShell
      active="planner"
      crumb="Планер"
      title="Планер"
      subtitle={`${countLabel(p.week.tasks)} на неделе · ${formatDuration(p.week.minutes)}`}
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
      <div className={drag ? "cursor-grabbing select-none" : ""}>
        <div className="mt-6">
          <WeekStrip p={p} sel={sel} onSel={setSel} over={drag?.over ?? null} from={drag?.p.kind === "item" ? drag.p.it.date : undefined} />
        </div>

        <div className="mt-3 grid items-start gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
          <section data-lab-block="agenda" className="flex min-w-0 flex-col overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
            <header className="flex items-center justify-between gap-6 px-6 pb-5 pt-6" style={dashed}>
              <div className="min-w-0">
                <div style={{ ...T.body, color: day?.isToday ? "#5AA9FF" : C.text3 }}>{day?.isToday ? "Сегодня" : day?.label}</div>
                <h2 className="mt-1" style={{ ...T.num, fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.035em" }}>
                  {dayLong(sel)}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ ...T.body, color: C.text2 }}>
                  <span>{countLabel(s.tasks)}</span>
                  {s.meetings > 0 && <span>{s.meetings} встр.</span>}
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={14} strokeWidth={1.75} color={C.text3} />
                    {s.minutes ? formatDuration(s.minutes) : "ничего не запланировано"}
                  </span>
                  {s.tasks > p.goal && <span style={{ color: TONE.amber.fg }}>больше нормы на {s.tasks - p.goal}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <Ring pct={pct} size={64} stroke={5}>
                  <span style={{ ...T.body, ...T.num, color: C.text2 }}>{Math.round(Math.min(100, pct))}%</span>
                </Ring>
                <div>
                  <div style={{ ...T.num, fontSize: 24, lineHeight: 1 }}>
                    {s.done}
                    <span style={{ color: C.text3, fontWeight: 400 }}>/{p.goal}</span>
                  </div>
                  <div style={{ ...T.foot, color: C.text3, marginTop: 4 }}>дневная норма</div>
                </div>
              </div>
            </header>

            {items.length === 0 ? (
              <div className="px-6 pt-5">
                <Empty>День свободен — добавьте задачу ниже или перенесите из «Без даты»</Empty>
              </div>
            ) : (
              <div>
                {timed.length > 0 && <GroupHead label="По времени" n={timed.length} />}
                {timed.map((it) => (
                  <ItemRow key={it.key} p={p} it={it} onPointerDown={(e) => begin(e, { kind: "item", it })} dragging={drag?.p.kind === "item" && drag.p.it.key === it.key} />
                ))}
                {rest.length > 0 && <GroupHead label="Задачи" n={rest.length} />}
                {rest.map((it) => (
                  <ItemRow key={it.key} p={p} it={it} onPointerDown={(e) => begin(e, { kind: "item", it })} dragging={drag?.p.kind === "item" && drag.p.it.key === it.key} />
                ))}
                {closed.length > 0 && <GroupHead label="Готово" n={closed.length} />}
                {closed.map((it) => (
                  <ItemRow key={it.key} p={p} it={it} onPointerDown={(e) => begin(e, { kind: "item", it })} />
                ))}
              </div>
            )}

            <div className="p-6 pt-5">
              <DayAdd solid height={56} inputRef={addRef} onAdd={(v) => p.actions.addToDay(v, sel)} placeholder={`Новая задача на ${dayShort(sel).toLowerCase()}, ${dayLong(sel)}`} />
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-3">
            <section data-lab-block="backlog" data-drop-day="backlog" className="flex flex-col p-5 pb-3" style={{ background: C.card, borderRadius: R.card, ...(drag?.over === "backlog" && drag.p.kind === "item" ? dropOver : {}) }}>
              <div className="mb-2 flex items-center gap-2.5">
                <Inbox size={18} strokeWidth={1.75} color={C.text2} />
                <h2 style={T.title}>Без даты</h2>
                <span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>{p.backlog.length}</span>
              </div>
              {p.backlog.length === 0 ? (
                <div className="py-4" style={{ ...T.body, color: C.text3 }}>
                  Все задачи разложены по дням
                </div>
              ) : (
                <div className="-mx-5 max-h-[340px] overflow-y-auto [scrollbar-width:thin]" style={{ scrollbarColor: `${C.line2} transparent` }}>
                  {p.backlog.map((t) => (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => begin(e, { kind: "task", t })}
                      onKeyDown={(e) => e.key === "Enter" && p.setEditTaskId(t.id)}
                      className="group flex cursor-grab touch-none items-center gap-2.5 pl-5 pr-3 outline-none transition-colors hover:bg-[#1C1C20]"
                      style={{ minHeight: 48, ...dashed, opacity: drag?.p.kind === "task" && drag.p.t.id === t.id ? 0.35 : 1 }}
                    >
                      <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[t.priority] }} />
                      <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                        {t.title}
                      </span>
                      <HoverAct title={`На ${dayShort(sel)}, ${dayLong(sel)}`} onClick={() => p.actions.schedule(t, sel)}>
                        <CalendarPlus size={16} strokeWidth={1.75} />
                      </HoverAct>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section data-lab-block="routines" className="flex flex-col p-5 pb-3" style={{ background: C.card, borderRadius: R.card }}>
              <div className="mb-2 flex items-center gap-2.5">
                <Pin size={18} strokeWidth={1.75} color={C.text2} />
                <h2 style={T.title}>Закреплённые</h2>
              </div>
              {p.templates.length === 0 ? (
                <div className="py-4" style={{ ...T.body, color: C.text3 }}>
                  Ритуалов пока нет
                </div>
              ) : (
                <div className="-mx-5">
                  {p.templates.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 pl-5 pr-3" style={{ minHeight: 48, ...dashed }}>
                      <span className="shrink-0" style={{ width: 3, height: 16, borderRadius: 9, background: PLAN_HEX[t.color] }} />
                      <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                        {t.title}
                      </span>
                      <span style={{ ...T.foot, color: C.text3 }}>{formatDuration(t.durationMin)}</span>
                      <button
                        type="button"
                        onClick={() => p.actions.placeRoutine(t.id, sel)}
                        title={`Поставить на ${dayShort(sel)}`}
                        className="inline-flex items-center gap-1 px-3 transition-colors hover:bg-[#26262C]"
                        style={{ height: 32, borderRadius: 999, background: C.raise, fontSize: 13, color: C.text2 }}
                      >
                        <Plus size={14} strokeWidth={2} />
                        {dayShort(sel)}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      {drag && (
        <DragGhost
          x={drag.x}
          y={drag.y}
          title={drag.p.kind === "item" ? drag.p.it.title : drag.p.t.title}
          target={drag.p.kind === "item" && drag.over === drag.p.it.date ? null : drag.p.kind === "task" && drag.over === "backlog" ? null : dropLabel(drag.over)}
        />
      )}
      <PlannerDialogs p={p} />
    </CraftShell>
  );
}

function GroupHead({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-center gap-2 px-6 pb-2 pt-5" style={{ ...T.foot, color: C.text3 }}>
      {label}
      <span style={{ ...T.num, fontWeight: 400 }}>{n}</span>
    </div>
  );
}
