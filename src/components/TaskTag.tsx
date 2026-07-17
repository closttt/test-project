import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { tagColor } from "@/lib/tags";

export function TaskTag({
  tag,
  className,
  onRemove,
}: {
  tag: string;
  className?: string;
  /** When set, shows a hover-revealed × to remove the tag right on the card — no picker needed. */
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "group/tag inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tagColor(tag),
        className
      )}
    >
      #{tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-50 transition-opacity hover:opacity-100"
          title={`Убрать тег #${tag}`}
          aria-label={`Убрать тег #${tag}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
