/**
 * «Индекс» · Аналитика — local chart pieces in the system's language: dot-matrix columns, a thin
 * 1.5px line over a dot-screen fill, a year pixel matrix, a segmented weekday list, and the right
 * slide-in panel for task lists. White / grey only; red only for overdue; lime only for «today».
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { B, T, tab, display, Sparkle } from "@/design-lab/screens/_kit/index";

export interface Point {
  label: string;
  value: number;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Dot-matrix columns (one column per day) + the single lime «today» marker
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function DotColumns({
  data,
  rows = 12,
  height = 132,
  format = (v: number) => String(v),
  marker = false,
}: {
  data: Point[];
  rows?: number;
  height?: number;
  format?: (v: number) => string;
  /** Draw the lime «today» tick under the last column (one per screen). */
  marker?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 2;
  const cell = (height - (rows - 1) * gap) / rows;
  const cols = { gridTemplateColumns: `repeat(${data.length}, minmax(0,1fr))`, columnGap: data.length > 60 ? 1 : 3 };
  const w = `min(100%, ${Math.round(cell)}px)`;
  return (
    <div>
      <div className="grid items-end" style={{ ...cols, height }}>
        {data.map((d, i) => {
          const lit = d.value > 0 ? Math.max(1, Math.round((d.value / max) * rows)) : 0;
          const today = i === data.length - 1;
          return (
            <div key={i} className="flex h-full flex-col-reverse items-center" style={{ gap }} title={`${d.label}: ${format(d.value)}`}>
              {Array.from({ length: rows }, (_, j) => (
                <span key={j} style={{ width: w, height: cell, background: j < lit ? (today ? B.text : B.text2) : B.l5 }} />
              ))}
            </div>
          );
        })}
      </div>
      {marker && (
        <div className="mt-2 grid" style={cols}>
          {data.map((_, i) => (
            <span key={i} className="flex justify-center">
              {i === data.length - 1 && <span style={{ width: w, height: 3, background: B.lime }} />}
            </span>
          ))}
        </div>
      )}
      <Axis first={data[0]?.label} mid={data[Math.floor(data.length / 2)]?.label} gap={marker ? 6 : 10} />
    </div>
  );
}

function Axis({ first, mid, gap = 10 }: { first?: string; mid?: string; gap?: number }) {
  return (
    <div className="flex justify-between" style={{ ...T.meta, color: B.off, ...tab, marginTop: gap }}>
      <span>{first}</span>
      <span>{mid}</span>
      <span>сегодня</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Thin line over a dot-screen fill
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function ThinLine({ data, height = 132, format = (v: number) => String(v) }: { data: Point[]; height?: number; format?: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = 2;
  const pts = useMemo(() => {
    if (!w || data.length === 0) return [];
    const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
    return data.map((d, i) => [pad + i * step, pad + (1 - d.value / max) * (height - pad * 2)] as const);
  }, [data, w, max, height]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const area = pts.length ? `${line}L${pts[pts.length - 1][0].toFixed(1)} ${height}L${pts[0][0].toFixed(1)} ${height}Z` : "";
  const last = pts[pts.length - 1];
  const [hover, setHover] = useState<number | null>(null);
  const pid = useMemo(() => `dots-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div>
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (!pts.length) return;
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          let best = 0;
          pts.forEach(([px], i) => {
            if (Math.abs(px - x) < Math.abs(pts[best][0] - x)) best = i;
          });
          setHover(best);
        }}
      >
        {w > 0 && (
          <svg width={w} height={height} className="absolute inset-0" aria-hidden>
            <defs>
              <pattern id={pid} width="4" height="4" patternUnits="userSpaceOnUse">
                <rect x="1" y="1" width="1" height="1" fill="rgba(255,255,255,0.28)" />
              </pattern>
            </defs>
            {[0, 0.5, 1].map((f) => (
              <line key={f} x1={0} x2={w} y1={0.5 + f * (height - 1)} y2={0.5 + f * (height - 1)} stroke={B.l5} />
            ))}
            {area && <path d={area} fill={`url(#${pid})`} />}
            {line && <path d={line} fill="none" stroke={B.text2} strokeWidth={1.5} strokeLinejoin="miter" />}
            {last && <rect x={last[0] - 3} y={last[1] - 3} width={6} height={6} fill={B.text} />}
            {hover !== null && pts[hover] && (
              <>
                <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={height} stroke={B.l20} />
                <rect x={pts[hover][0] - 3} y={pts[hover][1] - 3} width={6} height={6} fill={B.bg} stroke={B.text} />
              </>
            )}
          </svg>
        )}
        {hover !== null && pts[hover] && (
          <div
            className="pointer-events-none absolute top-0 whitespace-nowrap px-2.5 py-1.5"
            style={{
              left: Math.min(Math.max(0, pts[hover][0] - 50), Math.max(0, w - 110)),
              background: B.bg,
              boxShadow: B.shadowFloat,
              ...T.meta,
              color: B.text3,
            }}
          >
            {data[hover].label} · <span style={{ ...T.bodyStrong, color: B.text, ...tab }}>{format(data[hover].value)}</span>
          </div>
        )}
      </div>
      <Axis first={data[0]?.label} mid={data[Math.floor(data.length / 2)]?.label} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Year pixel matrix (53 weeks × 7 days, Monday first)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const SHADES = [B.l5, B.l15, "rgba(255,255,255,0.38)", B.text2, B.text];

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function YearMatrix({ values, format = (v: number) => String(v), weeks = 53 }: { values: Record<string, number>; format?: (v: number) => string; weeks?: number }) {
  const { cols, max, months } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7); // Monday, `weeks` back
    const out: { key: string; date: Date; future: boolean; today: boolean }[][] = [];
    const ms: { col: number; label: string }[] = [];
    let mx = 0;
    for (let c = 0; c < weeks; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        const d = new Date(start);
        d.setDate(start.getDate() + c * 7 + r);
        const key = dayKey(d);
        const future = d > today;
        if (!future) mx = Math.max(mx, values[key] ?? 0);
        col.push({ key, date: d, future, today: d.getTime() === today.getTime() });
        if (d.getDate() === 1) ms.push({ col: c, label: MONTHS_SHORT[d.getMonth()] });
      }
      out.push(col);
    }
    return { cols: out, max: Math.max(1, mx), months: ms };
  }, [values, weeks]);

  const shade = (v: number) => (v <= 0 ? 0 : v / max <= 0.25 ? 1 : v / max <= 0.5 ? 2 : v / max <= 0.75 ? 3 : 4);
  const grid = { gridTemplateColumns: `repeat(${weeks}, minmax(0,1fr))`, columnGap: 3 };

  return (
    <div className="grid gap-x-3" style={{ gridTemplateColumns: "20px minmax(0,1fr)" }}>
      <span />
      <div className="relative mb-2 h-4" style={{ ...T.meta, color: B.text3 }}>
        {months.map((m) => (
          <span key={`${m.col}-${m.label}`} className="absolute top-0" style={{ left: `${(m.col / weeks) * 100}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateRows: "repeat(7, minmax(0,1fr))", rowGap: 3, ...T.meta, color: B.off }}>
        {["Пн", "", "Ср", "", "Пт", "", ""].map((l, i) => (
          <span key={i} className="flex items-center">{l}</span>
        ))}
      </div>
      <div className="grid" style={grid}>
        {cols.map((col, c) => (
          <div key={c} className="grid" style={{ rowGap: 3 }}>
            {col.map((d) => {
              const v = values[d.key] ?? 0;
              return (
                <span
                  key={d.key}
                  className="aspect-square w-full"
                  title={d.future ? undefined : `${d.date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}: ${format(v)}`}
                  style={{
                    background: d.future ? "transparent" : SHADES[shade(v)],
                    boxShadow: d.today ? `inset 0 0 0 1px ${B.text}` : undefined,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShadeLegend() {
  return (
    <span className="inline-flex items-center gap-2" style={{ ...T.meta, color: B.text3 }}>
      меньше
      <span className="flex gap-[3px]">
        {SHADES.map((c) => (
          <span key={c} className="h-2.5 w-2.5" style={{ background: c }} />
        ))}
      </span>
      больше
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Right slide-in panel (task lists from the KPI / priority rows)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function Panel({ open, onClose, eyebrow, title, children }: { open: boolean; onClose: () => void; eyebrow: ReactNode; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col"
        style={{ background: B.bg, borderLeft: `1px solid ${B.l10}`, fontFamily: B.font, color: B.text }}
      >
        <div className="flex items-start justify-between gap-6 px-8 pb-8 pt-8">
          <div className="min-w-0">
            <div style={{ ...T.meta, color: B.text3 }}>{eyebrow}</div>
            <h2 className="mt-4" style={display(44)}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 shrink-0 items-center justify-center outline-none transition-colors duration-200 hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
            style={{ color: B.text2 }}
          >
            <Sparkle size={14} open />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">{children}</div>
      </aside>
    </>
  );
}
