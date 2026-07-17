import { useState } from "react";
import { Archive as ArchiveIcon, RotateCcw, Trash2, CheckSquare, FolderKanban, StickyNote, Search } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatDate } from "@/lib/format";

interface ArchiveRow {
  id: string;
  title: string;
  meta?: string;
  onRestore: () => void;
  onDelete: () => void;
}

function Section({
  icon: Icon,
  title,
  rows,
}: {
  icon: typeof CheckSquare;
  title: string;
  rows: ArchiveRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <StaggerItem>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-4 w-4" /> {title}
            <span className="ml-1 rounded-full bg-secondary px-2 text-xs tabular-nums">{rows.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {rows.map((row) => (
            <div key={row.id} className="group flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-secondary/40">
              <span className="flex-1 truncate text-sm">{row.title}</span>
              {row.meta && <span className="hidden text-xs text-muted-foreground sm:inline">{row.meta}</span>}
              <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={row.onRestore}>
                <RotateCcw className="h-3.5 w-3.5" /> Вернуть
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-risk" onClick={row.onDelete} title="Удалить навсегда">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </StaggerItem>
  );
}

export default function Archive() {
  const {
    archivedTasks, archivedProjects, archivedNotes,
    unarchiveTask, deleteTask, restoreTask,
    unarchiveProject, deleteProject, restoreProject,
    unarchiveNote, deleteNote, restoreNote,
  } = useData();
  const { toast } = useToast();
  const [query, setQuery] = useState("");

  const total = archivedTasks.length + archivedProjects.length + archivedNotes.length;
  const q = query.trim().toLowerCase();
  const matches = (title: string) => !q || title.toLowerCase().includes(q);

  const taskRows: ArchiveRow[] = archivedTasks.filter((t) => matches(t.title)).map((t) => ({
    id: t.id,
    title: t.title,
    meta: t.archivedAt ? `в архиве с ${formatDate(t.archivedAt)}` : undefined,
    onRestore: () => { unarchiveTask(t.id); toast("Задача возвращена"); },
    onDelete: () => { deleteTask(t.id); toast("Удалено навсегда", { actionLabel: "Вернуть", onAction: () => restoreTask(t) }); },
  }));

  const projectRows: ArchiveRow[] = archivedProjects.filter((p) => matches(p.name)).map((p) => ({
    id: p.id,
    title: p.name,
    meta: p.archivedAt ? `в архиве с ${formatDate(p.archivedAt)}` : undefined,
    onRestore: () => { unarchiveProject(p.id); toast("Проект возвращён"); },
    onDelete: () => { deleteProject(p.id); toast("Удалено навсегда", { actionLabel: "Вернуть", onAction: () => restoreProject(p) }); },
  }));

  const noteRows: ArchiveRow[] = archivedNotes.filter((n) => matches(n.title || "Без названия")).map((n) => ({
    id: n.id,
    title: n.title || "Без названия",
    meta: n.archivedAt ? `в архиве с ${formatDate(n.archivedAt)}` : undefined,
    onRestore: () => { unarchiveNote(n.id); toast("Заметка возвращена"); },
    onDelete: () => { deleteNote(n.id); toast("Удалено навсегда", { actionLabel: "Вернуть", onAction: () => restoreNote(n) }); },
  }));

  const visibleTotal = taskRows.length + projectRows.length + noteRows.length;

  return (
    <AppShell title="Архив" description="Скрытые задачи, проекты и заметки — верните или удалите навсегда">
      {total === 0 ? (
        <EmptyState
          icon={ArchiveIcon}
          title="Архив пуст"
          description="Архивируйте завершённые задачи или неактуальные проекты — они спрячутся из списков, но останутся здесь."
        />
      ) : (
        <div className="flex max-w-3xl flex-col gap-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по архиву…" className="pl-9" />
          </div>
          {visibleTotal === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Ничего не найдено.
            </div>
          ) : (
            <StaggerList className="flex flex-col gap-4">
              <Section icon={CheckSquare} title="Задачи" rows={taskRows} />
              <Section icon={FolderKanban} title="Проекты" rows={projectRows} />
              <Section icon={StickyNote} title="Заметки" rows={noteRows} />
            </StaggerList>
          )}
        </div>
      )}
    </AppShell>
  );
}
