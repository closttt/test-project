import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Donut chart from segments, with a centre label. Theme-aware via passed colors. */
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
  let offset = 0;

  return (
    <div ref={containerRef} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
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
              strokeLinecap="round"
              onMouseEnter={(e) => showAt(e.clientX, e.clientY, `${s.label}: ${s.value} (${pct}%)`)}
              onMouseMove={(e) => showAt(e.clientX, e.clientY, `${s.label}: ${s.value} (${pct}%)`)}
              onMouseLeave={hide}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {(centerTop || centerBottom) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerTop && <span className="text-lg font-semibold tracking-tight">{centerTop}</span>}
          {centerBottom && <span className="text-xs text-muted-foreground">{centerBottom}</span>}
        </div>
      )}
      <ChartTooltipBubble tooltip={tooltip} />
    </div>
  );
}
