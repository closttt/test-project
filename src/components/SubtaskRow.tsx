import { Bell, CalendarClock, Trash2, X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { IconAction } from "@/components/ui/icon-action";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PriorityPicker } from "@/components/PriorityPicker";
import { useData } from "@/store/DataProvider";
import { cn } from "@/lib/utils";
import { subPriority } from "@/lib/subtasks";
import { addDays, dueLabel, isOverdue, todayStr } from "@/lib/format";
import type { Subtask } from "@/types";

/**
 * Date + reminder menu for one subtask — the exact same choices as a task's date menu
 * (сегодня / завтра / через неделю / календарь / напоминание), so the two feel identical.
 * Shared by the inline row and the subtask card.
 */
export function SubtaskDueMenu({
  taskId,
  sub,
  className,
}: {
  taskId: string;
  sub: Subtask;
  className?: string;
}) {
  const { updateSubtask } = useData();
  const overdue = !sub.done && isOverdue(sub.dueDate);
  const set = (patch: Partial<Subtask>) => updateSubtask(taskId, sub.id, patch);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Срок и напоминание подзадачи"
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-secondary",
            sub.dueDate
              ? overdue
                ? "font-medium text-risk"
                : "text-muted-foreground"
              : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            className
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {sub.dueDate && dueLabel(sub.dueDate)}
          {sub.remindAt && <Bell className="h-3 w-3" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => set({ dueDate: todayStr() })}>Срок: сегодня</DropdownMenuItem>
        <DropdownMenuItem onClick={() => set({ dueDate: addDays(new Date(), 1) })}>Срок: завтра</DropdownMenuItem>
        <DropdownMenuItem onClick={() => set({ dueDate: addDays(new Date(), 7) })}>Срок: через неделю</DropdownMenuItem>
        {sub.dueDate && (
          <DropdownMenuItem onClick={() => set({ dueDate: undefined })}>
            <X /> Убрать срок
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <div className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
          <p className="mb-1 px-1 text-xs text-muted-foreground">Или выбрать дату</p>
          <Calendar selected={sub.dueDate} onSelect={(d) => set({ dueDate: d })} />
        </div>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <p className="mb-1 text-xs text-muted-foreground">Напоминание</p>
          <Input
            type="datetime-local"
            className="h-8 text-xs"
            value={sub.remindAt ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => set({ remindAt: e.target.value || undefined })}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One subtask line — the single row used everywhere subtasks are listed (карточка задачи,
 * Задачи, Проекты). Carries the full small-task kit: чекбокс, название (открывает карточку
 * подзадачи), срок + напоминание, приоритет, удаление.
 */
export function SubtaskRow({
  taskId,
  sub,
  onOpen,
  className,
}: {
  taskId: string;
  sub: Subtask;
  /** Click on the title opens the subtask card. Omit to make the title plain text. */
  onOpen?: (sub: Subtask) => void;
  className?: string;
}) {
  const { toggleSubtask, updateSubtask, deleteSubtask } = useData();
  const priority = subPriority(sub);

  return (
    <div className={cn("group flex items-center gap-2 rounded-md py-0.5 pr-1", className)}>
      <AnimatedCheckbox
        checked={sub.done}
        onChange={() => toggleSubtask(taskId, sub.id)}
        size="sm"
        label={sub.title}
        priority={priority}
      />
      {onOpen ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(sub); }}
          title="Открыть карточку подзадачи"
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm hover:underline",
            sub.done && "text-muted-foreground line-through"
          )}
        >
          {sub.title}
        </button>
      ) : (
        <span className={cn("min-w-0 flex-1 truncate text-sm", sub.done && "text-muted-foreground line-through")}>
          {sub.title}
        </span>
      )}
      <SubtaskDueMenu taskId={taskId} sub={sub} />
      <PriorityPicker
        p={priority}
        onChange={(p) => updateSubtask(taskId, sub.id, { priority: p })}
        className={cn(priority === 0 && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
      />
      <IconAction
        icon={Trash2}
        label={`Удалить подзадачу: ${sub.title}`}
        tone="danger"
        onClick={() => deleteSubtask(taskId, sub.id)}
        reveal
        className="p-0.5"
      />
    </div>
  );
}
