import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, Reorder } from "framer-motion";
import { Pencil, Trash2, StickyNote, User, FolderKanban, Pin, Search, ListPlus, Archive } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/EmptyState";
import { TaskTag } from "@/components/TaskTag";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { pushRecent } from "@/lib/recent";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { tagColor } from "@/lib/tags";
import type { Note } from "@/types";

const NONE = "none";

/** Cards show a plain-text preview, not the full rendered markdown — keeps the grid scannable. */
function plainSubtitle(body: string): string {
  const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.replace(/^#+\s*/, "").replace(/^[-*]\s*(\[.\]\s*)?/, "").slice(0, 140);
}

export default function Notes() {
  const { notes, allNotes, projects, allProjects, addNote, updateNote, reorderNotes, toggleNotePin, deleteNote, restoreNote, addTask, archiveNote, unarchiveNote } = useData();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  function extractTasks(note: Note) {
    const lines = note.body.split("\n");
    const titles = lines
      .map((l) => l.match(/^\s*-\s\[ \]\s(.+)$/))
      .filter(Boolean)
      .map((m) => m![1].trim());
    if (titles.length === 0) return;
    titles.forEach((title) => addTask({ title, done: false, projectId: note.linkedProjectId }));
    toast(`Создано задач: ${titles.length}`);
  }
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [projectId, setProjectId] = useState<string>(NONE);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>(NONE);
  const [sortBy, setSortBy] = useState<"pinned" | "newest" | "oldest" | "title">("pinned");

  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((n) => n.tags))).sort(), [notes]);

  const q = query.trim().toLowerCase();
  const visibleNotes = useMemo(() => {
    return notes
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .filter((n) => !activeTag || n.tags.includes(activeTag))
      .filter((n) => projectFilter === NONE || n.linkedProjectId === projectFilter)
      .sort((a, b) => {
        // Pinned notes always float first (Keep/Apple Notes behaviour), then the chosen
        // secondary sort applies within each group — so switching to «Новые» no longer sinks pins.
        if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
        // Pinned + "Закреп." mode = the user's own drag order wins.
        if (a.pinned && sortBy === "pinned") {
          const oa = a.order ?? Number.MAX_SAFE_INTEGER;
          const ob = b.order ?? Number.MAX_SAFE_INTEGER;
          if (oa !== ob) return oa - ob;
        }
        if (sortBy === "oldest") return a.createdAt.localeCompare(b.createdAt);
        if (sortBy === "title") return a.title.localeCompare(b.title);
        return b.createdAt.localeCompare(a.createdAt); // "pinned" & "newest" → newest first
      });
  }, [notes, q, activeTag, projectFilter, sortBy]);

  const pinnedNotes = visibleNotes.filter((n) => n.pinned);
  const restNotes = visibleNotes.filter((n) => !n.pinned);
  // Drag-to-reorder is only meaningful when nothing else is imposing an order.
  const canReorderPins = sortBy === "pinned" && !q && !activeTag && projectFilter === NONE;

  function openCreate() {
    setEditing(null);
    setTitle("");
    setBody("");
    setTags("");
    setProjectId(NONE);
    setOpen(true);
  }

  function openEdit(note: Note) {
    setEditing(note);
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags.join(", "));
    setProjectId(note.linkedProjectId ?? NONE);
    setOpen(true);
    pushRecent({ id: note.id, label: note.title || "Без названия", to: "/notes", state: { openNoteId: note.id } });
  }

  // Deep-link: CommandPalette sends { openNoteId } instead of dumping the user on the general
  // list — open that note once, then clear the state so back/forward doesn't re-fire it.
  useEffect(() => {
    const openId = (location.state as { openNoteId?: string } | null)?.openNoteId;
    if (!openId) return;
    const target = allNotes.find((n) => n.id === openId);
    if (target) openEdit(target);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function submit() {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      body: body.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      linkedProjectId: projectId === NONE ? undefined : projectId,
    };
    if (editing) updateNote(editing.id, payload);
    else addNote({ ...payload, pinned: false });
    setOpen(false);
  }

  function handleDelete(note: Note) {
    deleteNote(note.id);
    const run = pushUndo("Заметка удалена", () => restoreNote(note));
    toast("Заметка удалена", { actionLabel: "Вернуть", onAction: run });
  }

  function renderNote(note: Note) {
    // allProjects — an archived project shouldn't make the note's project badge/link vanish.
    const project = allProjects.find((p) => p.id === note.linkedProjectId);
    return (
      <StaggerItem key={note.id}>
        <motion.div whileHover={{ y: -3 }} transition={spring}>
          <Card
            onClick={() => openEdit(note)}
            className={cn("group flex h-full cursor-pointer flex-col transition-colors hover:border-muted-foreground/30", note.pinned && "border-amber-500/30")}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base">
                {note.title}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(note.pinned ? "text-amber-400" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                  onClick={(e) => { e.stopPropagation(); toggleNotePin(note.id); }}
                  title={note.pinned ? "Открепить" : "Закрепить"}
                  aria-label={note.pinned ? "Открепить заметку" : "Закрепить заметку"}
                  aria-pressed={note.pinned}
                >
                  <Pin className={cn("h-4 w-4", note.pinned && "fill-amber-400")} />
                </Button>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                  {/^\s*-\s\[ \]\s/m.test(note.body) && (
                    <Button variant="ghost" size="icon" title="Пункты → задачи" aria-label="Создать задачи из пунктов" onClick={(e) => { e.stopPropagation(); extractTasks(note); }}>
                      <ListPlus className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" title="Редактировать" aria-label="Редактировать заметку" onClick={(e) => { e.stopPropagation(); openEdit(note); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="В архив"
                    aria-label="В архив"
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveNote(note.id);
                      const run = pushUndo("Заметка в архиве", () => unarchiveNote(note.id));
                      toast("Заметка в архиве", { actionLabel: "Вернуть", onAction: run });
                    }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Удалить" aria-label={`Удалить заметку: ${note.title}`} onClick={(e) => { e.stopPropagation(); handleDelete(note); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              {plainSubtitle(note.body) && (
                <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{plainSubtitle(note.body)}</p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {note.tags.map((t) => (
                  <TaskTag key={t} tag={t} onRemove={() => updateNote(note.id, { tags: note.tags.filter((x) => x !== t) })} />
                ))}
                {project && (
                  <Link
                    to={`/projects/${project.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <FolderKanban className="h-3 w-3" /> {project.name}
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </StaggerItem>
    );
  }

  return (
    <AppShell
      title="Заметки"
      description="Свободные заметки — можно привязать к клиенту или проекту"
      actions={
        <Button variant="secondary" size="sm" onClick={openCreate}>
          Новая заметка
        </Button>
      }
    >
      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="Заметок пока нет"
          description="Держите здесь мысли, идеи и черновики. Заметку можно связать с клиентом или проектом — и открывать одним кликом."
          actionLabel="Добавить заметку"
          onAction={openCreate}
          shortcut="Q"
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по заметкам…" className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {allTags.map((tag) => (
                    <FilterChip
                      key={tag}
                      active={tag === activeTag}
                      activeClassName={tagColor(tag)}
                      onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                    >
                      #{tag}
                    </FilterChip>
                  ))}
                </div>
              )}
              {projects.length > 0 && (
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue placeholder="Все проекты" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Все проекты</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Segmented
                ariaLabel="Сортировка заметок"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "pinned", label: "Закреп.", title: "Закреплённые первыми" },
                  { value: "newest", label: "Новые" },
                  { value: "oldest", label: "Старые" },
                  { value: "title", label: "А-Я" },
                ]}
              />
            </div>
          </div>
          {visibleNotes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Ничего не найдено.
            </div>
          ) : pinnedNotes.length > 0 && restNotes.length > 0 ? (
            <div className="flex flex-col gap-6">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Pin className="h-3 w-3 fill-amber-400 text-amber-400" /> Закреплённые
                  {canReorderPins && pinnedNotes.length > 1 && (
                    <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                      · перетащите, чтобы задать порядок
                    </span>
                  )}
                </p>
                {canReorderPins && pinnedNotes.length > 1 ? (
                  <Reorder.Group
                    axis="y"
                    values={pinnedNotes}
                    onReorder={(next) => reorderNotes(next.map((n) => n.id))}
                    className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {pinnedNotes.map((note) => (
                      <Reorder.Item key={note.id} value={note} className="list-none">
                        {renderNote(note)}
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                ) : (
                  <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {pinnedNotes.map(renderNote)}
                  </StaggerList>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Остальные</p>
                <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {restNotes.map(renderNote)}
                </StaggerList>
              </div>
            </div>
          ) : (
            <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleNotes.map(renderNote)}
            </StaggerList>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Заметка" : "Новая заметка"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="n-title">Заголовок *</Label>
              <Input id="n-title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="n-body">Текст · ⌘/Ctrl+Enter — сохранить</Label>
              <Textarea
                id="n-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
                placeholder={"Поддерживается Markdown:\n# Заголовок\n- пункт\n- [ ] задача\n**жирный**, *курсив*, `код`, [ссылка](https://…)"}
              />
              <p className="text-xs text-muted-foreground">
                Markdown: # заголовки · - списки · - [ ] чекбоксы · **жирный** · *курсив* · `код` · [ссылка](url) · [[проект]] связь
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="n-tags">Теги (через запятую)</Label>
              <Input id="n-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="идеи, работа" />
            </div>
            <div className="grid gap-1.5">
              <Label>Проект</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Не связано</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={submit}>{editing ? "Сохранить" : "Добавить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
