import { useRef, useState, type ReactNode } from "react";

interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Shared hover-tooltip state for hand-rolled SVG charts — one absolutely-positioned layer per
 *  chart instead of a DOM tooltip per data point. Coordinates are relative to `containerRef`. */
export function useChartTooltip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  function showAt(clientX: number, clientY: number, content: ReactNode) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: clientX - rect.left, y: clientY - rect.top, content });
  }
  function hide() {
    setTooltip(null);
  }

  return { containerRef, tooltip, showAt, hide };
}

export function ChartTooltipBubble({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md"
      style={{ left: tooltip.x, top: tooltip.y - 10 }}
    >
      {tooltip.content}
    </div>
  );
}
