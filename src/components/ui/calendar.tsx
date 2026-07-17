import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { WEEKDAYS, MONTHS, ymd, buildMonthGrid } from "@/lib/calendar";
import { todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Single-month date grid — same shape as shadcn's Calendar, built on the app's own month-grid helpers. */
export function Calendar({
  selected,
  onSelect,
  className,
}: {
  selected?: string;
  onSelect: (date: string) => void;
  className?: string;
}) {
  const base = selected ? new Date(selected) : new Date();
  const [view, setView] = useState({ year: base.getFullYear(), month: base.getMonth() });
  const grid = buildMonthGrid(view.year, view.month);
  const today = todayStr();

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className={cn("w-64 p-1", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">{MONTHS[view.month]} {view.year}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs text-muted-foreground">{w}</div>
        ))}
        {grid.map((d) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === view.month;
          const isSel = key === selected;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md text-xs transition-colors",
                !inMonth && "text-muted-foreground/40",
                isSel ? "bg-foreground text-background" : "hover:bg-secondary/60",
                key === today && !isSel && "font-semibold text-brand"
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
