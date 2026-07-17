import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { listContainer, listItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

type DivProps = ComponentPropsWithoutRef<typeof motion.div>;

export function StaggerList({ children, className, ...props }: { children: ReactNode } & DivProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={cn(className)}>{children}</div>;
  return (
    <motion.div
      variants={listContainer}
      initial="hidden"
      animate="show"
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, ...props }: { children: ReactNode } & DivProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={cn(className)}>{children}</div>;
  return (
    <motion.div variants={listItem} className={cn(className)} {...props}>
      {children}
    </motion.div>
  );
}
