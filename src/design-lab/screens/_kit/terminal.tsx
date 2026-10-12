/**
 * Data Terminal kit — a precise-instrument UI distilled from Stuudio (31–34), Azura (14), JCA (35)
 * and the API-console refs (28–29): pure black, blocks as CELLS of one hairline grid (1px #1F1F1F,
 * drawn by a 1px gap over a line-coloured backdrop, so every line is shared and pixel-exact),
 * mono uppercase micro-labels, mono numerals, vertical hatch as filler, one signal family —
 * lime #C8FF00 for "now / live / done" and orange #FF5A1F for "overdue / risk" — used sparingly.
 * Icons are custom 1px-stroke square glyphs on a 14px grid, the same in every variant.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

// ── Tokens ──────────────────────────────────────────────────────────────────────────────────
export const T = {
  bg: "#000000",
  panel: "#0A0A0A",
  cell: "#0B0B0B",
  raised: "#111111",
  hover: "#151515",
  sunk: "#060606",
  line: "#1F1F1F",
  line2: "#2B2B2B",
  line3: "#3A3A3A",
  hatch: "#181818",
  ink: "#EDEDED",
  ink2: "#9A9A9A",
  ink3: "#6B6B6B",
  ink4: "#3F3F3F",
  ink5: "#262626",
  lime: "#C8FF00",
  limeTint: "#1A2106",
  orange: "#FF5A1F",
  orangeTint: "#2A1209",
  sans: '"Geist", "Inter", system-ui, sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
};

/** Mono text style; caps = uppercase micro-label tracking. */
export const mono = (size = 11, extra: CSSProperties = {}, caps = false): CSSProperties => ({
  fontFamily: T.mono,
  fontSize: size,
  lineHeight: 1.2,
  fontVariantNumeric: "tabular-nums",
  ...(caps ? { textTransform: "uppercase", letterSpacing: "0.1em" } : { letterSpacing: "0" }),
  ...extra,
});

/** Display sans (Geist) with tight tracking. */
export const sans = (size = 14, weight = 400, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: T.sans,
  fontSize: size,
  fontWeight: weight,
  lineHeight: size >= 28 ? 1.08 : 1.35,
  letterSpacing: size >= 24 ? "-0.03em" : size >= 16 ? "-0.015em" : "-0.005em",
  ...extra,
});

export const pad2 = (n: number) => String(n).padStart(2, "0");

// ── Micro-label ─────────────────────────────────────────────────────────────────────────────
export function MonoLabel({
  children,
  color = T.ink3,
  size = 10,
  className,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className} style={{ ...mono(size, { color, lineHeight: 1 }, true), ...style }}>
      {children}
    </span>
  );
}

// ── Grid of cells ───────────────────────────────────────────────────────────────────────────
/**
 * A hairline grid: the 1px gap shows the line-coloured backdrop, so neighbouring cells share one
 * exact 1px line. Every slot must be filled (use <Hatch/> for empty slots).
 */
export function CellGrid({
  children,
  className,
  style,
  frame = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  frame?: boolean;
}) {
  return (
    <div
      className={`grid ${className ?? ""}`}
      style={{ gap: 1, background: T.line, border: frame ? `1px solid ${T.line}` : undefined, ...style }}
    >
      {children}
    </div>
  );
}

export function Cell({
  children,
  className,
  style,
  bg = T.cell,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  bg?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className ?? ""}`} style={{ background: bg, ...style }}>
      {children}
    </div>
  );
}

/** Cell head: mono label left, meta right, fixed 36px row with a hairline under it. */
export function CellHead({ label, icon, right, line = true }: { label: ReactNode; icon?: ReactNode; right?: ReactNode; line?: boolean }) {
  return (
    <div
      className="flex h-9 items-center justify-between gap-3 px-4"
      style={{ borderBottom: line ? `1px solid ${T.line}` : undefined }}
    >
      <span className="flex min-w-0 items-center gap-2" style={{ color: T.ink3 }}>
        {icon}
        <MonoLabel>{label}</MonoLabel>
      </span>
      {right != null && <span className="flex shrink-0 items-center gap-2">{right}</span>}
    </div>
  );
}

// ── Hatch filler ────────────────────────────────────────────────────────────────────────────
/** Vertical-line hatch (2px line / 8px pitch) — the "empty cell" filler from Stuudio. */
export function Hatch({ className, style, pitch = 8, children }: { className?: string; style?: CSSProperties; pitch?: number; children?: ReactNode }) {
  return (
    <div
      aria-hidden={children ? undefined : true}
      className={`relative min-w-0 ${className ?? ""}`}
      style={{
        background: T.cell,
        backgroundImage: `repeating-linear-gradient(90deg, ${T.hatch} 0 2px, transparent 2px ${pitch}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Diagonal hatch — for "stripes of danger" behind overdue blocks. */
export const diagHatch = (color = "rgba(255,90,31,0.10)"): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 6px)`,
});

// ── Status square ───────────────────────────────────────────────────────────────────────────
export function StatusSquare({
  color = T.lime,
  size = 6,
  blink = false,
  hollow = false,
  title,
}: {
  color?: string;
  size?: number;
  blink?: boolean;
  hollow?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-block shrink-0 ${blink ? "animate-pulse" : ""}`}
      style={{
        width: size,
        height: size,
        background: hollow ? "transparent" : color,
        boxShadow: hollow ? `inset 0 0 0 1px ${color}` : undefined,
      }}
    />
  );
}

// ── Glyph icons ─────────────────────────────────────────────────────────────────────────────
const GLYPHS: Record<string, string> = {
  dashboard: "M1.5 1.5h4v4h-4z M8.5 1.5h4v4h-4z M1.5 8.5h4v4h-4z M8.5 8.5h4v4h-4z",
  clients: "M5.5 1.5h3v3h-3z M2.5 12.5v-3.5l2-2h5l2 2v3.5",
  projects: "M1.5 2.5h4l1.5 1.5h5.5v8.5h-11z M1.5 5.5h11",
  tasks: "M1.5 1.5h11v11h-11z M4.5 7l2 2 3.5-4",
  planner: "M1.5 2.5h11v10h-11z M1.5 5.5h11 M4.5 0.5v3 M9.5 0.5v3 M4.5 8.5h2v2h-2z",
  notes: "M2.5 1.5h6l3 3v8h-9z M8.5 1.5v3h3 M4.5 7.5h5 M4.5 9.5h3",
  analytics: "M1.5 12.5h11 M3.5 10.5v-3 M6.5 10.5v-6 M9.5 10.5v-4 M12.5 10.5v-8",
  knowledge: "M1.5 2.5h4l1.5 1v9l-1.5-1h-4z M12.5 2.5h-4l-1.5 1v9l1.5-1h4z",
  plus: "M7.5 2.5v10 M2.5 7.5h10",
  search: "M1.5 1.5h7v7h-7z M8.5 8.5l4 4",
  clock: "M1.5 1.5h11v11h-11z M7.5 4.5v3h2.5",
  arrow: "M1.5 7.5h11 M9 4l3.5 3.5L9 11",
  arrowUR: "M4.5 3.5h6v6 M10.5 3.5l-7 7",
  forward: "M1.5 3.5v8 M4.5 7.5h8 M9.5 4.5l3 3-3 3",
  money: "M1.5 3.5h11v7h-11z M5.5 5.5h3v3h-3z",
  meeting: "M1.5 3.5h8v7h-8z M9.5 6l3-2v6.5l-3-2",
  pulse: "M0.5 7.5h3l1.5-4 3 7.5 1.5-3.5h4",
  target: "M7.5 0.5v3 M7.5 11.5v3 M0.5 7.5h3 M11.5 7.5h3 M4.5 4.5h6v6h-6z",
  streak: "M7.5 1l3.5 5-3.5 7-3.5-7z M7.5 6v3",
  level: "M2.5 9.5l5-5 5 5 M2.5 13l5-5 5 5",
  command: "M2 3.5l4 4-4 4 M7.5 11.5h5",
  check: "M2.5 7.5l3 3 6-6.5",
  close: "M3.5 3.5l7 7 M10.5 3.5l-7 7",
  sliders: "M1.5 4.5h11 M1.5 10.5h11 M4.5 2.5v4 M9.5 8.5v4",
  power: "M7.5 1v6 M4.5 3.3a5 5 0 1 0 6 0",
  chevron: "M4 6l3.5 3.5L11 6",
  record: "M1.5 3.5h11v7h-11z M5.5 5.5h3v3h-3z",
  book: "M2.5 1.5h9v11h-9z M4.5 1.5v11 M6.5 4.5h3",
  bolt: "M8.5 0.5l-5 7.5h4l-1 6 5-8h-4z",
  list: "M1.5 3.5h2 M5.5 3.5h7 M1.5 7.5h2 M5.5 7.5h7 M1.5 11.5h2 M5.5 11.5h7",
  grid9: "M1.5 1.5h11v11h-11z M5.5 1.5v11 M9.5 1.5v11 M1.5 5.5h11 M1.5 9.5h11",
  dots: "M2.5 7.5h1 M7 7.5h1 M11.5 7.5h1",
};

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, size = 14, color = "currentColor", className }: { name: string; size?: number; color?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke={color}
      strokeWidth={1}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden
    >
      <path d={GLYPHS[name] ?? GLYPHS.dots} />
    </svg>
  );
}

export const NAV_GLYPH: Record<string, string> = {
  dashboard: "dashboard",
  clients: "clients",
  projects: "projects",
  tasks: "tasks",
  planner: "planner",
  notes: "notes",
  analytics: "analytics",
  knowledge: "knowledge",
};

// ── Hooks ───────────────────────────────────────────────────────────────────────────────────
export function useWidth<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const DOW = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MON = ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"];
/** «ВС 11 ОКТ 2026 · 14:22:05» */
export function stamp(d: Date, seconds = true) {
  const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}${seconds ? `:${pad2(d.getSeconds())}` : ""}`;
  return { date: `${DOW[d.getDay()]} ${pad2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`, time: t };
}

/** «05 окт.» → «05.10» from an ISO date (keeps relative labels like «Сегодня» untouched). */
export function shortDate(iso?: string) {
  if (!iso) return "—";
  const [, mo, d] = iso.split("-");
  return `${d}.${mo}`;
}

/** Minutes → «1:05» style clock reading for mono columns. */
export function hm(min: number) {
  return `${Math.floor(min / 60)}:${pad2(Math.round(min % 60))}`;
}

// ── Square checkbox ─────────────────────────────────────────────────────────────────────────
export function TermCheck({ done, onClick, label, size = 14 }: { done: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `Вернуть: ${label}` : `Готово: ${label}`}
      className="group/ck flex shrink-0 items-center justify-center outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#C8FF00]"
      style={{
        width: size,
        height: size,
        background: done ? T.lime : "transparent",
        boxShadow: `inset 0 0 0 1px ${done ? T.lime : T.line3}`,
      }}
    >
      {done ? (
        <Glyph name="check" size={size - 2} color="#000" />
      ) : (
        <span className="h-1 w-1 opacity-0 transition-opacity group-hover/ck:opacity-100" style={{ background: T.ink2 }} />
      )}
    </button>
  );
}

// ── Priority marker: 3 stacked squares ──────────────────────────────────────────────────────
export function PriorityBars({ priority }: { priority: number }) {
  const lvl = priority === 1 ? 3 : priority === 2 ? 2 : priority === 3 ? 1 : 0;
  return (
    <span className="inline-flex items-end gap-[2px]" aria-label={`приоритет ${lvl} из 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={{ width: 3, height: 3 + i * 2, background: i <= lvl ? (lvl === 3 ? T.ink : T.ink2) : T.ink5 }} />
      ))}
    </span>
  );
}

// ── Segmented progress (squares) ────────────────────────────────────────────────────────────
export function Cells({ pct, cells = 20, color = T.ink, h = 6, off = T.ink5, gap = 2 }: { pct: number; cells?: number; color?: string; h?: number; off?: string; gap?: number }) {
  const on = Math.round((Math.max(0, Math.min(100, pct)) / 100) * cells);
  return (
    <span className="flex w-full" style={{ gap }}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className="flex-1" style={{ height: h, background: i < on ? color : off }} />
      ))}
    </span>
  );
}

// ── Mini bars ───────────────────────────────────────────────────────────────────────────────
export function MiniBars({
  values,
  height = 28,
  color = T.ink2,
  last = T.lime,
  gap = 2,
  className,
}: {
  values: number[];
  height?: number;
  color?: string;
  last?: string | null;
  gap?: number;
  className?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <span className={`flex items-end ${className ?? ""}`} style={{ height, gap }}>
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1"
          style={{
            height: v ? Math.max(2, Math.round((v / max) * height)) : 1,
            background: v ? (i === values.length - 1 && last ? last : color) : T.ink5,
          }}
        />
      ))}
    </span>
  );
}

/** Barcode of a project's tasks: one bar per task — done ink, overdue orange, open dim. */
export function BarCode({ done, total, overdue, height = 22, max = 64 }: { done: number; total: number; overdue: number; height?: number; max?: number }) {
  const n = Math.min(total, max);
  const k = total > max ? max / total : 1;
  const d = Math.round(done * k);
  const o = Math.min(n - d, Math.max(overdue ? 1 : 0, Math.round(overdue * k)));
  if (!n)
    return (
      <span className="flex items-center" style={{ height }}>
        <MonoLabel color={T.ink4}>нет задач</MonoLabel>
      </span>
    );
  return (
    <span className="flex items-stretch" style={{ height, gap: 2 }} aria-label={`${done} из ${total}`}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          style={{
            width: i % 5 === 4 ? 2 : 1,
            background: i < d ? T.ink : i < d + o ? T.orange : T.ink4,
          }}
        />
      ))}
    </span>
  );
}

// ── Dial gauge (ring + tick bezel) ──────────────────────────────────────────────────────────
export function Dial({
  value,
  max,
  size = 140,
  color = T.lime,
  ticks = 60,
  thickness = 3,
  children,
  bezel = true,
  startDeg = -90,
  sweep = 360,
}: {
  value: number;
  max: number;
  size?: number;
  color?: string;
  ticks?: number;
  thickness?: number;
  children?: ReactNode;
  bezel?: boolean;
  startDeg?: number;
  sweep?: number;
}) {
  const c = size / 2;
  const rTick = c - 1;
  const rRing = c - (bezel ? 14 : thickness);
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number, r: number) => {
    if (to - from >= 359.99) return `M ${c - r} ${c} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden>
        {bezel &&
          Array.from({ length: ticks }, (_, i) => {
            const deg = startDeg + (sweep * i) / (sweep === 360 ? ticks : ticks - 1);
            const major = i % 5 === 0;
            const [x1, y1] = pt(deg, rTick);
            const [x2, y2] = pt(deg, rTick - (major ? 7 : 4));
            const lit = (i + 0.5) / ticks <= frac;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? color : major ? T.ink4 : T.ink5} strokeWidth={1} />;
          })}
        <path d={arc(startDeg, startDeg + sweep, rRing)} stroke={T.line} strokeWidth={thickness} fill="none" />
        {frac > 0 && <path d={arc(startDeg, startDeg + sweep * frac, rRing)} stroke={color} strokeWidth={thickness} fill="none" />}
        {frac > 0 && frac < 1 && (() => {
          const [x, y] = pt(startDeg + sweep * frac, rRing);
          return <rect x={x - 3} y={y - 3} width={6} height={6} fill={color} />;
        })()}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ── Segmented arc gauge (Solexa) ────────────────────────────────────────────────────────────
export function SegGauge({
  segments,
  size = 180,
  barLen = 22,
  barW = 6,
  children,
}: {
  /** one colour per segment, left → right */
  segments: string[];
  size?: number;
  barLen?: number;
  barW?: number;
  children?: ReactNode;
}) {
  const c = size / 2;
  const r = c - 2;
  const n = segments.length;
  const h = c + barW;
  return (
    <div className="relative shrink-0" style={{ width: size, height: h }}>
      <svg width={size} height={h} className="absolute inset-0" aria-hidden>
        {segments.map((col, i) => {
          const deg = 180 + (180 * i) / (n - 1);
          const a = (deg * Math.PI) / 180;
          const x = c + (r - barLen / 2) * Math.cos(a);
          const y = c + (r - barLen / 2) * Math.sin(a);
          return (
            <rect
              key={i}
              x={x - barLen / 2}
              y={y - barW / 2}
              width={barLen}
              height={barW}
              fill={col}
              transform={`rotate(${deg} ${x} ${y})`}
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
    </div>
  );
}

// ── Crosshair line chart (Azura) ────────────────────────────────────────────────────────────
export interface Point {
  label: string;
  value: number;
}

export function LineChart({
  data,
  height = 240,
  color = T.lime,
  tagRight = 56,
  unit = "",
  initialIndex,
  showAxis = true,
  area = true,
  grid = false,
  todayLabel = "СЕГОДНЯ",
  minTop = 4,
}: {
  data: Point[];
  height?: number;
  color?: string;
  /** right gutter for max / min / current tags */
  tagRight?: number;
  unit?: string;
  initialIndex?: number;
  showAxis?: boolean;
  area?: boolean;
  grid?: boolean;
  todayLabel?: string;
  minTop?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const top = 34;
  const bottom = showAxis ? 26 : 8;
  const plotW = Math.max(10, w - tagRight);
  const plotH = height - top - bottom;
  const max = Math.max(minTop, ...data.map((d) => d.value));
  const n = data.length;
  const x = (i: number) => Math.round(n > 1 ? (i / (n - 1)) * (plotW - 1) : 0) + 0.5;
  const y = (v: number) => Math.round(top + plotH - (v / max) * plotH) + 0.5;
  const peakIdx = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0);
  const avg = data.reduce((s, d) => s + d.value, 0) / Math.max(1, n);
  const idx = hover ?? initialIndex ?? peakIdx;
  const cur = data[idx];
  const last = data[n - 1];

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)} ${y(d.value)}`).join(" ");
  const areaPath = `${line} L${x(n - 1)} ${top + plotH} L${x(0)} ${top + plotH} Z`;
  const gid = useMemo(() => `lc${Math.random().toString(36).slice(2, 8)}`, []);

  const tagW = (s: string) => s.length * 6.6 + 12;
  const curText = `${cur?.value ?? 0}${unit}`;
  const dateText = cur?.label ?? "";
  const boxW = Math.max(tagW(curText), tagW(dateText)) + 4;
  const bx = Math.min(Math.max(0, x(idx) - boxW / 2), plotW - boxW);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {w > 0 && n > 0 && (
        <svg width={w} height={height} className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.22} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid &&
            [0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={0} x2={plotW} y1={Math.round(top + plotH * f) + 0.5} y2={Math.round(top + plotH * f) + 0.5} stroke={T.line} />
            ))}
          {/* floor */}
          <line x1={0} x2={plotW} y1={top + plotH + 0.5} y2={top + plotH + 0.5} stroke={T.line2} />
          {/* average baseline */}
          <line x1={0} x2={plotW} y1={y(avg)} y2={y(avg)} stroke={T.ink4} strokeDasharray="2 4" />
          {area && <path d={areaPath} fill={`url(#${gid})`} />}
          <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          {data.map((d, i) => (
            <rect key={i} x={x(i) - 1.5} y={y(d.value) - 1.5} width={3} height={3} fill={i === idx ? color : "#000"} stroke={color} strokeWidth={1} />
          ))}
          {/* crosshair */}
          <line x1={x(idx)} x2={x(idx)} y1={top - 4} y2={top + plotH} stroke={T.ink3} strokeDasharray="2 3" />
          <line x1={0} x2={plotW} y1={y(cur.value)} y2={y(cur.value)} stroke={T.ink3} strokeDasharray="2 3" />
          <rect x={x(idx) - 6} y={y(cur.value) - 6} width={12} height={12} fill="none" stroke={color} strokeOpacity={0.35} />
          {/* hover tag at top of the crosshair */}
          <g transform={`translate(${bx} 0)`}>
            <rect x={0} y={0} width={boxW} height={28} fill="#111" stroke={T.line2} />
            <text x={6} y={12} fill={T.ink} style={{ font: `500 11px ${T.mono}` }}>{curText}</text>
            <text x={6} y={23} fill={T.ink3} style={{ font: `400 9px ${T.mono}`, letterSpacing: "0.08em" }}>{dateText}</text>
          </g>
          {/* right gutter tags */}
          {(() => {
            const tags: { v: number; yy: number; fill: string; ink: string; key: string }[] = [
              { key: "max", v: max, yy: y(max), fill: "#111", ink: T.ink2 },
              { key: "cur", v: cur.value, yy: y(cur.value), fill: color, ink: "#000" },
              { key: "last", v: last.value, yy: y(last.value), fill: "#111", ink: T.ink },
            ];
            // de-collide: keep at least 18px apart, prefer cur
            const placed: number[] = [];
            return tags
              .filter((t, i, a) => a.findIndex((o) => Math.abs(o.yy - t.yy) < 1 && o.v === t.v) === i || t.key === "cur")
              .sort((a) => (a.key === "cur" ? -1 : 1))
              .map((t) => {
                if (t.key !== "cur" && placed.some((p) => Math.abs(p - t.yy) < 18)) return null;
                placed.push(t.yy);
                return (
                  <g key={t.key} transform={`translate(${plotW + 6} ${Math.round(t.yy) - 9})`}>
                    <rect width={tagRight - 8} height={18} fill={t.fill} stroke={t.key === "cur" ? "none" : T.line2} />
                    <text x={6} y={12.5} fill={t.ink} style={{ font: `500 10px ${T.mono}` }}>
                      {t.v}
                      {unit}
                    </text>
                  </g>
                );
              });
          })()}
          {/* x axis */}
          {showAxis &&
            data.map((d, i) =>
              i % 2 === 1 || i > n - 4 ? null : (
                <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : "middle"} fill={T.ink4} style={{ font: `400 9px ${T.mono}` }}>
                  {d.label}
                </text>
              )
            )}
          {showAxis && (
            <text x={x(n - 1)} y={height - 8} textAnchor="end" fill={T.lime} style={{ font: `500 9px ${T.mono}`, letterSpacing: "0.08em" }}>
              {todayLabel}
            </text>
          )}
          {/* hit area */}
          <rect
            x={0}
            y={0}
            width={plotW}
            height={height}
            fill="transparent"
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const px = e.clientX - r.left;
              setHover(Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1)))));
            }}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
    </div>
  );
}

// ── Dot-matrix year (26 weeks × 7) ──────────────────────────────────────────────────────────
export function YearMatrix({ year, cell = 6, gap = 2, color = T.lime }: { year: { date: string; value: number }[]; cell?: number; gap?: number; color?: string }) {
  const max = Math.max(1, ...year.map((d) => d.value));
  const weeks = Math.ceil(year.length / 7);
  return (
    <div className="grid" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoFlow: "column", gridAutoColumns: `${cell}px`, gap, width: weeks * (cell + gap) - gap }}>
      {year.map((d, i) => {
        const f = d.value / max;
        const bg = !d.value ? T.ink5 : f > 0.66 ? color : f > 0.33 ? "#8FB300" : "#4F6300";
        return <span key={d.date} title={`${d.date}: ${d.value}`} style={{ width: cell, height: cell, background: i === year.length - 1 ? T.ink : bg }} />;
      })}
    </div>
  );
}

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────
/** Single-line add field (submits on Enter). */
export function AddLine({
  onAdd,
  placeholder = "Добавить задачу на сегодня",
  id,
  className,
  style,
  prefix,
}: {
  onAdd: (text: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  prefix?: ReactNode;
}) {
  const [v, setV] = useState("");
  return (
    <form
      className={`flex items-center gap-3 ${className ?? ""}`}
      style={style}
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
    >
      {prefix ?? <Glyph name="plus" color={T.lime} />}
      <input
        id={id}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#4a4a4a]"
        style={{ ...sans(13), color: T.ink }}
      />
      <span className="hidden shrink-0 sm:inline" style={mono(10, { color: v ? T.lime : T.ink4 }, true)}>
        ↵ ввод
      </span>
    </form>
  );
}

/** Quick note box: textarea + save; clears on save. */
export function NoteBox({
  onSave,
  rows = 3,
  placeholder = "Мысль, ссылка, номер — сохранится в «Заметки»",
}: {
  onSave: (t: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [v, setV] = useState("");
  return (
    <div className="flex h-full flex-col">
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            onSave(v);
            setV("");
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className="w-full flex-1 resize-none bg-transparent px-4 py-3 outline-none placeholder:text-[#4a4a4a]"
        style={{ ...sans(13), color: T.ink, lineHeight: 1.5 }}
      />
      <div className="flex h-9 items-center justify-between px-4" style={{ borderTop: `1px solid ${T.line}` }}>
        <MonoLabel color={T.ink4}>ctrl ↵</MonoLabel>
        <button
          type="button"
          disabled={!v.trim()}
          onClick={() => {
            onSave(v);
            setV("");
          }}
          className="flex items-center gap-1.5 transition-colors disabled:cursor-default enabled:hover:text-white"
          style={{ ...mono(10, {}, true), color: v.trim() ? T.lime : T.ink4 }}
        >
          <Glyph name="check" size={12} /> сохранить
        </button>
      </div>
    </div>
  );
}

/** Small text-button used everywhere (mono caps, hairline frame). */
export function TermButton({
  children,
  onClick,
  tone = "ghost",
  icon,
  className,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "ghost" | "lime" | "solid";
  icon?: string;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const s: CSSProperties =
    tone === "lime"
      ? { background: T.lime, color: "#000" }
      : tone === "solid"
        ? { background: T.raised, color: T.ink, boxShadow: `inset 0 0 0 1px ${T.line2}` }
        : { background: "transparent", color: T.ink2, boxShadow: `inset 0 0 0 1px ${T.line2}` };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 outline-none transition-[filter,color,box-shadow] focus-visible:ring-1 focus-visible:ring-[#C8FF00] ${
        tone === "lime" ? "hover:brightness-110" : "hover:text-white hover:[box-shadow:inset_0_0_0_1px_#4a4a4a]"
      } ${className ?? ""}`}
      style={{ ...mono(10, {}, true), lineHeight: 1, ...s, borderRadius: 2 }}
    >
      {icon && <Glyph name={icon} size={12} />}
      {children}
    </button>
  );
}

/** Empty state: hatch panel with a centred mono message. */
export function Empty({ title, hint, icon = "meeting", className, style }: { title: string; hint?: string; icon?: string; className?: string; style?: CSSProperties }) {
  return (
    <Hatch className={`flex items-center justify-center ${className ?? ""}`} style={style}>
      <div className="flex flex-col items-center gap-2 px-4 py-3 text-center" style={{ background: T.cell, boxShadow: `0 0 0 1px ${T.line}` }}>
        <Glyph name={icon} color={T.ink3} />
        <MonoLabel color={T.ink2}>{title}</MonoLabel>
        {hint && <span style={sans(12, 400, { color: T.ink3 })}>{hint}</span>}
      </div>
    </Hatch>
  );
}

/** Health → signal colour + filled/hollow square. */
export function healthSignal(h: string): { color: string; hollow: boolean } {
  switch (h) {
    case "off-track":
      return { color: T.orange, hollow: false };
    case "at-risk":
      return { color: T.orange, hollow: true };
    case "on-track":
      return { color: T.lime, hollow: false };
    case "done":
      return { color: T.ink2, hollow: false };
    default:
      return { color: T.ink4, hollow: true };
  }
}

// ── Dot-matrix wordmark ─────────────────────────────────────────────────────────────────────
/** 5×8 dot-matrix Cyrillic glyphs (row 0 = diacritic row). Only the letters the lab needs. */
const DOT_FONT: Record<string, string[]> = {
  Р: [".....", "####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  А: [".....", ".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  Б: [".....", "#####", "#....", "#....", "####.", "#...#", "#...#", "####."],
  О: [".....", ".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  Ч: [".....", "#...#", "#...#", "#...#", ".####", "....#", "....#", "....#"],
  И: [".....", "#...#", "#...#", "#..##", "#.#.#", "##..#", "#...#", "#...#"],
  Й: [".###.", "#...#", "#...#", "#..##", "#.#.#", "##..#", "#...#", "#...#"],
  С: [".....", ".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  Т: [".....", "#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  Л: [".....", "..###", ".#..#", ".#..#", ".#..#", ".#..#", ".#..#", "##..#"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

/** LED dot-matrix word: lit dots in `on`, the unlit matrix stays faintly visible. */
export function DotWord({ text, dot = 6, gap = 1, on = T.ink, off = "#121212", accentIndex, accent = T.lime }: { text: string; dot?: number; gap?: number; on?: string; off?: string; accentIndex?: number; accent?: string }) {
  const letters = [...text.toUpperCase()].map((ch) => DOT_FONT[ch] ?? DOT_FONT[" "]);
  const cols = letters.length * 6 - 1;
  const step = dot + gap;
  return (
    <svg width={cols * step - gap} height={8 * step - gap} shapeRendering="crispEdges" role="img" aria-label={text}>
      {letters.flatMap((rows, li) =>
        rows.flatMap((row, y) =>
          [...row, ...(li < letters.length - 1 ? ["."] : [])].map((c, x) => (
            <rect
              key={`${li}-${x}-${y}`}
              x={(li * 6 + x) * step}
              y={y * step}
              width={dot}
              height={dot}
              fill={c === "#" ? (li === accentIndex ? accent : on) : off}
            />
          ))
        )
      )}
    </svg>
  );
}
