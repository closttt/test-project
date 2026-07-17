import { cn } from "@/lib/utils";
import { PRIORITY_META, type Priority } from "@/types";

/** Same pill language as tags (rounded-full border px-2 py-0.5 text-xs) — priority is a colored chip, not bare text. */
const PILL_CLASS: Record<Priority, string> = {
  0: "",
  1: "border-transparent bg-risk/15 text-risk",
  2: "border-transparent bg-amber-500/15 text-amber-400",
  3: "border-transparent bg-brand/15 text-brand",
};

export function PriorityFlag({
  p,
  onCycle,
  emptyLabel,
  className,
}: {
  p: Priority;
  onCycle?: () => void;
  /** When set, p===0 renders a chip with this label instead of disappearing — lets the empty
   *  state stay visible/clickable (e.g. as a picker trigger) instead of vanishing entirely. */
  emptyLabel?: string;
  className?: string;
}) {
  if (p === 0 && !emptyLabel) return null;
  const pill = "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors";
  const emptyStyle = p === 0 && "border-dashed text-muted-foreground";
  if (!onCycle) {
    return <span className={cn(pill, PILL_CLASS[p], emptyStyle, className)}>{p === 0 ? emptyLabel : PRIORITY_META[p].short}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      title={PRIORITY_META[p].label}
      className={cn(pill, PILL_CLASS[p], "hover:brightness-125", emptyStyle, className)}
    >
      {p === 0 ? emptyLabel : PRIORITY_META[p].short}
    </button>
  );
}
