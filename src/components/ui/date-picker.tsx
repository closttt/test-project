import { useState } from "react";
import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Design-system date picker: a button showing the chosen date that opens the shared `Calendar`
 * grid — replaces the raw `<input type="date">` (native OS picker) everywhere a plain date is set,
 * so date entry looks and behaves the same across the whole app.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Выбрать дату",
  className,
  allowClear = true,
}: {
  value?: string;
  onChange: (date: string | undefined) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 w-full justify-start gap-2 font-normal", !value && "text-muted-foreground", className)}
        >
          <CalendarClock className="h-4 w-4 shrink-0" />
          {value ? dueLabel(value) : placeholder}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <Calendar selected={value} onSelect={(d) => { onChange(d); setOpen(false); }} />
        {allowClear && value && (
          <button
            type="button"
            onClick={() => { onChange(undefined); setOpen(false); }}
            className="mt-1 w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Убрать дату
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
