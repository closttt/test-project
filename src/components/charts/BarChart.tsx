import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";

export interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
}

/** Vertical bar chart with value labels (reference "Opportunity Analysis" style). */
export function BarChart({
  data,
  height = 150,
  className,
  formatValue = (v) => String(v),
}: {
  data: Bar[];
  height?: number;
  className?: string;
  /** Formats a bar's value for the hover tooltip (e.g. "5 задач", "1ч 20м"). */
  formatValue?: (v: number) => string;
}) {
  const { containerRef, tooltip, showAt, hide } = useChartTooltip();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`} style={{ height }}>
      <div className="flex h-full items-stretch gap-2">
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center gap-1.5"
              onMouseEnter={(e) => showAt(e.clientX, e.clientY, `${d.label}: ${formatValue(d.value)}`)}
              onMouseMove={(e) => showAt(e.clientX, e.clientY, `${d.label}: ${formatValue(d.value)}`)}
              onMouseLeave={hide}
            >
              <span className="text-[0.7rem] font-medium text-foreground">{d.value}</span>
              {/* flex-1 track gives the percentage-height bar a definite parent height */}
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-md transition-all ${
                    d.highlight ? "bg-success/80" : "bg-success/25"
                  }`}
                  style={{ height: `${Math.max(2, pct)}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-[0.6rem] text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
      </div>
      <ChartTooltipBubble tooltip={tooltip} />
    </div>
  );
}
