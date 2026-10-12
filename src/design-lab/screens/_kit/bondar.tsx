/**
 * Bondar Editorial kit — the measured language of alexandrbondar.com (docs/redesign/refs/owner-site.md)
 * turned into product primitives.
 *
 *  · Golos Text only (Panama is excluded by the owner): display = 500–600, tracking −0.05…−0.055em,
 *    sentence case; caps only at 11–12px.
 *  · Black canvas, depth by line alpha (5 / 7 / 10 / 15 / 20 / 25 / 40 %), radius 0.
 *  · Lime #ADFB0C is the only colour — action, progress, selection.
 *  · Pixel semantics: 3-bar signal, 3×2 matrix, 6px corner markers, 8px square bullets,
 *    ordered-dither / ASCII imagery, «↳» and «⊹» glyphs, numbering 01 / 1.0.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Tokens (owner-site.md §10)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export const B = {
  // surfaces — one plane + lines
  bg: "#000000",
  body: "#08090A",
  raised: "#0A0A0A",
  s1: "#101010",
  s2: "#151515",
  s3: "#1C1C1C",
  s4: "#202020",
  // white alpha lines (on dark)
  l5: "rgba(255,255,255,0.05)",
  l7: "rgba(255,255,255,0.07)",
  l10: "rgba(255,255,255,0.10)",
  l15: "rgba(255,255,255,0.15)",
  l20: "rgba(255,255,255,0.20)",
  l25: "rgba(255,255,255,0.25)",
  l40: "rgba(255,255,255,0.40)",
  lineStrong: "#303030",
  lineInset: "#262626",
  // text on dark
  text: "#FFFFFF",
  text2: "rgba(255,255,255,0.70)",
  text3: "#7F7F7F",
  text4: "rgba(255,255,255,0.50)",
  off: "#454545",
  // accent
  lime: "#ADFB0C",
  limeTint: "rgba(173,251,12,0.12)",
  onLime: "#000000",
  limeCheck: "#92B152",
  // semantics (muted so they never fight the lime)
  danger: "#FF5A36",
  dangerTint: "rgba(255,90,54,0.12)",
  warn: "#E6C84B",
  info: "#6BA8D5",
  // light sections
  paper: "#F7F7F7",
  paper2: "#F2F2F2",
  white: "#FFFFFF",
  ink: "#202020",
  ink2: "rgba(32,32,32,0.70)",
  ink4: "rgba(0,0,0,0.50)",
  // black alpha lines (on light)
  d5: "rgba(0,0,0,0.05)",
  d7: "rgba(0,0,0,0.07)",
  d10: "rgba(0,0,0,0.10)",
  d15: "rgba(0,0,0,0.15)",
  d20: "rgba(0,0,0,0.20)",
  d25: "rgba(0,0,0,0.25)",
  d40: "rgba(0,0,0,0.40)",
  chipLight: "#EEEEEE",
  chipDark: "#141414",
  pixOffLight: "#E1E1E1",
  // type / motion / shadows
  font: '"Golos Text", system-ui, sans-serif',
  ease: "cubic-bezier(.4,0,.2,1)",
  easeOut: "cubic-bezier(0,0,.2,1)",
  shadowChip: "2px 2px 3px rgba(0,0,0,.05), 8px 9px 6px rgba(0,0,0,.04), 17px 20px 8px rgba(0,0,0,.03)",
  shadowFloat:
    "inset 0 0 0 1px #262626, 0 5px 5px rgba(0,0,0,.05), 0 20px 10px rgba(0,0,0,.04), 0 46px 14px rgba(0,0,0,.03), 0 82px 16px rgba(0,0,0,.01)",
} as const;

/** Type scale (owner-site.md §2.2 / §10) — Golos Text only. */
export const T = {
  displayXl: { fontSize: 64, lineHeight: 0.92, fontWeight: 500, letterSpacing: "-0.055em" },
  displayL: { fontSize: 48, lineHeight: 0.95, fontWeight: 500, letterSpacing: "-0.05em" },
  displayM: { fontSize: 36, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.05em" },
  displayS: { fontSize: 28, lineHeight: 1.05, fontWeight: 500, letterSpacing: "-0.045em" },
  title: { fontSize: 20, lineHeight: 1.25, fontWeight: 500, letterSpacing: "-0.04em" },
  bodyL: { fontSize: 16, lineHeight: 1.4, fontWeight: 400, letterSpacing: "-0.04em" },
  body: { fontSize: 14, lineHeight: 1.4, fontWeight: 400, letterSpacing: "-0.035em" },
  bodyStrong: { fontSize: 14, lineHeight: 1.3, fontWeight: 500, letterSpacing: "-0.035em" },
  meta: { fontSize: 12, lineHeight: 1.35, fontWeight: 400, letterSpacing: "-0.02em" },
  caps: { fontSize: 11, lineHeight: 1.3, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" },
  btn: { fontSize: 14, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.02em" },
  btnCaps: { fontSize: 12, lineHeight: 1, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" },
  num: { fontSize: 12, lineHeight: 1, fontWeight: 500, letterSpacing: "0", fontVariantNumeric: "tabular-nums" },
  kpiNum: { fontSize: 40, lineHeight: 0.95, fontWeight: 400, letterSpacing: "-0.06em", fontVariantNumeric: "tabular-nums" },
} satisfies Record<string, CSSProperties>;

/** Out-of-scale display (hero headlines 80–96px): Golos 500, −0.055em, tight leading. */
export const display = (size: number, extra: CSSProperties = {}): CSSProperties => ({
  fontSize: size,
  lineHeight: size >= 56 ? 0.92 : size >= 40 ? 0.95 : 1.05,
  letterSpacing: size >= 56 ? "-0.055em" : "-0.05em",
  fontWeight: 500,
  ...extra,
});

export const tab: CSSProperties = { fontVariantNumeric: "tabular-nums" };
export const pad2 = (n: number) => String(n).padStart(2, "0");

/** The site's 4-column page grid: 20px margins, 20px gutters (owner-site.md §3). */
export const GRID_MARGIN = 20;
export const GRID_GUTTER = 20;
export const grid4: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  columnGap: GRID_GUTTER,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Hairline column grid — lines at the CENTRES of the gutters (x = 365 / 728 / 1092 @1440)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function ColumnGrid({
  columns = 4,
  color = B.l5,
  margin = GRID_MARGIN,
  gutter = GRID_GUTTER,
  className = "",
}: {
  columns?: number;
  color?: string;
  margin?: number;
  gutter?: number;
  className?: string;
}) {
  const used = 2 * margin + (columns - 1) * gutter;
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      {Array.from({ length: columns - 1 }, (_, k) => {
        const i = k + 1;
        return (
          <span
            key={i}
            className="absolute inset-y-0 w-px"
            style={{
              left: `calc(${margin}px + ${i} * ((100% - ${used}px) / ${columns} + ${gutter}px) - ${gutter / 2}px)`,
              background: color,
            }}
          />
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Glyphs: ↳ (hook), ⊹ (sparkle), thin check, 8px bullet, 6px corner markers
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** «↳» — the brand CTA mark: corner down-right, 1px stroke. */
export function Hook({ size = 14, color = "currentColor", className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden className={className}>
      <path d="M3.5 1.5V9.5H12" stroke={color} strokeWidth={1.1} />
      <path d="M9.2 6.7L12 9.5L9.2 12.3" stroke={color} strokeWidth={1.1} />
    </svg>
  );
}

/** «⊹» — four separate strokes; `open` rotates them into «✕». */
export function Sparkle({ size = 14, color = "currentColor", open = false }: { size?: number; color?: string; open?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      style={{ transform: open ? "rotate(45deg)" : undefined, transition: `transform .3s ${B.easeOut}` }}
    >
      <path d="M7 0.5V4.8M7 9.2V13.5M0.5 7H4.8M9.2 7H13.5" stroke={color} strokeWidth={1.1} />
    </svg>
  );
}

/** Thin 1px check mark (≈12px) used in check-lists. */
export function ThinCheck({ size = 12, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M1.2 6.4L4.4 9.4L10.8 2.6" stroke={color} strokeWidth={1.1} />
    </svg>
  );
}

/** Filled square bullet (8px) — «Формат работы». */
export function Bullet({ size = 8, color = "currentColor" }: { size?: number; color?: string }) {
  return <span aria-hidden className="inline-block shrink-0" style={{ width: size, height: size, background: color }} />;
}

/** 6×6 lime corner markers pinned to the top corners of a relative parent (price cards). */
export function CornerMarks({ color = B.lime, inset = 0, bottom = false }: { color?: string; inset?: number; bottom?: boolean }) {
  const s: CSSProperties = { position: "absolute", width: 6, height: 6, background: color };
  return (
    <>
      <span aria-hidden style={{ ...s, top: inset, left: inset }} />
      <span aria-hidden style={{ ...s, top: inset, right: inset }} />
      {bottom && <span aria-hidden style={{ ...s, bottom: inset, left: inset }} />}
      {bottom && <span aria-hidden style={{ ...s, bottom: inset, right: inset }} />}
    </>
  );
}

/** Diamond star glyph (≈40px) — the icon of the «Карьера / Навыки» cards. */
export function StarGlyph({ size = 40, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <path d="M20 4L36 20L20 36L4 20Z" stroke={color} strokeWidth={2.2} />
      <path d="M2 14H38M20 4L11 27M20 4L29 27M11 27L20 36L29 27" stroke={color} strokeWidth={1.4} />
    </svg>
  );
}

/** Hand-drawn lime wave underline (text-link hover). */
export function Wave({ width = 120, color = B.lime }: { width?: number; color?: string }) {
  const seg = 10;
  const n = Math.ceil(width / seg);
  let d = "M0 3";
  for (let i = 0; i < n; i++) d += ` q ${seg / 4} -3 ${seg / 2} 0 t ${seg / 2} 0`;
  return (
    <svg width={width} height={6} viewBox={`0 0 ${width} 6`} fill="none" aria-hidden preserveAspectRatio="none">
      <path d={d} stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Pixel semantics
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Three-bar signal (grade indicator): 6×12 bars, gap 2px, square ends. */
export function Signal({
  value,
  max = 3,
  on = B.lime,
  off = B.off,
  w = 6,
  h = 12,
  label,
}: {
  value: number;
  max?: number;
  on?: string;
  off?: string;
  w?: number;
  h?: number;
  label?: string;
}) {
  return (
    <span className="inline-flex shrink-0 items-end gap-[2px]" role="img" aria-label={label ?? `${value} из ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ width: w, height: h, background: i < value ? on : off }} />
      ))}
    </span>
  );
}

/** 3×2 pixel matrix (bento «Обо мне»): `value` of `cols*rows` cells lit. */
export function Matrix({
  value,
  cols = 3,
  rows = 2,
  cell = 11,
  on = B.lime,
  off = B.off,
}: {
  value: number;
  cols?: number;
  rows?: number;
  cell?: number;
  on?: string;
  off?: string;
}) {
  return (
    <span
      className="grid shrink-0 gap-[2px]"
      role="img"
      aria-label={`${value} из ${cols * rows}`}
      style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)` }}
    >
      {Array.from({ length: cols * rows }, (_, i) => (
        <span key={i} style={{ width: cell, height: cell, background: i < value ? on : off }} />
      ))}
    </span>
  );
}

/** Segmented progress — a row of squares with 2px gaps (never a solid bar). */
export function Cells({
  pct,
  count = 24,
  size = 6,
  on = B.text,
  off = B.l10,
  stretch = false,
}: {
  pct: number;
  count?: number;
  size?: number;
  on?: string;
  off?: string;
  stretch?: boolean;
}) {
  const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * count);
  return (
    <span className={`flex gap-[2px] ${stretch ? "w-full" : ""}`} role="img" aria-label={`${Math.round(pct)}%`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={stretch ? "min-w-0 flex-1" : "shrink-0"}
          style={{ width: stretch ? undefined : size, height: size, background: i < lit ? on : off }}
        />
      ))}
    </span>
  );
}

/** Pixel-art icon from an ASCII bitmap ('#' = on). Crisp at integer scales. */
export function Pixel({ map, px = 2, color = "currentColor" }: { map: string[]; px?: number; color?: string }) {
  const w = map[0].length;
  const h = map.length;
  return (
    <svg width={w * px} height={h * px} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {map.flatMap((row, y) =>
        [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} /> : null))
      )}
    </svg>
  );
}

/** 7×7 pixel icon set (nav + utility). */
export const PIX = {
  dashboard: ["###.###", "###.###", "###.###", ".......", "###.###", "###.###", "###.###"],
  clients: ["..###..", "..###..", "..###..", ".......", ".#####.", "#######", "#######"],
  projects: ["###....", "#######", "#.....#", "#.....#", "#.....#", "#.....#", "#######"],
  tasks: ["#######", "#.....#", "#....##", "#.#.#.#", "#..#..#", "#.....#", "#######"],
  planner: [".#...#.", "#######", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#######"],
  notes: ["#####..", "#...##.", "#.....#", "#.###.#", "#.....#", "#.###.#", "#######"],
  analytics: [".....##", ".....##", "...#.##", "...#.##", ".#.#.##", ".#.#.##", "#######"],
  knowledge: ["##...##", "#.#.#.#", "#..#..#", "#..#..#", "#..#..#", "#..#..#", "###.###"],
  plus: ["...#...", "...#...", "...#...", "###.###", "...#...", "...#...", "...#..."],
  search: [".###...", "#...#..", "#...#..", "#...#..", ".###...", ".....#.", "......#"],
  bell: ["...#...", "..###..", ".#####.", ".#####.", ".#####.", "#######", "...#..."],
  gear: ["..#.#..", ".#####.", "##...##", ".#...#.", "##...##", ".#####.", "..#.#.."],
  play: ["#######", "#.#...#", "#.##..#", "#.###.#", "#.##..#", "#.#...#", "#######"],
  clock: [".#####.", "#..#..#", "#..#..#", "#..##.#", "#.....#", "#.....#", ".#####."],
  // 6×6 filled chip pictograms
  chipPerson: ["..##..", "..##..", "......", ".####.", "######", "######"],
  chipCheck: [".....#", "....##", "#..##.", "####..", ".##...", "......"],
  chipCloud: ["######", "######", "######", "######", ".#....", "......"],
  chipShield: ["######", "######", "######", ".####.", "..##..", "......"],
  chipStar: ["..##..", "..##..", "######", ".####.", ".#..#.", "#....#"],
  chipCal: ["#.##.#", "######", "#....#", "######", "#....#", "######"],
  chipCoin: [".####.", "##..##", "#.##.#", "#.##.#", "##..##", ".####."],
  chipBook: ["##..##", "##..##", "##..##", "##..##", "######", "......"],
};

export const NAV_PIX: Record<string, string[]> = {
  dashboard: PIX.dashboard,
  clients: PIX.clients,
  projects: PIX.projects,
  tasks: PIX.tasks,
  planner: PIX.planner,
  notes: PIX.notes,
  analytics: PIX.analytics,
  knowledge: PIX.knowledge,
};

/** priority 1 (high) → 3 bars … 0 (none) → 0 bars */
export const PRIORITY_BARS: Record<number, number> = { 1: 3, 2: 2, 3: 1, 0: 0 };

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Controls
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Eyebrow chip above a section: r 4px, 3-layer soft shadow, 12px pictogram + grey label. */
export function Chip({
  children,
  icon,
  tone = "dark",
  size = "sm",
}: {
  children: ReactNode;
  icon?: string[];
  tone?: "dark" | "light";
  size?: "sm" | "lg";
}) {
  const light = tone === "light";
  const lg = size === "lg";
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap"
      style={{
        gap: 8,
        padding: lg ? "10px 16px" : "6px 10px",
        borderRadius: 4,
        background: light ? B.white : B.s4,
        border: `1px solid ${light ? B.chipLight : B.chipDark}`,
        color: B.text3,
        boxShadow: B.shadowChip,
        ...(lg ? { fontSize: 14, lineHeight: 1.2, letterSpacing: "-0.03em" } : T.meta),
      }}
    >
      {icon && <Pixel map={icon} px={2} color={B.text3} />}
      {children}
    </span>
  );
}

type BtnVariant = "lime" | "outline" | "ghost" | "black" | "white" | "outlineLight";

/** Button with the site's rolling label: on hover the label scrolls up and its copy rolls in. */
export function Button({
  children,
  variant = "lime",
  size = "md",
  hook = true,
  hookRight = false,
  onClick,
  type = "button",
  full = false,
  disabled,
  title,
}: {
  children: ReactNode;
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  hook?: boolean;
  hookRight?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  full?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const h = size === "sm" ? 32 : size === "md" ? 36 : 48;
  const palette: Record<BtnVariant, CSSProperties> = {
    lime: { background: B.lime, color: B.onLime },
    black: { background: B.bg, color: B.text },
    white: { background: B.white, color: B.bg },
    outline: { background: "transparent", color: B.text2, boxShadow: `inset 0 0 0 1px ${B.l20}` },
    outlineLight: { background: "transparent", color: B.ink, boxShadow: `inset 0 0 0 1px ${B.d20}` },
    ghost: { background: "transparent", color: B.text2 },
  };
  const label = (
    <span className="flex items-center gap-2" style={{ height: h }}>
      {hook && !hookRight && <Hook size={size === "lg" ? 16 : 14} />}
      <span className="whitespace-nowrap">{children}</span>
      {hook && hookRight && <Hook size={size === "lg" ? 16 : 14} />}
    </span>
  );
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`group relative inline-flex shrink-0 items-start justify-center overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-[#ADFB0C] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40 ${full ? "w-full" : ""}`}
      style={{ height: h, padding: variant === "ghost" ? 0 : size === "lg" ? "0 20px" : "0 16px", ...T.btn, ...palette[variant] }}
    >
      <span className="flex flex-col transition-transform duration-200 group-hover:-translate-y-1/2" style={{ transitionTimingFunction: B.easeOut, height: h * 2 }}>
        {label}
        <span aria-hidden>{label}</span>
      </span>
    </button>
  );
}

/** Full-width CTA bar at the foot of a card (59 → 56px, border-top 15%, btn-caps, «↳»). */
export function CtaBar({
  children,
  tone = "dark",
  onClick,
  height = 56,
  disabled,
}: {
  children: ReactNode;
  tone?: "dark" | "invert" | "lime" | "light";
  onClick?: () => void;
  height?: number;
  disabled?: boolean;
}) {
  const p: Record<string, CSSProperties> = {
    dark: { background: "transparent", color: B.text, borderTop: `1px solid ${B.l15}` },
    invert: { background: B.white, color: B.bg, borderTop: `1px solid ${B.white}` },
    lime: { background: B.lime, color: B.onLime, borderTop: `1px solid ${B.lime}` },
    light: { background: "transparent", color: B.ink, borderTop: `1px solid ${B.d15}` },
  };
  const hover: Record<string, string> = {
    dark: "hover:bg-white/[0.06]",
    invert: "hover:bg-[#F1F1F1]",
    lime: "hover:brightness-[1.06]",
    light: "hover:bg-black/[0.03]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full shrink-0 items-center justify-center gap-2 outline-none transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#ADFB0C] disabled:opacity-40 ${hover[tone]}`}
      style={{ height, ...T.btnCaps, ...p[tone] }}
    >
      <Hook size={14} />
      {children}
    </button>
  );
}

/** Square 16px checkbox: 1px 20% → hover 40% → checked = lime fill + black 1px check. */
export function Check({
  done,
  onClick,
  label,
  tone = "dark",
  size = 16,
}: {
  done: boolean;
  onClick: () => void;
  label: string;
  tone?: "dark" | "light" | "lime";
  size?: number;
}) {
  const border = tone === "dark" ? B.l20 : tone === "lime" ? "rgba(0,0,0,.4)" : B.d20;
  const hover = tone === "dark" ? "hover:!border-white/40" : "hover:!border-black/40";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `Вернуть в работу: ${label}` : `Готово: ${label}`}
      className={`flex shrink-0 items-center justify-center outline-none transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-[#ADFB0C] ${done ? "" : hover}`}
      style={{
        width: size,
        height: size,
        border: `1px solid ${done ? (tone === "lime" ? B.bg : B.lime) : border}`,
        background: done ? (tone === "lime" ? B.bg : B.lime) : "transparent",
      }}
    >
      {done && <ThinCheck size={size - 6} color={tone === "lime" ? B.lime : B.onLime} />}
    </button>
  );
}

/** Numbered tabs «01 02 03»: circle + label, 2px underline, active = lime. */
export function NumTabs<Id extends string>({
  items,
  value,
  onChange,
  size = "sm",
  tone = "dark",
}: {
  items: { id: Id; label: string; count?: number }[];
  value: Id;
  onChange: (id: Id) => void;
  size?: "sm" | "lg";
  tone?: "dark" | "light";
}) {
  const lg = size === "lg";
  const circle = lg ? 33 : 24;
  const idle = tone === "dark" ? B.text3 : "rgba(0,0,0,.35)";
  const idleLine = tone === "dark" ? B.l20 : B.d15;
  const activeText = tone === "dark" ? B.text : B.ink;
  return (
    <div role="tablist" className="flex w-full gap-2">
      {items.map((it, i) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            className="group flex min-w-0 flex-1 items-center outline-none focus-visible:bg-white/[0.04]"
            style={{
              gap: lg ? 16 : 8,
              paddingBottom: lg ? 16 : 12,
              borderBottom: `2px solid ${on ? B.lime : idleLine}`,
              transition: `border-color .2s ${B.ease}`,
            }}
          >
            <span
              className="flex shrink-0 items-center justify-center rounded-full"
              style={{
                width: circle,
                height: circle,
                border: `1px solid ${on ? B.lime : idle}`,
                color: on ? (tone === "dark" ? B.lime : B.ink) : idle,
                ...T.num,
                fontSize: lg ? 14 : 11,
                transition: `color .2s ${B.ease}, border-color .2s ${B.ease}`,
              }}
            >
              {pad2(i + 1)}
            </span>
            <span
              className="truncate transition-opacity duration-200 group-hover:opacity-100"
              style={{
                ...(lg ? T.title : T.body),
                fontWeight: lg ? 400 : 500,
                color: on ? activeText : idle,
                opacity: on ? 1 : 0.85,
              }}
            >
              {it.label}
            </span>
            {it.count !== undefined && (
              <span className="ml-auto shrink-0" style={{ ...T.num, color: on ? activeText : idle }}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Key–value row (case tables): key grey left, value right, 1px 10% under. */
export function KV({
  k,
  v,
  tone = "dark",
  last = false,
  py = 12,
  valueColor,
}: {
  k: ReactNode;
  v: ReactNode;
  tone?: "dark" | "light" | "lime";
  last?: boolean;
  py?: number;
  valueColor?: string;
}) {
  const line = tone === "dark" ? B.l10 : tone === "lime" ? "rgba(0,0,0,.15)" : B.d10;
  const key = tone === "dark" ? B.text3 : tone === "lime" ? "rgba(0,0,0,.6)" : B.text3;
  const val = tone === "dark" ? B.text : B.ink;
  return (
    <div
      className="flex min-w-0 items-baseline justify-between gap-4"
      style={{ padding: `${py}px 0`, borderBottom: last ? undefined : `1px solid ${line}`, ...T.body }}
    >
      <span className="shrink-0" style={{ color: key }}>{k}</span>
      <span className="min-w-0 truncate text-right" style={{ color: valueColor ?? (tone === "lime" ? B.onLime : val), ...tab }}>{v}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Dithered imagery (ordered Bayer 4×4) — real images and procedural fields, on <canvas>
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Measures its box and hands the size to a draw callback (DPR-aware, crisp pixels). */
function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size.w, size.h);
    draw(ctx, size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, ...deps]);
  return ref;
}

type FieldKind = "blob" | "stripes" | "wave" | "orb" | "ridge";

/** `relative` unless the caller positions the box itself (Tailwind would let `relative` win). */
const posOf = (cls: string) => (/(^|\s)(absolute|fixed|sticky)(\s|$)/.test(cls) ? "" : "relative");

/** Procedural brightness field 0..1 used by DitherField / AsciiField. */
function field(kind: FieldKind, u: number, v: number, seed: number): number {
  const r = mulberry(seed);
  const cx = 0.35 + r() * 0.4;
  const cy = 0.3 + r() * 0.4;
  const ph = r() * 6.28;
  switch (kind) {
    case "orb": {
      const d = Math.hypot(u - cx, (v - cy) * 1.1);
      return Math.max(0, 1 - d * 2.1) ** 1.3;
    }
    case "stripes": {
      const diag = (u * 0.8 + v) * 10 + ph;
      const fall = Math.max(0, 1 - Math.hypot(u - 1, v - 0.1) * 0.95);
      return (0.5 + 0.5 * Math.sin(diag * 3.1)) * fall * 1.15;
    }
    case "wave": {
      const y = 0.5 + 0.18 * Math.sin(u * 6.3 + ph) + 0.06 * Math.sin(u * 17 + ph * 2);
      return Math.max(0, 1 - Math.abs(v - y) * 4.2) ** 1.6;
    }
    case "ridge": {
      const t = 0.55 + 0.25 * Math.sin(u * 3 + ph) - 0.1 * Math.cos(u * 9);
      return v > t ? Math.min(1, (v - t) * 2.4 + 0.15) * (0.6 + 0.4 * Math.sin(u * 40 + v * 12)) : 0;
    }
    default: {
      const d1 = Math.hypot(u - cx, v - cy);
      const d2 = Math.hypot(u - (1 - cx) * 0.9, v - (1 - cy));
      return Math.max(0, 1.05 - d1 * 2.2) * 0.85 + Math.max(0, 0.7 - d2 * 2.6) * 0.6;
    }
  }
}

/**
 * Procedural dot-dither art (the site's pixel figures): dots on a `cell` lattice,
 * ordered-dithered from a brightness field. White, lime or black — no anti-aliasing.
 */
export function DitherField({
  kind = "blob",
  seed = 7,
  color = B.text,
  accent,
  accentShare = 0.18,
  cell = 4,
  dot = 2,
  gain = 1,
  className = "",
  style,
}: {
  kind?: FieldKind;
  seed?: number;
  color?: string;
  accent?: string;
  accentShare?: number;
  cell?: number;
  dot?: number;
  gain?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      const cols = Math.floor(w / cell);
      const rows = Math.floor(h / cell);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const u = x / cols;
          const v = y / rows;
          const b = Math.min(1, field(kind, u, v, seed) * gain);
          if (b > BAYER[(y % 4) * 4 + (x % 4)]) {
            ctx.fillStyle = accent && b > 1 - accentShare ? accent : color;
            ctx.fillRect(x * cell, y * cell, dot, dot);
          }
        }
      }
    },
    [kind, seed, color, accent, accentShare, cell, dot, gain]
  );
  return (
    <div aria-hidden className={`${posOf(className)} overflow-hidden ${className}`} style={style}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
    </div>
  );
}

/** ASCII dither (`#+%@*01`) — glyph brightness follows a procedural field. */
export function AsciiField({
  kind = "stripes",
  seed = 3,
  color = "rgba(255,255,255,0.85)",
  accent,
  cellW = 8,
  cellH = 11,
  className = "",
  style,
}: {
  kind?: FieldKind;
  seed?: number;
  color?: string;
  accent?: string;
  cellW?: number;
  cellH?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ramp = " .*+10%#@";
  const ref = useCanvas(
    (ctx, w, h) => {
      const cols = Math.floor(w / cellW);
      const rows = Math.floor(h / cellH);
      const r = mulberry(seed * 13 + 1);
      ctx.font = `500 ${cellH - 1}px "Geist Mono", "JetBrains Mono", monospace`;
      ctx.textBaseline = "top";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const b = Math.min(0.999, field(kind, x / cols, y / rows, seed) * (0.85 + r() * 0.3));
          const ch = ramp[Math.floor(b * ramp.length)];
          if (ch === " ") continue;
          ctx.globalAlpha = 0.25 + b * 0.75;
          ctx.fillStyle = accent && b > 0.86 ? accent : color;
          ctx.fillText(ch, x * cellW, y * cellH);
        }
      }
      ctx.globalAlpha = 1;
    },
    [kind, seed, color, accent, cellW, cellH]
  );
  return (
    <div aria-hidden className={`${posOf(className)} overflow-hidden ${className}`} style={style}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/**
 * A real image rendered as 1-bit ordered dither (light dots on black). Falls back to a
 * grayscale + dot-screen treatment when the image can't be read (CORS).
 */
export function Dither({
  src,
  cell = 3,
  color = B.text,
  bg = B.bg,
  contrast = 1.35,
  className = "",
  style,
  fallbackKind = "orb",
  seed = 5,
}: {
  src?: string;
  cell?: number;
  color?: string;
  bg?: string;
  contrast?: number;
  className?: string;
  style?: CSSProperties;
  fallbackKind?: FieldKind;
  seed?: number;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setImg(null);
    setFailed(false);
    if (!src) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => setImg(im);
    im.onerror = () => setFailed(true);
    im.src = src;
  }, [src]);

  const ref = useCanvas(
    (ctx, w, h) => {
      if (!img) return;
      const cols = Math.max(1, Math.floor(w / cell));
      const rows = Math.max(1, Math.floor(h / cell));
      const off = document.createElement("canvas");
      off.width = cols;
      off.height = rows;
      const o = off.getContext("2d", { willReadFrequently: true });
      if (!o) return;
      // object-fit: cover
      const s = Math.max(cols / img.naturalWidth, rows / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      o.drawImage(img, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
      let data: Uint8ClampedArray;
      try {
        data = o.getImageData(0, 0, cols, rows).data;
      } catch {
        setFailed(true);
        return;
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = color;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          let l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          l = Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.5));
          if (l > BAYER[(y % 4) * 4 + (x % 4)]) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
      }
    },
    [img, cell, color, bg, contrast]
  );

  if (!src || failed) {
    return (
      <div className={`${posOf(className)} overflow-hidden ${className}`} style={{ background: bg, ...style }}>
        {src && failed ? (
          <>
            <img src={src} alt="" className="h-full w-full object-cover" style={{ filter: "grayscale(1) contrast(1.6) brightness(.85)" }} />
            <div
              className="absolute inset-0"
              style={{ backgroundImage: `radial-gradient(${bg} 0.9px, transparent 1.2px)`, backgroundSize: "3px 3px" }}
            />
          </>
        ) : (
          <DitherField kind={fallbackKind} seed={seed} color={color} className="absolute inset-0" />
        )}
      </div>
    );
  }
  return (
    <div aria-hidden className={`${posOf(className)} overflow-hidden ${className}`} style={{ background: bg, ...style }}>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Floating dock plate (site's bottom «МЕНЮ» dock / cookie bar)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function DockPlate({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={{ background: B.bg, boxShadow: B.shadowFloat, ...style }}>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Small shared helpers (data → wording / levels)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** ratio 0..1 → 0..3 bars */
export const bars = (ratio: number) => (ratio <= 0 ? 0 : ratio < 0.34 ? 1 : ratio < 0.67 ? 2 : 3);

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Colour of a project-health word: off-track = danger, at-risk = warn, rest = muted. */
export function healthColor(h: string, tone: "dark" | "light" = "dark") {
  if (h === "off-track") return B.danger;
  if (h === "at-risk") return tone === "dark" ? B.warn : "#9A7B00";
  return tone === "dark" ? B.text3 : B.text3;
}

/** One-line editorial deck under the greeting. */
export function deck(m: {
  plan: { done: boolean; overdue: boolean }[];
  overPlan: unknown[];
  meetings: { date: string; done?: boolean }[];
}): string {
  const open = m.plan.filter((r) => !r.done).length;
  const late = m.plan.filter((r) => r.overdue).length;
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const meet = m.meetings.filter((x) => x.date === key && !x.done).length;
  const parts = [
    open ? `В плане ${open} ${plural(open, "задача", "задачи", "задач")}` : "План на сегодня закрыт",
    late ? `${late} с просрочкой` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}. ${meet ? `${meet} ${plural(meet, "встреча", "встречи", "встреч")} сегодня.` : "Встреч сегодня нет."}${
    m.overPlan.length ? ` Ещё ${m.overPlan.length} — сверх плана.` : ""
  }`;
}

/** Hatch 2/8px #191919 — fills empty / past zones. */
export const hatch = (color = "#191919"): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 8px)`,
});
