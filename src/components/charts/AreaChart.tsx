import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";

export interface Point {
  label: string;
  value: number;
}

/**
 * Smooth SVG area+line chart (no deps). Catmull-Rom curve, ~12% gradient wash, 2px line, and a
 * crosshair-tracking hover layer (vertical guide + a moving end-dot with a surface ring) instead
 * of per-point hit targets — the line/area interaction pattern from the dataviz spec.
 */
export function AreaChart({
  data,
  height = 140,
  fill = false,
  className,
  color = "hsl(var(--success))",
  formatValue = (v) => String(v),
}: {
  data: Point[];
  height?: number;
  /** Stretch to fill the parent's height instead of a fixed px height. */
  fill?: boolean;
  className?: string;
  color?: string;
  /** Formats a point's value for the hover tooltip (e.g. "5 задач", "1ч 20м"). */
  formatValue?: (v: number) => string;
}) {
  const { containerRef: boxRef, tooltip, showAt, hide } = useChartTooltip();
  const gid = useId().replace(/:/g, "");
  const [box, setBox] = useState({ w: 100, h: fill ? 100 : height });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const overlayRef = useRef<SVGRectElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height: h } = entry.contentRect;
      if (width > 0 && h > 0) setBox({ w: width, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [boxRef]);

  const w = box.w;
  const h = box.h;
  const pad = Math.min(8, w * 0.06, h * 0.14);
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const x = (i: number) => pad + i * stepX;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);

  // Catmull-Rom → cubic Bézier for a smooth line that still passes through every point.
  const linePath = useMemo(() => {
    if (data.length < 2) return data.length ? `M ${x(0)} ${y(data[0].value)}` : "";
    const pts = data.map((d, i) => [x(i), y(d.value)] as const);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, w, h]);

  const areaPath = data.length >= 2 ? `${linePath} L ${x(data.length - 1)} ${h - pad} L ${x(0)} ${h - pad} Z` : "";

  function onMove(clientX: number) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || data.length === 0) return;
    const rel = clientX - rect.left;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round((rel - pad) / (stepX || 1))));
    setHoverIdx(idx);
    const d = data[idx];
    showAt(rect.left + x(idx), rect.top + y(d.value), `${d.label}: ${formatValue(d.value)}`);
  }

  return (
    <div className={cn(fill && "flex h-full flex-col", className)}>
      <div
        ref={boxRef}
        className="relative"
        style={fill ? { width: "100%", flex: "1 1 0", minHeight: 0 } : { width: "100%", height }}
      >
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%">
          <defs>
            <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill={`url(#grad-${gid})`} />}
          <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {hoverIdx !== null && data[hoverIdx] && (
            <g pointerEvents="none">
              <line x1={x(hoverIdx)} y1={pad} x2={x(hoverIdx)} y2={h - pad} stroke="hsl(var(--border))" strokeWidth="1" />
              {/* end-dot with a 2px surface ring so it stays legible over the line */}
              <circle cx={x(hoverIdx)} cy={y(data[hoverIdx].value)} r="4.5" fill={color} stroke="hsl(var(--card))" strokeWidth="2" />
            </g>
          )}

          <rect
            ref={overlayRef}
            x={0}
            y={0}
            width={w}
            height={h}
            fill="transparent"
            onMouseMove={(e) => onMove(e.clientX)}
            onMouseLeave={() => { setHoverIdx(null); hide(); }}
          />
        </svg>
        <ChartTooltipBubble tooltip={tooltip} />
      </div>
      {/* Only first / middle / last labels — one span per point overflows narrow cards. */}
      <div className="mt-1.5 flex justify-between text-[0.65rem] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor((data.length - 1) / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
