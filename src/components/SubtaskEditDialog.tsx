import { useEffect, useState } from "react";
import { CornerDownRight, Trash2 } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { Button } from "@/components/ui/button";
import { PriorityPicker } from "@/components/PriorityPicker";
import { SubtaskDueMenu } from "@/components/SubtaskRow";
import { useData } from "@/store/DataProvider";
import { subPriority } from "@/lib/subtasks";
import type { Subtask, Task } from "@/types";

/**
 * Subtask detail card — the small-task counterpart of TaskEditDialog: same meta row
 * (готово / срок + напоминание / приоритет), same live-editing title and description.
 * It stays deliberately lighter than a task card: no project, tags, files or timer — a subtask
 * belongs to its parent, and those live there.
 */
export function SubtaskEditDialog({
  taskId,
  subtaskId,
  open,
  onOpenChange,
  onOpenParent,
}: {
  taskId: string | null;
  subtaskId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Click on the parent's name jumps to its card. */
  onOpenParent?: (parent: Task) => void;
}) {
  const { tasks, toggleSubtask, updateSubtask, deleteSubtask } = useData();
  // Live from the store so every edit lands instantly, same as the task card.
  const parent = tasks.find((t) => t.id === taskId);
  const live = parent?.subtasks.find((s) => s.id === subtaskId);

  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  useEffect(() => {
    if (!open || !live) return;
    setTitleDraft(live.title);
    setDescDraft(live.description ?? "");
    // Re-seed on identity only: re-running on every keystroke would fight the drafts.
  }, [open, taskId, subtaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!parent || !live) return null;

  const set = (patch: Partial<Subtask>) => updateSubtask(parent.id, live.id, patch);

  function commitTitle() {
    const t = titleDraft.trim();
    if (t) set({ title: t });
    else setTitleDraft(live!.title);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogTitle className="sr-only">Подзадача</DialogTitle>

        <div className="flex flex-col gap-3 p-5 pb-4">
          {/* Meta row — the same widgets as a task card, in the same order. pr-7 keeps the
              priority pill clear of the dialog's close button in the corner. */}
          <div className="flex items-center gap-1.5 pr-7">
            <AnimatedCheckbox
              checked={live.done}
              onChange={() => toggleSubtask(parent.id, live.id)}
              label={live.title}
              priority={subPriority(live)}
            />
            <SubtaskDueMenu taskId={parent.id} sub={live} className="text-sm opacity-100" />
            <div className="flex-1" />
            <PriorityPicker p={subPriority(live)} onChange={(p) => set({ priority: p })} />
          </div>

          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="Название подзадачи"
            className="border-none bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
          />

          <Textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => set({ description: descDraft.trim() || undefined })}
            placeholder="Заметки"
            rows={3}
            className="resize-none border-none bg-transparent px-0 text-sm text-muted-foreground outline-none focus-visible:ring-0"
          />
        </div>

        <Separator />

        {/* Where it lives — a subtask is always read in the context of its parent. */}
        <div className="flex items-center gap-2 p-5 py-3">
          <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground hover:text-foreground hover:underline"
            title="Открыть родительскую задачу"
            onClick={() => { onOpenChange(false); onOpenParent?.(parent); }}
          >
            {parent.title}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground/60 hover:text-risk"
            onClick={() => { onOpenChange(false); deleteSubtask(parent.id, live.id); }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Удалить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
