/**
 * Dashboard · Craft Dark (style only) · v3 «Канбан дня» — composition from refs 6 (Taskplus kanban)
 * and 11 (Workspace orders kanban), rebuilt in the Craft Dark visual language.
 *
 *   ┌ sidebar (panel 24) ┐ ┌ page panel 24 ───────────────────────────────────────────────┐
 *   │ logo · avatar      │ │ Рабочий стол / Сегодня                  bell · Новая задача │
 *   │ Поиск · Уведомл.   │ │ [folder] Сегодня                                             │
 *   │ ── Разделы ──      │ │ [Доска · Список · Таймлайн]                Фильтр · Сортировка│
 *   │ nav pills          │ │ ring 0 из 24 │ status split bar + numbers │ Заметка ▾        │
 *   │                    │ │ ┌Просрочено┐┌В плане┐┌Готово сегодня┐┌Встречи┐  (lanes 20)  │
 *   │ streak promo card  │ │ │ cards 16 ││ + Доб.││ empty / done ││ empty │              │
 *   └────────────────────┘ └──────────────────────────────────────────────────────────────┘
 *
 * Lanes: overdue → «Просрочено» (first 5 + «ещё N»), open not overdue → «В плане», closed today →
 * «Готово сегодня» (ticking a card moves it there), meetings → «Встречи». Calm with 24 overdue: the
 * overdue tone lives only in the lane header pill; cards stay neutral with a grey «days late» tick bar.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDownWideNarrow,
  Bell,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  ChartColumn,
  ChevronDown,
  Columns3,
  Flame,
  FolderKanban,
  GanttChart,
  LayoutDashboard,
  List,
  ListChecks,
  ListFilter,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  Avatar,
  Btn,
  C,
  Empty,
  IconBtn,
  Logo,
  NoteBox,
  R,
  Ring,
  RoundCheck,
  Row,
  SplitBar,
  StatusPill,
  T,
  TH,
  TONE,
  dashed,
  plural,
  rootStyle,
  type Tone,
} from "@/design-lab/screens/_kit/craft";
import { useDashboardModel, type DashboardModel, type TodayRow } from "@/design-lab/screens/dashboardModel";

// ── Local helpers ─────────────────────────────────────────────────────────────────────────────

const NAV_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Users,
  projects: FolderKanban,
  tasks: ListChecks,
  planner: CalendarClock,
  notes: NotebookPen,
  analytics: ChartColumn,
  knowledge: BookOpen,
};

const PRIO_DOT: Record<number, string> = { 0: "#4A4C54", 1: C.red, 2: C.amber, 3: C.accent };
const PRIO_NAME: Record<number, string> = { 0: "Обычный", 1: "Высокий", 2: "Средний", 3: "Низкий" };

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const OVERDUE_CAP = 5;

function daysLate(due?: string) {
  if (!due) return 0;
  const a = new Date(due + "T00:00:00");
  const b = new Date(new Date().toDateString());
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, open, close]);
}

// ── Sidebar ───────────────────────────────────────────────────────────────────────────────────

function SideItem({ icon: Icon, label, active, badge, hint }: { icon: LucideIcon; label: string; active?: boolean; badge?: number; hint?: string }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 text-left transition-colors duration-150 hover:bg-[#1B1B1F]"
      style={{
        height: 40,
        borderRadius: 999,
        background: active ? C.raise : undefined,
        boxShadow: active ? `inset 0 0 0 1px ${C.line2}` : undefined,
        color: active ? C.text : C.text2,
        fontSize: 14,
      }}
    >
      <Icon {...ICON} color={active ? C.text : C.text2} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span style={{ ...T.foot, color: C.text3 }}>{hint}</span>}
      {badge ? (
        <span className="grid place-items-center" style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 99, background: C.accent, color: "#fff", fontSize: 12 }}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function StreakCard({ m }: { m: DashboardModel }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const k = m.kpi;
  return (
    <div className="p-4" style={{ background: C.card, borderRadius: R.card }}>
      <div className="flex items-center gap-3">
        <span className="grid shrink-0 place-items-center" style={{ width: 36, height: 36, borderRadius: 99, background: "rgba(10,132,255,0.10)", boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.22)", color: "#5AA9FF" }}>
          <Flame size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1" style={{ ...T.cell, fontWeight: 500 }}>
          Серия {k.streak} {plural(k.streak, "день", "дня", "дней")}
        </span>
        <button type="button" aria-label="Скрыть" onClick={() => setOpen(false)} className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-[#1E1E22]" style={{ color: C.text3 }}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="mt-3" style={{ ...T.foot, color: C.text2, lineHeight: 1.45 }}>
        {k.streak > 0 ? `Лучшая — ${k.bestStreak}. Закройте задачу, чтобы продлить.` : `Лучшая — ${k.bestStreak}. Закройте одну задачу, чтобы начать новую.`}
      </div>
      <div className="mt-4 flex items-center justify-between" style={{ ...T.foot, color: C.text3 }}>
        <span className="truncate">
          Уровень {k.level} · {k.levelTitle}
        </span>
        <span style={T.num}>{Math.round(k.levelPct)}%</span>
      </div>
      <div className="mt-2 overflow-hidden" style={{ height: 6, borderRadius: 99, background: C.raise }}>
        <div style={{ width: `${Math.max(0, Math.min(100, k.levelPct))}%`, height: "100%", borderRadius: 99, background: C.accent }} />
      </div>
    </div>
  );
}

function Sidebar({ m }: { m: DashboardModel }) {
  return (
    <aside
      className="sticky top-5 flex shrink-0 flex-col self-start overflow-y-auto [scrollbar-width:none]"
      style={{ width: 248, height: "calc(100vh - 40px)", background: C.panel, borderRadius: R.page, padding: "20px 16px 16px" }}
    >
      <div className="flex items-center justify-between pl-2" style={{ height: 40 }}>
        <Logo />
        <Avatar size={36} />
      </div>
      <div className="my-4" style={{ height: 1, background: C.line }} />
      <SideItem icon={Search} label="Поиск" hint="⌘K" />
      <div className="mb-2 mt-6 px-4" style={{ ...T.foot, color: C.text3 }}>
        Разделы
      </div>
      <nav className="flex flex-col gap-0.5">
        {m.nav.map((n) => (
          <SideItem key={n.id} icon={NAV_ICON[n.id] ?? LayoutDashboard} label={n.label} active={n.id === "dashboard"} badge={n.badge} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 pt-5">
        <StreakCard m={m} />
        <SideItem icon={Settings} label="Настройки" />
      </div>
    </aside>
  );
}

// ── Toolbar pieces ────────────────────────────────────────────────────────────────────────────

type View = "board" | "list" | "timeline";

function ViewTabs({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const items: { id: View; label: string; icon: LucideIcon }[] = [
    { id: "board", label: "Доска", icon: Columns3 },
    { id: "list", label: "Список", icon: List },
    { id: "timeline", label: "Таймлайн", icon: GanttChart },
  ];
  return (
    <div className="flex items-center gap-1 p-1" style={{ borderRadius: 999, background: C.card }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className="flex items-center gap-2 whitespace-nowrap transition-colors duration-150"
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 999,
              background: on ? C.raise : "transparent",
              boxShadow: on ? `inset 0 0 0 1px ${C.line2}` : undefined,
              color: on ? C.text : C.text3,
              fontSize: 14,
            }}
          >
            <it.icon size={16} strokeWidth={1.75} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function ToolPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 whitespace-nowrap px-4 transition-colors duration-150 hover:bg-[#1E1E22]"
      style={{ height: 44, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${C.line2}`, fontSize: 14, color: C.text }}
    >
      <Icon size={16} strokeWidth={1.75} color={C.text2} />
      {label}
    </button>
  );
}

function FolderTile() {
  return (
    <svg width="52" height="44" viewBox="0 0 52 44" fill="none" aria-hidden>
      <defs>
        <linearGradient id="v3folder" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3D9DFF" />
          <stop offset="1" stopColor="#0A6CF0" />
        </linearGradient>
      </defs>
      <path d="M0 8a6 6 0 0 1 6-6h12.5a6 6 0 0 1 4.2 1.7L26 7h20a6 6 0 0 1 6 6v25a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V8Z" fill="#0A5BC8" />
      <path d="M0 15a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6v23a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V15Z" fill="url(#v3folder)" />
      <path d="M6 10h40a5 5 0 0 1 5 5" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none" />
    </svg>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────────────────────

function NoteButton({ onSave }: { onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 whitespace-nowrap px-4 transition-colors duration-150 hover:bg-[#232327]"
        style={{ height: 44, borderRadius: 999, background: open ? C.line : C.raise, fontSize: 14, color: C.text }}
      >
        <NotebookPen size={16} strokeWidth={1.75} color={C.text2} />
        Заметка
        <ChevronDown size={16} strokeWidth={1.75} color={C.text2} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 p-4"
          style={{ top: 52, width: 360, background: C.panel, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span style={{ ...T.cell, fontWeight: 500 }}>Быстрая заметка</span>
            <span style={{ ...T.foot, color: C.text3 }}>сохранится в «Заметки»</span>
          </div>
          <NoteBox
            rows={5}
            onSave={(v) => {
              onSave(v);
              if (v.trim()) setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Summary({ m, done, total }: { m: DashboardModel; done: number; total: number }) {
  const s = m.status;
  const pct = total ? (done / total) * 100 : 0;
  const legend: { label: string; value: number; tone: Tone }[] = [
    { label: "Готово", value: s.doneAll, tone: "blue" },
    { label: "В работе", value: s.inProgress, tone: "neutral" },
    { label: "Просрочено", value: s.overdueAll, tone: "amber" },
  ];
  return (
    <div className="flex items-center gap-6 py-3 pl-3 pr-3" style={{ background: C.card, borderRadius: R.card }}>
      <div className="flex shrink-0 items-center gap-3">
        <Ring pct={pct} size={44} stroke={4}>
          <span style={{ ...T.foot, ...T.num, color: C.text2 }}>{Math.round(pct)}%</span>
        </Ring>
        <div>
          <div style={{ ...T.cell, ...T.num }}>
            {done} <span style={{ color: C.text3, fontWeight: 400 }}>из {total}</span>
          </div>
          <div style={{ ...T.foot, color: C.text3, marginTop: 2 }}>закрыто сегодня</div>
        </div>
      </div>
      <div className="shrink-0 self-stretch" style={{ width: 1, background: C.line }} />
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex flex-wrap items-center gap-x-5 gap-y-1">
          <span style={{ ...T.foot, color: C.text3 }}>Все задачи</span>
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5" style={{ ...T.foot, color: C.text2 }}>
              <span style={{ width: 6, height: 6, borderRadius: 9, background: l.tone === "neutral" ? "#5A5C64" : TONE[l.tone].dot }} />
              {l.label}
              <span style={{ ...T.num, color: C.text }}>{l.value}</span>
            </span>
          ))}
        </div>
        <SplitBar height={6} parts={legend.map((l) => ({ value: l.value, tone: l.tone, label: `${l.label}: ${l.value}` }))} />
      </div>
      <NoteButton onSave={m.actions.saveNote} />
    </div>
  );
}

// ── Board pieces ──────────────────────────────────────────────────────────────────────────────

function PrioTag({ p }: { p: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ height: 24, padding: "0 10px", borderRadius: 999, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, ...T.foot, color: C.text2 }}>
      <span style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[p] ?? PRIO_DOT[0] }} />
      {PRIO_NAME[p] ?? PRIO_NAME[0]}
    </span>
  );
}

/** Taskplus-style tick bar: 10 thin capsules, `on` of them lit. */
function Ticks({ on, of = 10, color }: { on: number; of?: number; color: string }) {
  return (
    <span className="flex items-center gap-[3px]">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} style={{ width: 3, height: 12, borderRadius: 99, background: i < on ? color : C.line2 }} />
      ))}
    </span>
  );
}

function TaskCard({ r, onToggle, done }: { r: TodayRow; onToggle: () => void; done?: boolean }) {
  const late = r.overdue ? daysLate(r.due) : 0;
  const when = r.overdue ? `с ${r.dueLabel}` : r.dueLabel === "Сегодня" ? "сегодня" : r.dueLabel;
  let foot: ReactNode = null;
  if (done) {
    foot = <span style={{ ...T.foot, color: C.text3 }}>закрыто</span>;
  } else if (r.subtasksTotal > 0) {
    const on = Math.round((r.subtasksDone / r.subtasksTotal) * 10);
    foot = (
      <>
        <Ticks on={on} color={C.accent} />
        <span style={{ ...T.foot, ...T.num, color: C.text }}>
          {r.subtasksDone} <span style={{ color: C.text3 }}>/ {r.subtasksTotal}</span>
        </span>
      </>
    );
  } else if (late > 0) {
    foot = (
      <>
        <Ticks on={Math.min(10, late)} color="#6E7079" />
        <span style={{ ...T.foot, color: C.text3 }}>
          {late} {plural(late, "день", "дня", "дней")} в просрочке
        </span>
      </>
    );
  } else if (r.estimateMin) {
    foot = <span style={{ ...T.foot, color: C.text3 }}>оценка {r.estimateMin} мин</span>;
  }
  return (
    <article
      className="group flex flex-col gap-3 p-4 transition-colors duration-150 hover:bg-[#222227]"
      style={{ background: C.raise, borderRadius: R.inner, opacity: r.overLimit && !done ? 0.55 : 1 }}
    >
      <div className="flex items-center justify-between gap-2">
        <PrioTag p={r.priority} />
        <RoundCheck done={!!done} onChange={onToggle} size={22} />
      </div>
      <div
        style={{
          ...T.body,
          fontWeight: 500,
          lineHeight: 1.4,
          color: done ? C.text3 : C.text,
          textDecoration: done ? "line-through" : undefined,
          textDecorationColor: C.text3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={r.title}
      >
        {r.title}
      </div>
      <div className="flex min-w-0 items-center gap-1.5" style={{ ...T.foot, color: C.text3 }}>
        <CalendarClock size={14} strokeWidth={1.75} className="shrink-0" />
        <span className="shrink-0">{when}</span>
        {r.projectName && (
          <>
            <span className="shrink-0">·</span>
            <span className="truncate" style={{ color: C.text2 }}>
              {r.projectName}
            </span>
          </>
        )}
      </div>
      {foot && (
        <div className="flex items-center gap-2.5 pt-3" style={{ ...dashedTop }}>
          {foot}
        </div>
      )}
    </article>
  );
}

const dashedTop: CSSProperties = { ...dashed, backgroundPosition: "left top" };

function Lane({
  tone,
  title,
  count,
  children,
  footer,
}: {
  tone: Tone;
  title: string;
  count: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col p-2.5" style={{ background: C.card, borderRadius: R.card }}>
      <header className="flex items-center gap-2 py-1.5 pl-1.5 pr-0.5">
        <StatusPill tone={tone} size={28}>
          {title}
        </StatusPill>
        <span style={{ ...T.body, ...T.num, color: C.text3 }}>{count}</span>
        <span className="flex-1" />
        <button type="button" aria-label="Действия" className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[#1E1E22]" style={{ color: C.text3 }}>
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </button>
      </header>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
      {footer && <div className="mt-2">{footer}</div>}
    </section>
  );
}

function LaneEmpty({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center" style={{ borderRadius: R.inner, border: `1px dashed ${C.line2}` }}>
      <span className="grid place-items-center" style={{ width: 44, height: 44, borderRadius: 99, boxShadow: `inset 0 0 0 1px ${C.line2}`, color: C.text2 }}>
        <Icon {...ICON} />
      </span>
      <div className="mt-4" style={{ ...T.body, fontWeight: 500, color: C.text }}>
        {title}
      </div>
      <div className="mt-1.5" style={{ ...T.foot, color: C.text3, lineHeight: 1.45, maxWidth: 200 }}>
        {sub}
      </div>
    </div>
  );
}

function GhostAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 transition-colors duration-150 hover:bg-[#1E1E22]"
      style={{ height: 44, borderRadius: 999, fontSize: 14, color: C.text2 }}
    >
      <Plus size={16} strokeWidth={1.75} />
      {label}
    </button>
  );
}

/** Inline add for a lane: the AddInput language (hairline field + pill), stacked to fit a lane. */
function LaneAdd({ onAdd, onClose }: { onAdd: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
      className="flex flex-col gap-2 p-2"
      style={{ background: C.raise, borderRadius: R.inner }}
    >
      <input
        ref={input}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        placeholder="Что сделать сегодня?"
        className="min-w-0 bg-transparent px-3 outline-none placeholder:text-[#5E6068]"
        style={{ height: 44, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${C.line2}`, fontSize: 14, color: C.text }}
      />
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="truncate" style={{ ...T.foot, color: C.text3 }}>
          Enter — добавить
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Закрыть" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[#2A2A30]" style={{ color: C.text2 }}>
            <X size={16} strokeWidth={1.75} />
          </button>
          <Btn type="submit" size={36} kind={v.trim() ? "primary" : "ghost"}>
            Добавить
          </Btn>
        </div>
      </div>
    </form>
  );
}

function MeetingCard({ mt, onToggle }: { mt: DashboardModel["meetings"][number]; onToggle: () => void }) {
  return (
    <article className="flex flex-col gap-3 p-4" style={{ background: C.raise, borderRadius: R.inner, opacity: mt.done ? 0.55 : 1 }}>
      <div className="flex items-center justify-between">
        <span style={{ ...T.title, ...T.num }}>{mt.time || "—"}</span>
        <RoundCheck done={!!mt.done} onChange={onToggle} />
      </div>
      <div style={{ ...T.body, fontWeight: 500, lineHeight: 1.4, color: C.text }}>{mt.title}</div>
      <div className="flex items-center gap-1.5" style={{ ...T.foot, color: C.text3 }}>
        <span>{mt.dateLabel}</span>
        <span>·</span>
        <span>{mt.durationMin} мин</span>
        {mt.clientName && (
          <>
            <span>·</span>
            <span className="truncate" style={{ color: C.text2 }}>
              {mt.clientName}
            </span>
          </>
        )}
      </div>
    </article>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────────────────────

export default function CraftDarkKanban() {
  const m = useDashboardModel();
  const [view, setView] = useState<View>("board");
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  /** Overdue tasks leave m.today once ticked — keep a snapshot so they land in «Готово сегодня». */
  const [closedHere, setClosedHere] = useState<TodayRow[]>([]);

  const lanes = useMemo(() => {
    const openIds = new Set(m.today.filter((r) => !r.done).map((r) => r.id));
    const doneToday = m.today.filter((r) => r.done);
    const doneIds = new Set(doneToday.map((r) => r.id));
    const extra = closedHere.filter((r) => !openIds.has(r.id) && !doneIds.has(r.id));
    return {
      overdue: m.today.filter((r) => !r.done && r.overdue),
      plan: m.today.filter((r) => !r.done && !r.overdue),
      done: [...extra.map((r) => ({ ...r, done: true })), ...doneToday],
    };
  }, [m.today, closedHere]);

  const todayStr = new Date().toDateString();
  const meetingsToday = m.meetings.filter((x) => new Date(x.date).toDateString() === todayStr);
  const meetingsNext = m.meetings.filter((x) => new Date(x.date).toDateString() !== todayStr && !x.done).slice(0, 3);

  const open = lanes.overdue.length + lanes.plan.length;
  const done = lanes.done.length;
  const total = open + done;

  const toggle = (r: TodayRow, wasDone: boolean) => {
    if (!wasDone && r.overdue) setClosedHere((xs) => [r, ...xs.filter((x) => x.id !== r.id)]);
    if (wasDone) setClosedHere((xs) => xs.filter((x) => x.id !== r.id));
    m.actions.toggle(r.id);
  };

  const shownOverdue = showAll ? lanes.overdue : lanes.overdue.slice(0, OVERDUE_CAP);
  const hidden = lanes.overdue.length - shownOverdue.length;

  return (
    <div className="flex min-h-screen gap-2 p-5" style={rootStyle}>
      <Sidebar m={m} />

      <main className="min-w-0 flex-1 p-6" style={{ background: C.panel, borderRadius: R.page }}>
        {/* breadcrumb row */}
        <div className="flex items-center justify-between gap-4" style={{ height: 44 }}>
          <div className="flex items-center gap-2.5" style={{ ...T.body, color: C.text3 }}>
            <LayoutDashboard size={16} strokeWidth={1.75} />
            <span>Рабочий стол</span>
            <span style={{ color: C.line2 }}>/</span>
            <span style={{ color: C.text }}>Сегодня</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-2 whitespace-nowrap" style={{ ...T.body, color: C.text3 }}>
              {m.dateLabel}
            </span>
            <IconBtn title="Уведомления">
              <Bell {...ICON} />
            </IconBtn>
            <Btn
              icon={<Plus size={16} strokeWidth={2} />}
              onClick={() => {
                setView("board");
                setAdding(true);
              }}
            >
              Новая задача
            </Btn>
          </div>
        </div>

        {/* title */}
        <div className="mt-6 flex items-center gap-4">
          <FolderTile />
          <div>
            <h1 style={{ fontSize: 40, lineHeight: 1.05, fontWeight: 500, letterSpacing: "-0.035em" }}>Сегодня</h1>
          </div>
          <span className="ml-1 self-end pb-1" style={{ ...T.body, color: C.text3 }}>
            {m.greeting} · {open} {plural(open, "задача", "задачи", "задач")} в работе
          </span>
        </div>

        {/* view switch + tools */}
        <div className="mt-6 flex items-center justify-between gap-4">
          <ViewTabs value={view} onChange={setView} />
          <div className="flex items-center gap-2">
            <ToolPill icon={ListFilter} label="Фильтр" />
            <ToolPill icon={ArrowDownWideNarrow} label="Сортировка" />
          </div>
        </div>

        <div className="mt-4">
          <Summary m={m} done={done} total={total} />
        </div>

        {view === "board" && (
          <div className="mt-3 grid items-start gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <Lane
              tone="amber"
              title="Просрочено"
              count={lanes.overdue.length}
              footer={
                lanes.overdue.length > OVERDUE_CAP ? (
                  <GhostAdd label={hidden > 0 ? `Ещё ${hidden} вне плана` : "Свернуть"} onClick={() => setShowAll((s) => !s)} />
                ) : null
              }
            >
              {shownOverdue.length ? (
                shownOverdue.map((r) => <TaskCard key={r.id} r={r} onToggle={() => toggle(r, false)} />)
              ) : (
                <LaneEmpty icon={CalendarCheck2} title="Хвостов нет" sub="Всё, что было запланировано, закрыто вовремя." />
              )}
            </Lane>

            <Lane
              tone="blue"
              title="В плане"
              count={lanes.plan.length}
              footer={adding ? <LaneAdd onAdd={m.actions.add} onClose={() => setAdding(false)} /> : <GhostAdd label="Добавить" onClick={() => setAdding(true)} />}
            >
              {lanes.plan.length
                ? lanes.plan.map((r) => <TaskCard key={r.id} r={r} onToggle={() => toggle(r, false)} />)
                : !adding && <LaneEmpty icon={ListChecks} title="На сегодня ничего нового" sub="Добавьте задачу или возьмите одну из просроченных." />}
            </Lane>

            <Lane tone="green" title="Готово сегодня" count={done}>
              {lanes.done.length ? (
                lanes.done.map((r) => <TaskCard key={r.id} r={r} done onToggle={() => toggle(r, true)} />)
              ) : (
                <LaneEmpty icon={CalendarCheck2} title="Пока пусто" sub="Отметьте задачу кружком — она переедет сюда." />
              )}
              <div className="flex items-center justify-between px-2 pt-1" style={{ ...T.foot, color: C.text3 }}>
                <span>За 14 дней</span>
                <span style={{ ...T.num, color: C.text2 }}>
                  {m.closed14} {plural(m.closed14, "задача", "задачи", "задач")}
                </span>
              </div>
            </Lane>

            <Lane tone="neutral" title="Встречи" count={meetingsToday.length}>
              {meetingsToday.length ? (
                meetingsToday.map((mt) => <MeetingCard key={mt.id} mt={mt} onToggle={() => m.actions.toggleMeeting(mt.id)} />)
              ) : (
                <LaneEmpty icon={CalendarClock} title="Встреч сегодня нет" sub="День свободен для глубокой работы." />
              )}
              {meetingsNext.length > 0 && (
                <>
                  <div className="px-2 pt-2" style={{ ...T.foot, color: C.text3 }}>
                    Дальше
                  </div>
                  {meetingsNext.map((mt) => (
                    <MeetingCard key={mt.id} mt={mt} onToggle={() => m.actions.toggleMeeting(mt.id)} />
                  ))}
                </>
              )}
            </Lane>
          </div>
        )}

        {view === "list" && (
          <ListView
            groups={[
              { tone: "amber", title: "Просрочено", rows: lanes.overdue },
              { tone: "blue", title: "В плане", rows: lanes.plan },
              { tone: "green", title: "Готово сегодня", rows: lanes.done, done: true },
            ]}
            onToggle={toggle}
          />
        )}

        {view === "timeline" && (
          <div className="mt-3">
            <Empty>
              <span className="grid place-items-center" style={{ width: 44, height: 44, borderRadius: 99, boxShadow: `inset 0 0 0 1px ${C.line2}`, color: C.text2 }}>
                <GanttChart {...ICON} />
              </span>
              <span style={{ color: C.text }}>Таймлайн дня скоро появится</span>
              <span style={T.foot}>Задачи встанут на шкалу часов вместе со встречами.</span>
            </Empty>
          </div>
        )}
      </main>
    </div>
  );
}

function ListView({
  groups,
  onToggle,
}: {
  groups: { tone: Tone; title: string; rows: TodayRow[]; done?: boolean }[];
  onToggle: (r: TodayRow, wasDone: boolean) => void;
}) {
  const cols = "22px minmax(0,1fr) 180px 120px 120px";
  return (
    <div className="mt-3 overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
      <div className="grid items-center gap-4 px-6" style={{ gridTemplateColumns: cols, height: 48, ...dashed }}>
        <span />
        <TH icon={<ListChecks size={14} strokeWidth={1.75} />}>Задача</TH>
        <TH icon={<FolderKanban size={14} strokeWidth={1.75} />}>Проект</TH>
        <TH>Приоритет</TH>
        <TH icon={<CalendarClock size={14} strokeWidth={1.75} />}>Срок</TH>
      </div>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="flex items-center gap-2 px-6 pb-2 pt-5">
            <StatusPill tone={g.tone} size={28}>
              {g.title}
            </StatusPill>
            <span style={{ ...T.body, color: C.text3 }}>{g.rows.length}</span>
          </div>
          {g.rows.length === 0 && (
            <div className="px-6 pb-4" style={{ ...T.body, color: C.text3, ...dashed }}>
              Пусто
            </div>
          )}
          {g.rows.map((r) => (
            <Row key={r.id} cols={cols} height={64} muted={r.overLimit && !g.done}>
              <RoundCheck done={!!g.done} onChange={() => onToggle(r, !!g.done)} />
              <span className="truncate" style={{ ...T.body, color: g.done ? C.text3 : C.text, textDecoration: g.done ? "line-through" : undefined }}>
                {r.title}
              </span>
              <span className="truncate" style={{ ...T.body, color: C.text2 }}>
                {r.projectName ?? "—"}
              </span>
              <span>
                <PrioTag p={r.priority} />
              </span>
              <span style={{ ...T.body, color: C.text3 }}>{r.overdue ? `с ${r.dueLabel}` : r.dueLabel}</span>
            </Row>
          ))}
        </div>
      ))}
    </div>
  );
}
