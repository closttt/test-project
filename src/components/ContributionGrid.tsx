import { cn } from "@/lib/utils";
import { useChartTooltip, ChartTooltipBubble } from "@/components/charts/ChartTooltip";
import { formatDate, localDayStr } from "@/lib/format";

/** GitHub-style heatmap of completed tasks over the last N weeks. */
export function ContributionGrid({
  log,
  weeks = 10,
}: {
  log: Record<string, number>;
  weeks?: number;
}) {
  const { containerRef, tooltip, showAt, hide } = useChartTooltip();
  // Build columns of 7 days ending today, Monday-first, aligned so today is last.
  const today = new Date();
  const end = new Date(today);
  // advance to the end of the current week (Sunday) so the grid is full
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  const totalDays = weeks * 7;
  const days: { key: string; count: number; future: boolean }[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = localDayStr(d);
    days.push({ key, count: log[key] ?? 0, future: d > today });
  }

  const columns: (typeof days)[] = [];
  for (let c = 0; c < weeks; c++) columns.push(days.slice(c * 7, c * 7 + 7));

  const shade = (count: number, future: boolean) => {
    if (future) return "bg-transparent";
    if (count === 0) return "bg-secondary";
    if (count <= 2) return "bg-success/30";
    if (count <= 4) return "bg-success/60";
    return "bg-success";
  };

  return (
    <div ref={containerRef} className="relative flex gap-1 overflow-x-auto">
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((d) => (
            <div
              key={d.key}
              className={cn("h-3 w-3 rounded-[3px]", !d.future && "cursor-default", shade(d.count, d.future))}
              onMouseEnter={(e) => !d.future && showAt(e.clientX, e.clientY, `${formatDate(d.key)}: ${d.count} задач`)}
              onMouseMove={(e) => !d.future && showAt(e.clientX, e.clientY, `${formatDate(d.key)}: ${d.count} задач`)}
              onMouseLeave={hide}
            />
          ))}
        </div>
      ))}
      <ChartTooltipBubble tooltip={tooltip} />
    </div>
  );
}
