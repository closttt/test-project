import { useEffect, useRef, useState } from "react";
import {
  Plus, X, Link2, MessageSquare, LayoutList, Save, Paperclip, GitBranch,
  CalendarClock, MoreHorizontal, FolderKanban, Repeat, Play, Pause,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { FilterChip } from "@/components/ui/filter-chip";
import { IconAction } from "@/components/ui/icon-action";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TaskTag } from "@/components/TaskTag";
import { PriorityPicker } from "@/components/PriorityPicker";
import { PromptDialog } from "@/components/PromptDialog";
import { AttachmentRow } from "@/components/AttachmentRow";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { uid } from "@/lib/id";
import { cn } from "@/lib/utils";
import { tagColor, FIXED_TAGS } from "@/lib/tags";
import { blockingTasks, isBlocked } from "@/lib/dependencies";
import { saveAttachmentBlob, deleteAttachmentBlob, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { formatDuration, formatDate, dueLabel, isOverdue, addDays } from "@/lib/format";
import type { Task, Recurrence, Attachment } from "@/types";

const NO_PROJECT = "none";

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Не повторять",
  daily: "Каждый день",
  weekdays: "Каждый будний день",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
  "monthly-first-monday": "Первый понедельник месяца",
};

/** Small footer icon trigger with an optional count badge — opens its editor in a dropdown. */
function FooterIcon({ icon: Icon, count, title, children }: { icon: typeof Link2; count: number; title: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-secondary",
            count > 0 ? "text-foreground" : "text-muted-foreground/50"
          )}
          title={title}
        >
          <Icon className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.5 text-[0.6rem] font-medium text-brand-foreground">
              {count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Task detail card — TickTick-style: quick meta row (done/date/priority/important) + big title +
 * description up top edit live, same as the row on /tasks; subtasks below; secondary stuff
 * (links/attachments/comments/dependencies/recurrence) tucked into footer icon dropdowns.
 */
export function TaskEditDialog({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { tasks, projects, allProjects, settings, toggleTask, updateTask, toggleSubtask, addSubtask, deleteSubtask, addChecklistTemplate, startTimer, stopTimer } = useData();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Live version from the store so every field updates instantly, same as the row on /tasks.
  const live = tasks.find((t) => t.id === task?.id) ?? task;

  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [newSub, setNewSub] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState("");
  const [depSearch, setDepSearch] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    setTitleDraft(task.title);
    setDescDraft(task.description ?? "");
    setNewSub("");
  }, [open, task]);

  if (!task || !live) return null;

  function commitTitle() {
    const t = titleDraft.trim();
    if (t) updateTask(live!.id, { title: t });
    else setTitleDraft(live!.title);
  }
  function commitDescription() {
    updateTask(live!.id, { description: descDraft.trim() || undefined });
  }

  function handleToggleDone() {
    if (!live!.done) {
      const blockers = blockingTasks(live!, tasks);
      if (blockers.length > 0) {
        toast(`Заблокировано — сначала закройте «${blockers[0].title}»${blockers.length > 1 ? ` (+${blockers.length - 1})` : ""}`);
        return;
      }
    }
    toggleTask(live!.id);
  }

  function addLink() {
    const url = linkDraft.trim();
    if (!url) return;
    updateTask(live!.id, { links: [...live!.links, url] });
    setLinkDraft("");
  }
  function removeLink(url: string) {
    updateTask(live!.id, { links: live!.links.filter((l) => l !== url) });
  }
  function addComment() {
    const text = commentDraft.trim();
    if (!text) return;
    updateTask(live!.id, { comments: [...live!.comments, { id: uid(), text, at: new Date().toISOString() }] });
    setCommentDraft("");
  }
  function removeComment(cid: string) {
    updateTask(live!.id, { comments: live!.comments.filter((c) => c.id !== cid) });
  }
  function startEditComment(cid: string, text: string) {
    setEditingComment(cid);
    setEditCommentDraft(text);
  }
  function commitEditComment() {
    if (!editingComment) return;
    const text = editCommentDraft.trim();
    if (text) {
      updateTask(live!.id, { comments: live!.comments.map((c) => (c.id === editingComment ? { ...c, text } : c)) });
    }
    setEditingComment(null);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !live) return;
    const files = Array.from(fileList);
    const added: Attachment[] = [];
    let rejected = 0;
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) { rejected++; continue; }
      const id = uid();
      await saveAttachmentBlob(id, file);
      added.push({ id, name: file.name, type: file.type, size: file.size, createdAt: new Date().toISOString() });
    }
    if (added.length) updateTask(live.id, { attachments: [...live.attachments, ...added] });
    if (rejected) toast(`Файл слишком большой (>${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} МБ): ${rejected}`);
  }

  async function removeAttachment(att: Attachment) {
    await deleteAttachmentBlob(att.id);
    updateTask(live!.id, { attachments: live!.attachments.filter((a) => a.id !== att.id) });
  }

  const doneSub = live.subtasks.filter((s) => s.done).length;
  const overdue = !live.done && isOverdue(live.dueDate);
  // allProjects — an archived project shouldn't make the footer wrongly claim "no project".
  const project = allProjects.find((p) => p.id === live.projectId);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Задача</DialogTitle>
        {/* Lives outside the attachments dropdown so the native file picker never risks closing it before onChange fires. */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <div className="flex flex-col gap-3 p-5 pb-4">
          {/* Quick meta row — same widgets as the row on /tasks */}
          <div className="flex items-center gap-1.5">
            <AnimatedCheckbox checked={live.done} onChange={handleToggleDone} label={live.title} />
            {isBlocked(live, tasks) && (
              <span className="text-muted-foreground" title="Заблокировано незавершёнными зависимостями">🔒</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-secondary",
                    live.dueDate ? (overdue ? "font-medium text-risk" : "text-muted-foreground") : "text-muted-foreground/60"
                  )}
                >
                  <CalendarClock className="h-4 w-4" />
                  {live.dueDate ? dueLabel(live.dueDate) : "Дата и напоминание"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onClick={() => updateTask(live.id, { dueDate: addDays(new Date(), 0) })}>Срок: сегодня</DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateTask(live.id, { dueDate: addDays(new Date(), 1) })}>Срок: завтра</DropdownMenuItem>
                <DropdownMenuItem onClick={() => updateTask(live.id, { dueDate: addDays(new Date(), 7) })}>Срок: через неделю</DropdownMenuItem>
                {live.dueDate && (
                  <DropdownMenuItem onClick={() => updateTask(live.id, { dueDate: undefined })}>
                    <X /> Убрать срок
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <div className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                  <p className="mb-1 px-1 text-xs text-muted-foreground">Или выбрать дату</p>
                  <Calendar selected={live.dueDate} onSelect={(d) => updateTask(live.id, { dueDate: d })} />
                </div>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <p className="mb-1 text-xs text-muted-foreground">Напоминание</p>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs"
                    value={live.remindAt ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateTask(live.id, { remindAt: e.target.value || undefined })}
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex-1" />
            <PriorityPicker p={live.priority} onChange={(p) => updateTask(live.id, { priority: p })} />
          </div>

          {/* Title */}
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="Название задачи"
            className="border-none bg-transparent text-xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
          />

          {/* Description */}
          <Textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={commitDescription}
            placeholder="Описание"
            rows={2}
            className="resize-none border-none bg-transparent px-0 text-sm text-muted-foreground outline-none focus-visible:ring-0"
          />

          {/* Tags + project */}
          <div className="flex flex-wrap items-center gap-1.5">
            {live.tags.map((t) => (
              <TaskTag key={t} tag={t} onRemove={() => updateTask(live.id, { tags: live.tags.filter((x) => x !== t) })} />
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground" title="Добавить тег">
                  + тег
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="flex flex-wrap gap-1.5 p-2" style={{ width: "12rem" }}>
                {FIXED_TAGS.map((tag) => {
                  const active = live.tags.includes(tag);
                  return (
                    <FilterChip
                      key={tag}
                      active={active}
                      activeClassName={tagColor(tag)}
                      onClick={() => {
                        const next = active ? live.tags.filter((t) => t !== tag) : [...live.tags, tag];
                        updateTask(live.id, { tags: next });
                      }}
                      className="py-1"
                    >
                      #{tag}
                    </FilterChip>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Select value={live.projectId ?? NO_PROJECT} onValueChange={(v) => updateTask(live.id, { projectId: v === NO_PROJECT ? undefined : v })}>
              <SelectTrigger className="h-6 w-auto gap-1 border-none bg-secondary/60 px-2 text-xs">
                <FolderKanban className="h-3 w-3" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Без проекта</SelectItem>
                {/* The task's current project stays selectable even if it was archived since assignment —
                    otherwise the trigger shows blank because its value matches no rendered item. */}
                {project && !projects.some((p) => p.id === project.id) && (
                  <SelectItem value={project.id}>{project.name} (в архиве)</SelectItem>
                )}
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Subtasks */}
        <div className="flex flex-col gap-1.5 p-5 py-4">
          <div className="flex items-center justify-between">
            <Label>
              Подзадачи {live.subtasks.length > 0 && <span className="text-muted-foreground">({doneSub}/{live.subtasks.length})</span>}
            </Label>
            <div className="flex items-center gap-1">
              {settings.checklistTemplates.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"><LayoutList className="h-3.5 w-3.5" /> Шаблон</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {settings.checklistTemplates.map((tpl) => (
                      <DropdownMenuItem key={tpl.id} onClick={() => tpl.items.forEach((it) => addSubtask(live!.id, it))}>
                        {tpl.name} <span className="ml-auto text-xs text-muted-foreground">{tpl.items.length}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {live.subtasks.length > 0 && (
                <Button
                  variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                  title="Сохранить подзадачи как шаблон"
                  onClick={() => setSavingTemplate(true)}
                >
                  <Save className="h-3.5 w-3.5" /> В шаблон
                </Button>
              )}
            </div>
          </div>
          {live.subtasks.map((s) => (
            <div key={s.id} className="group flex items-center gap-2">
              <AnimatedCheckbox checked={s.done} onChange={() => toggleSubtask(live.id, s.id)} size="sm" label={s.title} />
              <span className={cn("flex-1 text-sm", s.done && "text-muted-foreground line-through")}>{s.title}</span>
              <IconAction icon={X} label={`Удалить подзадачу: ${s.title}`} tone="danger" onClick={() => deleteSubtask(live.id, s.id)} reveal className="p-0.5" />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSub.trim()) {
                  addSubtask(live.id, newSub);
                  setNewSub("");
                }
              }}
              placeholder="Добавить подзадачу…"
              className="h-8 border-none bg-transparent px-0 focus-visible:ring-0"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                if (newSub.trim()) {
                  addSubtask(live.id, newSub);
                  setNewSub("");
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Footer — secondary fields tucked into icon dropdowns, TickTick-style */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="truncate px-2 text-xs text-muted-foreground">{project ? project.name : "Без проекта"}</span>
          <div className="flex items-center gap-0.5">
            <FooterIcon icon={Link2} count={live.links.length} title="Ссылки">
              <div className="flex flex-col gap-1.5">
                {live.links.map((l) => (
                  <div key={l} className="group flex items-center gap-2">
                    <a href={l} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm text-brand underline underline-offset-2">{l}</a>
                    <IconAction icon={X} label={`Удалить ссылку: ${l}`} tone="danger" onClick={() => removeLink(l)} reveal className="p-0.5" />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="https://…" className="h-8" />
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addLink}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            </FooterIcon>

            <FooterIcon icon={Paperclip} count={live.attachments.length} title="Вложения">
              <div className="flex flex-col gap-1.5">
                {live.attachments.map((att) => (
                  <AttachmentRow key={att.id} att={att} onRemove={() => removeAttachment(att)} />
                ))}
                <Button variant="outline" size="sm" className="self-start gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <Plus className="h-3.5 w-3.5" /> Прикрепить файл
                </Button>
              </div>
            </FooterIcon>

            <FooterIcon icon={MessageSquare} count={live.comments.length} title="Комментарии">
              <div className="flex flex-col gap-1.5">
                {live.comments.map((c) => (
                  <div key={c.id} className="group rounded-md bg-secondary/50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{formatDate(c.at)}</span>
                      <IconAction icon={X} label={`Удалить комментарий от ${formatDate(c.at)}`} tone="danger" onClick={() => removeComment(c.id)} reveal className="p-0.5" />
                    </div>
                    {editingComment === c.id ? (
                      <Input
                        autoFocus
                        value={editCommentDraft}
                        onChange={(e) => setEditCommentDraft(e.target.value)}
                        onBlur={commitEditComment}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditComment();
                          if (e.key === "Escape") setEditingComment(null);
                        }}
                        className="h-8 text-sm"
                      />
                    ) : (
                      <p className="cursor-pointer whitespace-pre-wrap text-sm" onClick={() => startEditComment(c.id, c.text)} title="Клик — редактировать">
                        {c.text}
                      </p>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Добавить комментарий…" className="h-8" />
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addComment}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            </FooterIcon>

            <FooterIcon icon={GitBranch} count={(live.blockedBy ?? []).length} title="Зависит от">
              <div className="flex flex-col gap-1.5">
                {(live.blockedBy ?? []).map((depId) => {
                  const dep = tasks.find((t) => t.id === depId);
                  if (!dep) return null;
                  return (
                    <div key={depId} className="group flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-sm", dep.done && "text-muted-foreground line-through")}>{dep.title}</span>
                      {!dep.done && <span className="shrink-0 text-xs text-risk">не завершена</span>}
                      <IconAction icon={X} label={`Убрать зависимость: ${dep.title}`} tone="danger" onClick={() => updateTask(live.id, { blockedBy: (live.blockedBy ?? []).filter((id) => id !== depId) })} reveal className="p-0.5" />
                    </div>
                  );
                })}
                <div className="relative">
                  <Input value={depSearch} onChange={(e) => setDepSearch(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Найти задачу…" className="h-8" />
                  {depSearch.trim() && (
                    <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                      {tasks
                        .filter(
                          (t) =>
                            t.id !== live.id &&
                            !(live.blockedBy ?? []).includes(t.id) &&
                            t.title.toLowerCase().includes(depSearch.trim().toLowerCase())
                        )
                        .slice(0, 8)
                        .map((t) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              updateTask(live.id, { blockedBy: [...(live.blockedBy ?? []), t.id] });
                              setDepSearch("");
                            }}
                            className="flex w-full items-center px-2.5 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent"
                          >
                            {t.title}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </FooterIcon>

            <FooterIcon icon={MoreHorizontal} count={0} title="Ещё">
              <div className="flex flex-col gap-3">
                <div className="grid gap-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><Repeat className="h-3.5 w-3.5" /> Повтор</Label>
                  <div className="flex flex-col gap-0.5">
                    {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => updateTask(live.id, { recurrence: r })}
                        className={cn(
                          "rounded px-2 py-1 text-left text-xs transition-colors",
                          live.recurrence === r ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {RECURRENCE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="te-est" className="text-xs">Оценка, мин</Label>
                  <Input
                    id="te-est"
                    type="number"
                    min={0}
                    className="h-8"
                    defaultValue={live.estimateMin ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => updateTask(live.id, { estimateMin: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="напр. 90"
                  />
                  {live.spentMin > 0 && (
                    <p className="text-xs text-muted-foreground">Потрачено: {formatDuration(live.spentMin)}</p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start gap-1.5"
                    onClick={() => (live.timerStartedAt ? stopTimer(live.id) : startTimer(live.id))}
                  >
                    {live.timerStartedAt ? <><Pause className="h-3.5 w-3.5" /> Остановить таймер</> : <><Play className="h-3.5 w-3.5" /> Начать таймер</>}
                  </Button>
                </div>
              </div>
            </FooterIcon>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <PromptDialog
      open={savingTemplate}
      onOpenChange={setSavingTemplate}
      title="Название шаблона"
      onSubmit={(name) => addChecklistTemplate(name, live.subtasks.map((s) => s.title))}
    />
    </>
  );
}
