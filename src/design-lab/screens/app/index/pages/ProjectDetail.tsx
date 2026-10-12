/**
 * «Индекс» · Проект — the site's «case» layout: huge title, KV table (клиент · статус · здоровье ·
 * прогресс · время · приоритет) beside a dithered cover, then the project's tasks grouped by
 * section (working checks, drag, add-into-section) with the journal in the fourth column.
 * Secondary things — rename, cover, archive, delete — live behind «⋯». One lime: «Новая задача».
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatDate, formatDuration } from "@/lib/format";
import { groupTasksByTime } from "@/lib/taskGrouping";
import { pushRecent } from "@/lib/recent";
import { pushUndo } from "@/lib/undoStack";
import { parseNaturalInput } from "@/lib/nlp";
import { uid } from "@/lib/id";
import { saveAttachmentBlob, deleteAttachmentBlob } from "@/lib/attachments";
import { PRIORITY_META, type Priority, type ProjectStatus, type Task } from "@/types";
import { DragRowsContext, DropZone, DragHandle } from "@/components/dnd/DragRows";
import {
  B,
  T,
  tab,
  display,
  hashSeed,
  Page,
  PageHeader,
  SectionHead,
  KV,
  Line,
  Button,
  Hook,
  Dither,
  plural,
} from "@/design-lab/screens/_kit/index";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  projectNumbers,
  healthLabel,
  healthTone,
  useAttachmentUrl,
  Menu,
  DotsButton,
  PriorityPick,
  TextSeg,
  ValueButton,
  PH,
  type MenuItem,
} from "./Projects.parts";
import { TaskRow, AddRow, DueMenu, Chevron, Grip } from "./ProjectDetail.parts";
import { useTaskPanel } from "@/design-lab/screens/_kit/index-ui";

type SortMode = "manual" | "date" | "priority";
const RANK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };

const collapseKey = (id: string) => `crm-project-collapsed-${id}`;
function loadCollapsed(id: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(collapseKey(id)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    allProjects,
    projects,
    tasks,
    allTasks,
    notes,
    clients,
    updateProject,
    deleteProject,
    restoreProject,
    archiveProject,
    unarchiveProject,
    addProjectSection,
    deleteProjectSection,
    renameProjectSection,
    reorderProjectSections,
    addProjectComment,
    deleteProjectComment,
    addTask,
    updateTask,
    reorderTasks,
  } = useData();

  const project = allProjects.find((p) => p.id === id);
  const coverUrl = useAttachmentUrl(project?.coverAttachmentId);
  const coverInput = useRef<HTMLInputElement>(null);

  const [sortBy, setSortBy] = useState<SortMode>("manual");
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => (id ? loadCollapsed(id) : new Set()));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const card = useTaskPanel();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>(0);
  const [newDate, setNewDate] = useState<string | undefined>();
  const [newTask, setNewTask] = useState("");
  const [comment, setComment] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  useEffect(() => {
    if (project) pushRecent({ id: project.id, label: project.name, to: `/projects/${project.id}` });
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (id) setCollapsed(loadCollapsed(id));
  }, [id]);
  useEffect(() => {
    if (id) localStorage.setItem(collapseKey(id), JSON.stringify([...collapsed]));
  }, [collapsed, id]);

  if (!project) {
    return (
      <Page>
        <PageHeader
          title="Проект не найден"
          deck="Возможно, он удалён или ссылка устарела."
          graphic="ridge"
          seed={3}
          actions={
            <Button variant="outline" onClick={() => navigate("/projects")}>
              К проектам
            </Button>
          }
        />
      </Page>
    );
  }
  const p = project;

  const projectTasks = tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.order - b.order);
  const archivedTaskCount = allTasks.filter((t) => t.projectId === p.id && t.archivedAt).length;
  const n = projectNumbers(projectTasks);
  const client = p.clientId ? clients.find((c) => c.id === p.clientId) : undefined;
  const sections = p.sections ?? [];
  const comments = [...(p.comments ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const index = projects.findIndex((x) => x.id === p.id);

  const pn = p.name.toLowerCase();
  const linkedNotes = notes.filter((note) => {
    if (note.linkedProjectId === p.id) return true;
    const mentions = note.body.match(/\[\[([^\]]+)\]\]/g);
    return !!mentions?.some((raw) => {
      const name = raw.slice(2, -2).trim().toLowerCase();
      return pn === name || pn.includes(name) || name.includes(pn);
    });
  });

  /* ── data shaping (same rules as the real page) ── */
  const sortTasks = (list: Task[]) => {
    if (sortBy === "date") return [...list].sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
    if (sortBy === "priority") return [...list].sort((a, b) => RANK[a.priority] - RANK[b.priority]);
    return list;
  };
  const visibleOf = (list: Task[]) => sortTasks(list.filter((t) => showDone || !t.done));
  const groups = [
    ...sections.map((s) => ({ name: s as string | null, tasks: visibleOf(projectTasks.filter((t) => t.section === s)) })),
    { name: null as string | null, tasks: visibleOf(projectTasks.filter((t) => !t.section || !sections.includes(t.section))) },
  ];
  const useTimeGroups = sections.length === 0 && projectTasks.length > 0;
  const timeGroups = useTimeGroups ? groupTasksByTime(projectTasks.filter((t) => !t.done)) : [];
  const doneTasks = useTimeGroups && showDone ? projectTasks.filter((t) => t.done).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")) : [];

  /* ── actions ── */
  function addParsed(raw: string, section?: string, priority: Priority = 0, date?: string) {
    const parsed = parseNaturalInput(raw);
    addTask({
      title: parsed.title.trim() || raw.trim(),
      done: false,
      projectId: p.id,
      section: section || undefined,
      priority,
      dueDate: date || parsed.dueDate,
      tags: parsed.tags,
      important: parsed.important,
      remindAt: parsed.remindAt,
      estimateMin: parsed.estimateMin,
      recurrence: parsed.recurrence,
    });
  }
  function submitNewTask() {
    if (!newTask.trim()) return;
    addParsed(newTask, undefined, newPriority, newDate);
    setNewTask("");
    setNewPriority(0);
    setNewDate(undefined);
  }
  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleExpanded(taskId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }
  function moveTaskBefore(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const order = [...tasks].sort((a, b) => a.order - b.order);
    const dragged = order.find((t) => t.id === draggedId);
    const target = order.find((t) => t.id === targetId);
    if (!dragged || !target) return;
    const without = order.filter((t) => t.id !== draggedId);
    without.splice(without.findIndex((t) => t.id === targetId), 0, dragged);
    reorderTasks(without.map((t) => t.id));
    if ((dragged.section ?? "") !== (target.section ?? "")) updateTask(draggedId, { section: target.section });
  }
  function moveSection(from: string, to: string) {
    if (from === to) return;
    const next = [...sections];
    const a = next.indexOf(from);
    const b = next.indexOf(to);
    if (a === -1 || b === -1) return;
    const [m] = next.splice(a, 1);
    next.splice(b, 0, m);
    reorderProjectSections(p.id, next);
  }
  function onRowsDrop(a: { id: string; type: string; name?: unknown }, o: { id: string; type: string; name?: unknown }) {
    if (a.type === "section" && o.type === "section") {
      if (typeof a.name === "string" && typeof o.name === "string") moveSection(a.name, o.name);
      return;
    }
    if (a.type !== "task") return;
    if (o.type === "task") {
      if (sortBy !== "manual") {
        setSortBy("manual");
        toast("Сортировка: «Как есть» — чтобы сохранить ваш порядок");
      }
      moveTaskBefore(a.id, o.id);
      return;
    }
    if (o.type === "section") updateTask(a.id, { section: typeof o.name === "string" ? o.name : undefined });
  }
  function commitSectionRename() {
    if (renamingSection && sectionDraft.trim() && sectionDraft.trim() !== renamingSection) renameProjectSection(p.id, renamingSection, sectionDraft.trim());
    setRenamingSection(null);
  }
  function commitRename() {
    if (nameDraft.trim()) updateProject(p.id, { name: nameDraft.trim() });
    setRenaming(false);
  }
  function startRename() {
    setNameDraft(p.name);
    setRenaming(true);
  }
  function addComment() {
    if (!comment.trim()) return;
    addProjectComment(p.id, comment.trim());
    setComment("");
  }
  function commitComment() {
    if (editingComment && commentDraft.trim()) {
      updateProject(p.id, { comments: (p.comments ?? []).map((c) => (c.id === editingComment ? { ...c, text: commentDraft.trim() } : c)) });
    }
    setEditingComment(null);
  }
  async function uploadCover(file: File | null) {
    if (!file) return;
    const old = p.coverAttachmentId;
    const attId = uid();
    await saveAttachmentBlob(attId, file);
    updateProject(p.id, { coverAttachmentId: attId });
    if (old) await deleteAttachmentBlob(old);
  }
  async function removeCover() {
    if (!p.coverAttachmentId) return;
    await deleteAttachmentBlob(p.coverAttachmentId);
    updateProject(p.id, { coverAttachmentId: undefined });
  }
  function removeProject() {
    deleteProject(p.id);
    const run = pushUndo(`Проект удалён: ${p.name}`, () => restoreProject(p));
    toast("Проект удалён", { actionLabel: "Вернуть", onAction: run });
    navigate("/projects");
  }

  const projectMenu: MenuItem[] = [
    { label: "Переименовать", onSelect: startRename },
    { label: coverUrl || p.coverAttachmentId ? "Заменить обложку" : "Загрузить обложку", onSelect: () => coverInput.current?.click() },
    ...(p.coverAttachmentId ? [{ label: "Убрать обложку", onSelect: () => void removeCover() }] : []),
    { kind: "sep" },
    p.archivedAt
      ? { label: "Вернуть из архива", onSelect: () => unarchiveProject(p.id) }
      : {
          label: "В архив",
          onSelect: () => {
            archiveProject(p.id);
            toast("Проект в архиве", { actionLabel: "Вернуть", onAction: () => unarchiveProject(p.id) });
          },
        },
    { label: "Удалить проект", danger: true, onSelect: removeProject },
  ];

  const otherProjects = allProjects.filter((x) => !x.archivedAt);
  const row = (t: Task) => (
    <TaskRow
      key={t.id}
      t={t}
      sections={sections}
      projects={otherProjects}
      currentProjectId={p.id}
      expanded={expanded.has(t.id)}
      onToggleExpand={() => toggleExpanded(t.id)}
      onOpen={() => card.open(t.id)}
    />
  );

  return (
    <Page>
      <PageHeader
        title={
          renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              aria-label="Название проекта"
              className="w-full min-w-[320px] bg-transparent outline-none"
              style={{ ...display(80), color: B.text, borderBottom: `1px solid ${B.l20}` }}
            />
          ) : (
            <span onDoubleClick={startRename} title="Двойной клик — переименовать" className="cursor-text">
              {p.name}
            </span>
          )
        }
        deck={
          <>
            {p.archivedAt ? <span style={{ color: B.text3 }}>В архиве. </span> : null}
            {n.total ? (
              <>
                Закрыто {n.done} из {n.total} {plural(n.total, "задачи", "задач", "задач")}
                {n.overdue ? <>, {n.overdue} с просрочкой</> : null}.
              </>
            ) : (
              "Пока без задач — добавьте первую."
            )}
          </>
        }
        graphic="ridge"
        seed={hashSeed(p.id) % 97}
        size={80}
        actions={
          <>
            <Link
              to="/projects"
              className="mr-2 flex h-12 items-center px-1 outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
              style={{ ...T.body, color: B.text2 }}
            >
              ← Все проекты
            </Link>
            {p.archivedAt && (
              <Button variant="outline" hook={false} onClick={() => unarchiveProject(p.id)}>
                Восстановить
              </Button>
            )}
            <Menu label="Действия с проектом" items={projectMenu} trigger={({ toggle, open }) => <DotsButton label="Действия с проектом" onClick={toggle} open={open} size={48} outline />} />
            <Button size="lg" onClick={() => document.getElementById("pd-add")?.focus()}>
              Новая задача
            </Button>
          </>
        }
      />
      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void uploadCover(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {/* ── Case: KV table · cover ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-x-5" style={{ borderTop: `1px solid ${B.l10}` }}>
        <div className="col-span-2 min-w-0 pr-5 pt-2">
          <KV
            k="Клиент"
            v={
              <Menu
                width={240}
                items={[
                  ...(client ? ([{ label: "Открыть клиентов", onSelect: () => navigate("/clients") }, { kind: "sep" }] as MenuItem[]) : []),
                  { label: "Без клиента", active: !client, onSelect: () => updateProject(p.id, { clientId: undefined }) },
                  ...clients.map((c) => ({ label: c.name, active: c.id === p.clientId, hint: c.id === p.clientId ? "✓" : undefined, onSelect: () => updateProject(p.id, { clientId: c.id }) })),
                ]}
                trigger={({ toggle, open }) => (
                  <ValueButton onClick={toggle} open={open} muted={!client}>
                    {client?.name ?? "Без клиента"}
                  </ValueButton>
                )}
              />
            }
          />
          <KV
            k="Статус"
            v={
              <Menu
                width={200}
                items={STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], active: p.status === s, hint: p.status === s ? "✓" : undefined, onSelect: () => updateProject(p.id, { status: s as ProjectStatus }) }))}
                trigger={({ toggle, open }) => (
                  <ValueButton onClick={toggle} open={open}>
                    {STATUS_LABEL[p.status]}
                  </ValueButton>
                )}
              />
            }
          />
          <KV
            k="Здоровье"
            v={
              <span style={{ color: healthTone(n.health) }}>
                {healthLabel(n.health)}
                {n.overdue ? <span style={{ color: B.text3 }}> · {n.overdue} просроч.</span> : null}
              </span>
            }
          />
          <KV
            k="Прогресс"
            v={
              <span className="flex items-center justify-end gap-4">
                <span className="w-[140px]">
                  <Line pct={n.pct} color={n.health === "off-track" ? B.danger : B.text} />
                </span>
                <span style={tab}>
                  {n.done}/{n.total}
                </span>
              </span>
            }
          />
          <KV
            k="Время"
            v={
              n.spentMin || n.estimateMin ? (
                <span>
                  {n.spentMin ? `${formatDuration(n.spentMin)} затрачено` : null}
                  {n.estimateMin ? <span style={{ color: B.text3 }}>{n.spentMin ? " · " : ""}осталось ≈ {formatDuration(n.estimateMin)}</span> : null}
                </span>
              ) : (
                <span style={{ color: B.text3 }}>не отслеживалось</span>
              )
            }
          />
          <KV
            k="Приоритет"
            last
            v={
              <span className="flex items-center justify-end gap-3">
                <span style={{ color: (p.priority ?? 0) ? B.text : B.text3 }}>{PRIORITY_META[p.priority ?? 0].label}</span>
                <PriorityPick value={p.priority ?? 0} onChange={(v) => updateProject(p.id, { priority: v })} />
              </span>
            }
          />
        </div>
        <div className="col-span-2 min-w-0 pt-5">
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            className="group relative block h-[268px] w-full overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
            aria-label={coverUrl ? "Заменить обложку" : "Загрузить обложку"}
          >
            <Dither src={coverUrl ?? undefined} className="absolute inset-0" fallbackKind="stripes" seed={hashSeed(p.id) % 31} color="rgba(255,255,255,0.8)" />
            <span
              className="absolute bottom-0 right-0 flex items-center gap-2 px-3 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
              style={{ ...T.meta, color: B.text, background: B.bg }}
            >
              <Hook size={12} /> {coverUrl ? "Заменить обложку" : "Загрузить обложку"}
            </span>
          </button>
          <div className="mt-2 flex justify-between" style={{ ...T.meta, color: B.off }}>
            <span style={tab}>{index >= 0 ? `№ ${String(index + 1).padStart(2, "0")}` : "Архив"}</span>
            <span>с {formatDate(p.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* ── Tasks · journal ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-20 grid grid-cols-4 gap-x-5">
        <section className="col-span-3 min-w-0 pr-5">
          <SectionHead
            n="01"
            title="Задачи"
            meta={
              <span className="flex items-center gap-3">
                <span>
                  {n.done} из {n.total}
                </span>
                {archivedTaskCount > 0 && <span style={{ color: B.off }}>+{archivedTaskCount} в архиве</span>}
              </span>
            }
          />
          <div className="mt-6 flex items-center justify-between gap-6">
            <TextSeg<SortMode>
              label="Сортировка задач"
              value={sortBy}
              onChange={setSortBy}
              items={[
                { value: "manual", label: "Как есть" },
                { value: "date", label: "По дате" },
                { value: "priority", label: "По приоритету" },
              ]}
            />
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-pressed={showDone}
              className="outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
              style={{ ...T.meta, color: showDone ? B.text : B.text3 }}
            >
              {showDone ? "Скрыть выполненные" : `Показать выполненные (${n.done})`}
            </button>
          </div>

          {/* main add row — into the project (no section), with priority + date */}
          <form
            className="mt-4 grid h-14 items-center gap-x-3"
            style={{ gridTemplateColumns: "14px minmax(0,1fr) 40px 64px 32px", borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l10}` }}
            onSubmit={(e) => {
              e.preventDefault();
              submitNewTask();
            }}
          >
            <span className="flex justify-center" style={{ color: B.text3 }}>
              <Hook size={14} />
            </span>
            <input
              id="pd-add"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Новая задача в проект — «макет завтра #дизайн !важно»"
              className={`min-w-0 bg-transparent outline-none ${PH}`}
              style={{ ...T.bodyL, color: B.text }}
            />
            <span className="flex justify-center">
              <PriorityPick value={newPriority} onChange={setNewPriority} />
            </span>
            <span className="flex justify-end">
              <DueMenu value={newDate} onChange={setNewDate} />
            </span>
            <button
              type="submit"
              aria-label="Добавить задачу"
              disabled={!newTask.trim()}
              className="flex h-7 items-center justify-center outline-none transition-colors hover:text-white disabled:opacity-30"
              style={{ ...T.meta, color: B.text2 }}
            >
              ↵
            </button>
          </form>

          {projectTasks.length === 0 && (
            <p className="py-6" style={{ ...T.body, color: B.text3 }}>
              Пока нет задач. Добавьте первую выше.
            </p>
          )}

          <DragRowsContext
            onDrop={onRowsDrop}
            labelOf={(x) => projectTasks.find((t) => t.id === x)?.title ?? x.replace(/^(zone|sec):/, "").replace("__none", "Без секции")}
            renderOverlay={(a) => {
              const t = a.type === "task" ? projectTasks.find((x) => x.id === a.id) : undefined;
              return (
                <div className="px-4 py-3" style={{ ...T.body, color: B.text, background: B.bg, boxShadow: B.shadowFloat }}>
                  {t ? t.title : String(a.name ?? "")}
                </div>
              );
            }}
          >
            {useTimeGroups ? (
              <div className="mt-10 flex flex-col gap-10">
                {timeGroups.map((g) => (
                  <Group
                    key={g.key}
                    title={g.label}
                    hot={g.key === "overdue"}
                    count={g.items.length}
                    collapsed={collapsed.has(g.key)}
                    onToggle={() => toggleCollapse(g.key)}
                  >
                    {g.items.map(row)}
                  </Group>
                ))}
                {doneTasks.length > 0 && (
                  <Group title="Завершённые" count={doneTasks.length} collapsed={collapsed.has("__done")} onToggle={() => toggleCollapse("__done")}>
                    {doneTasks.map(row)}
                  </Group>
                )}
                {timeGroups.length === 0 && doneTasks.length === 0 && (
                  <p style={{ ...T.body, color: B.text3 }}>Все задачи выполнены.</p>
                )}
              </div>
            ) : (
              <div className="mt-10 flex flex-col gap-12">
                {groups.map((g) => {
                  if (g.name === null && g.tasks.length === 0) return null;
                  const key = g.name ?? "__none";
                  const isCollapsed = g.name !== null && collapsed.has(g.name);
                  const total = g.name !== null ? projectTasks.filter((t) => t.section === g.name).length : 0;
                  const done = g.name !== null ? projectTasks.filter((t) => t.section === g.name && t.done).length : 0;
                  return (
                    <DropZone key={key} id={`zone:${key}`} data={{ type: "section", name: g.name }} activeClassName="bg-white/[0.03]">
                      {g.name !== null ? (
                        <div className="group/sec flex items-center gap-3 pb-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                          <DragHandle id={`sec:${g.name}`} data={{ type: "section", name: g.name }} className="flex w-[14px] cursor-grab justify-center active:cursor-grabbing">
                            <span style={{ color: B.off }} title="Перетащить секцию">
                              <Grip />
                            </span>
                          </DragHandle>
                          <button
                            type="button"
                            onClick={() => toggleCollapse(g.name!)}
                            aria-expanded={!isCollapsed}
                            aria-label={isCollapsed ? `Развернуть «${g.name}»` : `Свернуть «${g.name}»`}
                            className="flex h-6 w-4 items-center justify-center outline-none hover:text-white"
                            style={{ color: B.text3 }}
                          >
                            <Chevron open={!isCollapsed} />
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
                              className="min-w-0 flex-1 bg-transparent outline-none"
                              style={{ ...T.displayS, color: B.text, borderBottom: `1px solid ${B.l20}` }}
                            />
                          ) : (
                            <h3
                              className="min-w-0 flex-1 truncate"
                              style={T.displayS}
                              onDoubleClick={() => {
                                setRenamingSection(g.name);
                                setSectionDraft(g.name!);
                              }}
                              title="Двойной клик — переименовать"
                            >
                              {g.name}
                            </h3>
                          )}
                          <span className="w-20">
                            <Line pct={total ? (done / total) * 100 : 0} color={B.text2} />
                          </span>
                          <span className="w-12 text-right" style={{ ...T.num, color: B.text3 }}>
                            {done}/{total}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteProjectSection(p.id, g.name!)}
                            title="Удалить секцию (задачи останутся)"
                            aria-label={`Удалить секцию «${g.name}» (задачи останутся)`}
                            className="w-5 opacity-0 outline-none transition-opacity hover:text-white focus-visible:opacity-100 group-hover/sec:opacity-100"
                            style={{ ...T.meta, color: B.text3 }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-3 pb-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                          <h3 style={{ ...T.title, color: B.text2 }}>{sections.length ? "Без секции" : "Задачи"}</h3>
                          <span style={{ ...T.num, color: B.text3 }}>{g.tasks.length}</span>
                        </div>
                      )}
                      {!isCollapsed && (
                        <>
                          {g.tasks.length === 0 ? (
                            <p className="flex h-11 items-center gap-3" style={{ ...T.meta, color: B.off, borderBottom: `1px solid ${B.l7}` }}>
                              {done > 0 && !showDone ? (
                                <>
                                  Всё закрыто — {done} {plural(done, "задача скрыта", "задачи скрыты", "задач скрыто")}
                                  <button type="button" onClick={() => setShowDone(true)} className="outline-none hover:text-white focus-visible:text-white" style={{ color: B.text3 }}>
                                    Показать
                                  </button>
                                </>
                              ) : g.name !== null ? (
                                "Пусто — перетащите сюда задачу или добавьте ниже"
                              ) : (
                                "Пусто"
                              )}
                            </p>
                          ) : (
                            g.tasks.map(row)
                          )}
                          <AddRow
                            quiet
                            placeholder={g.name ? `Задача в «${g.name}»` : "Задача без секции"}
                            onAdd={(text) => addParsed(text, g.name ?? undefined)}
                          />
                        </>
                      )}
                    </DropZone>
                  );
                })}
              </div>
            )}
          </DragRowsContext>

          {/* new section */}
          <form
            className="mt-12 flex h-12 items-center gap-3"
            style={{ borderTop: `1px solid ${B.l7}`, borderBottom: `1px solid ${B.l7}` }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSection.trim()) return;
              addProjectSection(p.id, newSection.trim());
              setNewSection("");
            }}
          >
            <span className="flex w-[14px] justify-center" style={{ ...T.meta, color: B.off }}>
              +
            </span>
            <input
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="Новая секция — «Дизайн», «Разработка»…"
              className={`min-w-0 flex-1 bg-transparent outline-none ${PH}`}
              style={{ ...T.body, color: B.text }}
            />
            <Button variant="outline" size="sm" hook={false} type="submit" disabled={!newSection.trim()}>
              Секция
            </Button>
          </form>
        </section>

        <aside className="min-w-0 space-y-14">
          <section>
            <SectionHead n="02" title="Журнал" size="s" meta={comments.length || undefined} />
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                addComment();
              }}
            >
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addComment();
                  }
                }}
                rows={3}
                placeholder="Что нужно внести или сделать…"
                className={`w-full resize-none bg-transparent py-2 outline-none ${PH}`}
                style={{ ...T.body, color: B.text, borderTop: `1px solid ${B.l7}`, borderBottom: `1px solid ${B.l7}` }}
              />
              <div className="mt-3 flex items-center justify-between">
                <span style={{ ...T.meta, color: B.off }}>Enter — записать</span>
                <Button variant="outline" size="sm" type="submit" disabled={!comment.trim()}>
                  Записать
                </Button>
              </div>
            </form>
            {comments.length === 0 ? (
              <p className="mt-6" style={{ ...T.meta, color: B.text3 }}>
                Пока пусто. Сюда — решения, договорённости, что внести.
              </p>
            ) : (
              <ol className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
                {comments.map((c) => (
                  <li key={c.id} className="group/c py-4" style={{ borderBottom: `1px solid ${B.l7}` }}>
                    <div className="flex items-center justify-between" style={{ ...T.meta, color: B.text3 }}>
                      <span style={tab}>{formatDate(c.at)}</span>
                      <button
                        type="button"
                        onClick={() => deleteProjectComment(p.id, c.id)}
                        aria-label={`Удалить запись от ${formatDate(c.at)}`}
                        className="opacity-0 outline-none transition-opacity hover:text-white focus-visible:opacity-100 group-hover/c:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                    {editingComment === c.id ? (
                      <textarea
                        autoFocus
                        rows={3}
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onBlur={commitComment}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            commitComment();
                          }
                          if (e.key === "Escape") setEditingComment(null);
                        }}
                        className="mt-2 w-full resize-none bg-transparent outline-none"
                        style={{ ...T.body, color: B.text, borderBottom: `1px solid ${B.l20}` }}
                      />
                    ) : (
                      <p
                        className="mt-2 cursor-text whitespace-pre-wrap transition-colors [overflow-wrap:anywhere] hover:text-white"
                        style={{ ...T.body, color: B.text2 }}
                        onClick={() => {
                          setEditingComment(c.id);
                          setCommentDraft(c.text);
                        }}
                        title="Клик — редактировать"
                      >
                        {c.text}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {linkedNotes.length > 0 && (
            <section>
              <SectionHead n="03" title="Упоминания" size="s" meta={linkedNotes.length} />
              <ul className="mt-5">
                {linkedNotes.map((note) => (
                  <li key={note.id}>
                    <Link
                      to="/notes"
                      className="flex h-11 items-center truncate transition-colors hover:text-white"
                      style={{ ...T.body, color: B.text2, borderBottom: `1px solid ${B.l7}` }}
                    >
                      {note.title || "Без названия"}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

    </Page>
  );
}

/** A time-bucket group header («Просрочено 3 ›») + its rows. */
function Group({
  title,
  count,
  hot,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  hot?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-3 pb-3 text-left outline-none"
        style={{ borderBottom: `1px solid ${B.l10}` }}
      >
        <span className="flex w-[14px] justify-center" style={{ color: B.text3 }}>
          <Chevron open={!collapsed} />
        </span>
        <h3 style={T.displayS}>{title}</h3>
        <span style={{ ...T.num, color: hot ? B.danger : B.text3 }}>{count}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}
