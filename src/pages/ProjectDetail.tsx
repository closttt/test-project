import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Trash2, Plus, CheckSquare, StickyNote, X,
  ImagePlus, ImageOff, Images, ChevronDown, ChevronRight, GripVertical, MessageSquare, Eye, EyeOff, Save,
  Paperclip, CalendarClock,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
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
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { TaskTag } from "@/components/TaskTag";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PriorityPicker } from "@/components/PriorityPicker";
import { Calendar } from "@/components/ui/calendar";
import { ProjectHealthBadge } from "@/components/ProjectHealthBadge";
import { PhotoGallery, saveGalleryFiles, deleteGalleryFile } from "@/components/PhotoGallery";
import { AttachmentRow } from "@/components/AttachmentRow";
import { TaskEditDialog } from "@/components/TaskEditDialog";
import { PromptDialog } from "@/components/PromptDialog";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { cn } from "@/lib/utils";
import { dueLabel, isOverdue, formatDate, todayStr, addDays } from "@/lib/format";
import { groupTasksByTime } from "@/lib/taskGrouping";
import { projectHealth } from "@/lib/projectHealth";
import { pushRecent } from "@/lib/recent";
import { pushUndo } from "@/lib/undoStack";
import { parseNaturalInput } from "@/lib/nlp";
import { uid } from "@/lib/id";
import { saveAttachmentBlob, loadAttachmentBlob, deleteAttachmentBlob, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import type { ProjectStatus, Task, Attachment, Priority } from "@/types";

const NO_SECTION = "—";
type SortMode = "manual" | "date" | "priority";

const statusLabel: Record<ProjectStatus, string> = {
  active: "В работе",
  done: "Завершён",
  archived: "Архив",
};

function collapseKey(projectId: string) {
  return `crm-project-collapsed-${projectId}`;
}

function loadCollapsed(projectId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(collapseKey(projectId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    allProjects, tasks, allTasks, notes,
    updateProject, deleteProject, restoreProject, unarchiveProject,
    addProjectSection, deleteProjectSection, renameProjectSection, reorderProjectSections,
    addProjectComment, deleteProjectComment,
    addTask, updateTask, toggleTask, deleteTask, restoreTask,
    addProjectTemplate,
  } = useData();
  const { toast } = useToast();
  const [newTask, setNewTask] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>(0);
  const [newTaskDate, setNewTaskDate] = useState<string | undefined>(undefined);
  const [dateOpen, setDateOpen] = useState(false);
  const [newSection, setNewSection] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("manual");
  const [showDone, setShowDone] = useState(false);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => (id ? loadCollapsed(id) : new Set()));
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // allProjects (not the active-only list) — an archived project should still open by direct
  // link (backlink, browser history) instead of showing "not found".
  const project = allProjects.find((p) => p.id === id);

  useEffect(() => {
    if (project) pushRecent({ id: project.id, label: project.name, to: `/projects/${project.id}` });
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (id) localStorage.setItem(collapseKey(id), JSON.stringify([...collapsed]));
  }, [collapsed, id]);

  useEffect(() => {
    let revoke: string | null = null;
    if (project?.coverAttachmentId) {
      loadAttachmentBlob(project.coverAttachmentId).then((blob) => {
        if (blob) {
          const u = URL.createObjectURL(blob);
          revoke = u;
          setCoverUrl(u);
        }
      });
    } else {
      setCoverUrl(null);
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [project?.coverAttachmentId]);

  if (!project) {
    return (
      <AppShell title="Проект не найден">
        <Button variant="outline" onClick={() => navigate("/projects")}>
          <ArrowLeft /> К проектам
        </Button>
      </AppShell>
    );
  }

  const projectTasks = tasks.filter((t) => t.projectId === project.id).sort((a, b) => a.order - b.order);
  const archivedTaskCount = allTasks.filter((t) => t.projectId === project.id && t.archivedAt).length;
  const doneCount = projectTasks.filter((t) => t.done).length;
  const progress = projectTasks.length ? (doneCount / projectTasks.length) * 100 : 0;

  // Reverse backlinks: notes linked to this project, or mentioning it via [[name]].
  const pn = project.name.toLowerCase();
  const linkedNotes = notes.filter((n) => {
    if (n.linkedProjectId === project.id) return true;
    const mentions = n.body.match(/\[\[([^\]]+)\]\]/g);
    return !!mentions?.some((raw) => {
      const name = raw.slice(2, -2).trim().toLowerCase();
      return pn === name || pn.includes(name) || name.includes(pn);
    });
  });

  const sections = project.sections ?? [];
  const comments = [...(project.comments ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  function sortTasks(list: Task[]): Task[] {
    if (sortBy === "date") return [...list].sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
    if (sortBy === "priority") {
      const rank: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
      return [...list].sort((a, b) => rank[a.priority] - rank[b.priority]);
    }
    return list;
  }

  function visibleOf(list: Task[]): Task[] {
    return sortTasks(list.filter((t) => showDone || !t.done));
  }

  const groups: { name: string | null; tasks: Task[] }[] = [
    ...sections.map((s) => ({ name: s, tasks: visibleOf(projectTasks.filter((t) => t.section === s)) })),
    { name: null, tasks: visibleOf(projectTasks.filter((t) => !t.section || !sections.includes(t.section))) },
  ];

  // No manual sections → organise by time buckets («Просрочено / Сегодня / … / Позже»),
  // same language as the Tasks page. Manual sections, when present, win over time grouping.
  const useTimeGroups = sections.length === 0 && projectTasks.length > 0;
  const timeGroups = useTimeGroups ? groupTasksByTime(projectTasks.filter((t) => !t.done)) : [];
  const doneProjectTasks = useTimeGroups && showDone ? projectTasks.filter((t) => t.done) : [];

  function addProjectTask() {
    if (!newTask.trim()) return;
    // Same live parsing as the global quick-add dialog: #tags / !важно / date words. An explicit
    // date-picker pick wins over the NLP guess, same precedence as QuickAddDialog.
    const parsed = parseNaturalInput(newTask);
    const finalTitle = parsed.title.trim() || newTask.trim();
    addTask({
      title: finalTitle,
      done: false,
      projectId: project!.id,
      priority: newTaskPriority,
      dueDate: newTaskDate || parsed.dueDate,
      tags: parsed.tags,
      important: parsed.important,
      remindAt: parsed.remindAt,
      estimateMin: parsed.estimateMin,
      recurrence: parsed.recurrence,
    });
    setNewTask("");
    setNewTaskPriority(0);
    setNewTaskDate(undefined);
  }

  function addSection() {
    const n = newSection.trim();
    if (!n) return;
    addProjectSection(project!.id, n);
    setNewSection("");
  }

  function commitSectionRename() {
    if (renamingSection && sectionDraft.trim() && sectionDraft.trim() !== renamingSection) {
      renameProjectSection(project!.id, renamingSection, sectionDraft.trim());
    }
    setRenamingSection(null);
  }

  function moveSection(fromName: string, toName: string) {
    if (fromName === toName) return;
    const current = project!.sections ?? [];
    const from = current.indexOf(fromName);
    const to = current.indexOf(toName);
    if (from === -1 || to === -1) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    reorderProjectSections(project!.id, next);
  }

  function toggleCollapse(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function addComment() {
    if (!commentDraft.trim()) return;
    addProjectComment(project!.id, commentDraft.trim());
    setCommentDraft("");
  }

  function startEditComment(commentId: string, text: string) {
    setEditingComment(commentId);
    setEditCommentDraft(text);
  }
  function commitEditComment() {
    if (!editingComment || !project) return;
    const text = editCommentDraft.trim();
    if (text) {
      updateProject(project.id, {
        comments: (project.comments ?? []).map((c) => (c.id === editingComment ? { ...c, text } : c)),
      });
    }
    setEditingComment(null);
  }

  async function handleCoverUpload(file: File | null) {
    if (!file || !project) return;
    const oldId = project.coverAttachmentId;
    const attId = uid();
    await saveAttachmentBlob(attId, file);
    updateProject(project.id, { coverAttachmentId: attId });
    if (oldId) await deleteAttachmentBlob(oldId);
  }

  async function removeCover() {
    if (!project?.coverAttachmentId) return;
    await deleteAttachmentBlob(project.coverAttachmentId);
    updateProject(project.id, { coverAttachmentId: undefined });
  }

  async function handlePhotosAdd(files: File[]) {
    if (!project) return;
    const added = await saveGalleryFiles(files);
    if (added.length) updateProject(project.id, { photos: [...(project.photos ?? []), ...added] });
    if (added.length < files.length) toast(`Файл слишком большой: ${files.length - added.length}`);
  }

  async function handlePhotoRemove(id: string) {
    if (!project) return;
    await deleteGalleryFile(id);
    updateProject(project.id, { photos: (project.photos ?? []).filter((p) => p.id !== id) });
  }

  async function handleFilesAdd(fileList: FileList | null) {
    if (!fileList || !project) return;
    const files = Array.from(fileList);
    const added: Attachment[] = [];
    let rejected = 0;
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) { rejected++; continue; }
      const id = uid();
      await saveAttachmentBlob(id, file);
      added.push({ id, name: file.name, type: file.type, size: file.size, createdAt: new Date().toISOString() });
    }
    if (added.length) updateProject(project.id, { files: [...(project.files ?? []), ...added] });
    if (rejected) toast(`Файл слишком большой (>${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} МБ): ${rejected}`);
  }

  function handleDeleteTask(t: Task) {
    deleteTask(t.id);
    const run = pushUndo("Задача удалена", () => restoreTask(t));
    toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
  }

  async function handleFileRemove(att: Attachment) {
    if (!project) return;
    await deleteAttachmentBlob(att.id);
    updateProject(project.id, { files: (project.files ?? []).filter((f) => f.id !== att.id) });
  }

  function startRenameProject() {
    if (!project) return;
    setNameDraft(project.name);
    setRenamingProject(true);
  }

  function commitRenameProject() {
    if (project && nameDraft.trim()) updateProject(project.id, { name: nameDraft.trim() });
    setRenamingProject(false);
  }

  function renderTaskRow(t: Task) {
    const overdue = !t.done && isOverdue(t.dueDate);
    const doneSub = t.subtasks.filter((s) => s.done).length;
    return (
      <div
        key={t.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/x-task-id", t.id)}
        className="group flex cursor-grab items-center gap-2 rounded-md px-1 py-1 active:cursor-grabbing"
      >
        <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} label={t.title} priority={t.priority} />
        <span
          className={cn("flex-1 cursor-pointer text-sm hover:underline", t.done && "text-muted-foreground line-through")}
          onClick={() => setEditing(t)}
          title="Открыть карточку задачи"
        >
          {t.title}
        </span>
        {t.subtasks.length > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">{doneSub}/{t.subtasks.length}</span>
        )}
        <PriorityPicker p={t.priority} onChange={(p) => updateTask(t.id, { priority: p })} />
        {t.tags.map((tag) => (
          <TaskTag key={tag} tag={tag} onRemove={() => updateTask(t.id, { tags: t.tags.filter((x) => x !== tag) })} />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "rounded px-1 py-0.5 text-xs transition-colors hover:bg-secondary",
                t.dueDate ? (overdue ? "font-medium text-risk" : "text-muted-foreground") : "text-muted-foreground/50"
              )}
            >
              {t.dueDate ? dueLabel(t.dueDate) : "Срок"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => updateTask(t.id, { dueDate: addDays(new Date(), 0) })}>Срок: сегодня</DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateTask(t.id, { dueDate: addDays(new Date(), 1) })}>Срок: завтра</DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateTask(t.id, { dueDate: addDays(new Date(), 7) })}>Срок: через неделю</DropdownMenuItem>
            {t.dueDate && (
              <DropdownMenuItem onClick={() => updateTask(t.id, { dueDate: undefined })}>
                <X /> Убрать срок
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <div className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
              <p className="mb-1 px-1 text-xs text-muted-foreground">Или выбрать дату</p>
              <Calendar selected={t.dueDate} onSelect={(d) => updateTask(t.id, { dueDate: d })} />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {sections.length > 0 && (
          <Select
            value={t.section && sections.includes(t.section) ? t.section : NO_SECTION}
            onValueChange={(v) => updateTask(t.id, { section: v === NO_SECTION ? undefined : v })}
          >
            <SelectTrigger className="h-7 w-32 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SECTION}>Без секции</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <IconAction
          icon={Trash2}
          label={`Удалить задачу: ${t.title}`}
          tone="danger"
          onClick={() => handleDeleteTask(t)}
          reveal
          className="p-1"
          iconClassName="h-4 w-4"
        />
      </div>
    );
  }

  function handleDeleteProject() {
    deleteProject(project!.id);
    const run = pushUndo(`Проект удалён: ${project!.name}`, () => restoreProject(project!));
    toast("Проект удалён", { actionLabel: "Вернуть", onAction: run });
    navigate("/projects");
  }

  return (
    <AppShell
      title={
        renamingProject ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRenameProject}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRenameProject();
              if (e.key === "Escape") setRenamingProject(false);
            }}
            className="h-8 max-w-sm text-xl font-semibold"
          />
        ) : (
          <span className="cursor-pointer" onDoubleClick={startRenameProject} title="Двойной клик — переименовать">
            {project.name}
          </span>
        )
      }
      description={`${doneCount}/${projectTasks.length} задач · двойной клик по названию — переименовать`}
      actions={
        <>
          {project.archivedAt && (
            <>
              <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">В архиве</span>
              <Button variant="outline" size="sm" onClick={() => unarchiveProject(project.id)}>
                Восстановить
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
            <ArrowLeft /> <span className="hidden sm:inline">Проекты</span>
          </Button>
        </>
      }
    >
      <StaggerList className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <StaggerItem>
          <div className="flex flex-col gap-4">
            <Card className="overflow-hidden">
              <div className="group/cover relative flex h-32 items-center justify-center bg-secondary/40">
                {coverUrl ? (
                  <img src={coverUrl} alt={project.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground">Без обложки</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-visible:opacity-100">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { handleCoverUpload(e.target.files?.[0] ?? null); e.target.value = ""; }}
                  />
                  <Button size="sm" variant="outline" onClick={() => coverInputRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" /> {coverUrl ? "Заменить" : "Добавить обложку"}
                  </Button>
                  {coverUrl && (
                    <Button size="sm" variant="outline" className="text-risk hover:text-risk" onClick={removeCover}>
                      <ImageOff className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <CardContent className="flex flex-col gap-5 p-5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Статус</span>
                    <Select value={project.status} onValueChange={(v) => updateProject(project.id, { status: v as ProjectStatus })}>
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">В работе</SelectItem>
                        <SelectItem value="done">Завершён</SelectItem>
                        <SelectItem value="archived">Архив</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Badge variant="outline" className="w-fit">{statusLabel[project.status]}</Badge>
                    <PriorityPicker
                      p={project.priority ?? 0}
                      onChange={(p) => updateProject(project.id, { priority: p })}
                    />
                    <ProjectHealthBadge level={projectHealth(projectTasks)} className="ml-auto" />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Прогресс</span>
                    <span>{doneCount}/{projectTasks.length}</span>
                  </div>
                  <Progress value={progress} />
                </div>

                {linkedNotes.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <StickyNote className="h-3.5 w-3.5" /> Упоминания в заметках ({linkedNotes.length})
                    </span>
                    {linkedNotes.map((n) => (
                      <Link key={n.id} to="/notes" className="truncate rounded-md px-2 py-1 text-sm transition-colors hover:bg-secondary/50">
                        {n.title || "Без названия"}
                      </Link>
                    ))}
                  </div>
                )}

                <Button variant="ghost" size="sm" className="justify-start text-risk hover:text-risk" onClick={handleDeleteProject}>
                  <Trash2 className="h-4 w-4" /> Удалить проект
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" /> Обновления
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                    placeholder="Что нужно внести/сделать…"
                    className="h-9"
                  />
                  <Button size="icon" className="h-9 w-9 shrink-0" aria-label="Добавить обновление" onClick={addComment}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {comments.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">Пока пусто.</p>
                ) : (
                  <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                    {comments.map((c) => (
                      <div key={c.id} className="group/c rounded-md bg-secondary/50 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{formatDate(c.at)}</span>
                          <IconAction
                            icon={X}
                            label={`Удалить обновление от ${formatDate(c.at)}`}
                            tone="danger"
                            onClick={() => deleteProjectComment(project.id, c.id)}
                            className="p-0.5 opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100"
                          />
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
                          <p
                            className="cursor-pointer whitespace-pre-wrap text-sm"
                            onClick={() => startEditComment(c.id, c.text)}
                            title="Клик — редактировать"
                          >
                            {c.text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Images className="h-4 w-4" /> Фото
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PhotoGallery photos={project.photos ?? []} onAdd={handlePhotosAdd} onRemove={handlePhotoRemove} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Paperclip className="h-4 w-4" /> Файлы
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <input
                  ref={filesInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleFilesAdd(e.target.files); e.target.value = ""; }}
                />
                {(project.files ?? []).length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">Пока пусто.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {(project.files ?? []).map((f) => (
                      <AttachmentRow key={f.id} att={f} onRemove={() => handleFileRemove(f)} />
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" className="self-start gap-1.5" onClick={() => filesInputRef.current?.click()}>
                  <Plus className="h-3.5 w-3.5" /> Прикрепить файл
                </Button>
              </CardContent>
            </Card>
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckSquare className="h-4 w-4" /> Задачи проекта ({projectTasks.length})
                {archivedTaskCount > 0 && (
                  <Link to="/archive" className="text-xs font-normal text-muted-foreground/70 hover:text-foreground hover:underline">
                    +{archivedTaskCount} в архиве
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="mb-1 flex flex-col gap-2 sm:flex-row">
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addProjectTask()}
                    placeholder="Новая задача в проект…"
                    className="h-9"
                  />
                  <PriorityPicker p={newTaskPriority} onChange={setNewTaskPriority} />
                  <DropdownMenu open={dateOpen} onOpenChange={setDateOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 font-normal">
                        <CalendarClock className="h-3.5 w-3.5" /> {newTaskDate ? dueLabel(newTaskDate) : "Срок"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Calendar
                        selected={newTaskDate ?? todayStr()}
                        onSelect={(d) => { setNewTaskDate(d); setDateOpen(false); }}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="icon" className="h-9 w-9 shrink-0" aria-label="Добавить задачу" onClick={addProjectTask}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSection()}
                    placeholder="Новая секция…"
                    className="h-9 sm:w-40"
                  />
                  <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={addSection} disabled={!newSection.trim()}>
                    Секция
                  </Button>
                </div>
              </div>

              {projectTasks.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-1 h-7 w-fit gap-1.5 text-xs text-muted-foreground"
                  onClick={() => setSavingTemplate(true)}
                >
                  <Save className="h-3.5 w-3.5" /> Сохранить как шаблон
                </Button>
              )}

              <div className="mb-1 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
                  {([["manual", "Как есть"], ["date", "По дате"], ["priority", "По приоритету"]] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setSortBy(v)}
                      className={cn("rounded px-2 py-1 font-medium transition-colors", sortBy === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={() => setShowDone((v) => !v)}>
                  {showDone ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showDone ? "Скрыть выполненные" : `Показать выполненные (${doneCount})`}
                </Button>
              </div>

              {projectTasks.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Пока нет задач. Добавьте первую выше.
                </p>
              )}
              {useTimeGroups ? (
                <div className="flex flex-col gap-4">
                  {timeGroups.map((g) => (
                    <CollapsibleSection
                      key={g.key}
                      label={g.label}
                      count={g.items.length}
                      accent={g.accent}
                      collapsed={collapsed.has(g.key)}
                      onToggle={() => toggleCollapse(g.key)}
                    >
                      {g.items.map(renderTaskRow)}
                    </CollapsibleSection>
                  ))}
                  {doneProjectTasks.length > 0 && (
                    <CollapsibleSection
                      label="Завершённые"
                      count={doneProjectTasks.length}
                      accent="hsl(var(--success))"
                      collapsed={collapsed.has("__done")}
                      onToggle={() => toggleCollapse("__done")}
                    >
                      {doneProjectTasks
                        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
                        .map(renderTaskRow)}
                    </CollapsibleSection>
                  )}
                  {timeGroups.length === 0 && doneProjectTasks.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Все задачи выполнены 🎉
                    </p>
                  )}
                </div>
              ) : (
              groups.map((g) => {
                if (g.name === null && g.tasks.length === 0) return null;
                const isCollapsed = g.name !== null && collapsed.has(g.name);
                const sectionTotal = g.name !== null ? projectTasks.filter((t) => t.section === g.name).length : 0;
                const sectionDone = g.name !== null ? projectTasks.filter((t) => t.section === g.name && t.done).length : 0;
                return (
                  <div
                    key={g.name ?? "__none"}
                    className={cn(
                      "flex flex-col gap-1 rounded transition-colors",
                      dragOverSection === (g.name ?? "__none") && "bg-brand/5 ring-1 ring-inset ring-brand/40"
                    )}
                    draggable={g.name !== null}
                    onDragStart={(e) => { if (g.name) e.dataTransfer.setData("application/x-project-section", g.name); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverSection(g.name ?? "__none"); }}
                    onDragLeave={() => setDragOverSection((cur) => (cur === (g.name ?? "__none") ? null : cur))}
                    onDrop={(e) => {
                      setDragOverSection(null);
                      const sectionFrom = e.dataTransfer.getData("application/x-project-section");
                      if (sectionFrom && g.name) { moveSection(sectionFrom, g.name); return; }
                      const taskId = e.dataTransfer.getData("application/x-task-id");
                      if (taskId) updateTask(taskId, { section: g.name ?? undefined });
                    }}
                  >
                    {g.name !== null && (
                      <div className="group/sec mt-1 flex items-center gap-2 border-t border-border pt-2 text-xs font-medium text-muted-foreground">
                        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/40" />
                        <button onClick={() => toggleCollapse(g.name!)} className="shrink-0">
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {renamingSection === g.name ? (
                          <input
                            autoFocus
                            value={sectionDraft}
                            onChange={(e) => setSectionDraft(e.target.value)}
                            onBlur={commitSectionRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitSectionRename();
                              if (e.key === "Escape") setRenamingSection(null);
                            }}
                            className="min-w-0 flex-1 rounded border border-brand bg-transparent px-1 py-0.5 text-sm font-semibold outline-none"
                          />
                        ) : (
                          <span
                            className="flex-1 truncate text-sm font-semibold text-foreground"
                            onDoubleClick={() => { setRenamingSection(g.name); setSectionDraft(g.name!); }}
                            title="Двойной клик — переименовать"
                          >
                            {g.name}
                          </span>
                        )}
                        <span className="w-16 shrink-0"><Progress value={sectionTotal ? (sectionDone / sectionTotal) * 100 : 0} className="h-1.5" /></span>
                        <span className="shrink-0 tabular-nums">{sectionDone}/{sectionTotal}</span>
                        <IconAction
                          icon={X}
                          label={`Удалить секцию «${g.name}» (задачи останутся)`}
                          tone="danger"
                          onClick={() => deleteProjectSection(project!.id, g.name!)}
                          className="p-0.5 opacity-0 group-hover/sec:opacity-100 focus-visible:opacity-100"
                        />
                      </div>
                    )}
                    {!isCollapsed && (
                      g.tasks.length === 0 ? (
                        <p className="px-1 py-1 text-xs text-muted-foreground/60">
                          {g.name !== null ? "Перетащите сюда задачу или выберите секцию у неё в карточке" : "Пусто"}
                        </p>
                      ) : (
                        g.tasks.map(renderTaskRow)
                      )
                    )}
                  </div>
                );
              })
              )}
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerList>

      <PromptDialog
        open={savingTemplate}
        onOpenChange={setSavingTemplate}
        title="Название шаблона"
        defaultValue={project.name}
        onSubmit={(name) => {
          addProjectTemplate(
            name,
            sections,
            projectTasks.map((t) => ({ title: t.title, section: t.section }))
          );
          toast(`Шаблон «${name}» сохранён`);
        }}
      />

      <TaskEditDialog task={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />
    </AppShell>
  );
}
