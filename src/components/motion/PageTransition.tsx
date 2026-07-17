import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { pageVariants } from "@/lib/motion";

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}
