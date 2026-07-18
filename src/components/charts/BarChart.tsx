import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";
import { cn } from "@/lib/utils";

export interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
}

/**
 * Vertical column chart. Per the dataviz mark spec: columns are capped thin (never fill the slot —
 * the band's leftover is air), carry a 4px rounded top with a square baseline, and grow from one
 * baseline. The value rides the cap; the highlighted column carries the series colour, the rest a
 * recessive wash.
 */
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
    <div ref={containerRef} className={cn("relative", className)} style={{ height }}>
      <div className="flex h-full items-stretch gap-1.5">
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
              <span className={cn("text-[0.7rem] font-medium tabular-nums", d.highlight ? "text-foreground" : "text-muted-foreground")}>
                {d.value}
              </span>
              {/* flex-1 track gives the percentage-height column a definite parent height; cap the
                  column width so it never fills the slot (air on both sides), rounded top only. */}
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className={cn(
                    "w-full max-w-[24px] rounded-t transition-all",
                    d.highlight ? "bg-success" : "bg-success/20"
                  )}
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
