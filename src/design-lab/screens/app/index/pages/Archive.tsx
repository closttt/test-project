/**
 * «Индекс» · Архив — archived tasks, projects and notes as one editorial hairline index.
 * Header (dots) → NumTabs per entity + search (tab counts follow the search) → numbered month
 * sections (newest first) of hairline rows: № · title + context · date · «Вернуть» · «Удалить».
 *
 * Task rows open the shared task card (useTaskPanel). «Удалить навсегда» asks in a Modal, then
 * leaves an undo toast — same as the real page. One lime element: the active tab's underline.
 */
import { useMemo, useState } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatDate } from "@/lib/format";
import type { Note, Project, Task } from "@/types";
import { B, T, tab, pad2, Page, PageHeader, SectionHead, NumTabs, Empty, Hook, plural } from "@/design-lab/screens/_kit/index";
import { SearchField, Modal, useTaskPanel } from "@/design-lab/screens/_kit/index-ui";

type Kind = "tasks" | "projects" | "notes";

interface Row {
  id: string;
  title: string;
  sub?: string;
  archivedAt?: string;
  /** Open the entity (tasks only — the shared task card). */
  open?: () => void;
  restore: () => void;
  remove: () => void;
}

const KIND_WORD: Record<Kind, { one: string; few: string; many: string; empty: string }> = {
  tasks: { one: "задача", few: "задачи", many: "задач", empty: "В архиве нет задач" },
  projects: { one: "проект", few: "проекта", many: "проектов", empty: "В архиве нет проектов" },
  notes: { one: "заметка", few: "заметки", many: "заметок", empty: "В архиве нет заметок" },
};

/** Plain-text excerpt of a note body (rich-text HTML or markdown). */
function excerpt(body: string): string {
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[#>*_`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

const monthKey = (iso?: string) => (iso ? iso.slice(0, 7) : "");
function monthLabel(key: string): string {
  if (!key) return "Без даты";
  const d = new Date(`${key}-01T12:00:00`);
  const s = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(/\s*г\.$/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Archive() {
  const {
    archivedTasks,
    archivedProjects,
    archivedNotes,
    allProjects,
    allTasks,
    clients,
    unarchiveTask,
    deleteTask,
    restoreTask,
    unarchiveProject,
    deleteProject,
    restoreProject,
    unarchiveNote,
    deleteNote,
    restoreNote,
  } = useData();
  const { toast } = useToast();
  const panel = useTaskPanel();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>(() => (archivedTasks.length ? "tasks" : archivedProjects.length ? "projects" : archivedNotes.length ? "notes" : "tasks"));
  const [confirm, setConfirm] = useState<{ kind: Kind; row: Row } | null>(null);

  const q = query.trim().toLowerCase();
  const hit = (...fields: (string | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));
  const byNewest = <X extends { archivedAt?: string }>(a: X, b: X) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "");

  const rows = useMemo(() => {
    const projectName = (id?: string) => (id ? allProjects.find((p) => p.id === id)?.name : undefined);
    const clientName = (id?: string) => (id ? clients.find((c) => c.id === id)?.name : undefined);

    const tasks: Row[] = [...archivedTasks]
      .sort(byNewest)
      .filter((t: Task) => hit(t.title, projectName(t.projectId)))
      .map((t) => ({
        id: t.id,
        title: t.title,
        sub: [projectName(t.projectId), t.done ? `выполнена${t.completedAt ? ` ${formatDate(t.completedAt)}` : ""}` : "не выполнена"].filter(Boolean).join(" · "),
        archivedAt: t.archivedAt,
        open: () => panel.open(t.id),
        restore: () => {
          unarchiveTask(t.id);
          toast("Задача возвращена");
        },
        remove: () => {
          deleteTask(t.id);
          toast("Удалено навсегда", { actionLabel: "Вернуть", onAction: () => restoreTask(t) });
        },
      }));

    const projects: Row[] = [...archivedProjects]
      .sort(byNewest)
      .filter((p: Project) => hit(p.name, clientName(p.clientId)))
      .map((p) => {
        const n = allTasks.filter((t) => t.projectId === p.id).length;
        return {
          id: p.id,
          title: p.name,
          sub: [clientName(p.clientId), `${n} ${plural(n, "задача", "задачи", "задач")}`].filter(Boolean).join(" · "),
          archivedAt: p.archivedAt,
          restore: () => {
            unarchiveProject(p.id);
            toast("Проект возвращён");
          },
          remove: () => {
            deleteProject(p.id);
            toast("Удалено навсегда", { actionLabel: "Вернуть", onAction: () => restoreProject(p) });
          },
        };
      });

    const notes: Row[] = [...archivedNotes]
      .sort(byNewest)
      .filter((n: Note) => hit(n.title || "Без названия", excerpt(n.body)))
      .map((n) => ({
        id: n.id,
        title: n.title || "Без названия",
        sub: excerpt(n.body) || undefined,
        archivedAt: n.archivedAt,
        restore: () => {
          unarchiveNote(n.id);
          toast("Заметка возвращена");
        },
        remove: () => {
          deleteNote(n.id);
          toast("Удалено навсегда", { actionLabel: "Вернуть", onAction: () => restoreNote(n) });
        },
      }));

    return { tasks, projects, notes } as Record<Kind, Row[]>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivedTasks, archivedProjects, archivedNotes, allProjects, allTasks, clients, q]);

  const total = archivedTasks.length + archivedProjects.length + archivedNotes.length;
  const list = rows[kind];
  const groups = useMemo(() => {
    const out: { key: string; rows: Row[] }[] = [];
    for (const r of list) {
      const k = monthKey(r.archivedAt);
      const g = out.find((x) => x.key === k);
      if (g) g.rows.push(r);
      else out.push({ key: k, rows: [r] });
    }
    return out;
  }, [list]);
  const found = rows.tasks.length + rows.projects.length + rows.notes.length;

  return (
    <Page>
      <PageHeader
        title="Архив"
        deck={
          total === 0
            ? "Скрытые задачи, проекты и заметки — здесь их можно вернуть или удалить навсегда."
            : `${total} ${plural(total, "запись", "записи", "записей")} вне списков. Верните нужное или удалите навсегда.`
        }
        graphic="dots"
        seed={9}
      />

      {total === 0 ? (
        <div className="max-w-[420px] pt-6">
          <Empty
            title="Архив пуст"
            text="Архивируйте завершённые задачи или неактуальные проекты — они спрячутся из списков, но останутся здесь."
            seed={9}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 items-end gap-x-5">
            <div className="col-span-3 min-w-0 pr-5">
              <NumTabs<Kind>
                value={kind}
                onChange={setKind}
                items={[
                  { id: "tasks", label: "Задачи", count: rows.tasks.length },
                  { id: "projects", label: "Проекты", count: rows.projects.length },
                  { id: "notes", label: "Заметки", count: rows.notes.length },
                ]}
              />
            </div>
            <SearchField value={query} onChange={setQuery} placeholder="Поиск по архиву…" className="mb-[2px]" />
          </div>

          <section className="mt-14">
            {list.length === 0 ? (
              <div className="max-w-[420px]">
                {q ? (
                  <Empty
                    title="Ничего не найдено"
                    text={found ? "В этой вкладке совпадений нет — счётчики во вкладках учитывают поиск." : "Попробуйте другое слово."}
                    seed={4}
                    height={64}
                  />
                ) : (
                  <Empty title={KIND_WORD[kind].empty} text="Архивированное появится здесь." seed={4} height={64} />
                )}
              </div>
            ) : (
              groups.map((g, gi) => (
                <div key={g.key || "none"} className="mb-14 last:mb-0">
                  <SectionHead
                    n={pad2(gi + 1)}
                    title={monthLabel(g.key)}
                    size="s"
                    meta={`${g.rows.length} ${plural(g.rows.length, KIND_WORD[kind].one, KIND_WORD[kind].few, KIND_WORD[kind].many)}`}
                  />
                  <ol className="mt-4" style={{ borderTop: `1px solid ${B.l10}` }}>
                    {g.rows.map((r) => (
                      <ArchiveRow key={r.id} n={list.indexOf(r) + 1} row={r} onDelete={() => setConfirm({ kind, row: r })} />
                    ))}
                  </ol>
                </div>
              ))
            )}
          </section>
        </>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Удалить навсегда?"
        width={480}
        footer={
          <div className="flex items-center justify-end gap-6 px-5 py-3">
            <button type="button" onClick={() => setConfirm(null)} className="h-8 transition-colors hover:text-white" style={{ ...T.body, color: B.text3 }}>
              Отмена
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                confirm?.row.remove();
                setConfirm(null);
              }}
              className="h-8 px-4 outline-none transition-[filter] hover:brightness-125 focus-visible:ring-1 focus-visible:ring-white/40"
              style={{ ...T.btn, color: B.danger, boxShadow: `inset 0 0 0 1px ${B.danger}` }}
            >
              Удалить
            </button>
          </div>
        }
      >
        {confirm && (
          <div className="px-5 py-5">
            <div style={T.bodyL}>«{confirm.row.title}»</div>
            <p className="mt-2" style={{ ...T.body, color: B.text3 }}>
              {confirm.kind === "projects"
                ? "Проект исчезнет из архива, его задачи и заметки останутся без проекта."
                : confirm.kind === "tasks"
                  ? "Задача исчезнет из архива вместе с подзадачами и комментариями."
                  : "Заметка исчезнет из архива."}{" "}
              Передумать можно сразу — в уведомлении будет «Вернуть».
            </p>
          </div>
        )}
      </Modal>
    </Page>
  );
}

function ArchiveRow({ n, row, onDelete }: { n: number; row: Row; onDelete: () => void }) {
  const title = (
    <span className="min-w-0">
      <span className="block truncate transition-colors duration-200 group-hover/open:text-white" style={{ ...T.bodyL, color: B.text2 }}>
        {row.title}
      </span>
      {row.sub && (
        <span className="mt-0.5 block truncate" style={{ ...T.meta, color: B.text3 }}>
          {row.sub}
        </span>
      )}
    </span>
  );
  return (
    <li
      className="group grid min-h-[60px] items-center gap-4 transition-colors duration-200 hover:bg-white/[0.02]"
      style={{ gridTemplateColumns: "28px minmax(0,1fr) 120px 92px 72px", borderBottom: `1px solid ${B.l7}` }}
    >
      <span style={{ ...T.num, color: B.off }}>{pad2(n)}</span>
      {row.open ? (
        <button type="button" onClick={row.open} className="group/open min-w-0 py-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-white/30" title="Открыть карточку задачи">
          {title}
        </button>
      ) : (
        <span className="py-2">{title}</span>
      )}
      <span className="text-right" style={{ ...T.meta, color: B.text3, ...tab }}>
        {row.archivedAt ? `с ${formatDate(row.archivedAt)}` : ""}
      </span>
      <button
        type="button"
        onClick={row.restore}
        className="flex h-8 items-center justify-end gap-2 outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
        style={{ ...T.body, color: B.text2 }}
      >
        <Hook size={12} />
        Вернуть
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Удалить навсегда"
        className="h-8 text-right opacity-60 outline-none transition-[color,opacity] duration-200 hover:!text-[#FF5A36] hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
        style={{ ...T.body, color: B.text3 }}
      >
        Удалить
      </button>
    </li>
  );
}
