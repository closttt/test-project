/**
 * Soft Instrument kit — friendly productivity-SaaS panels (refs 5 Relatel, 6 Taskplus, 8 Celoci,
 * 10 Mailite, 11 Workspace). Lifted soft surfaces on #0c0c0c, 12–16px radii, widget headers with a
 * tinted icon tile + title + a mini toolbar, 10–15% tinted status/priority chips, meta rows of tiny
 * icons with counts, segmented tick progress, stepped burndown lines, hatched area fills, square
 * heatmaps and tinted kanban lanes. One accent (violet) + semantic status colours, Inter, tabular
 * numbers, lucide icons at strokeWidth 1.75 in 26–28px rounded-square tinted tiles.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  CalendarRange,
  Check as CheckIcon,
  Clock3,
  Flag,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Maximize2,
  MoreHorizontal,
  NotebookPen,
  PenLine,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { TodayRow } from "@/design-lab/screens/dashboardModel";
import { formatDuration, dueLabel, localDayStr, todayStr } from "@/lib/format";
import { useData } from "@/store/DataProvider";
import { PRIORITY_META } from "@/types";

// ── Tokens ────────────────────────────────────────────────────────────────────────────────────
export const S = {
  bg: "#0C0C0C",
  rail: "#111112",
  s1: "#151516",
  s2: "#1A1A1C",
  s3: "#212123",
  s4: "#2A2A2C",
  line: "rgba(255,255,255,0.06)",
  line2: "rgba(255,255,255,0.09)",
  line3: "rgba(255,255,255,0.14)",
  // text scale (group-1 synthesis): primary / secondary / tertiary / muted / ghost
  ink: "#F7F7F8",
  ink2: "#A9AAB0",
  ink3: "#8A8A8F",
  ink4: "#55565A",
  // one accent (violet, measured #8957fe) + consensus status palette
  accent: "#8957FE",
  accentText: "#A68BFF",
  red: "#FF335A",
  orange: "#FF7110",
  amber: "#F8AE3E",
  green: "#26C66C",
  blue: "#3B82F6",
  font: '"Inter", system-ui, sans-serif',
  /** Bevel: dark outer 1px + light inner top highlight + hairline; depth without big shadows. */
  lift: "0 0 0 1px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.045), 0 10px 28px -20px rgba(0,0,0,0.9)",
  bevel: "0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(255,255,255,0.05)",
};

export type Tone = "accent" | "red" | "orange" | "amber" | "green" | "blue" | "neutral";

export const toneColor = (t: Tone) => (t === "neutral" ? S.ink2 : t === "accent" ? S.accentText : S[t]);
/** Fill colour of a tone (accent uses the saturated violet). */
export const toneFill = (t: Tone) => (t === "neutral" ? S.ink2 : S[t]);

/** #rrggbb → rgba() with alpha. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const rootStyle: CSSProperties = {
  background: S.bg,
  color: S.ink,
  fontFamily: S.font,
  fontFeatureSettings: '"cv11", "ss03"',
  WebkitFontSmoothing: "antialiased",
};

export const NAV_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Users,
  projects: FolderKanban,
  tasks: ListChecks,
  planner: CalendarRange,
  notes: NotebookPen,
  analytics: BarChart3,
  knowledge: BookOpen,
};

export const PRIORITY: Record<number, { label: string; tone: Tone }> = {
  1: { label: "Высокий", tone: "red" },
  2: { label: "Средний", tone: "orange" },
  3: { label: "Низкий", tone: "green" },
  0: { label: "Обычный", tone: "neutral" },
};

/** Pluralise a Russian noun: plural(5, "задача", "задачи", "задач"). */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────────────────────
export function IconBox({
  icon: Icon,
  tone = "neutral",
  size = 28,
  solid = false,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
  solid?: boolean;
}) {
  const c = toneColor(tone);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 32 ? 10 : 8,
        background: solid ? c : tone === "neutral" ? S.s3 : alpha(c, 0.14),
        boxShadow: tone === "neutral" && !solid ? `inset 0 0 0 1px ${S.line2}` : `inset 0 0 0 1px ${alpha(c, 0.12)}`,
        color: solid ? "#0C0C0C" : tone === "neutral" ? S.ink2 : c,
      }}
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={1.75} />
    </span>
  );
}

export function Chip({
  tone = "neutral",
  icon: Icon,
  dot,
  children,
  className = "",
  title,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const c = toneColor(tone);
  return (
    <span
      title={title}
      className={`inline-flex h-[22px] min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] px-[7px] text-[11.5px] font-medium leading-none ${className}`}
      style={{ background: tone === "neutral" ? "rgba(255,255,255,0.055)" : alpha(c, 0.13), color: c }}
    >
      {dot && <span className="size-[5px] shrink-0 rounded-full" style={{ background: c }} />}
      {Icon && <Icon size={12} strokeWidth={2} className="shrink-0" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function PriorityChip({ priority, short = false }: { priority: number; short?: boolean }) {
  const p = PRIORITY[priority] ?? PRIORITY[0];
  return (
    <Chip tone={p.tone} icon={Flag}>
      {short && priority === 0 ? "—" : p.label}
    </Chip>
  );
}

export function DueChip({ row }: { row: TodayRow }) {
  if (!row.dueLabel) return null;
  return (
    <Chip tone={row.overdue ? "red" : "neutral"} icon={CalendarClock}>
      {row.overdue ? `Просрочено · ${row.dueLabel}` : row.dueLabel}
    </Chip>
  );
}

/** Ref 5 delta: «↗ 2.9%» — tinted, tabular. */
export function DeltaChip({ value, suffix = "", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  const tone: Tone = value === 0 ? "neutral" : good ? "green" : "red";
  return (
    <Chip tone={tone}>
      <span className="tabular-nums">
        {value > 0 ? "+" : value < 0 ? "−" : "±"}
        {Math.abs(value)}
        {suffix}
      </span>
    </Chip>
  );
}

/** Rounded checkbox — accent fill when done. */
export function Check({ done, onClick, label, size = 18 }: { done: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="group/check inline-flex shrink-0 items-center justify-center rounded-[6px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2"
      style={{
        width: size,
        height: size,
        background: done ? S.accent : "transparent",
        boxShadow: done ? "none" : `inset 0 0 0 1.5px ${S.ink4}`,
        ["--tw-ring-color" as string]: alpha(S.accent, 0.5),
      }}
    >
      <CheckIcon
        size={size - 6}
        strokeWidth={3}
        className={done ? "" : "opacity-0 transition-opacity group-hover/check:opacity-40"}
        style={{ color: done ? "#fff" : S.ink2 }}
      />
    </button>
  );
}

/** Small square icon button (toolbar, ⋯, +). */
export function IconBtn({
  icon: Icon,
  label,
  onClick,
  size = 26,
  className = "",
  style,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center rounded-[7px] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 ${className}`}
      style={{ width: size, height: size, color: S.ink3, ...style }}
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={1.75} />
    </button>
  );
}

/** Ref 5 widget toolbar — edit / expand / ⋯ in one soft pill. */
export function Toolbar({ items }: { items?: { icon: LucideIcon; label: string; onClick?: () => void }[] }) {
  const list = items ?? [
    { icon: PenLine, label: "Редактировать" },
    { icon: Maximize2, label: "Развернуть" },
    { icon: MoreHorizontal, label: "Ещё" },
  ];
  return (
    <span className="inline-flex items-center gap-px rounded-[9px] p-[2px]" style={{ background: S.s2, boxShadow: `inset 0 0 0 1px ${S.line}` }}>
      {list.map((it) => (
        <IconBtn key={it.label} icon={it.icon} label={it.label} onClick={it.onClick} size={24} />
      ))}
    </span>
  );
}

export function Widget({
  icon,
  tone = "neutral",
  title,
  hint,
  actions,
  toolbar = true,
  className = "",
  children,
  style,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  toolbar?: boolean | { icon: LucideIcon; label: string; onClick?: () => void }[];
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-2xl ${className}`}
      style={{ background: S.s1, boxShadow: S.lift, ...style }}
    >
      <header className="flex min-h-[52px] items-center gap-2.5 px-4 pb-2 pt-3">
        {icon && <IconBox icon={icon} tone={tone} size={26} />}
        <h3 className="min-w-0 truncate text-[13.5px] font-semibold tracking-[-0.01em]">{title}</h3>
        {hint && <span className="min-w-0 truncate text-[12.5px]" style={{ color: S.ink3 }}>{hint}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {toolbar && <Toolbar items={Array.isArray(toolbar) ? toolbar : undefined} />}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Ghost/secondary/primary buttons. */
export function Btn({
  children,
  icon: Icon,
  kind = "ghost",
  onClick,
  type = "button",
  className = "",
  disabled,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  kind?: "ghost" | "soft" | "primary" | "accent";
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const st: Record<string, CSSProperties> = {
    ghost: { color: S.ink2 },
    soft: { color: S.ink, background: S.s2, boxShadow: `inset 0 0 0 1px ${S.line2}` },
    primary: { color: "#111", background: "#F2F2F3" },
    accent: { color: "#fff", background: S.accent, boxShadow: `inset 0 1px 0 rgba(255,255,255,.18), 0 6px 18px -8px ${alpha(S.accent, 0.8)}` },
  };
  const hover: Record<string, string> = {
    ghost: "hover:bg-white/[0.05] hover:text-white",
    soft: "hover:bg-[#222]",
    primary: "hover:bg-white",
    accent: "hover:brightness-110",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium transition-all disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${hover[kind]} ${className}`}
      style={st[kind]}
    >
      {Icon && <Icon size={15} strokeWidth={1.75} />}
      {children}
    </button>
  );
}

/** Small icon + count, the meta row of cards. */
export function Meta({ icon: Icon, children, tone, title }: { icon: LucideIcon; children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums" style={{ color: tone ? toneColor(tone) : S.ink3 }}>
      <Icon size={13} strokeWidth={1.75} />
      {children}
    </span>
  );
}

export function TaskMeta({ row, showDue = true }: { row: TodayRow; showDue?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {showDue && row.dueLabel && (
        <Meta icon={CalendarClock} tone={row.overdue ? "red" : undefined} title="Срок">
          {row.dueLabel}
        </Meta>
      )}
      {row.subtasksTotal > 0 && (
        <Meta icon={ListChecks} title="Подзадачи">
          {row.subtasksDone}/{row.subtasksTotal}
        </Meta>
      )}
      {(row.spentMin > 0 || row.estimateMin) && (
        <Meta icon={Clock3} title="Время">
          {row.spentMin > 0 ? formatDuration(row.spentMin) : `~${formatDuration(row.estimateMin ?? 0)}`}
        </Meta>
      )}
    </div>
  );
}

// ── Progress ──────────────────────────────────────────────────────────────────────────────────
/** Ref 6 «||||||||| 14 / 20» — tick segments. */
export function SegmentBar({
  value,
  total,
  segments = 10,
  tone = "accent",
  label = true,
  h = 12,
  w = 3,
}: {
  value: number;
  total: number;
  segments?: number;
  tone?: Tone;
  label?: boolean;
  h?: number;
  w?: number;
}) {
  const filled = total > 0 ? Math.round((value / total) * segments) : 0;
  const c = toneFill(tone);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-[2px]" aria-label={`${value} из ${total}`}>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className="rounded-[1px]" style={{ width: w, height: h, background: i < filled ? c : "rgba(255,255,255,0.12)" }} />
        ))}
      </span>
      {label && (
        <span className="text-[12px] tabular-nums">
          <span style={{ color: S.ink }}>{value}</span>
          <span style={{ color: S.ink3 }}> / {total}</span>
        </span>
      )}
    </span>
  );
}

/** Thin rounded progress track. */
export function Track({ pct, tone = "accent", h = 6 }: { pct: number; tone?: Tone; h?: number }) {
  return (
    <span className="block w-full overflow-hidden rounded-full" style={{ height: h, background: "rgba(255,255,255,0.07)" }}>
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: toneFill(tone) }} />
    </span>
  );
}

/**
 * Ref 5 «task status» spectrum: a restrained indigo → violet → rose gradient whose stops sit on the
 * real done / in-progress / overdue boundaries, with fine vertical striations for texture.
 */
export function SpectrumBar({ parts, h = 64, seed = 7 }: { parts: { value: number; color: string }[]; h?: number; seed?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let acc = 0;
  const stops: string[] = [];
  parts.forEach((p) => {
    const a = (acc / total) * 100;
    acc += p.value;
    const b = (acc / total) * 100;
    stops.push(`${p.color} ${a.toFixed(1)}%`, `${p.color} ${Math.max(a, b - 2).toFixed(1)}%`);
  });
  // deterministic striations
  let x = seed;
  const lines: { left: number; w: number; o: number }[] = [];
  for (let i = 0; i < 26; i++) {
    x = (x * 9301 + 49297) % 233280;
    const r = x / 233280;
    x = (x * 9301 + 49297) % 233280;
    lines.push({ left: r * 100, w: 1 + (x % 4), o: 0.08 + ((x % 7) / 7) * 0.18 });
  }
  return (
    <div className="relative w-full overflow-hidden rounded-[8px]" style={{ height: h, background: `linear-gradient(90deg, ${stops.join(", ")})` }}>
      {lines.map((l, i) => (
        <span key={i} className="absolute inset-y-0" style={{ left: `${l.left}%`, width: l.w, background: i % 3 ? `rgba(255,255,255,${l.o})` : `rgba(0,0,0,${l.o})` }} />
      ))}
      <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.18))" }} />
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────────────────────
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const n = Math.ceil(v / step);
  const m = n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return Math.max(4, m * step);
}

/**
 * Ref 8 hatched area: daily values as a diagonally-hatched area with dots, a dashed accent
 * 7-day average, and one highlighted column (capsule + tooltip pill).
 */
export function HatchedArea({
  values,
  labels,
  highlight,
  height = 240,
  tooltip,
}: {
  values: number[];
  labels: string[];
  highlight?: number;
  height?: number;
  tooltip?: (i: number) => string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const padL = 30;
  const padR = 18;
  const padT = 36;
  const padB = 26;
  const max = niceMax(Math.max(1, ...values));
  const iw = Math.max(1, W - padL - padR);
  const ih = height - padT - padB;
  const n = values.length;
  const x = (i: number) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - (v / max) * ih;
  const avg = values.map((_, i) => {
    const s = values.slice(Math.max(0, i - 6), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
  // smooth path (monotone-ish via midpoints)
  const path = (vs: number[]) =>
    vs
      .map((v, i) => {
        if (i === 0) return `M${x(0)},${y(v)}`;
        const cx = (x(i - 1) + x(i)) / 2;
        return `C${cx},${y(vs[i - 1])} ${cx},${y(v)} ${x(i)},${y(v)}`;
      })
      .join(" ");
  const top = path(values);
  const area = `${top} L${x(n - 1)},${padT + ih} L${x(0)},${padT + ih} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const active = hover ?? highlight;
  const capW = Math.min(26, Math.max(14, iw / n - 10));

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {W > 0 && (
        <svg width={W} height={height} className="block overflow-visible">
          <defs>
            <pattern id={`h${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="rgba(255,255,255,0.03)" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.13)" strokeWidth="1.6" />
            </pattern>
            <linearGradient id={`f${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor={S.s1} stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
              <text x={padL - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill={S.ink3} style={{ fontVariantNumeric: "tabular-nums" }}>
                {t}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#h${uid})`} />
          <path d={area} fill={`url(#f${uid})`} />
          <path d={top} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
          <path d={path(avg)} fill="none" stroke={S.accent} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
          {active != null && (
            <rect
              x={x(active) - capW / 2}
              y={padT - 4}
              width={capW}
              height={ih + 12}
              rx={capW / 2}
              fill={alpha(S.accent, 0.1)}
              stroke={S.accent}
              strokeWidth="2.5"
            />
          )}
          {values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={i === active ? 3.5 : 2.5} fill={i === active ? S.accent : "#5a5a60"} stroke={i === active ? "#fff" : "none"} strokeWidth="1.5" />
          ))}
          {labels.map((l, i) =>
            n <= 16 || i % 2 === 0 ? (
              <text key={i} x={i === n - 1 ? Math.min(x(i), W - 2 - 22) : x(i)} y={height - 6} textAnchor="middle" fontSize="11" fill={i === active ? S.ink : S.ink3} style={{ fontVariantNumeric: "tabular-nums" }}>
                {l}
              </text>
            ) : null
          )}
          {/* hover hit areas */}
          {values.map((_, i) => (
            <rect
              key={i}
              x={x(i) - iw / (n - 1 || 1) / 2}
              y={padT}
              width={iw / (n - 1 || 1)}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}
      {W > 0 && active != null && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-[8px] px-2.5 py-1 text-[12px] font-medium tabular-nums"
          style={{
            left: Math.min(Math.max(x(active), 40), W - 40),
            top: Math.max(0, padT - 38),
            background: "#0A0A0A",
            boxShadow: `inset 0 0 0 1px ${S.line3}, 0 6px 16px rgba(0,0,0,.5)`,
          }}
        >
          {tooltip ? tooltip(active) : values[active]}
        </span>
      )}
    </div>
  );
}

/** Ref 5 burndown: stepped lines over dashed gridlines; first series gets a faint fill. */
export function StepLine({
  series,
  height = 200,
  xLabels,
}: {
  series: { values: number[]; color: string; dashed?: boolean; label?: string }[];
  height?: number;
  xLabels?: [string, string];
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const padL = 30;
  const padT = 8;
  const padB = xLabels ? 22 : 6;
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(1, ...all));
  const iw = Math.max(1, W - padL);
  const ih = height - padT - padB;
  const n = series[0]?.values.length ?? 0;
  const x = (i: number) => padL + (i / n) * iw;
  const y = (v: number) => padT + ih - (v / max) * ih;
  const step = (vs: number[]) => vs.map((v, i) => `${i === 0 ? "M" : "H"}${x(i)}${i === 0 ? `,${y(v)}` : ` V${y(v)}`} H${x(i + 1)}`).join(" ");
  const ticks = [0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {W > 0 && n > 0 && (
        <svg width={W} height={height} className="block">
          <defs>
            <linearGradient id={`s${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={series[0].color} stopOpacity="0.16" />
              <stop offset="1" stopColor={series[0].color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
              <text x={padL - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill={S.ink3} style={{ fontVariantNumeric: "tabular-nums" }}>
                {t}
              </text>
            </g>
          ))}
          <path d={`${step(series[0].values)} V${padT + ih} H${padL} Z`} fill={`url(#s${uid})`} />
          {series.map((s, k) => (
            <path key={k} d={step(s.values)} fill="none" stroke={s.color} strokeWidth="1.6" strokeDasharray={s.dashed ? "3 3" : undefined} strokeLinejoin="round" />
          ))}
          {xLabels && (
            <>
              <text x={padL} y={height - 4} fontSize="11" fill={S.ink3}>
                {xLabels[0]}
              </text>
              <text x={W} y={height - 4} textAnchor="end" fontSize="11" fill={S.ink3}>
                {xLabels[1]}
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  );
}

/** Ref 8/9 heatmap of small rounded squares, column-major (one column = one week). */
export function Heatmap({
  values,
  rows = 7,
  gap = 3,
  color = S.accent,
  dates,
  radius = 2,
}: {
  values: number[];
  rows?: number;
  gap?: number;
  color?: string;
  dates?: string[];
  radius?: number;
}) {
  const max = Math.max(1, ...values);
  const cols = Math.ceil(values.length / rows);
  const level = (v: number) => (v <= 0 ? 0 : v / max <= 0.25 ? 1 : v / max <= 0.5 ? 2 : v / max <= 0.75 ? 3 : 4);
  const fills = ["rgba(255,255,255,0.05)", alpha(color, 0.28), alpha(color, 0.5), alpha(color, 0.75), color];
  return (
    <div
      className="grid w-full"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: "column", gap }}
    >
      {values.map((v, i) => (
        <span
          key={i}
          title={dates ? `${dates[i]}: ${v}` : String(v)}
          className="aspect-square w-full transition-transform hover:scale-125"
          style={{ background: fills[level(v)], borderRadius: radius, outline: i === values.length - 1 ? `1.5px solid ${S.ink}` : undefined, outlineOffset: 1 }}
        />
      ))}
    </div>
  );
}

/** Small vertical bars (ref 5 «commits»), last bar highlighted. */
export function MiniBars({
  values,
  height = 36,
  highlightLast = true,
  highlight,
  tone = "accent",
  barW = 5,
}: {
  values: number[];
  height?: number;
  highlightLast?: boolean;
  highlight?: number;
  tone?: Tone;
  barW?: number;
}) {
  const max = Math.max(1, ...values);
  return (
    <span className="inline-flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => {
        const hi = highlight != null ? i === highlight : highlightLast && i === values.length - 1;
        return (
          <span
            key={i}
            className={barW > 8 ? "rounded-[4px]" : "rounded-full"}
            style={{
              width: barW,
              height: Math.max(barW, (v / max) * height),
              background: hi ? toneFill(tone) : v > 0 ? alpha(toneFill(tone), 0.45) : "rgba(255,255,255,0.08)",
            }}
          />
        );
      })}
    </span>
  );
}

/** Ref 5 «comments» dot scatter: each day a column of dots (one per closed task, capped). */
export function DotScatter({ values, height = 44, cap = 8 }: { values: number[]; height?: number; cap?: number }) {
  const max = Math.max(1, ...values);
  return (
    <span className="flex w-full items-end justify-between" style={{ height }}>
      {values.map((v, i) => {
        const dots = v > 0 ? Math.max(1, Math.round((v / max) * cap)) : 0;
        const last = i === values.length - 1;
        return (
          <span key={i} className="flex flex-col-reverse items-center gap-[2px]" title={String(v)}>
            {dots === 0 && <span className="size-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />}
            {Array.from({ length: dots }, (_, j) => (
              <span
                key={j}
                className="size-[4px] rounded-full"
                style={{ background: last ? S.orange : j === dots - 1 ? S.accent : alpha(S.accent, 0.45) }}
              />
            ))}
          </span>
        );
      })}
    </span>
  );
}

/** Half-ring gauge (ref 8) — outer arc = main value, optional inner arc = secondary. */
export function HalfRing({
  value,
  inner,
  size = 220,
  stroke = 12,
  children,
}: {
  value: number;
  inner?: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r1 = size / 2 - stroke / 2;
  const r2 = r1 - stroke - 10;
  const arc = (r: number) => `M${size / 2 - r},${size / 2} A${r},${r} 0 0 1 ${size / 2 + r},${size / 2}`;
  const len = (r: number) => Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const v2 = Math.max(0, Math.min(1, inner ?? 0));
  return (
    <div className="relative" style={{ width: size, height: size / 2 + stroke }}>
      <svg width={size} height={size / 2 + stroke} className="block">
        <path d={arc(r1)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={arc(r1)}
          fill="none"
          stroke={S.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${len(r1) * v} ${len(r1)}`}
          style={{ transition: "stroke-dasharray .6s ease", opacity: v === 0 ? 0 : 1 }}
        />
        {inner != null && (
          <>
            <path d={arc(r2)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke - 4} strokeLinecap="round" />
            <path
              d={arc(r2)}
              fill="none"
              stroke={S.blue}
              strokeWidth={stroke - 4}
              strokeLinecap="round"
              strokeDasharray={`${len(r2) * v2} ${len(r2)}`}
              style={{ opacity: v2 === 0 ? 0 : 0.85 }}
            />
          </>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
    </div>
  );
}

// ── Composites ───────────────────────────────────────────────────────────────────────────────
/** Ref 11 tinted lane: dark tint of the status colour, header pill with dot + count + ⋯ +. */
export function Lane({
  title,
  tone,
  count,
  onAdd,
  menu,
  children,
  footer,
  className = "",
}: {
  title: string;
  tone: Tone;
  count: number;
  onAdd?: () => void;
  menu?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const c = toneColor(tone);
  return (
    <section
      className={`flex min-w-0 flex-col rounded-[16px] p-2 ${className}`}
      style={{
        background: tone === "neutral" ? "#131313" : `linear-gradient(180deg, ${alpha(c, 0.085)}, ${alpha(c, 0.04)})`,
        boxShadow: `inset 0 0 0 1px ${tone === "neutral" ? S.line : alpha(c, 0.1)}`,
      }}
    >
      <header className="flex h-10 items-center gap-2 px-1.5">
        <span
          className="inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[13px] font-semibold"
          style={{ background: tone === "neutral" ? "rgba(255,255,255,0.06)" : alpha(c, 0.16), color: tone === "neutral" ? S.ink : "#fff" }}
        >
          <span className="size-[6px] rounded-full" style={{ background: c }} />
          {title}
        </span>
        <span className="text-[13px] font-medium tabular-nums" style={{ color: tone === "neutral" ? S.ink3 : c }}>
          {count}
        </span>
        <span className="ml-auto flex items-center">
          {menu ?? <IconBtn icon={MoreHorizontal} label="Меню колонки" />}
          {onAdd && <IconBtn icon={Plus} label={`Добавить в «${title}»`} onClick={onAdd} />}
        </span>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
      {footer}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  tone = "neutral",
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-[12px] px-5 py-6 text-center ${className}`}
      style={{ background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.018) 0 6px, transparent 6px 12px)", boxShadow: `inset 0 0 0 1px ${S.line}` }}
    >
      <IconBox icon={icon} tone={tone} size={32} />
      <div className="mt-1 text-[13px] font-semibold">{title}</div>
      {text && <div className="max-w-[260px] text-[12.5px] leading-[1.45]" style={{ color: S.ink3 }}>{text}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Inline «+ Добавить» that turns into an input; Enter adds, Esc closes. */
export function AddInline({
  onAdd,
  label = "Добавить",
  placeholder = "Задача — «созвон завтра 15:00 !важно»",
  tone = "neutral",
  openSignal,
}: {
  onAdd: (text: string) => void;
  label?: string;
  placeholder?: string;
  tone?: Tone;
  /** Bump to open + focus from outside (column header «+»). */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, openSignal]);
  const c = tone === "neutral" ? S.ink3 : toneColor(tone);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors hover:bg-white/[0.04]"
        style={{ color: c }}
      >
        <Plus size={15} strokeWidth={1.75} />
        {label}
      </button>
    );
  return (
    <form
      className="flex items-center gap-2 rounded-[10px] px-2.5 py-1.5"
      style={{ background: S.s2, boxShadow: `inset 0 0 0 1px ${alpha(S.accent, 0.5)}, 0 0 0 3px ${alpha(S.accent, 0.12)}` }}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text);
        setText("");
      }}
    >
      <Plus size={15} strokeWidth={1.75} style={{ color: S.accent }} className="shrink-0" />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        onBlur={() => !text && setOpen(false)}
        placeholder={placeholder}
        className="h-6 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#5b5b62]"
      />
      <kbd className="rounded-[5px] px-1.5 py-0.5 text-[10.5px]" style={{ background: S.s4, color: S.ink3 }}>
        Enter
      </kbd>
    </form>
  );
}

/** Quick note — textarea with a soft footer. */
export function NoteBox({ onSave, rows = 4, placeholder = "Мысль, ссылка, идея — сохранится в «Заметки»" }: { onSave: (t: string) => void; rows?: number; placeholder?: string }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex flex-col overflow-hidden rounded-[12px] transition-shadow focus-within:shadow-[inset_0_0_0_1px_rgba(139,124,255,.5)]"
      style={{ background: S.s2, boxShadow: `inset 0 0 0 1px ${S.line2}` }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text);
        setText("");
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(text);
            setText("");
          }
        }}
        className="resize-none bg-transparent px-3 py-2.5 text-[13px] leading-[1.5] outline-none placeholder:text-[#5b5b62]"
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="pl-1 text-[11.5px] tabular-nums" style={{ color: S.ink4 }}>
          {text.length ? `${text.length} симв.` : "Ctrl + Enter"}
        </span>
        <Btn kind={text.trim() ? "accent" : "soft"} type="submit" disabled={!text.trim()} className="h-7 px-2.5 text-[12px]">
          Сохранить
        </Btn>
      </div>
    </form>
  );
}

/** Segmented tab switcher (ref 5 / 6). */
export function ViewTabs<T extends string>({
  tabs,
  value,
  onChange,
  size = "md",
}: {
  tabs: { id: T; label: string; icon?: LucideIcon; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  size?: "md" | "lg";
}) {
  return (
    <div role="tablist" className="inline-flex items-center gap-[2px] rounded-[11px] p-[3px]" style={{ background: S.s1, boxShadow: `inset 0 0 0 1px ${S.line}` }}>
      {tabs.map((t) => {
        const on = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 font-medium transition-all ${size === "lg" ? "h-9 text-[14px]" : "h-[30px] text-[13px]"} ${on ? "" : "hover:text-white"}`}
            style={{
              background: on ? S.s4 : "transparent",
              color: on ? S.ink : S.ink3,
              boxShadow: on ? "inset 0 1px 0 rgba(255,255,255,.06), 0 1px 2px rgba(0,0,0,.5)" : undefined,
            }}
          >
            {Icon && <Icon size={15} strokeWidth={1.75} />}
            {t.label}
            {t.count != null && (
              <span className="rounded-[5px] px-1 text-[11px] tabular-nums" style={{ background: on ? "rgba(255,255,255,.08)" : "transparent", color: S.ink3 }}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Search field look-alike with a kbd hint. */
export function SearchField({ placeholder = "Поиск", width = 280, kbd = "⌘K" }: { placeholder?: string; width?: number | string; kbd?: string }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-[10px] px-3 transition-shadow focus-within:shadow-[inset_0_0_0_1px_rgba(139,124,255,.5)]" style={{ width, background: S.s1, boxShadow: `inset 0 0 0 1px ${S.line2}` }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={S.ink3} strokeWidth="1.75" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#6b6b73]" />
      {kbd && (
        <kbd className="rounded-[5px] px-1.5 py-0.5 text-[10.5px]" style={{ background: S.s3, color: S.ink3, boxShadow: `inset 0 0 0 1px ${S.line}` }}>
          {kbd}
        </kbd>
      )}
    </label>
  );
}

/** Brand mark: a soft gradient tile with a check glyph. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(140deg, #A99DFF 0%, ${S.accent} 45%, #5B4FD9 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.35), 0 6px 16px -6px ${alpha(S.accent, 0.8)}`,
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12.5 9.5 18 20 6.5" />
      </svg>
    </span>
  );
}

/** Rolling 7-day delta from 14-day dynamics: this week vs previous. */
export function weekDelta(dyn: { value: number }[]) {
  const cur = dyn.slice(-7).reduce((s, d) => s + d.value, 0);
  const prev = dyn.slice(-14, -7).reduce((s, d) => s + d.value, 0);
  return { cur, prev, diff: cur - prev, pct: prev ? Math.round(((cur - prev) / prev) * 100) : null };
}

/**
 * Open-tasks burndown reconstructed backwards from today's open count: open(d−1) = open(d) +
 * closed(d). New tasks aren't in the log, so it shows the burn of the current backlog only.
 */
export function openBurn(openNow: number, dyn: { value: number }[]) {
  const out = new Array(dyn.length).fill(0);
  let o = openNow;
  for (let i = dyn.length - 1; i >= 0; i--) {
    out[i] = o;
    o += dyn[i].value;
  }
  const start = out[0];
  const pace = (start - openNow) / Math.max(1, dyn.length - 1);
  const ideal = out.map((_, i) => Math.max(0, Math.round(start - pace * i * 1.25)));
  return { actual: out, ideal };
}

/**
 * Tasks closed today (read-only from the store). The model's «today» drops a task the moment an
 * overdue one is ticked off, so the «Готово сегодня» lanes read completions directly.
 */
export function useDoneToday(): TodayRow[] {
  const { tasks, projects } = useData();
  return useMemo(() => {
    const pn = new Map(projects.map((p) => [p.id, p.name]));
    const today = todayStr();
    return tasks
      .filter((t) => t.done && t.completedAt && localDayStr(new Date(t.completedAt)) === today)
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
      .map((t) => ({
        id: t.id,
        title: t.title,
        done: true,
        priority: t.priority,
        priorityLabel: PRIORITY_META[t.priority].label,
        priorityShort: PRIORITY_META[t.priority].short,
        due: t.dueDate,
        dueLabel: t.dueDate ? dueLabel(t.dueDate) : "",
        overdue: false,
        overLimit: false,
        projectName: t.projectId ? pn.get(t.projectId) : undefined,
        spentMin: t.spentMin,
        estimateMin: t.estimateMin,
        subtasksDone: (t.subtasks ?? []).filter((x) => x.done).length,
        subtasksTotal: (t.subtasks ?? []).length,
        task: t,
      }));
  }, [tasks, projects]);
}
