/**
 * Планер · Craft Dark · v1 «Неделя колонками» — seven day columns, like the Taskplus / Studio kanban
 * (refs 6, 3): each column has the day, its count against the daily norm in capsules, the day's
 * meetings, routines and tasks as cards, and an inline add at the bottom. Cards are dragged between
 * columns (a task's day changes — the kanban follows); a press opens the editor.
 */
import { useRef } from "react";
import { Plus } from "lucide-react";

import { Btn, C, R, Ring, T, TONE } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import {
  DayAdd,
  DragGhost,
  ItemCard,
  PlannerDialogs,
  WeekNav,
  countLabel,
  dayShort,
  dropLabel,
  dropOver,
  formatDuration,
  useDayDrag,
  usePlanner,
  type DayItem,
  type Planner,
  type WeekDay,
} from "./_parts";

function Capsules({ count, done, goal }: { count: number; done: number; goal: number }) {
  const n = Math.max(goal, 1);
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1" style={{ height: 6 }}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="flex-1" style={{ borderRadius: 999, background: i < done ? C.accent : i < count ? "rgba(10,132,255,0.35)" : "#2C2C33" }} />
        ))}
      </div>
      {count > goal && <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: TONE.amber.fg }}>+{count - goal}</span>}
    </div>
  );
}

function Column({
  p,
  d,
  over,
  draggingKey,
  begin,
  addRef,
}: {
  p: Planner;
  d: WeekDay;
  over: boolean;
  draggingKey?: string;
  begin: (e: React.PointerEvent, it: DayItem) => void;
  addRef?: React.RefObject<HTMLInputElement>;
}) {
  const items = p.byDay.get(d.date) ?? [];
  const s = p.stats(d.date);
  return (
    <section
      data-drop-day={d.date}
      data-lab-block={d.isToday ? "day-today" : undefined}
      className="flex min-w-0 flex-col gap-3 p-2.5 transition-[background,box-shadow] duration-150"
      style={{ background: C.card, borderRadius: R.card, minHeight: "calc(100vh - 248px)", ...(over ? dropOver : {}) }}
    >
      <header className="flex flex-col gap-2.5 px-1.5 pt-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate" style={{ ...T.foot, color: d.isToday ? "#5AA9FF" : C.text3 }}>{d.isToday ? "Сегодня" : d.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span style={{ ...T.num, fontSize: 24, lineHeight: 1.1 }}>{d.short.split(" ")[0]}</span>
              <span className="truncate" style={{ ...T.body, color: C.text2 }}>
                {dayShort(d.date)}
              </span>
            </div>
          </div>
          <Ring pct={(s.done / p.goal) * 100} size={26} stroke={3} />
        </div>
        <Capsules count={s.tasks} done={s.done} goal={p.goal} />
        <div className="truncate" style={{ ...T.foot, color: C.text3 }}>
          {s.tasks || s.meetings ? (
            <>
              <span style={{ color: C.text2 }}>
                {s.done}/{p.goal}
              </span>{" "}
              · {s.minutes ? formatDuration(s.minutes) : "—"}
              {s.meetings ? ` · ${s.meetings} встр.` : ""}
            </>
          ) : (
            "Свободный день"
          )}
        </div>
      </header>

      <div className="flex flex-col gap-1.5">
        {items.map((it) => (
          <ItemCard key={it.key} p={p} it={it} onPointerDown={(e) => begin(e, it)} dragging={draggingKey === it.key} />
        ))}
      </div>

      <div className="mt-auto">
        <DayAdd onAdd={(v) => p.actions.addToDay(v, d.date)} placeholder="Добавить" inputRef={addRef} />
      </div>
    </section>
  );
}

export default function PlannerWeekColumns() {
  const p = usePlanner();
  const { drag, begin } = useDayDrag<DayItem>(
    (it, day) => p.actions.move(it, day),
    (it) => p.actions.open(it)
  );
  const todayAdd = useRef<HTMLInputElement>(null);
  const firstAdd = useRef<HTMLInputElement>(null);

  return (
    <CraftShell
      active="planner"
      crumb="Планер"
      title="Планер"
      subtitle={`${countLabel(p.week.tasks)} на неделе · ${p.week.done} закрыто · ${formatDuration(p.week.minutes)}`}
      actions={
        <Btn
          icon={<Plus size={16} strokeWidth={2} />}
          onClick={() => {
            const el = (p.todayCol ? todayAdd : firstAdd).current;
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            el?.focus({ preventScroll: true });
          }}
        >
          Новая задача
        </Btn>
      }
      titleRight={<WeekNav p={p} />}
    >
      <div data-lab-block="board" className={`mt-6 grid gap-2 ${drag ? "cursor-grabbing select-none" : ""}`} style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {p.days.map((d, i) => (
          <Column
            key={d.date}
            p={p}
            d={d}
            over={drag?.over === d.date && drag.p.date !== d.date}
            draggingKey={drag?.p.key}
            begin={begin}
            addRef={d.isToday ? todayAdd : i === 0 ? firstAdd : undefined}
          />
        ))}
      </div>
      {drag && <DragGhost x={drag.x} y={drag.y} title={drag.p.title} target={drag.over !== drag.p.date ? dropLabel(drag.over) : null} />}
      <PlannerDialogs p={p} />
    </CraftShell>
  );
}
