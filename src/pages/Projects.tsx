import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FolderKanban, Archive, User } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/store/ToastProvider";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { IconAction } from "@/components/ui/icon-action";
import { EmptyState } from "@/components/EmptyState";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useData } from "@/store/DataProvider";
import { PriorityPicker } from "@/components/PriorityPicker";
import { ProjectHealthBadge } from "@/components/ProjectHealthBadge";
import { projectHealth, type HealthLevel } from "@/lib/projectHealth";
import { formatDuration, isOverdue } from "@/lib/format";
import { loadAttachmentBlob } from "@/lib/attachments";
import { spring } from "@/lib/motion";
import type { ProjectStatus, Priority } from "@/types";

const statusLabel: Record<ProjectStatus, string> = {
  active: "В работе",
  done: "Завершён",
  archived: "Архив",
};

type StatusFilter = "all" | ProjectStatus;
type SortMode = "manual" | "name" | "progress" | "tasks" | "health";
const NO_TEMPLATE = "none";

/** Worst-first: slipping projects float to the top when sorting by health. */
const HEALTH_RANK: Record<HealthLevel, number> = {
  "off-track": 0, "at-risk": 1, "on-track": 2, "done": 3, "empty": 4,
};

/** Full-bleed cover — the card's main visual anchor, not a tiny icon next to the title. */
function ProjectCover({ attachmentId, name }: { attachmentId?: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    if (attachmentId) {
      loadAttachmentBlob(attachmentId).then((blob) => {
        if (blob) {
          const u = URL.createObjectURL(blob);
          revoke = u;
          setUrl(u);
        }
      });
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [attachmentId]);

  if (url) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-t-lg bg-secondary/40">
        <img src={url} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }
  // No cover — a subtle branded monogram reads as intentional, not an empty grey box.
  const initial = name.trim().slice(0, 1).toUpperCase() || "•";
  return (
    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-t-lg bg-gradient-to-br from-brand/15 via-secondary/25 to-background">
      <span className="select-none text-4xl font-bold text-foreground/15">{initial}</span>
    </div>
  );
}

export default function Projects() {
  const { projects, tasks, clients, settings, addProject, updateProject, createProjectFromTemplate, archiveProject, unarchiveProject } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [priority, setPriority] = useState<Priority>(0);
  const [clientId, setClientId] = useState<string>(NO_TEMPLATE);
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortMode>("manual");

  function submit() {
    if (!name.trim()) return;
    if (templateId !== NO_TEMPLATE) {
      createProjectFromTemplate(name.trim(), templateId);
    } else {
      addProject({ name: name.trim(), status, priority, clientId: clientId === NO_TEMPLATE ? undefined : clientId });
    }
    setName("");
    setStatus("active");
    setPriority(0);
    setClientId(NO_TEMPLATE);
    setTemplateId(NO_TEMPLATE);
    setOpen(false);
  }

  const visibleProjects = useMemo(() => {
    const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);
    if (sortBy === "manual") return filtered;
    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const ta = tasks.filter((t) => t.projectId === a.id);
      const tb = tasks.filter((t) => t.projectId === b.id);
      if (sortBy === "tasks") return tb.length - ta.length;
      if (sortBy === "health") return HEALTH_RANK[projectHealth(ta)] - HEALTH_RANK[projectHealth(tb)];
      // progress — most complete first
      const pa = ta.length ? ta.filter((t) => t.done).length / ta.length : 0;
      const pb = tb.length ? tb.filter((t) => t.done).length / tb.length : 0;
      return pb - pa;
    });
  }, [projects, tasks, filter, sortBy]);

  return (
    <AppShell
      title="Проекты"
      description="Задачи, сгруппированные по направлению работы"
      actions={
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Новый проект
        </Button>
      }
    >
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Пока нет проектов"
          description="Проект группирует задачи по направлению работы. Создайте первый и наполните его задачами."
          actionLabel="Добавить проект"
          onAction={() => setOpen(true)}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <Segmented
              ariaLabel="Фильтр по статусу"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Все" },
                { value: "active", label: "В работе" },
                { value: "done", label: "Завершён" },
                { value: "archived", label: "Архив" },
              ]}
            />
            <Segmented
              ariaLabel="Сортировка проектов"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "manual", label: "Как есть", title: "Порядок как есть" },
                { value: "health", label: "Состояние", title: "Сортировать по состоянию: сорвано → на треке" },
                { value: "name", label: "Имя", title: "Сортировать по имени" },
                { value: "progress", label: "Прогресс", title: "Сортировать по прогрессу" },
                { value: "tasks", label: "Кол-во", title: "Сортировать по количеству задач" },
              ]}
            />
          </div>
          {visibleProjects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Нет проектов с таким статусом.
              <Button variant="outline" size="sm" onClick={() => setFilter("all")}>Показать все</Button>
            </div>
          ) : (
        <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleProjects.map((project) => {
            const projectTasks = tasks.filter((t) => t.projectId === project.id);
            const doneCount = projectTasks.filter((t) => t.done).length;
            const progress = projectTasks.length ? (doneCount / projectTasks.length) * 100 : 0;
            const estimateMin = projectTasks.filter((t) => !t.done).reduce((s, t) => s + (t.estimateMin ?? 0), 0);
            const health = projectHealth(projectTasks);
            const overdue = projectTasks.filter((t) => !t.done && isOverdue(t.dueDate)).length;
            const client = project.clientId ? clients.find((c) => c.id === project.clientId) : undefined;
            return (
              <StaggerItem key={project.id}>
                <motion.div whileHover={{ y: -3 }} transition={spring}>
                  <Card
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="h-full cursor-pointer overflow-hidden transition-colors hover:border-muted-foreground/30"
                  >
                    <div className="group/cover relative">
                      <ProjectCover attachmentId={project.coverAttachmentId} name={project.name} />
                      <IconAction
                        icon={Archive}
                        label={`В архив: ${project.name}`}
                        tone="danger"
                        onClick={() => {
                          archiveProject(project.id);
                          toast("Проект в архиве", { actionLabel: "Вернуть", onAction: () => unarchiveProject(project.id) });
                        }}
                        className="absolute right-2 top-2 h-7 w-7 rounded-full bg-background/80 p-0 opacity-0 backdrop-blur group-hover/cover:opacity-100 focus-visible:opacity-100"
                      />
                    </div>
                    <div className="flex flex-col gap-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="min-w-0 truncate text-base leading-snug">{project.name}</CardTitle>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <PriorityPicker
                            p={project.priority ?? 0}
                            onChange={(p) => updateProject(project.id, { priority: p })}
                          />
                          <Badge variant="outline">{statusLabel[project.status]}</Badge>
                        </span>
                      </div>
                      {client && (
                        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <User className="h-3 w-3 shrink-0" /> {client.name}
                        </span>
                      )}
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>{doneCount}/{projectTasks.length} задач</span>
                            <ProjectHealthBadge level={health} />
                            {overdue > 0 && <span className="font-medium text-risk">{overdue} просроч.</span>}
                          </span>
                          {estimateMin > 0 && <span className="shrink-0">≈ {formatDuration(estimateMin)}</span>}
                        </div>
                        <Progress value={progress} />
                      </div>
                    </div>
                  </Card>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerList>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый проект</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="p-name">Название *</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Статус</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)} disabled={templateId !== NO_TEMPLATE}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">В работе</SelectItem>
                    <SelectItem value="done">Завершён</SelectItem>
                    <SelectItem value="archived">Архив</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {templateId === NO_TEMPLATE && (
                <div className="grid gap-1.5">
                  <Label>Приоритет</Label>
                  <div className="flex h-10 items-center">
                    <PriorityPicker p={priority} onChange={setPriority} />
                  </div>
                </div>
              )}
            </div>
            {clients.length > 0 && templateId === NO_TEMPLATE && (
              <div className="grid gap-1.5">
                <Label>Клиент</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Без клиента" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>Без клиента</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {settings.projectTemplates.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Шаблон</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>Без шаблона</SelectItem>
                    {settings.projectTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} · {t.tasks.length} задач</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templateId !== NO_TEMPLATE && (
                  <p className="text-xs text-muted-foreground">Секции и задачи шаблона будут добавлены сразу, статус — «В работе».</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={submit}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
