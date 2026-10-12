/**
 * Планер · Craft Dark · v5 «Обзор недели» — the week as a calm report (refs 5, 8: a row of summary
 * tiles over the working list). On top: closed against the week's norm (ring), the load per day in
 * capsule bars (a bar picks the day), meetings and the backlog. Below: one plain list of the week
 * grouped by day, filterable by kind; each row moves to another day from its hover menu, opens on a
 * click, and the solid add puts a task on the picked day.
 */
import { useMemo, useRef, useState } from "react";
import { CalendarClock, ChartColumn, Inbox, Plus, X } from "lucide-react";

import { Btn, C, CapsuleBars, Empty, PillTabs, R, Ring, T, TONE, dashed } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import {
  DayAdd,
  ItemRow,
  PRIO_DOT,
  PlannerDialogs,
  WeekNav,
  countLabel,
  dayLong,
  dayShort,
  formatDuration,
  usePlanner,
  type ItemKind,
  type Planner,
} from "./_parts";

type Filter = "all" | ItemKind;

function Tile({ children, area, className = "" }: { children: React.ReactNode; area?: string; className?: string }) {
  return (
    <section data-lab-block={area} className={`flex min-w-0 flex-col p-6 ${className}`} style={{ background: C.card, borderRadius: R.card }}>
      {children}
    </section>
  );
}

function TileHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span style={{ color: C.text2 }}>{icon}</span>
        <h2 style={T.title}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

function LoadTile({ p, sel, onSel }: { p: Planner; sel: string | null; onSel: (d: string | null) => void }) {
  const data = p.days.map((d) => ({ label: dayShort(d.date), value: Math.round(p.stats(d.date).minutes / 6) / 10 }));
  const todayIdx = p.days.findIndex((d) => d.isToday);
  const selIdx = sel ? p.days.findIndex((d) => d.date === sel) : -1;
  const [hover, setHover] = useState<number | null>(null);
  const busiestIdx = data.reduce((b, x, i) => (x.value > data[b].value ? i : b), 0);
  const hi = hover ?? (selIdx >= 0 ? selIdx : todayIdx >= 0 && data[todayIdx].value > 0 ? todayIdx : busiestIdx);
  const busiest = p.days.reduce((b, d) => (p.stats(d.date).minutes > p.stats(b.date).minutes ? d : b), p.days[0]);
  const H = 150;
  return (
    <Tile area="load">
      <TileHead
        icon={<ChartColumn size={18} strokeWidth={1.75} />}
        title="Нагрузка по дням"
        right={
          <span className="whitespace-nowrap" style={{ ...T.foot, color: C.text2, padding: "6px 12px", borderRadius: 999, background: C.raise }}>
            плотнее всего — {dayShort(busiest.date).toLowerCase()}
          </span>
        }
      />
      <div className="mt-3 flex items-baseline gap-2">
        <span style={{ ...T.num, fontSize: 40, lineHeight: 1 }}>{formatDuration(p.week.minutes)}</span>
        <span style={{ ...T.body, color: C.text2 }}>в плане на неделю</span>
      </div>
      <div className="relative mt-auto pt-6" onMouseLeave={() => setHover(null)}>
        <CapsuleBars data={data} height={H} highlight={hi} />
        <div className="absolute inset-x-0 flex gap-1.5" style={{ top: 24, height: H + 22 }}>
          {p.days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              aria-label={`${d.label}: ${formatDuration(p.stats(d.date).minutes)}`}
              className="flex-1 cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onClick={() => onSel(sel === d.date ? null : d.date)}
            />
          ))}
        </div>
      </div>
    </Tile>
  );
}

export default function PlannerWeekOverview() {
  const p = usePlanner();
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const addRef = useRef<HTMLInputElement>(null);
  const weekNorm = p.goal * p.days.length;
  const pct = (p.week.done / weekNorm) * 100;
  const now = Date.now();

  const meetings = useMemo(
    () =>
      p.days
        .flatMap((d) => p.byDay.get(d.date) ?? [])
        .filter((x) => x.kind === "meeting")
        .sort((a, b) => a.date.localeCompare(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0)),
    [p.days, p.byDay]
  );
  const next = meetings.find((m) => !m.done && new Date(`${m.date}T${m.meeting?.time ?? "00:00"}`).getTime() > now);

  const counts = useMemo(() => {
    const all = p.days.flatMap((d) => p.byDay.get(d.date) ?? []);
    return { all: all.length, task: all.filter((x) => x.kind === "task").length, meeting: all.filter((x) => x.kind === "meeting").length, routine: all.filter((x) => x.kind === "routine").length };
  }, [p.days, p.byDay]);

  const shownDays = sel ? p.days.filter((d) => d.date === sel) : p.days;
  const addDay = sel ?? p.todayCol ?? p.days[0].date;

  const groups = shownDays
    .map((d) => ({ d, items: (p.byDay.get(d.date) ?? []).filter((x) => filter === "all" || x.kind === filter) }))
    .filter((g) => g.items.length > 0 || sel);

  return (
    <CraftShell
      active="planner"
      crumb="Планер"
      title="Планер"
      subtitle={`${p.rangeLabel} · ${countLabel(p.week.tasks)}`}
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
      <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.5fr) minmax(0,1fr)" }}>
        <Tile area="norm">
          <TileHead icon={<CalendarClock size={18} strokeWidth={1.75} />} title="Неделя" />
          <div className="flex flex-1 items-center justify-center py-5">
            <Ring pct={pct} size={148} stroke={12}>
              <div className="text-center">
                <div style={{ ...T.num, fontSize: 40, lineHeight: 1 }}>
                  {p.week.done}
                  <span style={{ color: C.text3, fontWeight: 400, fontSize: 24 }}>/{weekNorm}</span>
                </div>
                <div style={{ ...T.foot, color: C.text2, marginTop: 6 }}>закрыто по норме</div>
              </div>
            </Ring>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4" style={{ ...dashed, backgroundPosition: "left top" }}>
            <div className="min-w-0">
              <div style={{ ...T.foot, color: C.text2 }}>В плане</div>
              <div className="mt-1 truncate" style={{ ...T.num, fontSize: 20, lineHeight: 1.2 }}>
                {p.week.tasks}
              </div>
            </div>
            <div className="min-w-0">
              <div style={{ ...T.foot, color: C.text2 }}>Норма в день</div>
              <div className="mt-1 truncate" style={{ ...T.num, fontSize: 20, lineHeight: 1.2 }}>
                {p.goal}
              </div>
            </div>
          </div>
        </Tile>

        <LoadTile p={p} sel={sel} onSel={setSel} />

        <div className="flex min-w-0 flex-col gap-3">
          <Tile area="meetings" className="flex-1">
            <TileHead icon={<CalendarClock size={18} strokeWidth={1.75} />} title="Встречи" right={<span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>{meetings.length}</span>} />
            {next ? (
              <div className="mt-4 flex flex-col gap-1 p-4" style={{ background: C.raise, borderRadius: R.inner }}>
                <div className="flex items-baseline gap-2">
                  <span style={{ ...T.title, ...T.num }}>{next.meeting?.time}</span>
                  <span style={{ ...T.foot, color: C.text3 }}>
                    {dayShort(next.date)}, {dayLong(next.date)}
                  </span>
                </div>
                <div className="truncate" style={{ ...T.body, color: C.text }}>
                  {next.title}
                </div>
              </div>
            ) : (
              <div className="mt-3" style={{ ...T.body, color: C.text3 }}>
                {meetings.length ? "Все встречи недели прошли" : "На этой неделе встреч нет"}
              </div>
            )}
          </Tile>
          <Tile area="backlog">
            <TileHead icon={<Inbox size={18} strokeWidth={1.75} />} title="Без даты" right={<span style={{ ...T.num, fontSize: 24, lineHeight: 1 }}>{p.backlog.length}</span>} />
            <div className="mt-3 flex flex-col gap-1.5">
              {p.backlog.slice(0, 2).map((t) => (
                <button key={t.id} type="button" onClick={() => p.setEditTaskId(t.id)} className="flex min-w-0 items-center gap-2 text-left hover:text-[#F4F5F7]" style={{ ...T.body, color: C.text2 }}>
                  <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[t.priority] }} />
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
              {p.backlog.length > 2 && <span style={{ ...T.foot, color: C.text3 }}>и ещё {p.backlog.length - 2}</span>}
              {p.backlog.length === 0 && <span style={{ ...T.body, color: C.text3 }}>Всё разложено по дням</span>}
            </div>
          </Tile>
        </div>
      </div>

      <section data-lab-block="list" className="mt-3 flex flex-col overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
        <header className="flex items-center justify-between gap-4 px-6" style={{ height: 72, ...dashed }}>
          <div className="flex items-center gap-3">
            <h2 style={T.title}>План недели</h2>
            {sel && (
              <button
                type="button"
                onClick={() => setSel(null)}
                className="inline-flex items-center gap-1.5 pl-3.5 pr-2.5 transition-colors hover:brightness-125"
                style={{ height: 32, borderRadius: 999, background: "rgba(10,132,255,0.14)", color: C.text, fontSize: 13 }}
              >
                {dayShort(sel)}, {dayLong(sel)}
                <X size={14} strokeWidth={1.75} color={C.text2} />
              </button>
            )}
          </div>
          <PillTabs<Filter>
            size={36}
            value={filter}
            onChange={setFilter}
            items={[
              { id: "all", label: "Всё" },
              { id: "task", label: `Задачи · ${counts.task}` },
              { id: "meeting", label: `Встречи · ${counts.meeting}` },
              { id: "routine", label: `Ритуалы · ${counts.routine}` },
            ]}
          />
        </header>

        {groups.length === 0 ? (
          <div className="px-6 pt-5">
            <Empty>{filter === "all" ? "Неделя пока пустая — добавьте первую задачу ниже" : "Здесь ничего нет"}</Empty>
          </div>
        ) : (
          groups.map(({ d, items }) => {
            const s = p.stats(d.date);
            return (
              <div key={d.date}>
                <div className="flex items-baseline justify-between gap-4 px-6 pb-2 pt-6">
                  <div className="flex items-baseline gap-2">
                    <span style={{ ...T.cell, fontWeight: 500, color: d.isToday ? "#5AA9FF" : C.text }}>{d.isToday ? "Сегодня" : d.label}</span>
                    <span style={{ ...T.body, color: C.text3 }}>{dayLong(d.date)}</span>
                  </div>
                  <span style={{ ...T.foot, ...T.num, fontWeight: 400, color: s.tasks > p.goal ? TONE.amber.fg : C.text3 }}>
                    {s.done}/{p.goal} · {s.minutes ? formatDuration(s.minutes) : "свободно"}
                  </span>
                </div>
                <div style={{ height: 1, ...dashed }} />
                {items.length === 0 ? (
                  <div className="px-6 py-4" style={{ ...T.body, color: C.text3 }}>
                    {filter === "all" ? "Свободный день" : "Ничего"}
                  </div>
                ) : (
                  items.map((it) => <ItemRow key={it.key} p={p} it={it} />)
                )}
              </div>
            );
          })
        )}

        <div data-lab-block="add" className="p-6 pt-5">
          <DayAdd
            solid
            height={56}
            inputRef={addRef}
            onAdd={(v) => p.actions.addToDay(v, addDay)}
            placeholder={`Новая задача на ${dayShort(addDay).toLowerCase()}, ${dayLong(addDay)} — «завтра 15:00 #дизайн»`}
          />
        </div>
      </section>
      <PlannerDialogs p={p} />
    </CraftShell>
  );
}

