/**
 * «Индекс» — the chosen system (owner picked Bondar Editorial · «Редакционный индекс» and asked for a
 * MINIMAL take). Built on the Bondar tokens (_kit/bondar.tsx); this layer adds the rules that make
 * it quiet:
 *
 *  · One lime element per screen (the primary action or the "now" marker). Everything else is
 *    white / grey on black.
 *  · Column lines stay, but at 4% and fading out down the page; they are diluted by ONE soft
 *    procedural graphic per screen (topographic contours — refs 22/25, dithered orb — owner site +
 *    ref 16, dot field — ref 16, ASCII — owner site), always low-contrast and masked.
 *  · Numbers do the iconography: sections and nav are numbered (01, 02…). Pixel icons, signal bars
 *    and caps labels are used sparingly — priority only, never as decoration.
 *  · Tables over cards. Hairlines over boxes. Big type over chrome.
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { isOverdue, isToday } from "@/lib/format";
import { levelProgress } from "@/lib/gamification";
import { levelTitle } from "@/types";
import { B, T, display, tab, pad2, hashSeed, DitherField, AsciiField, Chip, PIX } from "@/design-lab/screens/_kit/bondar";

export * from "@/design-lab/screens/_kit/bondar";

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Background: faded column grid
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const FADE_DOWN = "linear-gradient(to bottom, #000 0, rgba(0,0,0,.6) 420px, transparent 900px)";

/** The site's 4-column hairlines, quiet (4%) and fading out — structure without stripes. */
export function QuietGrid({ margin = 40, gutter = 20, color = "rgba(255,255,255,0.045)" }: { margin?: number; gutter?: number; color?: string }) {
  const used = 2 * margin + 3 * gutter;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ WebkitMaskImage: FADE_DOWN, maskImage: FADE_DOWN }}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="absolute inset-y-0 w-px"
          style={{ left: `calc(${margin}px + ${i} * ((100% - ${used}px) / 4 + ${gutter}px) - ${gutter / 2}px)`, background: color }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Graphics — one per screen, soft, masked
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Topographic contour lines (refs 22 / 25): warped concentric rings, 1px, very low contrast. */
export function TopoLines({
  seed = 1,
  rings = 18,
  color = "rgba(255,255,255,0.09)",
  className = "",
  style,
}: {
  seed?: number;
  rings?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const paths = useMemo(() => {
    const out: string[] = [];
    const a = (seed % 7) + 2;
    const b = (seed % 5) + 3;
    for (let k = 1; k <= rings; k++) {
      const r = (k / rings) * 0.62;
      let d = "";
      for (let s = 0; s <= 96; s++) {
        const t = (s / 96) * Math.PI * 2;
        const warp = 1 + 0.16 * Math.sin(a * t + seed + k * 0.21) + 0.08 * Math.sin(b * t - seed * 0.7 + k * 0.13) + 0.04 * Math.cos(7 * t + k);
        const x = 0.5 + Math.cos(t) * r * warp;
        const y = 0.5 + Math.sin(t) * r * warp * 0.78;
        d += `${s ? "L" : "M"}${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`;
      }
      out.push(d + "Z");
    }
    return out;
  }, [seed, rings]);
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className={`pointer-events-none ${className}`} style={style}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={0.18} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1 }} />
      ))}
    </svg>
  );
}

/** Fading dot field (ref 16): a square lattice that dissolves toward one corner. */
export function DotField({ className = "", style, step = 14, color = "rgba(255,255,255,0.16)" }: { className?: string; style?: CSSProperties; step?: number; color?: string }) {
  const mask = "radial-gradient(ellipse at 70% 30%, #000 0, rgba(0,0,0,.5) 35%, transparent 70%)";
  return (
    <div
      aria-hidden
      className={`pointer-events-none ${className}`}
      style={{
        backgroundImage: `radial-gradient(${color} 1px, transparent 1.4px)`,
        backgroundSize: `${step}px ${step}px`,
        WebkitMaskImage: mask,
        maskImage: mask,
        ...style,
      }}
    />
  );
}

export type GraphicKind = "topo" | "orb" | "dots" | "ascii" | "ridge";

/** The one hero graphic of a screen — sits behind the page header, top-right, masked soft. */
export function HeroGraphic({ kind, seed = 3 }: { kind: GraphicKind; seed?: number }) {
  const mask = "radial-gradient(ellipse 60% 85% at 70% 45%, #000 0, rgba(0,0,0,.5) 45%, transparent 80%)";
  const box: CSSProperties = { WebkitMaskImage: mask, maskImage: mask };
  // Confined to the header block and kept clear of the right edge, where header actions live.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-[16%] w-[48%] overflow-hidden" style={box}>
      {kind === "topo" && <TopoLines seed={seed} className="absolute inset-0 h-full w-full" />}
      {kind === "dots" && <DotField className="absolute inset-0" />}
      {kind === "orb" && (
        <DitherField kind="orb" seed={seed} color="rgba(255,255,255,0.55)" cell={5} dot={2} gain={0.9} className="absolute inset-0" />
      )}
      {kind === "ridge" && (
        <DitherField kind="ridge" seed={seed} color="rgba(255,255,255,0.4)" cell={5} dot={2} gain={0.85} className="absolute inset-0" />
      )}
      {kind === "ascii" && <AsciiField kind="wave" seed={seed} color="rgba(255,255,255,0.22)" className="absolute inset-0" />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Shell
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export const NAV: { to: string; label: string; id: string }[] = [
  { id: "dashboard", to: "/", label: "Дашборд" },
  { id: "tasks", to: "/tasks", label: "Задачи" },
  { id: "projects", to: "/projects", label: "Проекты" },
  { id: "clients", to: "/clients", label: "Клиенты" },
  { id: "planner", to: "/planner", label: "Планер" },
  { id: "notes", to: "/notes", label: "Заметки" },
  { id: "knowledge", to: "/knowledge", label: "База знаний" },
  { id: "analytics", to: "/analytics", label: "Аналитика" },
];

/** App frame: quiet numbered sidebar + routed page. */
export function Shell() {
  const { tasks, gamification } = useData();
  const { pathname } = useLocation();
  const todayCount = tasks.filter((t) => !t.done && (isOverdue(t.dueDate) || (t.dueDate && isToday(t.dueDate)))).length;
  const lvl = levelProgress(gamification.xp);

  const item = (to: string, label: string, n: string, badge?: number) => {
    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
    return (
      <NavLink
        key={to}
        to={to}
        className="group relative flex h-9 items-center gap-3 pl-5 pr-4 outline-none transition-colors duration-200"
        style={{ color: active ? B.text : B.text3 }}
      >
        {active && <span className="absolute inset-y-[10px] left-0 w-[2px]" style={{ background: B.lime }} />}
        <span className="w-5" style={{ ...T.num, color: active ? B.text2 : B.off }}>{n}</span>
        <span className="flex-1 truncate transition-colors duration-200 group-hover:text-white" style={T.body}>{label}</span>
        {badge ? <span style={{ ...T.num, color: active ? B.text : B.text3 }}>{badge}</span> : null}
      </NavLink>
    );
  };

  return (
    <div className="flex min-h-screen antialiased" style={{ background: B.bg, color: B.text, fontFamily: B.font }}>
      <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col" style={{ borderRight: `1px solid ${B.l7}` }}>
        <div className="flex items-center justify-between px-5 pb-10 pt-7">
          <span style={{ ...T.title, fontWeight: 600 }}>Рабочий стол</span>
          <Mark />
        </div>
        <nav className="flex flex-col">{NAV.map((n, i) => item(n.to, n.label, pad2(i + 1), n.id === "tasks" ? todayCount : undefined))}</nav>
        <div className="mt-auto flex flex-col pb-5">
          {item("/archive", "Архив", "09")}
          {item("/changelog", "Что нового", "10")}
          {item("/settings", "Настройки", "11")}
          {item("/system", "Система", "12")}
          <NavLink to="/achievements" className="group mx-5 mt-5 flex flex-col gap-2" title="Достижения">
            <div className="flex justify-between" style={{ ...T.meta, color: B.text3 }}>
              <span>
                Ур. {lvl.level} · {levelTitle(lvl.level)}
              </span>
              <span style={tab}>{Math.round(lvl.pct)}%</span>
            </div>
            <span className="relative h-px w-full" style={{ background: B.l10 }}>
              <span className="absolute inset-y-0 left-0" style={{ width: `${lvl.pct}%`, background: B.text2 }} />
            </span>
          </NavLink>
        </div>
      </aside>
      <main className="relative min-w-0 flex-1">
        <QuietGrid />
        <Outlet />
      </main>
    </div>
  );
}

/** Brand mark: 3×2 matrix, one lime cell. */
export function Mark() {
  return (
    <span className="grid grid-cols-3 gap-[2px]" aria-hidden>
      {[1, 1, 1, 1, 1, 0].map((on, i) => (
        <span key={i} className="h-[5px] w-[5px]" style={{ background: i === 0 ? B.lime : on ? B.text3 : B.off }} />
      ))}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Page structure
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Page content padding — matches QuietGrid margin. */
export const PAGE_X = 40;

export function Page({ children }: { children: ReactNode }) {
  return <div className="relative px-10 pb-24 pt-8">{children}</div>;
}

/** Editorial page header: optional chip, huge title, one-line deck, actions, ONE background graphic. */
export function PageHeader({
  title,
  deck,
  chip,
  actions,
  graphic,
  seed,
  size = 72,
}: {
  title: ReactNode;
  deck?: ReactNode;
  chip?: ReactNode;
  actions?: ReactNode;
  graphic?: GraphicKind;
  seed?: number;
  size?: number;
}) {
  return (
    <header className="relative -mx-10 -mt-8 px-10 pb-10 pt-8">
      {graphic && <HeroGraphic kind={graphic} seed={seed ?? hashSeed(String(title))} />}
      <div className="relative flex items-end justify-between gap-10">
        <div className="min-w-0">
          {chip && <Chip icon={PIX.chipCal}>{chip}</Chip>}
          <h1 className={chip ? "mt-6" : ""} style={display(size)}>
            {title}
          </h1>
          {deck && (
            <p className="mt-4 max-w-[600px]" style={{ ...T.bodyL, color: B.text2 }}>
              {deck}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}

/** Numbered section heading: «01  План дня ……… meta». */
export function SectionHead({ n, title, meta, size = "m" }: { n?: string; title: ReactNode; meta?: ReactNode; size?: "m" | "s" }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="flex min-w-0 items-baseline gap-3">
        {n && <span style={{ ...T.num, color: B.off }}>{n}</span>}
        <h2 className="truncate" style={size === "m" ? T.displayS : T.title}>
          {title}
        </h2>
      </div>
      {meta && <div className="shrink-0" style={{ ...T.meta, color: B.text3, ...tab }}>{meta}</div>}
    </div>
  );
}

/** A KPI strip: hairline-ruled numerals, no cards. */
export function Stats({ items }: { items: { k: string; v: ReactNode; sub?: ReactNode; hot?: boolean }[] }) {
  return (
    <section className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l10}` }}>
      {items.map((s, i) => (
        <div key={s.k} className="min-w-0 px-5 pb-6 pt-5" style={{ borderLeft: i ? `1px solid ${B.l7}` : undefined, paddingLeft: i ? 20 : 0 }}>
          <div style={{ ...T.meta, color: B.text3 }}>{s.k}</div>
          <div className="mt-6 truncate" style={{ ...T.displayL, ...tab }}>{s.v}</div>
          {s.sub && <div className="mt-2 truncate" style={{ ...T.meta, color: s.hot ? B.danger : B.text3 }}>{s.sub}</div>}
        </div>
      ))}
    </section>
  );
}

/** Thin progress line — the minimal replacement for cell bars. */
export function Line({ pct, color = B.text, track = B.l10 }: { pct: number; color?: string; track?: string }) {
  return (
    <span className="relative block h-px w-full" style={{ background: track }}>
      <span className="absolute inset-y-[-0.5px] left-0" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, height: 2 }} />
    </span>
  );
}

/** Text-only tag: hairline outline, no fill. */
export function Tag({ children, color = B.text3 }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap px-2" style={{ ...T.meta, color, boxShadow: `inset 0 0 0 1px ${B.l15}` }}>
      {children}
    </span>
  );
}

/** Empty state: a small dithered orb + one line. */
export function Empty({ title, text, seed = 5, height = 88 }: { title: string; text?: string; seed?: number; height?: number }) {
  return (
    <div className="flex flex-col">
      <DitherField kind="orb" seed={seed} color="rgba(255,255,255,0.45)" cell={4} dot={2} gain={0.9} className="w-full" style={{ height }} />
      <div className="mt-4" style={T.bodyStrong}>
        {title}
      </div>
      {text && (
        <p className="mt-1" style={{ ...T.meta, color: B.text3 }}>
          {text}
        </p>
      )}
    </div>
  );
}

/** Underlined minimal input row with the ↳ hook. */
export const inputStyle: CSSProperties = { ...T.body, color: B.text };
