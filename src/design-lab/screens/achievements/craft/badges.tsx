/**
 * Достижения · skeuomorphic 3D badges, drawn as SVG (no raster art, nothing loaded at runtime).
 *
 * One family, built like our folder icon (glossy blue enamel #3D9DFF→#0A6CF0, darker back layer,
 * inset white highlight line) but with more depth:
 *
 *   ground shadow + coloured glow
 *   extruded side wall (the shape stacked downwards, darker, lit from the middle)
 *   metal rim (platinum, gold for capstones) with a top bevel highlight and a bottom shade
 *   groove (reversed metal — the bezel slopes into the face)
 *   raised enamel face: soft drop onto the groove, inset top highlight, bottom inner shade,
 *     glossy top lens and a small specular spot
 *   emblem: a lucide glyph re-drawn as a cream embossed relief (side wall + face + cast shadow)
 *   optional metal plaque with the number (10 / 250 / 7 …) at the bottom
 *
 * Shape by category: tasks — rounded tile · focus — hexagon · streaks & habits — shield ·
 * levels — rosette seal. Locked = the same badge in desaturated steel.
 *
 * <LiveBadge> renders the art in two layers inside a preserve-3d stage (body, and the emblem +
 * plaque lifted on translateZ), so tilting toward the cursor gives real parallax; a glare follows the
 * pointer, a click spins it once, and the hero emblem floats. All motion is off under
 * prefers-reduced-motion.
 */
import { memo, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  Award,
  Brain,
  CalendarCheck,
  CalendarClock,
  Check,
  Clock,
  Crown,
  Flame,
  Gem,
  Headphones,
  Hourglass,
  Inbox,
  Layers,
  ListChecks,
  MoonStar,
  Mountain,
  Orbit,
  RefreshCw,
  Rocket,
  Sparkles,
  Star,
  Sunrise,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

// ── Definitions ─────────────────────────────────────────────────────────────────────────────────

type Shape = "tile" | "hex" | "shield" | "seal";
type Family = "blue" | "azure" | "indigo";
type Metal = "platinum" | "gold";

interface BadgeDef {
  shape: Shape;
  family: Family;
  metal?: Metal;
  icon: LucideIcon;
  /** Number on the plaque (shown from 72px up). */
  num?: string;
}

const task = (icon: LucideIcon, num?: string, metal?: Metal): BadgeDef => ({ shape: "tile", family: "blue", icon, num, metal });
const focus = (icon: LucideIcon, num?: string, metal?: Metal): BadgeDef => ({ shape: "hex", family: "azure", icon, num, metal });
const habit = (icon: LucideIcon, num?: string, metal?: Metal): BadgeDef => ({ shape: "shield", family: "indigo", icon, num, metal });
const level = (icon: LucideIcon, num?: string, metal?: Metal): BadgeDef => ({ shape: "seal", family: "blue", icon, num, metal });

export const BADGES: Record<string, BadgeDef> = {
  // Tasks — tile
  "first-task": task(Check),
  "ten-tasks": task(ListChecks, "10"),
  "fifty-tasks": task(Rocket, "50"),
  "hundred-tasks": task(Award, "100"),
  "milestone-250": task(Target, "250"),
  "milestone-500": task(Mountain, "500", "gold"),
  "record-day": task(Zap, "8"),
  "inbox-zero": task(Inbox),
  "multi-project": task(Layers, "5"),
  perfectionist: task(Gem),
  // Focus — hexagon
  "first-pomodoro": focus(Timer),
  "ten-pomodoros": focus(Timer, "10"),
  "fifty-pomodoros": focus(Timer, "50"),
  "pomodoro-100": focus(Timer, "100"),
  "pomodoro-200": focus(Timer, "200", "gold"),
  "pomodoro-day": focus(CalendarClock, "6"),
  "focus-2h": focus(Clock, "2 ч"),
  "focus-10h": focus(Hourglass, "10 ч"),
  "big-focus-day": focus(Brain, "4 ч"),
  "long-session-90": focus(Headphones, "90"),
  // Streaks & habits — shield
  "streak-3": habit(Flame, "3"),
  "streak-7": habit(CalendarCheck, "7"),
  "streak-30": habit(Trophy, "30", "gold"),
  comeback: habit(RefreshCw),
  "early-bird": habit(Sunrise),
  "night-owl": habit(MoonStar),
  // Levels — seal
  "level-5": level(Star, "5"),
  "level-10": level(Crown, "10"),
  "level-15": level(Sparkles, "15"),
  "level-20": level(Orbit, "20", "gold"),
  // Hero emblem (the plaque gets the current level)
  hero: level(Trophy, undefined, "gold"),
};

const FALLBACK: BadgeDef = task(Star);

// ── Palettes ────────────────────────────────────────────────────────────────────────────────────

interface Enamel {
  face: [string, string, string];
  side: [string, string];
  deep: string;
  glow: string;
}

const ENAMEL: Record<Family | "steel", Enamel> = {
  blue: { face: ["#6CBBFF", "#2A8CFF", "#0A63DC"], side: ["#0A55BC", "#042A63"], deep: "#06357F", glow: "10,132,255" },
  azure: { face: ["#7EDBFF", "#28AEF6", "#0A7DD8"], side: ["#0A6FBF", "#043F70"], deep: "#05467E", glow: "24,168,255" },
  indigo: { face: ["#A6B1FF", "#6375FA", "#3C46DA"], side: ["#3539B8", "#1B1D6E"], deep: "#1E2483", glow: "98,116,250" },
  steel: { face: ["#6E717A", "#4B4E56", "#34363C"], side: ["#2B2D32", "#141518"], deep: "#1A1B1F", glow: "0,0,0" },
};

interface MetalPal {
  stops: [string, string, string, string, string];
  inner: [string, string];
  edge: string;
  text: string;
}

const METALS: Record<Metal | "steel", MetalPal> = {
  platinum: { stops: ["#FFFFFF", "#D9E0EA", "#97A3B4", "#EEF2F7", "#AEB8C6"], inner: ["#56637A", "#C9D2DE"], edge: "#3E4858", text: "#0B2A5E" },
  gold: { stops: ["#FFF6DA", "#F1CF80", "#B4822C", "#FBE6AE", "#C99642"], inner: ["#6E4A12", "#F3D58F"], edge: "#5E400E", text: "#4A2F05" },
  steel: { stops: ["#B5B8BF", "#8C9098", "#5A5D64", "#A3A6AD", "#6E7178"], inner: ["#34363B", "#8E9198"], edge: "#26282C", text: "#2A2C30" },
};

const EMBLEM = {
  on: { top: "#FFFFFF", bottom: "#FFF1D6", wall: "#CDB98F" },
  off: { top: "#C4C6CC", bottom: "#9C9FA6", wall: "#5C5F66" },
};

// ── Geometry (viewBox 0 0 120 120; body sits in 14..106 × 8..104, side wall + shadow below) ──────

const CX = 60;
const CY = 56;
const DEPTH = 7;

const n = (v: number) => Math.round(v * 100) / 100;

function rrect(x: number, y: number, w: number, h: number, r: number) {
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}

function circle(cx: number, cy: number, r: number) {
  return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
}

function roundPoly(pts: [number, number][], r: number) {
  const toward = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    return `${n(a[0] + (dx / l) * r)} ${n(a[1] + (dy / l) * r)}`;
  };
  let d = "";
  pts.forEach((v, k) => {
    const p = pts[(k - 1 + pts.length) % pts.length];
    const q = pts[(k + 1) % pts.length];
    d += `${k === 0 ? "M" : "L"}${toward(v, p)}Q${n(v[0])} ${n(v[1])} ${toward(v, q)}`;
  });
  return `${d}Z`;
}

/** The shape at a given inset (0 = outer rim edge). */
function shapePath(shape: Shape, i: number): string {
  switch (shape) {
    case "tile":
      return rrect(14 + i, 10 + i, 92 - 2 * i, 92 - 2 * i, Math.max(6, 28 - i * 0.9));
    case "hex": {
      const R = 48 - i * 1.155;
      const pts = Array.from({ length: 6 }, (_, k) => {
        const a = ((-90 + k * 60) * Math.PI) / 180;
        return [CX + R * Math.cos(a), CY + R * Math.sin(a)] as [number, number];
      });
      return roundPoly(pts, Math.max(4, 11 - i * 0.45));
    }
    case "shield": {
      const L = 16 + i;
      const Rt = 104 - i;
      const T = 10 + i;
      const mid = 50;
      const B = 108 - i * 1.3;
      const r = Math.max(6, 16 - i * 0.6);
      return (
        `M${n(L + r)} ${n(T)}Q${CX} ${n(T - 3)} ${n(Rt - r)} ${n(T)}Q${n(Rt)} ${n(T)} ${n(Rt)} ${n(T + r)}V${mid}` +
        `C${n(Rt)} ${mid + 32} ${CX + 26 - i * 0.4} ${n(B - 12)} ${CX} ${n(B)}` +
        `C${CX - 26 + i * 0.4} ${n(B - 12)} ${n(L)} ${mid + 32} ${n(L)} ${mid}V${n(T + r)}Q${n(L)} ${n(T)} ${n(L + r)} ${n(T)}Z`
      );
    }
    case "seal": {
      if (i > 0) return circle(CX, CY, 44.5 - i);
      const N = 18;
      const pts: string[] = [];
      for (let k = 0; k < 180; k++) {
        const a = (k / 180) * Math.PI * 2;
        const r = 46.5 + 2.4 * Math.cos(N * a);
        pts.push(`${n(CX + r * Math.cos(a))} ${n(CY + r * Math.sin(a))}`);
      }
      return `M${pts.join("L")}Z`;
    }
  }
}

const EMBLEM_LAYOUT: Record<Shape, { cy: number; size: number; plaqueY: number }> = {
  tile: { cy: 56, size: 46, plaqueY: 99 },
  hex: { cy: 56, size: 42, plaqueY: 97 },
  shield: { cy: 52, size: 42, plaqueY: 91 },
  seal: { cy: 56, size: 40, plaqueY: 100 },
};

const RIM = 7;
const FACE = 10;

// ── Art ─────────────────────────────────────────────────────────────────────────────────────────

function useUid(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

interface ArtProps {
  id: string;
  locked?: boolean;
  /** Overrides the plaque number (the hero emblem shows the current level). */
  num?: string;
  /** Rendered size in px — small badges drop the plaque and the finest details. */
  size: number;
  layer: "base" | "top";
}

/** One layer of a badge as an absolutely-filling SVG. */
export const BadgeArt = memo(function BadgeArt({ id, locked, num, size, layer }: ArtProps) {
  const u = useUid(`bdg-${layer}-`);
  const def = BADGES[id] ?? FALLBACK;
  const en = ENAMEL[locked ? "steel" : def.family];
  const mt = METALS[locked ? "steel" : (def.metal ?? "platinum")];
  const em = locked ? EMBLEM.off : EMBLEM.on;
  const plaque = size >= 72 ? (num ?? def.num) : undefined;
  const lay = EMBLEM_LAYOUT[def.shape];
  const gs = lay.size;
  const gy = lay.cy - (plaque ? 4 : 0);
  const Icon = def.icon;
  const sw = size < 64 ? 2.5 : 2.2;

  const outer = shapePath(def.shape, 0);
  const groove = shapePath(def.shape, RIM);
  const face = shapePath(def.shape, FACE);

  const svg: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" };

  const glyph = (stroke: string, extra?: { dx?: number; dy?: number; filter?: string; opacity?: number }) => (
    <g transform={`translate(${extra?.dx ?? 0} ${extra?.dy ?? 0})`} filter={extra?.filter} opacity={extra?.opacity}>
      <Icon x={CX - gs / 2} y={gy - gs / 2} size={gs} color={stroke} strokeWidth={sw} />
    </g>
  );

  if (layer === "base") {
    return (
      <svg viewBox="0 0 120 120" style={svg} aria-hidden>
        <defs>
          <linearGradient id={`${u}m`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={mt.stops[0]} />
            <stop offset="0.3" stopColor={mt.stops[1]} />
            <stop offset="0.56" stopColor={mt.stops[2]} />
            <stop offset="0.78" stopColor={mt.stops[3]} />
            <stop offset="1" stopColor={mt.stops[4]} />
          </linearGradient>
          <linearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mt.inner[0]} />
            <stop offset="1" stopColor={mt.inner[1]} />
          </linearGradient>
          <linearGradient id={`${u}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={en.face[0]} />
            <stop offset="0.55" stopColor={en.face[1]} />
            <stop offset="1" stopColor={en.face[2]} />
          </linearGradient>
          <linearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={en.side[1]} />
            <stop offset="0.5" stopColor={en.side[0]} />
            <stop offset="1" stopColor={en.side[1]} />
          </linearGradient>
          <linearGradient id={`${u}l`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={locked ? 0.2 : 0.5} />
            <stop offset="1" stopColor="#fff" stopOpacity="0.03" />
          </linearGradient>
          <radialGradient id={`${u}b`} cx="0.5" cy="0.18" r="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity={locked ? 0.08 : 0.22} />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${u}co`}>
            <path d={outer} />
          </clipPath>
          <clipPath id={`${u}cf`}>
            <path d={face} />
          </clipPath>
          <filter id={`${u}x8`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`${u}x3`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id={`${u}x1`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* Ground: coloured glow + contact shadow */}
        {!locked && <path d={outer} transform="translate(0 10)" fill={`rgb(${en.glow})`} opacity="0.32" filter={`url(#${u}x8)`} />}
        <path d={outer} transform={`translate(0 ${DEPTH + 3})`} fill="#000" opacity="0.5" filter={`url(#${u}x3)`} />

        {/* Side wall — the shape stacked downwards */}
        {Array.from({ length: DEPTH }, (_, k) => DEPTH - k).map((dy) => (
          <path key={dy} d={outer} transform={`translate(0 ${dy})`} fill={`url(#${u}s)`} />
        ))}
        <path d={outer} transform={`translate(0 ${DEPTH})`} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="0.8" />

        {/* Metal rim with top bevel light and bottom shade */}
        <path d={outer} fill={`url(#${u}m)`} />
        <g clipPath={`url(#${u}co)`}>
          <path d={outer} transform="translate(0 1.1)" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.6" />
          <path d={outer} transform="translate(0 -1.4)" fill="none" stroke={mt.edge} strokeOpacity="0.55" strokeWidth="2" />
        </g>
        <path d={outer} fill="none" stroke={mt.edge} strokeOpacity="0.5" strokeWidth="0.6" />

        {/* Groove — bezel slopes into the face */}
        <path d={groove} fill={`url(#${u}g)`} />
        <path d={face} transform="translate(0 2)" fill="#000" opacity="0.45" filter={`url(#${u}x1)`} />

        {/* Raised enamel face */}
        <path d={face} fill={`url(#${u}f)`} />
        <g clipPath={`url(#${u}cf)`}>
          <rect x="0" y="0" width="120" height="120" fill={`url(#${u}b)`} />
          <path d={face} transform="translate(0 -2.5)" fill="none" stroke={en.deep} strokeOpacity="0.85" strokeWidth="5" filter={`url(#${u}x1)`} />
          <path d={face} transform="translate(0 1.2)" fill="none" stroke="#fff" strokeOpacity={locked ? 0.25 : 0.55} strokeWidth="1.4" />
          {/* Glossy top lens */}
          <ellipse cx={CX} cy={def.shape === "shield" ? 14 : 18} rx="64" ry="36" fill={`url(#${u}l)`} />
          {/* Specular spot */}
          {size >= 64 && (
            <ellipse cx="40" cy={def.shape === "shield" ? 26 : 30} rx="9" ry="4.5" transform={`rotate(-32 40 ${def.shape === "shield" ? 26 : 30})`} fill="#fff" opacity={locked ? 0.12 : 0.38} filter={`url(#${u}x1)`} />
          )}
        </g>
        <path d={face} fill="none" stroke={en.deep} strokeOpacity="0.6" strokeWidth="0.6" />

        {/* Emblem's cast shadow stays on the face — the relief floats above it (parallax). */}
        {glyph(en.deep, { dy: 2.6, filter: `url(#${u}x1)`, opacity: 0.85 })}
      </svg>
    );
  }

  // Top layer: embossed emblem + plaque
  const pw = plaque ? 14 + plaque.length * 7.2 : 0;
  return (
    <svg viewBox="0 0 120 120" style={svg} aria-hidden>
      <defs>
        <linearGradient id={`${u}e`} gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22">
          <stop offset="0" stopColor={em.top} />
          <stop offset="1" stopColor={em.bottom} />
        </linearGradient>
        <linearGradient id={`${u}p`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mt.stops[0]} />
          <stop offset="0.5" stopColor={mt.stops[1]} />
          <stop offset="1" stopColor={mt.stops[2]} />
        </linearGradient>
        <filter id={`${u}x`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* Relief: side wall, then the cream face of the glyph */}
      {glyph(em.wall, { dy: size >= 64 ? 1.5 : 1 })}
      {glyph(`url(#${u}e)`)}

      {plaque && (
        <g>
          <rect x={CX - pw / 2} y={lay.plaqueY - 7.5 + 3} width={pw} height="15" rx="7.5" fill="#000" opacity="0.45" filter={`url(#${u}x)`} />
          <rect x={CX - pw / 2} y={lay.plaqueY - 7.5 + 1.6} width={pw} height="15" rx="7.5" fill={mt.edge} />
          <rect x={CX - pw / 2} y={lay.plaqueY - 7.5} width={pw} height="15" rx="7.5" fill={`url(#${u}p)`} />
          <rect x={CX - pw / 2 + 0.6} y={lay.plaqueY - 7.5 + 0.6} width={pw - 1.2} height="13.8" rx="6.9" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.8" />
          <text
            x={CX}
            y={lay.plaqueY + 4.3 + 0.6}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            fontFamily={`"Inter Tight", "Inter", system-ui, sans-serif`}
            fill="#fff"
            fillOpacity="0.6"
          >
            {plaque}
          </text>
          <text x={CX} y={lay.plaqueY + 4.3} textAnchor="middle" fontSize="11.5" fontWeight="700" fontFamily={`"Inter Tight", "Inter", system-ui, sans-serif`} fill={mt.text}>
            {plaque}
          </text>
        </g>
      )}
    </svg>
  );
});

/** Glare that follows the pointer, clipped to the badge silhouette. */
function Glare({ id, gx, gy, on }: { id: string; gx: number; gy: number; on: boolean }) {
  const u = useUid("bdg-glare-");
  const def = BADGES[id] ?? FALLBACK;
  return (
    <svg viewBox="0 0 120 120" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden>
      <defs>
        <clipPath id={`${u}c`}>
          <path d={shapePath(def.shape, 0)} />
        </clipPath>
        <radialGradient id={`${u}r`} cx={gx / 100} cy={gy / 100} r="0.42">
          <stop offset="0" stopColor="#fff" stopOpacity={on ? 0.36 : 0.08} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="120" height="120" fill={`url(#${u}r)`} clipPath={`url(#${u}c)`} />
    </svg>
  );
}

// ── Live badge ──────────────────────────────────────────────────────────────────────────────────

function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

const FLOAT_CSS = `@keyframes achBadgeFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}.ach-badge-float{animation:achBadgeFloat 5s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.ach-badge-float{animation:none}}`;

export function LiveBadge({
  id,
  size = 120,
  locked,
  tilt = 16,
  float,
  spinOnClick = true,
  onClick,
  title,
  num,
}: {
  id: string;
  size?: number;
  locked?: boolean;
  /** Max tilt in degrees. */
  tilt?: number;
  /** Gentle idle bob (the hero emblem). */
  float?: boolean;
  spinOnClick?: boolean;
  onClick?: () => void;
  title?: string;
  /** Plaque number override. */
  num?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [t, setT] = useState({ rx: 0, ry: 0, gx: 50, gy: 25, on: false });
  const [spin, setSpin] = useState(0);
  const canSpin = spinOnClick && !locked && !reduced;

  const move = (e: React.PointerEvent) => {
    if (reduced) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setT({ rx: (0.5 - py) * tilt * 2, ry: (px - 0.5) * tilt * 2, gx: px * 100, gy: py * 100, on: true });
  };
  const leave = () => setT({ rx: 0, ry: 0, gx: 50, gy: 25, on: false });

  const lift = size * 0.075;
  const body: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    transform: `rotateX(${t.rx}deg) rotateY(${t.ry + spin}deg) translateZ(${t.on ? size * 0.05 : 0}px) scale(${t.on ? 1.04 : 1})`,
    transition: spin && !t.on ? "transform 900ms cubic-bezier(.3,.7,.2,1)" : t.on ? "transform 90ms linear" : "transform 600ms cubic-bezier(.2,.8,.2,1)",
  };
  const layer = (z: number): CSSProperties => ({ position: "absolute", inset: 0, transform: `translateZ(${z}px)`, transformStyle: "preserve-3d", pointerEvents: "none" });

  return (
    <div
      ref={ref}
      title={title}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-hidden={onClick ? undefined : true}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={() => {
        if (canSpin) setSpin((s) => s + 360);
        onClick?.();
      }}
      className={`relative shrink-0 select-none ${float && !reduced ? "ach-badge-float" : ""}`}
      style={{ width: size, height: size, perspective: size * 6, cursor: onClick || canSpin ? "pointer" : "default" }}
    >
      {float && <style>{FLOAT_CSS}</style>}
      <div style={body}>
        <div style={layer(0)}>
          <BadgeArt id={id} locked={locked} num={num} size={size} layer="base" />
        </div>
        {!locked && (
          <div style={layer(1)}>
            <Glare id={id} gx={t.gx} gy={t.gy} on={t.on} />
          </div>
        )}
        <div style={layer(lift)}>
          <BadgeArt id={id} locked={locked} num={num} size={size} layer="top" />
        </div>
      </div>
    </div>
  );
}
