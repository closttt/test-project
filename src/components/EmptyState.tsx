import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { easeOut } from "@/lib/motion";

/**
 * Empty state = onboarding, not a dead-end (research §1.3).
 * Explains what will appear + one obvious action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeOut }}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center"
    >
      {/* Layered illustration */}
      <div className="relative mb-5 flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-brand/5" />
        <span className="absolute inset-3 rounded-full bg-brand/10" />
        <motion.span
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/25 to-brand/5 text-brand shadow-sm"
          animate={reduce ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon className="h-7 w-7" />
        </motion.span>
      </div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
