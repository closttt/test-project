import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A collapsible list section with a dot-accent header, a count, and an expand chevron.
 * Reused for time-grouped task lists («Позже» и т.д.). DS-token driven — no hex.
 */
export function CollapsibleSection({
  label,
  count,
  accent,
  collapsed,
  onToggle,
  children,
  headerRight,
}: {
  label: string;
  count: number;
  accent?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-secondary/40"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            collapsed && "-rotate-90"
          )}
        />
        {accent && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground/60">{count}</span>
        <span className="ml-auto flex items-center gap-2">{headerRight}</span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
