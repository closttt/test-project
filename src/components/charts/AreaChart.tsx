import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";
import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";

export interface Point {
  label: string;
  value: number;
}

/** Lightweight SVG area+line chart (no deps). Green accent, theme-aware. */
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
  // viewBox always matches the real rendered box (measured via ResizeObserver), so the
  // coordinate system is 1:1 with pixels — no non-uniform x/y scaling, no stretching.
  const [box, setBox] = useState({ w: 100, h: fill ? 100 : height });

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
  const pad = Math.min(6, w * 0.06, h * 0.12);
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const x = (i: number) => pad + i * stepX;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`).join(" ");
  const area = `${line} L ${x(data.length - 1)} ${h - pad} L ${x(0)} ${h - pad} Z`;
  const hitR = Math.max(6, stepX / 2);

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
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#grad-${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={i} cx={x(i)} cy={y(d.value)} r="1.4" fill={color} />
          ))}
          {data.map((d, i) => (
            <circle
              key={`hit-${i}`}
              cx={x(i)}
              cy={y(d.value)}
              r={hitR}
              fill="transparent"
              onMouseEnter={(e) => showAt(e.clientX, e.clientY, `${d.label}: ${formatValue(d.value)}`)}
              onMouseMove={(e) => showAt(e.clientX, e.clientY, `${d.label}: ${formatValue(d.value)}`)}
              onMouseLeave={hide}
            />
          ))}
        </svg>
        <ChartTooltipBubble tooltip={tooltip} />
      </div>
      {/* Only first / middle / last labels — rendering one span per point overflows narrow cards. */}
      <div className="mt-1 flex justify-between text-[0.65rem] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor((data.length - 1) / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
