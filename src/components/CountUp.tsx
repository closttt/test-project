import { useEffect } from "react";
import { animate, useMotionValue, useTransform, useReducedMotion, motion } from "framer-motion";

/** Animated number that counts up to `value`. `format` maps the rounded number to a string. */
export function CountUp({
  value,
  format = (n) => String(n),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(Math.round(v)));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [value, reduce, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
