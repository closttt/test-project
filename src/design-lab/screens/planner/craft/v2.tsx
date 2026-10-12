/**
 * Планер · Craft Dark · v2 «Сетка по часам» — the real page's composition in the approved language
 * (refs 16, 35): the week as an hour grid in one card, meetings and blocks on their hours, kanban
 * tasks as dashed drafts from 09:00, a blue «now» line. The right column holds pinned routines and
 * the open tasks — drag one onto a day and hour; drag a block to move it, pull its bottom edge to
 * stretch it, press it to open the block editor.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ListTodo, Pin, Plus, Search, Trash2, Video, X } from "lucide-react";

import { Btn, C, Empty, R, RoundCheck, T, dashed } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { layoutDay, resizeDuration, totalMinutes } from "@/lib/planner";
import type { PlanBlock } from "@/types";
import {
  HoverAct,
  MirrorToggle,
  PLAN_HEX,
  PRIO_DOT,
  PlannerDialogs,
  RoutineForm,
  WeekNav,
  dayShort,
  durationForTask,
  formatClock,
  formatDuration,
  formatRange,
  isAutoBlock,
  isMeetingBlock,
  startFromOffset,
  tint,
  useNowMin,
  useWide,
  usePlanner,
  type Planner,
  type Source,
} from "./_parts";

const HOUR_PX = 52;
const PX_PER_MIN = HOUR_PX / 60;
const OPEN_AT_HOUR = 8;
const TIME_COL = 56;

type Drag = { kind: "new"; source: Source } | { kind: "move"; block: PlanBlock; grabMin: number };
interface Live {
  x: number;
  y: number;
  target: { date: string; startMin: number } | null;
}

/** One pointer pipeline for «new from the panel» and «move a block» — the real page's rules. */
function useGridDrag(p: Planner, scrollRef: React.RefObject<HTMLDivElement>) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [resizing, setResizing] = useState<{ id: string; durationMin: number } | null>(null);

  function hit(x: number, y: number, d: Drag): Live["target"] {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-plan-day]");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const duration = d.kind === "new" ? d.source.durationMin : d.block.durationMin;
    const grab = d.kind === "move" ? d.grabMin : 0;
    return { date: el.dataset.planDay!, startMin: startFromOffset((y - rect.top) / PX_PER_MIN - grab, duration) };
  }

  function autoScroll(x: number, y: number) {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right) return;
    if (y < r.top + 64) el.scrollTop -= 12;
    else if (y > r.bottom - 48) el.scrollTop += 12;
  }

  function begin(e: ReactPointerEvent, d: Drag) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    let last: Live | null = null;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        started = true;
        setDrag(d);
      }
      autoScroll(ev.clientX, ev.clientY);
      last = { x: ev.clientX, y: ev.clientY, target: hit(ev.clientX, ev.clientY, d) };
      setLive(last);
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
      setLive(null);
      if (!started) {
        if (d.kind === "move" && ev.type === "pointerup") p.actions.openBlock(d.block);
        return;
      }
      if (ev.type !== "pointerup" || !last?.target) return;
      if (d.kind === "new") p.actions.dropNew(d.source, last.target);
      else p.actions.dropMove(d.block, last.target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function beginResize(e: ReactPointerEvent, block: PlanBlock) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sy = e.clientY;
    let current = block.durationMin;
    setResizing({ id: block.id, durationMin: current });
    const move = (ev: PointerEvent) => {
      current = resizeDuration(block.startMin, block.durationMin, (ev.clientY - sy) / PX_PER_MIN);
      setResizing({ id: block.id, durationMin: current });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setResizing(null);
      p.actions.resize(block, current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return { drag, live, resizing, begin, beginResize };
}

function GridBlock({
  p,
  block,
  lane,
  lanes,
  g,
  wide,
}: {
  p: Planner;
  block: PlanBlock;
  lane: number;
  lanes: number;
  g: ReturnType<typeof useGridDrag>;
  wide: boolean;
}) {
  const meeting = isMeetingBlock(block);
  const draft = isAutoBlock(block);
  const duration = g.resizing?.id === block.id ? g.resizing.durationMin : block.durationMin;
  const done = meeting ? !!block.done : p.blockDone(block);
  const title = p.blockTitle(block);
  const h = Math.max(duration, 20) * PX_PER_MIN - 2;
  const tall = h >= 42;
  const hex = PLAN_HEX[block.color];
  const moving = g.drag?.kind === "move" && g.drag.block.id === block.id;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${meeting ? "Встреча: " : ""}${title}, ${formatRange(block.startMin, duration)}${draft ? ", с канбана" : ""}`}
      title={draft ? "С канбана — перетащите или растяните, чтобы закрепить" : undefined}
      onPointerDown={meeting ? undefined : (e) => g.begin(e, { kind: "move", block, grabMin: (e.clientY - e.currentTarget.getBoundingClientRect().top) / PX_PER_MIN })}
      onClick={meeting ? () => p.actions.openBlock(block) : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.actions.openBlock(block);
        if (e.key === "Delete" && !meeting && !draft) p.actions.removeBlock(block);
      }}
      className={`group absolute touch-none overflow-hidden outline-none transition-opacity focus-visible:brightness-125 ${meeting ? "cursor-pointer" : "cursor-grab"}`}
      style={{
        top: block.startMin * PX_PER_MIN + 1,
        height: h,
        left: `calc(${(lane / lanes) * 100}% + 3px)`,
        width: `calc(${100 / lanes}% - 6px)`,
        borderRadius: 10,
        padding: tall ? "6px 8px 6px 10px" : "2px 8px 2px 10px",
        background: meeting ? "rgba(10,132,255,0.14)" : draft ? "rgba(255,255,255,0.025)" : tint(hex, 0.16),
        outline: draft ? "1px dashed rgba(255,255,255,0.16)" : undefined,
        outlineOffset: -1,
        opacity: moving ? 0.3 : done ? 0.45 : 1,
        zIndex: 2,
      }}
    >
      <span className="absolute" style={{ left: 0, top: 0, bottom: 0, width: 3, background: meeting ? C.accent : draft ? tint(hex, 0.5) : hex }} />
      <div className="flex items-start gap-1">
        <p className="min-w-0 flex-1 truncate" style={{ fontSize: 12, lineHeight: "16px", fontWeight: 500, color: C.text, textDecoration: done ? "line-through" : undefined }}>
          {meeting && <Video size={12} strokeWidth={1.75} color="#5AA9FF" className="mr-1 inline align-[-2px]" />}
          {title}
        </p>
        {tall && !draft && (
          <span className={done ? "" : "opacity-0 transition-opacity group-hover:opacity-100"}>
            <RoundCheck done={done} onChange={() => p.actions.toggleBlock(block)} size={16} />
          </span>
        )}
      </div>
      {tall && (
        <p className="truncate" style={{ fontSize: 11, lineHeight: "14px", color: C.text2, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
          {wide && lanes === 1 ? formatRange(block.startMin, duration) : `${formatClock(block.startMin)} · ${formatDuration(duration)}`}
        </p>
      )}
      {!meeting && (
        <div onPointerDown={(e) => g.beginResize(e, block)} className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize justify-center" aria-hidden>
          <span className="mt-0.5 h-0.5 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "rgba(255,255,255,0.4)" }} />
        </div>
      )}
    </div>
  );
}

function WeekGrid({ p, g, scrollRef }: { p: Planner; g: ReturnType<typeof useGridDrag>; scrollRef: React.RefObject<HTMLDivElement> }) {
  const nowMin = useNowMin();
  const wide = useWide(1400);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = OPEN_AT_HOUR * HOUR_PX - 12;
  }, [scrollRef]);
  const ghostMin = g.drag?.kind === "new" ? g.drag.source.durationMin : g.drag?.kind === "move" ? g.drag.block.durationMin : 0;
  return (
    <section data-lab-block="grid" className="min-w-0 flex-1 overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
      <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden [scrollbar-width:thin]" style={{ height: "calc(100vh - 236px)", minHeight: 420, scrollbarColor: `${C.line2} transparent` }}>
        <div className="grid" style={{ gridTemplateColumns: `${TIME_COL}px repeat(7, minmax(0, 1fr))` }}>
          <div className="sticky top-0 z-20" style={{ background: C.card, ...dashed }} />
          {p.days.map((d) => {
            const total = totalMinutes(p.weekBlocks.filter((b) => b.date === d.date));
            return (
              <div key={d.date} className="sticky top-0 z-20 flex items-center gap-2 px-2.5" style={{ height: 60, background: C.card, ...dashed }}>
                <span
                  className="grid shrink-0 place-items-center"
                  style={{ width: 32, height: 32, borderRadius: 999, background: d.isToday ? "rgba(10,132,255,0.16)" : "transparent", color: d.isToday ? "#5AA9FF" : C.text, ...T.num, fontSize: 16 }}
                >
                  {d.short.split(" ")[0]}
                </span>
                <div className="min-w-0">
                  <div className="truncate" style={{ ...T.body, color: d.isToday ? C.text : C.text2 }}>
                    {dayShort(d.date)}
                  </div>
                  <div className="truncate" style={{ fontSize: 11, color: C.text3 }}>
                    {total ? formatDuration(total) : "—"}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="relative" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-2.5 -translate-y-1/2" style={{ top: h * HOUR_PX, fontSize: 11, color: C.text3, fontVariantNumeric: "tabular-nums" }}>
                {h === 0 ? "" : formatClock(h * 60)}
              </span>
            ))}
          </div>

          {p.days.map((d) => {
            const placed = layoutDay(p.weekBlocks.filter((b) => b.date === d.date));
            const ghost = g.live?.target?.date === d.date && g.drag ? g.live.target : null;
            return (
              <div
                key={d.date}
                data-plan-day={d.date}
                className="relative"
                style={{
                  height: 24 * HOUR_PX,
                  background: d.isToday ? "rgba(10,132,255,0.035)" : undefined,
                  backgroundImage: `linear-gradient(to bottom, ${C.line} 1px, transparent 1px)`,
                  backgroundSize: `100% ${HOUR_PX}px`,
                  boxShadow: `inset 1px 0 0 ${C.line}`,
                }}
              >
                {placed.map(({ block, lane, lanes }) => (
                  <GridBlock key={block.id} p={p} block={block} lane={lane} lanes={lanes} g={g} wide={wide} />
                ))}
                {ghost && (
                  <div
                    className="pointer-events-none absolute z-10 px-2 py-1"
                    style={{ top: ghost.startMin * PX_PER_MIN, height: ghostMin * PX_PER_MIN, left: 3, right: 3, borderRadius: 10, background: "rgba(10,132,255,0.12)", outline: "1.5px dashed rgba(10,132,255,0.7)", outlineOffset: -1.5, fontSize: 11, color: "#5AA9FF", fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatRange(ghost.startMin, ghostMin)}
                  </div>
                )}
                {d.isToday && (
                  <div className="pointer-events-none absolute inset-x-0 z-[5] flex items-center" style={{ top: nowMin * PX_PER_MIN }}>
                    <span className="-ml-1 h-2 w-2 rounded-full" style={{ background: C.accent }} />
                    <span className="h-px flex-1" style={{ background: C.accent }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PanelHead({ icon, title, count, right }: { icon: React.ReactNode; title: string; count?: number; right?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5" style={{ minHeight: 32 }}>
      <span style={{ color: C.text2 }}>{icon}</span>
      <h2 style={T.title}>{title}</h2>
      {count !== undefined && <span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>{count}</span>}
      <div className="ml-auto">{right}</div>
    </div>
  );
}

export default function PlannerHourGrid() {
  const p = usePlanner();
  const scrollRef = useRef<HTMLDivElement>(null);
  const g = useGridDrag(p, scrollRef);
  const [formOpen, setFormOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return p.openTasks.filter((t) => !s || t.title.toLowerCase().includes(s));
  }, [p.openTasks, q]);
  const weekTotal = totalMinutes(p.weekBlocks);

  return (
    <CraftShell
      active="planner"
      crumb="Планер"
      title="Планер"
      subtitle={`${weekTotal ? formatDuration(weekTotal) : "ничего"} в плане на неделю`}
      actions={
        <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={() => setFormOpen(true)}>
          Новый ритуал
        </Btn>
      }
      titleRight={
        <>
          <MirrorToggle p={p} />
          <WeekNav p={p} />
        </>
      }
    >
      <div className={`mt-6 flex gap-3 ${g.drag ? "cursor-grabbing select-none" : ""}`}>
        <WeekGrid p={p} g={g} scrollRef={scrollRef} />

        <aside className="flex shrink-0 flex-col gap-3" style={{ width: 296, height: "calc(100vh - 236px)", minHeight: 420 }}>
          <section data-lab-block="routines" className="flex flex-col gap-3 p-4" style={{ background: C.card, borderRadius: R.card }}>
            <PanelHead
              icon={<Pin size={18} strokeWidth={1.75} />}
              title="Закреплённые"
              right={
                <button type="button" aria-label={formOpen ? "Закрыть" : "Добавить ритуал"} onClick={() => setFormOpen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[#26262C]" style={{ color: C.text2 }}>
                  {formOpen ? <X size={16} strokeWidth={1.75} /> : <Plus size={16} strokeWidth={1.75} />}
                </button>
              }
            />
            {formOpen && (
              <RoutineForm
                onAdd={(v) => {
                  p.actions.addTemplate(v);
                  setFormOpen(false);
                }}
                onCancel={() => setFormOpen(false)}
              />
            )}
            {p.templates.length === 0 && !formOpen ? (
              <Empty>Повторяющееся — тренировку, английский — закрепите здесь и перетаскивайте на дни</Empty>
            ) : (
              <div className="flex flex-col gap-1.5">
                {p.templates.map((t) => (
                  <div
                    key={t.id}
                    onPointerDown={(e) => g.begin(e, { kind: "new", source: { title: t.title, durationMin: t.durationMin, color: t.color, templateId: t.id } })}
                    className="group relative flex cursor-grab touch-none items-center gap-2 overflow-hidden pl-4 pr-1.5 transition-colors hover:bg-[#232328]"
                    style={{ height: 44, borderRadius: 12, background: tint(PLAN_HEX[t.color], 0.12) }}
                  >
                    <span className="absolute" style={{ left: 0, top: 0, bottom: 0, width: 3, background: PLAN_HEX[t.color] }} />
                    <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                      {t.title}
                    </span>
                    <span className="shrink-0" style={{ ...T.foot, color: C.text2 }}>
                      {formatDuration(t.durationMin)}
                    </span>
                    <HoverAct title={`Открепить: ${t.title}`} danger onClick={() => p.actions.deleteTemplate(t.id)}>
                      <Trash2 size={14} strokeWidth={1.75} />
                    </HoverAct>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section data-lab-block="tasks" className="flex min-h-0 flex-1 flex-col gap-3 p-4" style={{ background: C.card, borderRadius: R.card }}>
            <PanelHead icon={<ListTodo size={18} strokeWidth={1.75} />} title="Задачи" count={p.openTasks.length} />
            <label className="flex shrink-0 items-center gap-2.5 px-3.5" style={{ height: 40, borderRadius: 999, background: C.raise }}>
              <Search size={16} strokeWidth={1.75} color={C.text2} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти задачу" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]" style={{ fontSize: 14, color: C.text }} />
            </label>
            <div className="-mx-2 flex min-h-0 flex-col overflow-y-auto [scrollbar-width:thin]" style={{ scrollbarColor: `${C.line2} transparent` }}>
              {list.length === 0 ? (
                <div className="px-2 py-6 text-center" style={{ ...T.body, color: C.text3 }}>
                  {q ? "Ничего не найдено" : "Открытых задач нет"}
                </div>
              ) : (
                list.map((t) => (
                  <div
                    key={t.id}
                    onPointerDown={(e) => g.begin(e, { kind: "new", source: { title: t.title, durationMin: durationForTask(t.estimateMin), color: "blue", taskId: t.id } })}
                    className="flex shrink-0 cursor-grab touch-none items-center gap-2.5 px-2 transition-colors hover:bg-[#1E1E22]"
                    style={{ minHeight: 44, borderRadius: 10 }}
                  >
                    <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[t.priority] }} />
                    <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                      {t.title}
                    </span>
                    {p.plannedTaskIds.has(t.id) ? (
                      <span className="shrink-0 px-2" style={{ height: 20, lineHeight: "20px", borderRadius: 99, background: "rgba(10,132,255,0.14)", color: "#5AA9FF", fontSize: 11 }}>
                        в плане
                      </span>
                    ) : (
                      <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
                        {formatDuration(durationForTask(t.estimateMin))}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {g.drag && g.live && (
        <div
          className="pointer-events-none fixed z-50 flex max-w-[260px] -translate-x-1/2 -translate-y-full items-center gap-2 px-3"
          style={{ left: g.live.x, top: g.live.y - 10, height: 32, borderRadius: 999, background: C.raise, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 16px 40px rgba(0,0,0,0.55)`, fontSize: 12, color: C.text }}
        >
          <span className="truncate">{g.drag.kind === "new" ? g.drag.source.title : p.blockTitle(g.drag.block)}</span>
          {g.live.target && (
            <span className="shrink-0" style={{ color: "#5AA9FF", fontVariantNumeric: "tabular-nums" }}>
              {dayShort(g.live.target.date)} {formatClock(g.live.target.startMin)}
            </span>
          )}
        </div>
      )}
      <PlannerDialogs p={p} />
    </CraftShell>
  );
}
