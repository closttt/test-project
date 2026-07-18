import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/**
 * Donut chart from segments with a centre label. Per the dataviz mark spec, touching segments are
 * separated by a small surface-colour gap (not a stroke) so neighbours read distinct; a single
 * full-circle segment gets no gap. Theme-aware via passed colours.
 */
export function DonutGauge({
  segments,
  size = 160,
  thickness = 16,
  centerTop,
  centerBottom,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerBottom?: string;
}) {
  const { containerRef, tooltip, showAt, hide } = useChartTooltip();
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  // A ~2px surface gap between segments (expressed as arc length). Only applied when more than one
  // segment actually has a value, so a lone full ring stays unbroken.
  const drawn = segments.filter((s) => s.value > 0);
  const gap = drawn.length > 1 ? Math.min(6, c * 0.012) : 0;
  let offset = 0;

  return (
    <div ref={containerRef} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={thickness} />
        {segments.map((s, i) => {
          if (s.value <= 0) return null;
          const raw = (s.value / total) * c;
          const len = Math.max(0.5, raw - gap);
          const dash = `${len} ${c - len}`;
          const pct = Math.round((s.value / total) * 100);
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap={gap > 0 ? "round" : "butt"}
              onMouseEnter={(e) => showAt(e.clientX, e.clientY, `${s.label}: ${s.value} (${pct}%)`)}
              onMouseMove={(e) => showAt(e.clientX, e.clientY, `${s.label}: ${s.value} (${pct}%)`)}
              onMouseLeave={hide}
            />
          );
          offset += raw;
          return el;
        })}
      </svg>
      {(centerTop || centerBottom) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerTop && <span className="text-xl font-semibold tracking-tight">{centerTop}</span>}
          {centerBottom && <span className="text-xs text-muted-foreground">{centerBottom}</span>}
        </div>
      )}
      <ChartTooltipBubble tooltip={tooltip} />
    </div>
  );
}
