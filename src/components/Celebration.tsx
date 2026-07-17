import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { effectsLevel } from "@/lib/effects";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"];

/** Subtle one-shot confetti burst — fires when all of today's tasks are done. */
export function Celebration({ show }: { show: boolean }) {
  const reduce = useReducedMotion();
  const level = effectsLevel();
  if (reduce || level === "off") return null;

  const pieces = Array.from({ length: level === "subtle" ? 8 : 14 }, (_, i) => i);

  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-[100] flex justify-center">
          {pieces.map((i) => {
            const angle = (i / pieces.length) * Math.PI * 2;
            const dist = 60 + (i % 5) * 26;
            return (
              <motion.span
                key={i}
                className="absolute block h-2 w-2 rounded-[2px]"
                style={{ background: COLORS[i % COLORS.length] }}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
                animate={{
                  opacity: 0,
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist + 40,
                  scale: 0.6,
                  rotate: (i % 2 ? 1 : -1) * 220,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}
