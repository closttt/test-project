import { motion, useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";
import { effectsLevel } from "@/lib/effects";

/**
 * Animated streak badge — the flame flickers while a streak is alive. Hidden below `min` days.
 * `compact` drops the pill background for tight spots (e.g. the sidebar level card).
 */
export function StreakFlame({
  streak,
  min = 2,
  compact = false,
  atRisk = false,
  className,
}: {
  streak: number;
  min?: number;
  compact?: boolean;
  /** Streak is alive but today has 0 completions — the flame flickers "fragile" + nudges. */
  atRisk?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const still = reduce || effectsLevel() === "off";
  if (streak < min) return null;

  const title = atRisk ? "Стрик под угрозой — закрой задачу сегодня, чтобы сохранить" : `${streak} дней подряд`;

  const flame = (
    <motion.span
      animate={
        still
          ? undefined
          : atRisk
            ? { opacity: [1, 0.4, 1], scale: [1, 0.92, 1] }
            : { scale: [1, 1.18, 0.96, 1.08, 1], rotate: [0, -4, 3, -2, 0] }
      }
      transition={still ? undefined : { duration: atRisk ? 1.1 : 1.6, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "50% 80%" }}
      className="inline-flex"
    >
      <Flame className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "fill-amber-400/30")} />
    </motion.span>
  );

  if (compact) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-xs font-medium", atRisk ? "text-amber-400/60" : "text-amber-400", className)}
        title={title}
      >
        {flame}
        {streak}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
        atRisk ? "bg-amber-500/10 text-amber-400/70" : "bg-amber-500/15 text-amber-400",
        className
      )}
      title={title}
    >
      {flame}
      {streak} дн.
    </span>
  );
}
