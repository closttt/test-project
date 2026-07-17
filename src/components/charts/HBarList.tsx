import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";

export interface HBar {
  label: string;
  value: number; // 0..100 percentage
}

/** Horizontal bar list (reference "Opportunity by Venue" style). */
export function HBarList({ data }: { data: HBar[] }) {
  const { containerRef, tooltip, showAt, hide } = useChartTooltip();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div ref={containerRef} className="relative flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex items-center gap-3"
          onMouseEnter={(e) => showAt(e.clientX, e.clientY, `${d.label}: ${d.value}%`)}
          onMouseMove={(e) => showAt(e.clientX, e.clientY, `${d.label}: ${d.value}%`)}
          onMouseLeave={hide}
        >
          <span className="w-24 shrink-0 truncate text-sm text-muted-foreground">{d.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${i === 0 ? "bg-success" : "bg-muted-foreground/40"}`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{d.value}%</span>
        </div>
      ))}
      <ChartTooltipBubble tooltip={tooltip} />
    </div>
  );
}
