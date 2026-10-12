/**
 * Graphite Glow kit — monochrome chrome, colour only for meaning, LIGHT instead of shadow.
 *
 * Surfaces: neutral #050505 → #1d1d1d ramp, 5–13 % white hairlines, a top-edge highlight that
 * fades to the corners (ref 13), a soft top-left sheen. Glows: white/silver bloom behind the one
 * primary action and the hero data, charts drawn as white light (glowing line + gradient fill),
 * ambient light pools on the canvas. Type: Geist (Cyrillic) + Geist Mono for every numeral.
 * Icons: lucide-react, strokeWidth 1.5, 16 px, always inside an IconBox / Nav container.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarRange,
  ChartNoAxesColumn,
  Check,
  CircleCheck,
  Clock,
  CornerDownLeft,
  FolderKanban,
  LayoutGrid,
  NotebookPen,
  Plus,
  Users,
  type LucideProps,
} from "lucide-react";

import type { DashboardModel, TodayRow, ProjectRow } from "@/design-lab/screens/dashboardModel";
import type { HealthLevel } from "@/lib/projectHealth";

// ── Tokens ──────────────────────────────────────────────────────────────────────────────────

export const G = {
  // Surface ramp (group-1 synthesis: L0 #000–#0a → L1 #0d–#14 → L2 #17–#1d → L3 #21 → L4 #26–#2c)
  c0: "#050505", // L0 canvas
  c1: "#0a0a0a", // frame / wells (inputs sit darker than their panel)
  c2: "#101010", // L1 panel
  c3: "#141414", // L1+ panel top
  c4: "#1a1a1a", // L2 card
  c5: "#1d1d1d", // L2 card top
  c6: "#212121", // L3 raised / popover
  c7: "#2a2a2a", // L4 hover / active
  line: "rgba(255,255,255,0.05)", // row hairline
  line2: "rgba(255,255,255,0.07)", // card border
  line3: "rgba(255,255,255,0.12)", // interactive outline
  bevel: "rgba(255,255,255,0.14)", // top-edge highlight
  // Text ramp 1 / .66 / .58 / .43 / .31
  ink: "#f7f7f7",
  ink2: "#a8a8a8",
  inkT: "#949494",
  ink3: "#6e6e6e",
  ink4: "#4f4f4f",
  red: "#ff5a5f",
  amber: "#f8ae3e",
  green: "#2ec062",
  blue: "#3b82f6",
  sans: '"Geist", "Inter", system-ui, sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
  // Radii scale: chip 6 · control 10 · tile 12 · card 16 · popover 20 · frame 24
  r: { chip: 6, ctl: 10, tile: 12, card: 16, pop: 20, frame: 24 },
} as const;

export type Tone = "neutral" | "red" | "amber" | "green" | "blue" | "white";

const TONE_RGB: Record<Exclude<Tone, "neutral" | "white">, string> = {
  red: "255,90,95",
  amber: "248,174,62",
  green: "46,192,98",
  blue: "96,150,255",
};

export function toneColor(t: Tone): string {
  if (t === "neutral") return G.ink2;
  if (t === "white") return G.ink;
  return `rgb(${TONE_RGB[t]})`;
}

export function toneRgba(t: Tone, a: number): string {
  if (t === "neutral" || t === "white") return `rgba(255,255,255,${a})`;
  return `rgba(${TONE_RGB[t]},${a})`;
}

/** Type scale (px): 11 eyebrow · 12 meta · 13 secondary · 14 base · 15 title · 18 section · 24/32/48+ display. */
export const t = {
  eyebrow: { fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: G.ink3 } as CSSProperties,
  meta: { fontSize: 12, color: G.ink3 } as CSSProperties,
  small: { fontSize: 13, color: G.ink2 } as CSSProperties,
  title: { fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em", color: G.ink } as CSSProperties,
  section: { fontSize: 16, fontWeight: 500, letterSpacing: "-0.015em", color: G.ink } as CSSProperties,
};

export const display = (size: number, weight = 600, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: G.sans,
  fontSize: size,
  fontWeight: weight,
  lineHeight: size >= 40 ? 1 : 1.15,
  letterSpacing: `${size >= 40 ? -0.035 : -0.022}em`,
  ...extra,
});

export const mono = (size: number, weight = 400, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: G.mono,
  fontSize: size,
  fontWeight: weight,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: size >= 32 ? "-0.04em" : "-0.01em",
  lineHeight: size >= 32 ? 1 : 1.2,
  ...extra,
});

/** Hero numerals (≥ 48 px): Geist sans, tabular — mono's slashed zero turns into «Ø» at this size. */
export const bigNum = (size: number, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: G.sans,
  fontSize: size,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.045em",
  lineHeight: 1,
  ...extra,
});

/** Root style for every variant. */
export const rootStyle: CSSProperties = {
  background: G.c0,
  color: G.ink,
  fontFamily: G.sans,
  fontSize: 14,
  WebkitFontSmoothing: "antialiased",
  fontFeatureSettings: '"ss01", "cv11"',
};

// ── Light ───────────────────────────────────────────────────────────────────────────────────

/** 1 px highlight along the top edge, fading to the corners — "light from above". */
export function TopLight({ strength = 0.3, inset = "10%" }: { strength?: number; inset?: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-[-1px] h-px"
      style={{
        left: inset,
        right: inset,
        background: `linear-gradient(90deg, transparent, rgba(255,255,255,${strength}) 50%, transparent)`,
      }}
    />
  );
}

/** A soft pool of light. Position it absolutely inside a relative/overflow-hidden parent. */
export function Bloom({
  x,
  y,
  size,
  opacity = 0.12,
  color = "255,255,255",
  blur = 40,
}: {
  x: string | number;
  y: string | number;
  size: number;
  opacity?: number;
  color?: string;
  blur?: number;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(closest-side, rgba(${color},${opacity}), rgba(${color},0))`,
        filter: `blur(${blur}px)`,
      }}
    />
  );
}

/** Ambient light pools for a whole canvas (absolute, behind content). */
export function Ambient({ pools }: { pools: { x: string; y: string; size: number; o: number }[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pools.map((p, i) => (
        <Bloom key={i} x={p.x} y={p.y} size={p.size} opacity={p.o} blur={60} />
      ))}
    </div>
  );
}

/** Dot grid that fades out with a radial mask (ref 16). */
export function DotGrid({ step = 22, opacity = 0.07, mask = "radial-gradient(70% 60% at 50% 0%, #000 0%, transparent 75%)" }: { step?: number; opacity?: number; mask?: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `radial-gradient(rgba(255,255,255,${opacity}) 1px, transparent 1.2px)`,
        backgroundSize: `${step}px ${step}px`,
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  );
}

// ── Surfaces ────────────────────────────────────────────────────────────────────────────────

type SurfaceKind = "solid" | "raised" | "glass" | "inset" | "flat";

/** Bevel = 1 px top highlight fading over ~4 px + dark outer contour (group-1 «Бордеры»). */
export const BEVEL = "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 4px 6px -5px rgba(255,255,255,0.10)";
export const CONTOUR = "0 0 0 1px rgba(0,0,0,0.85)";

const SURFACE: Record<SurfaceKind, CSSProperties> = {
  solid: {
    background: `radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.03), transparent 55%), linear-gradient(180deg, ${G.c3} 0%, ${G.c2} 100%)`,
    border: `1px solid ${G.line2}`,
    boxShadow: `${BEVEL}, ${CONTOUR}`,
  },
  raised: {
    background: `radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.05), transparent 55%), linear-gradient(180deg, ${G.c5} 0%, ${G.c4} 100%)`,
    border: `1px solid ${G.line2}`,
    boxShadow: `${BEVEL}, ${CONTOUR}, 0 24px 48px -24px rgba(0,0,0,0.8)`,
  },
  glass: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.018) 100%)",
    border: `1px solid ${G.line2}`,
    boxShadow: `${BEVEL}, 0 30px 60px -30px rgba(0,0,0,0.9)`,
    backdropFilter: "blur(22px) saturate(140%)",
    WebkitBackdropFilter: "blur(22px) saturate(140%)",
  },
  inset: {
    background: G.c1,
    border: `1px solid ${G.line}`,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
  },
  flat: {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${G.line}`,
  },
};

export function Surface({
  kind = "solid",
  r = 20,
  edge = true,
  edgeStrength,
  className = "",
  style,
  children,
  as: Tag = "div",
}: {
  kind?: SurfaceKind;
  r?: number;
  edge?: boolean;
  edgeStrength?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  as?: "div" | "section" | "aside" | "header" | "nav" | "article";
}) {
  return (
    <Tag className={`relative ${className}`} style={{ borderRadius: r, ...SURFACE[kind], ...style }}>
      {edge && kind !== "inset" && <TopLight strength={edgeStrength ?? (kind === "raised" ? 0.32 : 0.2)} inset={`${Math.max(8, r)}px`} />}
      {children}
    </Tag>
  );
}

/** Section header: title + inline grey count (ref 15) + optional right side. */
export function Head({
  title,
  count,
  icon,
  right,
  className = "",
}: {
  title: ReactNode;
  count?: ReactNode;
  icon?: ComponentType<LucideProps>;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-[28px] items-center justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconBox icon={icon} size={28} />}
        <span className="truncate" style={t.section}>
          {title}
          {count !== undefined && (
            <span className="ml-2" style={{ color: G.ink3, fontWeight: 400 }}>
              {count}
            </span>
          )}
        </span>
      </div>
      {right}
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────────────────────

export const NAV_ICON: Record<string, ComponentType<LucideProps>> = {
  dashboard: LayoutGrid,
  clients: Users,
  projects: FolderKanban,
  tasks: CircleCheck,
  planner: CalendarRange,
  notes: NotebookPen,
  analytics: ChartNoAxesColumn,
  knowledge: BookOpen,
};

export function Ico({ icon: I, size = 16, color, className }: { icon: ComponentType<LucideProps>; size?: number; color?: string; className?: string }) {
  return <I size={size} strokeWidth={1.5} color={color} className={className} aria-hidden />;
}

/** The one icon container of this style: rounded square, graphite gradient, top light. */
export function IconBox({
  icon,
  size = 32,
  tone = "neutral",
  active = false,
  className = "",
}: {
  icon: ComponentType<LucideProps>;
  size?: number;
  tone?: Tone;
  active?: boolean;
  className?: string;
}) {
  const white = tone === "white";
  const colored = tone !== "neutral" && tone !== "white";
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        background: white
          ? "linear-gradient(180deg,#ffffff,#dcdcdc)"
          : colored
            ? toneRgba(tone, 0.12)
            : active
              ? `linear-gradient(180deg, ${G.c7}, ${G.c5})`
              : `linear-gradient(180deg, ${G.c5}, ${G.c3})`,
        border: `1px solid ${white ? "rgba(255,255,255,0.7)" : colored ? toneRgba(tone, 0.26) : G.line2}`,
        boxShadow: white
          ? "0 0 18px -2px rgba(255,255,255,0.45)"
          : active
            ? "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 16px -4px rgba(255,255,255,0.25)"
            : "inset 0 1px 0 rgba(255,255,255,0.06)",
        color: white ? "#0a0a0a" : colored ? toneColor(tone) : active ? G.ink : G.ink2,
      }}
    >
      <Ico icon={icon} size={size >= 40 ? 18 : 16} />
    </span>
  );
}

/** Product mark: a small lit graphite tile. */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: "linear-gradient(145deg, #2a2a2a, #0e0e0e)",
        border: `1px solid ${G.line3}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 20px -6px rgba(255,255,255,0.35)",
      }}
    >
      <span
        className="rounded-full"
        style={{ width: size * 0.3, height: size * 0.3, background: "#fff", boxShadow: "0 0 10px 1px rgba(255,255,255,0.7)" }}
      />
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1.5"
      style={{ ...mono(11), color: G.ink2, background: "rgba(255,255,255,0.05)", border: `1px solid ${G.line2}` }}
    >
      {children}
    </kbd>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────────────────────

/** The ONE white primary per screen, with a silver bloom. */
export function PrimaryBtn({
  children,
  icon,
  onClick,
  size = "md",
  type = "button",
  disabled,
  className = "",
  title,
}: {
  children: ReactNode;
  icon?: ComponentType<LucideProps>;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const h = size === "lg" ? 52 : size === "md" ? 40 : 34;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`group relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-[box-shadow,transform,filter] duration-200 hover:-translate-y-px hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:translate-y-0 disabled:pointer-events-none disabled:opacity-40 ${className}`}
      style={{
        height: h,
        padding: size === "lg" ? "0 26px" : size === "md" ? "0 16px" : "0 12px",
        borderRadius: size === "lg" ? 16 : 11,
        fontSize: size === "lg" ? 16 : 14,
        color: "#0a0a0a",
        background: "linear-gradient(180deg, #ffffff 0%, #e4e4e4 100%)",
        boxShadow:
          "inset 0 1px 0 #fff, inset 0 -1px 0 rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.35), 0 0 28px -4px rgba(255,255,255,0.38), 0 10px 30px -10px rgba(255,255,255,0.35)",
      }}
    >
      {icon && <Ico icon={icon} size={size === "lg" ? 18 : 16} />}
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  icon,
  onClick,
  size = "md",
  disabled,
  className = "",
  title,
  type = "button",
}: {
  children?: ReactNode;
  icon?: ComponentType<LucideProps>;
  onClick?: () => void;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const h = size === "md" ? 36 : 30;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={!children ? title : undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-150 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-35 ${className}`}
      style={{
        height: h,
        minWidth: h,
        padding: children ? (size === "md" ? "0 14px" : "0 10px") : 0,
        borderRadius: size === "md" ? 10 : 8,
        fontSize: size === "md" ? 13 : 12,
        fontWeight: 500,
        color: G.ink2,
        background: "rgba(255,255,255,0.035)",
        border: `1px solid ${G.line2}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {icon && <Ico icon={icon} size={size === "md" ? 16 : 14} />}
      {children}
    </button>
  );
}

// ── Chips & marks ───────────────────────────────────────────────────────────────────────────

export function Chip({
  tone = "neutral",
  icon,
  dot,
  children,
  pill = false,
  className = "",
}: {
  tone?: Tone;
  icon?: ComponentType<LucideProps>;
  dot?: boolean;
  children: ReactNode;
  pill?: boolean;
  className?: string;
}) {
  const neutral = tone === "neutral" || tone === "white";
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap px-2 ${className}`}
      style={{
        borderRadius: pill ? 999 : 6,
        fontSize: 12,
        fontWeight: 500,
        color: neutral ? G.ink2 : toneColor(tone),
        background: neutral ? "rgba(255,255,255,0.045)" : toneRgba(tone, 0.1),
        border: `1px solid ${neutral ? G.line2 : toneRgba(tone, 0.22)}`,
      }}
    >
      {dot && <Dot tone={tone} size={6} />}
      {icon && <Ico icon={icon} size={12} />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", size = 6, glow = true }: { tone?: Tone; size?: number; glow?: boolean }) {
  const c = tone === "neutral" ? G.ink3 : toneColor(tone);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: c, boxShadow: glow && tone !== "neutral" ? `0 0 8px ${toneRgba(tone, 0.7)}` : undefined }}
    />
  );
}

export const PRIO_TONE: Record<number, Tone> = { 1: "red", 2: "amber", 3: "blue", 0: "neutral" };

export function PrioChip({ r, short = false }: { r: Pick<TodayRow, "priority" | "priorityLabel" | "priorityShort">; short?: boolean }) {
  if (!r.priority) return null;
  return (
    <Chip tone={PRIO_TONE[r.priority]} dot>
      {short ? r.priorityShort : r.priorityLabel}
    </Chip>
  );
}

export function DueChip({ r }: { r: Pick<TodayRow, "dueLabel" | "overdue"> }) {
  if (!r.dueLabel) return null;
  return (
    <Chip tone={r.overdue ? "red" : "neutral"} icon={Clock}>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.dueLabel}</span>
    </Chip>
  );
}

export const HEALTH_TONE: Record<HealthLevel, Tone> = {
  "off-track": "red",
  "at-risk": "amber",
  "on-track": "green",
  done: "neutral",
  empty: "neutral",
};

// ── Controls ────────────────────────────────────────────────────────────────────────────────

/** Round checkbox — done = lit white disc. */
export function CheckDot({ done, onClick, label, size = 20 }: { done: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={done}
      aria-label={done ? `Вернуть: ${label}` : `Готово: ${label}`}
      className="group/ck inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      style={{
        width: size,
        height: size,
        border: done ? "1px solid rgba(255,255,255,0.9)" : "1.5px solid rgba(255,255,255,0.22)",
        background: done ? "linear-gradient(180deg,#fff,#d9d9d9)" : "transparent",
        boxShadow: done ? "0 0 12px -1px rgba(255,255,255,0.55)" : undefined,
      }}
    >
      <Check
        size={size * 0.6}
        strokeWidth={2.25}
        color={done ? "#0a0a0a" : G.ink2}
        className={done ? "" : "opacity-0 transition-opacity group-hover/ck:opacity-70"}
        aria-hidden
      />
    </button>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────────────────────────

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function useSvgId() {
  return useId().replace(/:/g, "");
}

/** Monotone cubic path (no overshoot below the baseline). */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  const tg: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  tg[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      tg[i] = 0;
      tg[i + 1] = 0;
      continue;
    }
    const a = tg[i] / m[i];
    const b = tg[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tg[i] = k * a * m[i];
      tg[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${(x0 + h).toFixed(1)},${(y0 + tg[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - tg[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/**
 * Area chart drawn as light: glowing white line, white→transparent fill, a lit marker with a
 * tooltip on `marker` (default: last point = today).
 */
export function AreaGlow({
  values,
  height = 200,
  marker,
  tooltip,
  fill = true,
  lineWidth = 1.75,
  grid = 3,
  padTop = 36,
  dotsAll = false,
}: {
  values: number[];
  height?: number;
  marker?: number | null;
  tooltip?: ReactNode;
  fill?: boolean;
  lineWidth?: number;
  grid?: number;
  padTop?: number;
  dotsAll?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const id = useSvgId();
  const max = Math.max(1, ...values);
  const pb = 6;
  const px = 6;
  const pts: [number, number][] = values.map((v, i) => [
    px + (i / Math.max(1, values.length - 1)) * Math.max(0, w - px * 2),
    padTop + (1 - v / max) * (height - padTop - pb),
  ]);
  const line = w ? smoothPath(pts) : "";
  const area = w && pts.length ? `${line} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z` : "";
  const mi = marker === null ? -1 : (marker ?? values.length - 1);
  const mp = pts[mi];
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} className="absolute inset-0 overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.2} />
              <stop offset="55%" stopColor="#fff" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`l${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.35} />
              <stop offset="70%" stopColor="#fff" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#fff" stopOpacity={1} />
            </linearGradient>
            <filter id={`g${id}`} x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          {Array.from({ length: grid }, (_, i) => {
            const y = padTop + ((i + 1) / (grid + 1)) * (height - padTop - pb);
            return <line key={i} x1={0} x2={w} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 5" />;
          })}
          <line x1={0} x2={w} y1={height - 0.5} y2={height - 0.5} stroke="rgba(255,255,255,0.08)" />
          {fill && <path d={area} fill={`url(#f${id})`} />}
          <path d={line} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={lineWidth * 3.5} filter={`url(#g${id})`} />
          <path d={line} fill="none" stroke={`url(#l${id})`} strokeWidth={lineWidth} strokeLinecap="round" />
          {dotsAll &&
            pts.map(([x, y], i) =>
              values[i] > 0 && i !== mi ? <circle key={i} cx={x} cy={y} r={2} fill="#0a0a0a" stroke="rgba(255,255,255,0.6)" strokeWidth={1} /> : null
            )}
          {mp && (
            <>
              <line x1={mp[0]} x2={mp[0]} y1={mp[1]} y2={height} stroke="rgba(255,255,255,0.25)" strokeDasharray="2 3" />
              <circle cx={mp[0]} cy={mp[1]} r={12} fill="#fff" opacity={0.18} filter={`url(#g${id})`} />
              <circle cx={mp[0]} cy={mp[1]} r={4.5} fill="#fff" />
              <circle cx={mp[0]} cy={mp[1]} r={8} fill="none" stroke="rgba(255,255,255,0.25)" />
            </>
          )}
        </svg>
      )}
      {mp && tooltip && (
        <div
          className="pointer-events-none absolute whitespace-nowrap"
          style={{
            left: Math.min(Math.max(mp[0], 60), w - 60),
            top: mp[1] - 14,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div
            className="rounded-[9px] px-2.5 py-1.5"
            style={{
              background: "rgba(24,24,24,0.85)",
              border: `1px solid ${G.line3}`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px -8px rgba(0,0,0,0.8)",
              backdropFilter: "blur(10px)",
              fontSize: 12,
            }}
          >
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny glowing sparkline (fixed size). */
export function Spark({ values, w = 96, h = 28, tone = "white" }: { values: number[]; w?: number; h?: number; tone?: Tone }) {
  const id = useSvgId();
  const max = Math.max(1, ...values);
  const pts: [number, number][] = values.map((v, i) => [2 + (i / Math.max(1, values.length - 1)) * (w - 4), 3 + (1 - v / max) * (h - 6)]);
  const d = smoothPath(pts);
  const c = tone === "neutral" ? "#fff" : toneColor(tone);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <defs>
        <filter id={`s${id}`} x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <linearGradient id={`sl${id}`} x1="0" x2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.15} />
          <stop offset="100%" stopColor={c} stopOpacity={1} />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={c} strokeOpacity={0.5} strokeWidth={3} filter={`url(#s${id})`} />
      <path d={d} fill="none" stroke={`url(#sl${id})`} strokeWidth={1.25} strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2.25} fill={c} style={{ filter: `drop-shadow(0 0 4px ${c})` }} />}
    </svg>
  );
}

/** Progress ring drawn as light, with a tick crown and a lit end-cap. */
export function Ring({
  pct,
  size = 220,
  stroke = 10,
  ticks = 60,
  pad = 14,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  ticks?: number;
  /** Space between the outer edge and the arc (tick crown lives there). */
  pad?: number;
  children?: ReactNode;
}) {
  const id = useSvgId();
  const p = Math.max(0, Math.min(100, pct));
  const c = size / 2;
  const rad = c - stroke / 2 - pad;
  const len = 2 * Math.PI * rad;
  const ang = (p / 100) * 2 * Math.PI - Math.PI / 2;
  const ex = c + rad * Math.cos(ang);
  const ey = c + rad * Math.sin(ang);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#9a9a9a" />
          </linearGradient>
          <filter id={`rg${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={Math.max(1.5, size / 36)} />
          </filter>
          <radialGradient id={`rc${id}`}>
            <stop offset="0%" stopColor="#fff" stopOpacity={0.07} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={rad - stroke} fill={`url(#rc${id})`} />
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * 2 * Math.PI - Math.PI / 2;
          const r1 = c - 5;
          const r2 = c - (i % 5 === 0 ? 10 : 8);
          const lit = i / ticks < p / 100;
          return (
            <line
              key={i}
              x1={c + r1 * Math.cos(a)}
              y1={c + r1 * Math.sin(a)}
              x2={c + r2 * Math.cos(a)}
              y2={c + r2 * Math.sin(a)}
              stroke={lit ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.1)"}
              strokeWidth={1}
            />
          );
        })}
        <circle cx={c} cy={c} r={rad} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {p > 0 && (
          <g transform={`rotate(-90 ${c} ${c})`}>
            <circle
              cx={c}
              cy={c}
              r={rad}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.5}
              strokeWidth={stroke + 4}
              strokeDasharray={`${(p / 100) * len} ${len}`}
              strokeLinecap="round"
              filter={`url(#rg${id})`}
            />
            <circle
              cx={c}
              cy={c}
              r={rad}
              fill="none"
              stroke={`url(#r${id})`}
              strokeWidth={stroke}
              strokeDasharray={`${(p / 100) * len} ${len}`}
              strokeLinecap="round"
            />
          </g>
        )}
        <circle cx={p > 0 ? ex : c} cy={p > 0 ? ey : c - rad} r={stroke / 2 + 1} fill="#fff" style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9))" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Vertical bars; highlighted bar is lit. */
export function BarsGlow({
  values,
  labels,
  height = 120,
  highlight,
  gap = 6,
  radius = 5,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  highlight?: number;
  gap?: number;
  radius?: number;
}) {
  const max = Math.max(1, ...values);
  const hi = highlight ?? values.length - 1;
  return (
    <div>
      <div className="flex items-end" style={{ height, gap }}>
        {values.map((v, i) => {
          const lit = i === hi;
          const h = v > 0 ? Math.max(6, (v / max) * height) : 3;
          return (
            <div key={i} className="group relative flex h-full flex-1 items-end" title={labels ? `${labels[i]}: ${v}` : String(v)}>
              <div
                className="w-full transition-[filter] duration-150 group-hover:brightness-150"
                style={{
                  height: h,
                  borderRadius: `${radius}px ${radius}px ${Math.min(radius, 3)}px ${Math.min(radius, 3)}px`,
                  background: v === 0
                    ? "rgba(255,255,255,0.07)"
                    : lit
                      ? "linear-gradient(180deg,#ffffff 0%,#bdbdbd 100%)"
                      : "linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.08) 100%)",
                  boxShadow: lit && v > 0 ? "0 0 18px -2px rgba(255,255,255,0.55), inset 0 1px 0 #fff" : v > 0 ? "inset 0 1px 0 rgba(255,255,255,0.35)" : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      {labels && (
        <div className="mt-2 flex" style={{ gap }}>
          {labels.map((l, i) => (
            <span key={i} className="flex-1 text-center" style={{ ...mono(10.5), color: i === hi ? G.ink : G.ink4 }}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Year heatmap: columns = weeks, rows = weekdays; the busiest cells glow. */
export function HeatCells({ cells, cell = 10, gap = 3 }: { cells: { date: string; value: number }[]; cell?: number; gap?: number }) {
  const max = Math.max(1, ...cells.map((c) => c.value));
  const weeks = Math.ceil(cells.length / 7);
  return (
    <div className="grid" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoFlow: "column", gridAutoColumns: `${cell}px`, gap, width: weeks * (cell + gap) - gap }}>
      {cells.map((c) => {
        const k = c.value / max;
        const lvl = c.value === 0 ? 0 : k > 0.75 ? 4 : k > 0.5 ? 3 : k > 0.25 ? 2 : 1;
        const bg = ["rgba(255,255,255,0.045)", "rgba(255,255,255,0.2)", "rgba(255,255,255,0.4)", "rgba(255,255,255,0.65)", "#ffffff"][lvl];
        return (
          <span
            key={c.date}
            title={`${c.date}: ${c.value}`}
            style={{ borderRadius: 3, background: bg, boxShadow: lvl === 4 ? "0 0 8px rgba(255,255,255,0.6)" : undefined }}
          />
        );
      })}
    </div>
  );
}

/** Thin progress line with a lit head. */
export function Meter({ pct, tone = "white", h = 4 }: { pct: number; tone?: Tone; h?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const c = tone === "white" || tone === "neutral" ? "#ffffff" : toneColor(tone);
  return (
    <div className="relative w-full overflow-visible rounded-full" style={{ height: h, background: "rgba(255,255,255,0.06)" }}>
      {p > 0 && (
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${p}%`,
            background: `linear-gradient(90deg, ${tone === "white" || tone === "neutral" ? "rgba(255,255,255,0.25)" : toneRgba(tone, 0.3)}, ${c})`,
            boxShadow: `0 0 10px ${tone === "white" || tone === "neutral" ? "rgba(255,255,255,0.45)" : toneRgba(tone, 0.55)}`,
          }}
        />
      )}
    </div>
  );
}

/** Segmented status bar: done / in progress / overdue. */
export function StatusBar({ done, progress, overdue, h = 8 }: { done: number; progress: number; overdue: number; h?: number }) {
  const total = Math.max(1, done + progress + overdue);
  const segs = [
    { v: done, bg: "linear-gradient(180deg,#fff,#cfcfcf)", glow: "0 0 12px rgba(255,255,255,0.45)" },
    { v: progress, bg: "rgba(255,255,255,0.22)", glow: undefined },
    { v: overdue, bg: toneColor("red"), glow: `0 0 12px ${toneRgba("red", 0.55)}` },
  ].filter((s) => s.v > 0);
  return (
    <div className="flex w-full gap-[3px]" style={{ height: h }}>
      {segs.map((s, i) => (
        <span key={i} className="rounded-full" style={{ flex: s.v / total, background: s.bg, boxShadow: s.glow, minWidth: 6 }} />
      ))}
    </div>
  );
}

// ── Composite blocks (shared anatomy, variants place them) ─────────────────────────────────

export function Empty({
  icon,
  title,
  text,
  action,
  compact = false,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  text?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`relative flex flex-col items-center justify-center text-center ${compact ? "gap-2 py-6" : "gap-3 py-10"}`}>
      <div className="relative">
        <Bloom x="50%" y="50%" size={110} opacity={0.12} blur={18} />
        <IconBox icon={icon} size={compact ? 36 : 44} />
      </div>
      <div className="mt-1" style={{ ...t.title, fontSize: 14 }}>
        {title}
      </div>
      {text && (
        <div className="max-w-[240px] leading-[1.5]" style={{ ...t.small, color: G.ink3 }}>
          {text}
        </div>
      )}
      {action}
    </div>
  );
}

/** One plan row: check · title + meta · chips. */
export function TaskLine({
  r,
  onToggle,
  onOpen,
  index,
  active = false,
  dense = false,
  chips = "full",
}: {
  r: TodayRow;
  onToggle: () => void;
  onOpen?: () => void;
  index?: number;
  active?: boolean;
  dense?: boolean;
  /** full = priority chip + due chip · compact = priority dot + due chip · due · none */
  chips?: "full" | "compact" | "due" | "none";
}) {
  const meta = [
    r.projectName,
    r.subtasksTotal ? `${r.subtasksDone}/${r.subtasksTotal} подзадач` : null,
    r.spentMin ? `${r.spentMin} мин` : null,
  ].filter(Boolean) as string[];
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group relative flex items-center gap-3 rounded-[12px] px-3 transition-colors duration-150 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25 ${onOpen ? "cursor-pointer" : ""}`}
      style={{
        minHeight: dense ? 44 : 56,
        background: active ? "rgba(255,255,255,0.05)" : undefined,
        boxShadow: active ? `inset 0 0 0 1px ${G.line2}` : undefined,
      }}
    >
      {index !== undefined && (
        <span className="w-5 shrink-0" style={{ ...mono(12), color: G.ink4 }}>
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
      <CheckDot done={r.done} onClick={onToggle} label={r.title} />
      <div className="min-w-0 flex-1 py-2">
        <div
          className="truncate"
          style={{ fontSize: 14, fontWeight: 450, color: r.done ? G.ink3 : G.ink, textDecoration: r.done ? "line-through" : undefined, textDecorationColor: G.ink4 }}
        >
          {r.title}
        </div>
        {!dense && meta.length > 0 && (
          <div className="mt-0.5 truncate" style={t.meta}>
            {meta.join(" · ")}
          </div>
        )}
      </div>
      {chips !== "none" && (
        <div className="flex shrink-0 items-center gap-1.5">
          {chips === "full" && <PrioChip r={r} short />}
          {chips === "compact" && r.priority ? (
            <span title={r.priorityLabel} className="mr-1 inline-flex">
              <Dot tone={PRIO_TONE[r.priority]} size={7} />
            </span>
          ) : null}
          <DueChip r={r} />
        </div>
      )}
    </div>
  );
}

export function AddTask({
  onAdd,
  id,
  placeholder = "Добавить на сегодня — «созвон завтра 15:00 !важно»",
  framed = true,
}: {
  onAdd: (text: string) => void;
  id?: string;
  placeholder?: string;
  framed?: boolean;
}) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(v);
        setV("");
      }}
      className="group flex h-11 items-center gap-3 rounded-[12px] px-3 transition-colors focus-within:bg-white/[0.035]"
      style={framed ? { background: G.c1, border: `1px solid ${G.line}`, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)" } : undefined}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ border: `1.5px dashed ${G.ink4}`, color: G.ink3 }}>
        <Plus size={12} strokeWidth={2} aria-hidden />
      </span>
      <input
        id={id}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        aria-label="Новая задача на сегодня"
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#555]"
        style={{ color: G.ink }}
      />
      <span className={`flex items-center gap-1 transition-opacity ${v ? "opacity-100" : "opacity-0"}`}>
        <Kbd>
          <CornerDownLeft size={11} strokeWidth={1.75} aria-hidden />
        </Kbd>
      </span>
    </form>
  );
}

export function NoteBox({ onSave, rows = 3, id }: { onSave: (text: string) => void; rows?: number; id?: string }) {
  const [v, setV] = useState("");
  const save = () => {
    onSave(v);
    setV("");
  };
  return (
    <div className="flex flex-col gap-2.5">
      <textarea
        id={id}
        value={v}
        rows={rows}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        placeholder="Мысль, ссылка, идея — сохранится в «Заметки»"
        aria-label="Быстрая заметка"
        className="w-full resize-none rounded-[12px] px-3.5 py-3 text-[14px] leading-[1.5] outline-none transition-colors placeholder:text-[#555] focus:border-white/20"
        style={{ background: G.c1, border: `1px solid ${G.line}`, color: G.ink, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)" }}
      />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5" style={t.meta}>
          <Kbd>Ctrl</Kbd>
          <Kbd>
            <CornerDownLeft size={11} strokeWidth={1.75} aria-hidden />
          </Kbd>
        </span>
        <GhostBtn size="sm" onClick={save} disabled={!v.trim()}>
          Сохранить
        </GhostBtn>
      </div>
    </div>
  );
}

export type MeetingItem = DashboardModel["meetings"][number];

export function MeetingLine({ mt, onToggle }: { mt: MeetingItem; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <div className="w-12 shrink-0">
        <div style={{ ...mono(14, 500), color: mt.done ? G.ink3 : G.ink }}>{mt.time}</div>
        <div style={{ ...t.meta, fontSize: 11 }}>{mt.dateLabel}</div>
      </div>
      <span className="h-8 w-px shrink-0" style={{ background: mt.done ? G.line2 : "linear-gradient(180deg,#fff,rgba(255,255,255,0.2))", boxShadow: mt.done ? undefined : "0 0 8px rgba(255,255,255,0.5)" }} />
      <div className="min-w-0 flex-1">
        {mt.url ? (
          <a href={mt.url} target="_blank" rel="noreferrer" className="block truncate hover:underline" style={{ fontSize: 14, color: mt.done ? G.ink3 : G.ink }}>
            {mt.title}
          </a>
        ) : (
          <div className="truncate" style={{ fontSize: 14, color: mt.done ? G.ink3 : G.ink }}>
            {mt.title}
          </div>
        )}
        <div className="truncate" style={t.meta}>
          {[mt.clientName, `${mt.durationMin} мин`].filter(Boolean).join(" · ")}
        </div>
      </div>
      <CheckDot done={!!mt.done} onClick={onToggle} label={mt.title} size={18} />
    </div>
  );
}

export function ProjectLine({ p, dense = false }: { p: ProjectRow; dense?: boolean }) {
  const tone = HEALTH_TONE[p.health];
  return (
    <div className={`flex flex-col gap-2 rounded-[12px] px-3 transition-colors hover:bg-white/[0.03] ${dense ? "py-2.5" : "py-3"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Dot tone={tone} size={6} />
          <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>
            {p.name}
          </span>
          {p.clientName && (
            <span className="truncate" style={t.meta}>
              {p.clientName}
            </span>
          )}
        </div>
        <span className="shrink-0" style={{ ...mono(12), color: G.ink2 }}>
          {p.done}/{p.total}
        </span>
      </div>
      <Meter pct={p.pct} tone={tone === "red" ? "red" : "white"} h={3} />
      {!dense && (
        <div className="flex items-center justify-between" style={t.meta}>
          <span style={{ color: tone === "neutral" ? G.ink3 : toneColor(tone) }}>{p.healthLabel}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {Math.round(p.pct)}% · {p.spentLabel}
            {p.overdue ? <span style={{ color: toneColor("red") }}> · {p.overdue} просроч.</span> : null}
          </span>
        </div>
      )}
    </div>
  );
}

export function ReadingCard({ item, size = 64 }: { item: NonNullable<DashboardModel["reading"]>; size?: number }) {
  const body = (
    <div className="group flex items-center gap-3.5">
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: size, height: size, borderRadius: 12, background: G.c4, border: `1px solid ${G.line2}` }}
      >
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            className="h-full w-full object-cover transition-[filter] duration-300 group-hover:grayscale-0"
            style={{ filter: "grayscale(1) contrast(1.1) brightness(0.9)" }}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center" style={{ color: G.ink3 }}>
            <Ico icon={BookOpen} />
          </span>
        )}
        <span className="pointer-events-none absolute inset-0 rounded-[12px]" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 leading-[1.35]" style={{ fontSize: 14, fontWeight: 500 }}>
          {item.title}
        </div>
        <div className="mt-1 flex items-center gap-1" style={t.meta}>
          {item.domain ?? item.author ?? "Библиотека"}
          {item.url && <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden />}
        </div>
      </div>
    </div>
  );
  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className="block rounded-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30">
      {body}
    </a>
  ) : (
    body
  );
}

/** Key/value line (label left, mono value right). */
export function KV({ k, v, tone, plain = false }: { k: ReactNode; v: ReactNode; tone?: Tone; plain?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0" style={t.small}>{k}</span>
      <span className="min-w-0 truncate" style={{ ...(plain ? { fontSize: 13 } : mono(13, 500)), color: tone ? toneColor(tone) : G.ink }}>
        {v}
      </span>
    </div>
  );
}

/** Mono number with thin gaps between thousands (a mono NBSP is a full cell wide). */
export function Grouped({ n, size = 14, weight = 400 }: { n: number; size?: number; weight?: number }) {
  const parts = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ").split(" ");
  return (
    <span style={mono(size, weight)}>
      {n < 0 ? "−" : ""}
      {parts.map((p, i) => (
        <span key={i} style={{ marginLeft: i ? "0.28em" : 0 }}>
          {p}
        </span>
      ))}
    </span>
  );
}

/** Money: mono digits + grey sans unit ("число белое, единица серая", ref 2). */
export function Rub({ n, size = 14, weight = 400, color }: { n: number; size?: number; weight?: number; color?: string }) {
  return (
    <span className="whitespace-nowrap" style={{ color }}>
      <Grouped n={n} size={size} weight={weight} />
      <span style={{ fontSize: size * 0.72, color: G.ink3, marginLeft: size * 0.18, fontWeight: 400 }}>₽</span>
    </span>
  );
}

/** Inline numeral in mono (keep Cyrillic words outside — mono Cyrillic reads too wide). */
export function N({ children, size = 12, weight = 400, color }: { children: ReactNode; size?: number; weight?: number; color?: string }) {
  return <span style={{ ...mono(size, weight), color }}>{children}</span>;
}

/** Russian plural helper. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Segmented switch: active segment = lit graphite pill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-[11px] p-1" role="tablist" style={{ background: G.c1, border: `1px solid ${G.line}` }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className="inline-flex h-7 items-center gap-1.5 rounded-[8px] px-3 text-[13px] transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
            style={{
              color: on ? G.ink : G.ink3,
              fontWeight: on ? 500 : 400,
              background: on ? `linear-gradient(180deg, ${G.c7}, ${G.c5})` : undefined,
              boxShadow: on ? `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 1px ${G.line2}` : undefined,
            }}
          >
            {o.label}
            {o.count !== undefined && <span style={{ ...mono(11.5), color: on ? G.ink2 : G.ink4 }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
