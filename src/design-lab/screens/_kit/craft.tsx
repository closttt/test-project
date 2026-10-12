/**
 * Design lab · «Craft Dark» kit — the owner's DocumentCraft language (Figma C4spzkPV… node 411:1096)
 * rebuilt for a dark theme. Light → dark mapping keeps the same STEPS, not the same colours:
 *
 *   canvas #F6F6F6 → #060607   page panel #FFF → #0D0D0F   inner card #FAFAFA → #131315
 *   pill control #F6F6F6 → #19191C   hairline #F0F0F0 → #1D1D21   dashed row #E0E0E0 → #242429
 *   text #031B38 → #F4F5F7   secondary #818181 → #9A9CA3   tertiary #BFBFBF → #5E6068
 *   accent #007AFF → #0A84FF (single accent)   red #F5222D → #FF4A42
 *
 * Measured from the frames (1600 wide): outer gutter 20, header 68 tall, 8 between header and page
 * panel, page panel radius 24, inner padding 24, inner cards radius 20, every control a pill
 * (52 primary, 44 tabs, 40 icon buttons, 32–40 status pills), table rows 74 with DASHED dividers,
 * table heads = 14px glyph + 12px label. Type: Inter Tight 12 / 14 / 16 / 18 / 24, weight 400–500,
 * never bold. Status = tinted fill + 1px tinted border + dot + text of the same hue.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";

// ── Tokens ──────────────────────────────────────────────────────────────────────────────────────
export const C = {
  canvas: "#060607",
  panel: "#0D0D0F",
  card: "#131315",
  raise: "#19191C",
  hover: "#161619",
  line: "#1D1D21",
  line2: "#28282D",
  dash: "#242429",
  text: "#F4F5F7",
  text2: "#9A9CA3",
  text3: "#5E6068",
  accent: "#0A84FF",
  accentHover: "#2B95FF",
  green: "#2EE6A0",
  red: "#FF4A42",
  amber: "#FFB938",
  violet: "#A08EFF",
} as const;

export type Tone = "blue" | "green" | "red" | "amber" | "neutral" | "violet";

/** Tinted status recipe — fill 15%, border 36%, text in the hue (denser since the darker palette). */
export const TONE: Record<Tone, { fg: string; bg: string; bd: string; dot: string }> = {
  blue: { fg: "#5AA9FF", bg: "rgba(10,132,255,0.15)", bd: "rgba(10,132,255,0.36)", dot: C.accent },
  green: { fg: "#4DF2B0", bg: "rgba(46,230,160,0.15)", bd: "rgba(46,230,160,0.36)", dot: C.green },
  red: { fg: "#FF6B63", bg: "rgba(255,74,66,0.15)", bd: "rgba(255,74,66,0.36)", dot: C.red },
  amber: { fg: "#FFCA5C", bg: "rgba(255,185,56,0.15)", bd: "rgba(255,185,56,0.36)", dot: C.amber },
  violet: { fg: "#BBAEFF", bg: "rgba(160,142,255,0.15)", bd: "rgba(160,142,255,0.36)", dot: C.violet },
  neutral: { fg: C.text, bg: "transparent", bd: C.line2, dot: C.text },
};

export const R = { page: 24, card: 20, inner: 16, small: 12 } as const;

export const font = `"Inter Tight", "Inter", system-ui, sans-serif`;

/** Type scale from the Figma text styles (footnote 12 / body 14) plus the sizes seen in frames. */
export const T = {
  foot: { fontSize: 12, lineHeight: 1.3 } as CSSProperties,
  body: { fontSize: 14, lineHeight: 1.3 } as CSSProperties,
  cell: { fontSize: 16, lineHeight: 1.3 } as CSSProperties,
  title: { fontSize: 18, lineHeight: 1.25, fontWeight: 500, letterSpacing: "-0.01em" } as CSSProperties,
  h2: { fontSize: 24, lineHeight: 1.2, fontWeight: 500, letterSpacing: "-0.02em" } as CSSProperties,
  h1: { fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: "-0.03em" } as CSSProperties,
  num: { fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em", fontWeight: 500 } as CSSProperties,
};

export const rootStyle: CSSProperties = {
  background: C.canvas,
  color: C.text,
  fontFamily: font,
  fontWeight: 400,
  WebkitFontSmoothing: "antialiased",
};

// ── Shell ───────────────────────────────────────────────────────────────────────────────────────

/** App mark — the rounded blue tile with a small wordmark, as in the DocumentCraft logo. */
export function Logo({ name = "Рабочий стол" }: { name?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid h-9 w-9 place-items-center"
        style={{
          borderRadius: 10,
          background: "linear-gradient(180deg,#3D9DFF 0%,#0A6CF0 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 14px rgba(10,132,255,0.25)",
          fontSize: 9,
          fontWeight: 600,
          color: "#fff",
          letterSpacing: "-0.02em",
        }}
      >
        CRM
      </div>
      <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em" }}>{name}</span>
    </div>
  );
}

/** Segmented pill tabs with count bubbles (header nav «Sent · Inbox · For signature»). */
export function PillTabs<K extends string>({
  items,
  value,
  onChange,
  size = 44,
}: {
  items: { id: K; label: string; count?: number }[];
  value: K;
  onChange?: (id: K) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange?.(it.id)}
            className="relative whitespace-nowrap transition-colors duration-150"
            style={{
              height: size,
              padding: "0 16px",
              borderRadius: 999,
              background: on ? C.raise : "transparent",
              color: on ? C.text : C.text3,
              fontSize: 14,
            }}
            onMouseEnter={(e) => !on && (e.currentTarget.style.color = C.text2)}
            onMouseLeave={(e) => !on && (e.currentTarget.style.color = C.text3)}
          >
            {it.label}
            {it.count ? (
              <span
                className="absolute grid place-items-center"
                style={{
                  top: 2,
                  right: 0,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 999,
                  fontSize: 10,
                  background: on ? C.accent : C.raise,
                  color: on ? "#fff" : C.text3,
                }}
              >
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Pill buttons. primary = solid blue, outline = hairline with blue label, ghost = raise fill, danger = solid red. */
export function Btn({
  children,
  kind = "primary",
  icon,
  size = 44,
  onClick,
  type = "button",
  disabled,
  full,
}: {
  children: ReactNode;
  kind?: "primary" | "outline" | "ghost" | "danger";
  icon?: ReactNode;
  size?: 36 | 40 | 44 | 52;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  full?: boolean;
}) {
  const s: Record<string, CSSProperties> = {
    primary: { background: C.accent, color: "#fff" },
    outline: { background: "transparent", color: "#5AA9FF", boxShadow: `inset 0 0 0 1px ${C.line2}` },
    ghost: { background: C.raise, color: C.text },
    danger: { background: C.red, color: "#fff" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap transition-[filter,opacity] duration-150 hover:brightness-110 disabled:opacity-40 ${full ? "w-full" : ""}`}
      style={{ height: size, padding: `0 ${size >= 52 ? 24 : 18}px`, borderRadius: 999, fontSize: size >= 52 ? 16 : 14, ...s[kind] }}
    >
      {icon}
      {children}
    </button>
  );
}

/** Round icon button with hairline (header file/bell buttons, row actions). */
export function IconBtn({
  children,
  size = 40,
  onClick,
  title,
  dot,
  filled,
}: {
  children: ReactNode;
  size?: number;
  onClick?: () => void;
  title?: string;
  dot?: boolean;
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="relative grid shrink-0 place-items-center transition-colors duration-150"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: filled ? C.raise : "transparent",
        boxShadow: filled ? "none" : `inset 0 0 0 1px ${C.line2}`,
        color: C.text,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.raise)}
      onMouseLeave={(e) => (e.currentTarget.style.background = filled ? C.raise : "transparent")}
    >
      {children}
      {dot && <span className="absolute" style={{ top: 7, right: 8, width: 7, height: 7, borderRadius: 9, background: C.red }} />}
    </button>
  );
}

export function Avatar({ initials = "АБ", size = 40 }: { initials?: string; size?: number }) {
  return (
    <div className="relative shrink-0">
      <div
        className="grid place-items-center"
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: "linear-gradient(140deg,#2A2F3A,#15171C)",
          boxShadow: `inset 0 0 0 1px ${C.line2}`,
          fontSize: 13,
          color: C.text2,
        }}
      >
        {initials}
      </div>
      <span
        className="absolute grid place-items-center"
        style={{ right: -2, bottom: -2, width: 16, height: 16, borderRadius: 99, background: C.accent, boxShadow: `0 0 0 2px ${C.canvas}` }}
      >
        <Check size={10} strokeWidth={3} color="#fff" />
      </span>
    </div>
  );
}

/** Full-width header bar (Figma «header» symbol): 68 tall, page-panel colour, radius 24. */
export function HeaderBar({ left, center, right }: { left: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <header
      className="grid items-center px-5"
      style={{ height: 68, background: C.panel, borderRadius: R.page, gridTemplateColumns: "1fr auto 1fr" }}
    >
      <div className="flex min-w-0 items-center">{left}</div>
      <div className="flex justify-center">{center}</div>
      <div className="flex items-center justify-end gap-2">{right}</div>
    </header>
  );
}

/** Large surface — the page panel / section card. `tone="card"` for the nested lighter step. */
export function Panel({
  children,
  tone = "panel",
  pad = 24,
  className = "",
  style,
}: {
  children: ReactNode;
  tone?: "panel" | "card" | "raise";
  pad?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={className}
      style={{ background: C[tone], borderRadius: tone === "panel" ? R.page : R.card, padding: pad, ...style }}
    >
      {children}
    </section>
  );
}

/** Section heading row: 24px title (+ optional muted counter like «Notifications (2)») and actions. */
export function SectionHead({
  title,
  count,
  sub,
  action,
  size = "h2",
}: {
  title: ReactNode;
  count?: number | string;
  sub?: ReactNode;
  action?: ReactNode;
  size?: "h2" | "title";
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 style={T[size]}>
          {title}
          {count !== undefined && <span style={{ color: C.text3 }}> ({count})</span>}
        </h2>
        {sub && <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

/** Pill search field (Figma: 56 tall, inner-card fill). Uncontrolled unless value given. */
export function SearchField({
  placeholder = "Поиск по задачам, проектам и клиентам",
  value,
  onChange,
  height = 56,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  height?: number;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-3 px-5" style={{ height, borderRadius: 999, background: C.card }}>
      <Search size={18} strokeWidth={1.75} color={C.text2} />
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
    </label>
  );
}

/** Filter pill: glyph + label + chevron («Document status ⌄»). */
export function FilterPill({ icon, label, height = 56 }: { icon?: ReactNode; label: string; height?: number }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 whitespace-nowrap px-5"
      style={{ height, borderRadius: 999, background: C.card, fontSize: 14, color: C.text }}
    >
      {icon}
      {label}
      <ChevronDown size={16} strokeWidth={1.75} color={C.text2} />
    </button>
  );
}

// ── Data pieces ─────────────────────────────────────────────────────────────────────────────────

/** Status pill: dot + text in the hue on a tinted fill with a tinted 1px border. */
export function StatusPill({ tone = "neutral", children, size = 32 }: { tone?: Tone; children: ReactNode; size?: 28 | 32 | 40 }) {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap"
      style={{
        height: size,
        padding: `0 ${size === 40 ? 14 : 12}px`,
        borderRadius: 999,
        background: t.bg,
        boxShadow: `inset 0 0 0 1px ${t.bd}`,
        color: t.fg,
        fontSize: size === 28 ? 12 : 14,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9, background: t.dot }} />
      {children}
    </span>
  );
}

/** Plain tinted chip without a dot («2 of 3 signed»). */
export function Chip({ tone = "neutral", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      style={{ height: 40, padding: "0 14px", borderRadius: 999, background: tone === "neutral" ? C.card : t.bg, boxShadow: `inset 0 0 0 1px ${tone === "neutral" ? C.line : t.bd}`, color: tone === "neutral" ? C.text2 : t.fg, fontSize: 14 }}
    >
      {icon}
      {children}
    </span>
  );
}

/** Table header cell: small glyph + 12px label, as in the Figma tables. */
export function TH({ icon, children, className = "" }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} style={{ ...T.foot, color: C.text2 }}>
      {icon && <span style={{ color: C.text }}>{icon}</span>}
      {children}
    </div>
  );
}

/** Dashed divider — the signature row separator. */
export const dashed: CSSProperties = {
  backgroundImage: `linear-gradient(to right, ${C.dash} 50%, transparent 50%)`,
  backgroundSize: "8px 1px",
  backgroundRepeat: "repeat-x",
  backgroundPosition: "left bottom",
};

/** One table row: grid columns, dashed bottom, hover fill, optional unread dot at the far left. */
export function Row({
  cols,
  children,
  height = 74,
  unread,
  onClick,
  muted,
}: {
  cols: string;
  children: ReactNode;
  height?: number;
  unread?: boolean;
  onClick?: () => void;
  muted?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="group relative grid items-center gap-4 px-6 transition-colors duration-150 hover:bg-[#16161A]"
      style={{ gridTemplateColumns: cols, minHeight: height, ...dashed, opacity: muted ? 0.5 : 1, cursor: onClick ? "pointer" : undefined }}
    >
      {unread && <span className="absolute" style={{ left: 10, top: "50%", width: 6, height: 6, marginTop: -3, borderRadius: 9, background: C.accent }} />}
      {children}
    </div>
  );
}

/** Round checkbox — hairline ring → solid blue with a check. */
export function RoundCheck({ done, onChange, size = 22 }: { done: boolean; onChange?: () => void; size?: number }) {
  return (
    <button
      type="button"
      aria-label={done ? "Вернуть" : "Готово"}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.();
      }}
      className="grid shrink-0 place-items-center transition-colors duration-150"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: done ? C.accent : "transparent",
        boxShadow: done ? "none" : `inset 0 0 0 1.5px ${C.line2}`,
      }}
    >
      {done && <Check size={size * 0.6} strokeWidth={3} color="#fff" />}
    </button>
  );
}

/** Document-style icon tile (blue page glyph on a soft square) — for files/notes/reading. */
export function DocTile({ size = 56, children }: { size?: number; children?: ReactNode }) {
  return (
    <div
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: R.inner, background: "rgba(10,132,255,0.10)", boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.18)" }}
    >
      {children ?? (
        <svg width={size * 0.42} height={size * 0.5} viewBox="0 0 24 30" fill="none">
          <path d="M3 0h12l9 9v18a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z" fill="#0A84FF" />
          <path d="M15 0l9 9h-6a3 3 0 0 1-3-3V0Z" fill="#7CC0FF" />
          <rect x="5" y="14" width="10" height="2" rx="1" fill="#fff" opacity=".9" />
          <rect x="5" y="19" width="14" height="2" rx="1" fill="#fff" opacity=".6" />
        </svg>
      )}
    </div>
  );
}

/** Small «person» card (Figma «A.G. Bondar / TIN …» corner card). */
export function MiniCard({ icon, title, sub }: { icon: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-6 p-4" style={{ background: C.card, borderRadius: R.inner, minWidth: 150 }}>
      <span className="grid h-8 w-8 place-items-center" style={{ borderRadius: 99, boxShadow: `inset 0 0 0 1px ${C.line2}`, color: C.accent }}>
        {icon}
      </span>
      <div>
        <div style={{ ...T.body, color: C.text }}>{title}</div>
        {sub && <div style={{ ...T.body, color: C.text3, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Quick add — pill input with a blue «+» pill on the right («Enter the recipient's login · + Add a signer»). */
export function AddInput({ onAdd, placeholder = "Новая задача на сегодня — «завтра 15:00 #дизайн»" }: { onAdd: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(v);
        setV("");
      }}
      className="flex items-center gap-2 pl-5 pr-1.5"
      style={{ height: 56, borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line}` }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-4 transition-colors"
        style={{ height: 44, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${C.line2}`, color: "#5AA9FF", fontSize: 14 }}
      >
        <Plus size={16} strokeWidth={2} />
        Добавить
      </button>
    </form>
  );
}

/** Note box — borderless textarea in an inner card with a pill save button. */
export function NoteBox({ onSave, rows = 4 }: { onSave: (v: string) => void; rows?: number }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-col gap-3 p-4" style={{ background: C.card, borderRadius: R.inner }}>
      <textarea
        value={v}
        rows={rows}
        onChange={(e) => setV(e.target.value)}
        placeholder="Мысль, ссылка, номер телефона…"
        className="w-full resize-none bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, lineHeight: 1.45, color: C.text }}
      />
      <div className="flex items-center justify-between">
        <span style={{ ...T.foot, color: C.text3 }}>{v.length} символов</span>
        <Btn
          size={36}
          kind={v.trim() ? "primary" : "ghost"}
          onClick={() => {
            onSave(v);
            setV("");
          }}
        >
          Сохранить
        </Btn>
      </div>
    </div>
  );
}

// ── Light charts (from the reference set, kept quiet: one hue + greys) ───────────────────────────

/** Capsule bars (Celoci): rounded columns, the highlighted one solid blue with a value bubble. */
export function CapsuleBars({
  data,
  height = 140,
  highlight,
  showLabels = true,
}: {
  data: { label: string; value: number }[];
  height?: number;
  highlight?: number;
  showLabels?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hi = highlight ?? data.length - 1;
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(8, (d.value / max) * (height - 24));
          const on = i === hi;
          return (
            <div key={i} className="relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }} title={`${d.label}: ${d.value}`}>
              {on && (
                <span className="absolute" style={{ bottom: h + 6, ...T.foot, color: C.text, padding: "2px 7px", borderRadius: 99, background: C.raise }}>
                  {d.value}
                </span>
              )}
              <div
                style={{
                  width: "100%",
                  maxWidth: 22,
                  height: h,
                  borderRadius: 999,
                  background: on ? "linear-gradient(180deg,#3D9DFF,#0A6CF0)" : "#202025",
                  boxShadow: on ? "0 6px 18px rgba(10,132,255,0.35)" : `inset 0 0 0 1px ${C.line}`,
                }}
              />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="mt-2 flex gap-1.5">
          {data.map((d, i) => (
            <span key={i} className="flex-1 text-center" style={{ fontSize: 10, color: i === hi ? C.text2 : C.text3 }}>
              {d.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Smooth area sparkline with a fading blue fill and an end marker. */
export function Spark({ values, width = 240, height = 64, stroke = C.accent }: { values: number[]; width?: number; height?: number; stroke?: string }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => [i * step, height - 4 - (v / max) * (height - 12)] as const);
  const d = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  const id = `sp${Math.round(Math.random() * 1e6)}`;
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r={4} fill={C.panel} stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Semicircle gauge (Celoci «Sales performance»): grey track + blue arc, value in the middle. */
export function Gauge({ pct, size = 200, label, value }: { pct: number; size?: number; label?: ReactNode; value?: ReactNode }) {
  const r = size / 2 - 12;
  const len = Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const arc = `M12,${size / 2} A${r},${r} 0 0 1 ${size - 12},${size / 2}`;
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 8 }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <defs>
          <linearGradient id="gaugeg" x1="0" x2="1">
            <stop offset="0" stopColor="#0A6CF0" />
            <stop offset="1" stopColor="#7CC0FF" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke={C.raise} strokeWidth={16} strokeLinecap="round" />
        {p > 0 && <path d={arc} fill="none" stroke="url(#gaugeg)" strokeWidth={16} strokeLinecap="round" strokeDasharray={`${(p / 100) * len} ${len}`} />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div style={{ ...T.num, fontSize: 32, lineHeight: 1 }}>{value ?? `${Math.round(p)}%`}</div>
        {label && <div style={{ ...T.foot, color: C.text2, marginTop: 4 }}>{label}</div>}
      </div>
    </div>
  );
}

/** Thin ring progress. */
export function Ring({ pct, size = 56, stroke = 5, children }: { pct: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.raise} strokeWidth={stroke} />
        {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.accent} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`} />}
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}

/** Contribution cells (Celoci «visits by hour»): rounded squares in 4 blue steps. */
export function HeatCells({ values, cols = 26, cell = 12, gap = 3 }: { values: number[]; cols?: number; cell?: number; gap?: number }) {
  const max = Math.max(1, ...values);
  const rows = Math.ceil(values.length / cols);
  const step = (v: number) => (v <= 0 ? C.raise : v / max < 0.34 ? "rgba(10,132,255,0.30)" : v / max < 0.67 ? "rgba(10,132,255,0.60)" : C.accent);
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridTemplateRows: `repeat(${Math.min(7, rows)}, ${cell}px)`, gridAutoFlow: "column", gap }}>
      {values.map((v, i) => (
        <span key={i} style={{ width: cell, height: cell, borderRadius: 4, background: step(v) }} />
      ))}
    </div>
  );
}

/** Segmented horizontal bar for a status split. */
export function SplitBar({ parts, height = 10 }: { parts: { value: number; tone: Tone; label?: string }[]; height?: number }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  return (
    <div className="flex w-full gap-1" style={{ height }}>
      {parts.map((p, i) =>
        p.value > 0 ? (
          <span key={i} title={p.label} style={{ width: `${(p.value / total) * 100}%`, borderRadius: 999, background: p.tone === "neutral" ? "#3A3A42" : TONE[p.tone].dot }} />
        ) : null
      )}
    </div>
  );
}

/** Empty state — dashed rounded box with a muted line and an optional action. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center"
      style={{ borderRadius: R.inner, border: `1px dashed ${C.line2}`, ...T.body, color: C.text3 }}
    >
      {children}
      {action}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Priority → status tone (1 high red, 2 amber, 3 blue, 0 neutral). */
export const PRIO_TONE: Record<number, Tone> = { 0: "neutral", 1: "red", 2: "amber", 3: "blue" };

/** Health → tone for project rows. */
export const HEALTH_TONE: Record<string, Tone> = { "off-track": "red", "at-risk": "amber", "on-track": "blue", done: "green", empty: "neutral" };
