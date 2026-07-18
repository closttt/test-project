import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Native tooltip — useful when the label is shortened to fit. */
  title?: string;
}

/**
 * The app's one inline segmented control (filters, sorts, view switches).
 * Previously this markup was hand-copied on every page, which drifted: no focus ring,
 * no wrapping (long label sets overflowed on phones), and slightly different paddings.
 * One component = one behaviour everywhere.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  ariaLabel?: string;
}) {
  // Unique per instance — a page can show more than one Segmented at once (e.g. Knowledge's sort
  // + view switches side by side), and a shared layoutId across unrelated instances would make
  // the active pill try to animate between them. Matches Sidebar.tsx's own "sidebar-active" pattern.
  const groupId = useId();

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-1 rounded-md border border-border p-0.5 text-xs", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-active-${groupId}`}
                className="absolute inset-0 rounded bg-secondary"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
