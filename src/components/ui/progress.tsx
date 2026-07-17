import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { easeOut } from "@/lib/motion";

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number; // 0..100
  className?: string;
  indicatorClassName?: string;
}) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn("h-full rounded-full bg-success", indicatorClassName)}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.5, ease: easeOut }}
      />
    </div>
  );
}
