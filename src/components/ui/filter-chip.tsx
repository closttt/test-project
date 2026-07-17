import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's one toggleable filter chip — tag filters, smart lists, "Все · N" pills.
 * This markup used to be hand-copied on 7 surfaces with drifting padding and no focus
 * ring; one component keeps the pill language (and keyboard access) identical everywhere.
 */
export function FilterChip({
  active,
  onClick,
  children,
  count,
  activeClassName,
  className,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Optional trailing count (smart lists, tag counts). */
  count?: number;
  /** Active styling override — e.g. tagColor(tag) so each tag keeps its own colour. */
  activeClassName?: string;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        active
          ? activeClassName ?? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("tabular-nums", active ? "opacity-70" : "opacity-50")}>{count}</span>
      )}
    </button>
  );
}
