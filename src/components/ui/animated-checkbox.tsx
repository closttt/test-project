import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { effectsLevel, effectsScale } from "@/lib/effects";

/**
 * Satisfying task checkbox: springy pop on check, animated tick path, and a one-shot
 * success "burst" (expanding ring + particles) fired the moment a task is completed.
 * The burst is self-contained here, so every completion surface (Dashboard, Tasks,
 * ProjectDetail, Focus, Calendar) gets the same reward with zero extra wiring.
 * Accessible: it's a real <button role="checkbox">. Fully respects reduced-motion.
 */
export function AnimatedCheckbox({
  checked,
  onChange,
  className,
  size = "md",
  label,
  priority,
}: {
  checked: boolean;
  onChange: () => void;
  className?: string;
  size?: "sm" | "md";
  label?: string;
  /** Task priority (1 high … 3 low, 0 none). Scales the burst so closing a big task feels bigger. */
  priority?: number;
}) {
  const reduce = useReducedMotion();
  const box = size === "sm" ? "h-4 w-4" : "h-[1.15rem] w-[1.15rem]";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  // Reward scales with the task's weight — same idea as priority-scaled XP — and with the
  // user's FX setting (Настройки → Эффекты).
  const priorityBoost = priority === 1 ? 1.6 : priority === 2 ? 1.3 : priority === 3 ? 1.1 : 1;
  const intensity = priorityBoost * effectsScale();

  // Fire a burst only on the false → true transition (completing), never on unchecking or mount.
  const prevChecked = useRef(checked);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (checked && !prevChecked.current && !reduce && effectsLevel() !== "off") setBurst((n) => n + 1);
    prevChecked.current = checked;
  }, [checked, reduce]);

  const particles = Math.max(3, Math.round((size === "sm" ? 5 : 6) * intensity));
  const ringScale = 1 + 1.3 * intensity;
  const particleDist = (size === "sm" ? 11 : 14) * intensity;

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      whileTap={reduce ? undefined : { scale: 0.85 }}
      transition={spring}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-[0.4rem] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        box,
        checked
          ? "border-success bg-success text-success-foreground"
          : "border-muted-foreground/40 bg-transparent hover:border-muted-foreground/70",
        className
      )}
    >
      <motion.span
        initial={false}
        animate={checked ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
        transition={reduce ? { duration: 0 } : spring}
      >
        <Check className={cn(icon)} strokeWidth={3} />
      </motion.span>

      <AnimatePresence>
        {burst > 0 && checked && (
          <span key={burst} className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* Expanding ring */}
            <motion.span
              className="absolute inset-0 rounded-[0.4rem] border border-success"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: ringScale, opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              onAnimationComplete={() => setBurst(0)}
            />
            {/* Radial particles */}
            {Array.from({ length: particles }).map((_, i) => {
              const angle = (i / particles) * Math.PI * 2;
              const dist = particleDist;
              return (
                <motion.span
                  key={i}
                  className="absolute h-1 w-1 rounded-full bg-success"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    opacity: 0,
                    scale: 0.4,
                  }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
