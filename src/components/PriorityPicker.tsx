import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PriorityFlag } from "@/components/PriorityFlag";
import { PRIORITY_META, type Priority } from "@/types";

const ORDER: Priority[] = [1, 2, 3, 0];

/** Same due-date-dropdown UX for priority — click opens a direct choice of all 4 levels,
 *  instead of blind-cycling one click at a time. */
export function PriorityPicker({
  p,
  onChange,
  emptyLabel = "Приоритет",
  className,
}: {
  p: Priority;
  onChange: (p: Priority) => void;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex shrink-0">
          <PriorityFlag p={p} emptyLabel={emptyLabel} className={className} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {ORDER.map((pr) => (
          <DropdownMenuItem key={pr} onClick={() => onChange(pr)}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY_META[pr].dot }} />
            {PRIORITY_META[pr].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
