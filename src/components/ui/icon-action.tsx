import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The app's one small icon-only action button (delete, archive, pin, remove…).
 *
 * Fixes two things that were wrong on every hand-rolled copy:
 *  - `aria-label` is mandatory here, so icon-only actions are no longer unlabelled for
 *    screen readers (they previously relied on `title` alone).
 *  - `reveal` adds `focus-visible:opacity-100` alongside `group-hover:opacity-100`, so a
 *    keyboard user tabbing onto a hover-revealed action can actually SEE it. Without that
 *    the focus ring landed on a fully transparent button.
 */
export function IconAction({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  reveal = false,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  /** Used for BOTH aria-label and the native tooltip — never optional. */
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  /** Hide until the parent (`.group`) is hovered — or this button is keyboard-focused. */
  reveal?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded p-1.5 transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        reveal && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        tone === "danger"
          ? "text-muted-foreground/50 hover:text-risk"
          : "text-muted-foreground/60 hover:text-foreground",
        className
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", iconClassName)} />
    </button>
  );
}
