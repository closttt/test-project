import { useState } from "react";
import { CalendarIcon, Sparkles, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TaskTag } from "@/components/TaskTag";
import { PriorityPicker } from "@/components/PriorityPicker";
import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { parseNaturalInput } from "@/lib/nlp";
import { formatDate } from "@/lib/format";
import type { Priority } from "@/types";

const NONE = "none";

/** Single global quick-capture dialog — opened from header button, Cmd+K, or "N". */
export function QuickAddDialog({ defaultProjectId }: { defaultProjectId?: string } = {}) {
  const { addTask, projects } = useData();
  const { quickAddOpen, setQuickAddOpen } = useUI();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? NONE);
  const [priority, setPriority] = useState<Priority>(0);
  const [dueDateOverride, setDueDateOverride] = useState("");

  // Live natural-language detection: date + #tags + ! priority. An explicit date pick wins over the NLP guess.
  const parsed = parseNaturalInput(title);
  const effectiveDueDate = dueDateOverride || parsed.dueDate;

  function submit() {
    const finalTitle = parsed.title.trim() || title.trim();
    if (!finalTitle) return;
    addTask({
      title: finalTitle,
      done: false,
      projectId: projectId === NONE ? undefined : projectId,
      dueDate: effectiveDueDate,
      tags: parsed.tags,
      important: parsed.important,
      priority,
    });
    reset();
    setQuickAddOpen(false);
  }

  function reset() {
    setTitle("");
    setProjectId(defaultProjectId ?? NONE);
    setPriority(0);
    setDueDateOverride("");
  }

  const hasHints = !!parsed.dueDate || parsed.tags.length > 0 || parsed.important;

  return (
    <Dialog
      open={quickAddOpen}
      onOpenChange={(v) => {
        setQuickAddOpen(v);
        if (v) setProjectId(defaultProjectId ?? NONE);
        else reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="qa-title">Название</Label>
            <Input
              id="qa-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр.: Отправить прайс завтра #клиент !важно"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
            {hasHints && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {parsed.dueDate && (
                  <span className="flex items-center gap-1 text-xs text-brand">
                    <Sparkles className="h-3 w-3" /> {formatDate(parsed.dueDate)}
                  </span>
                )}
                {parsed.important && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <Star className="h-3 w-3 fill-amber-400" /> важно
                  </span>
                )}
                {parsed.tags.map((t) => (
                  <TaskTag key={t} tag={t} />
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Приоритет</Label>
              <div className="flex h-9 items-center">
                <PriorityPicker p={priority} onChange={setPriority} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qa-date">Срок</Label>
              <Input id="qa-date" type="date" value={effectiveDueDate ?? ""} onChange={(e) => setDueDateOverride(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Проект</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Без проекта" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Без проекта</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarIcon className="h-3 w-3" />
            Пишите прямо в строке: «завтра», «в пятницу», «через 3 дня», «#тег», «!важно».
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setQuickAddOpen(false)}>
            Отмена
          </Button>
          <Button onClick={submit}>Добавить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
