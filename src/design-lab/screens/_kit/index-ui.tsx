/**
 * «Индекс» · UI layer — the ONE entry point for interactive building blocks (panels, dialogs,
 * menus, fields, the task card). Screens import from here, never from another page's *.parts.
 *
 * Stage 1 (now): re-exports of the best implementations the section builders made, plus the global
 * task-panel host and a centred Modal. Stage 2: the code moves physically into this file and the
 * page-local duplicates are deleted — the API below stays the same.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { pushRecent } from "@/lib/recent";
import { blockingTasks } from "@/lib/dependencies";
import { FIXED_TAGS } from "@/lib/tags";
import { isSnoozed } from "@/lib/taskGrouping";
import { uid } from "@/lib/id";
import { dueLabel, formatDate, formatDuration, isOverdue, localDayStr } from "@/lib/format";
import { saveAttachmentBlob, loadAttachmentBlob, deleteAttachmentBlob, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { kindOf } from "@/components/FilePreviewDialog";
import { PRIORITY_META, type Attachment, type Project, type Recurrence, type Subtask, type Task, type TaskComment } from "@/types";
import { B, T, tab, Check, CtaBar, Hook, Signal, Sparkle, PRIORITY_BARS, plural } from "@/design-lab/screens/_kit/index";
import {
  FloatMenu,
  MenuItem,
  MenuLabel,
  MenuSep,
  useFloat,
  DueMenuBody,
  PriorityMenuBody,
  ProjectMenuBody,
  Dots,
  IconBtn,
  inDays,
  nextMonday,
  type TaskActions,
} from "@/design-lab/screens/app/index/pages/Tasks.parts";

/* ── Panels (right slide-over «case») ─────────────────────────────────────────────────────── */
export { CasePanel, PanelHead, Prop, FieldInput, Money, Ledger, DangerLink } from "@/design-lab/screens/app/index/pages/Clients.parts";

/* ── Menus ────────────────────────────────────────────────────────────────────────────────── */
export {
  FloatMenu,
  MenuItem,
  MenuLabel,
  MenuSep,
  useFloat,
  anchorOf,
  anchorAt,
  DueMenuBody,
  PriorityMenuBody,
  ProjectMenuBody,
  Dots,
  parseQuick,
  TaskRow,
  type TaskActions,
} from "@/design-lab/screens/app/index/pages/Tasks.parts";

/* ── Fields & controls ────────────────────────────────────────────────────────────────────── */
export { Switch, Seg, TextField, NumField, Select, TextAction, Row, Status, Disclosure, SubHead } from "@/design-lab/screens/app/index/pages/Settings.parts";
export { SearchField, IxEditor, ProseStyles } from "@/design-lab/screens/app/index/pages/Notes.parts";

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Modal — centred dialog: black plate, hairline frame, title row, Esc / backdrop closes
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  title,
  n,
  width = 560,
  children,
  footer,
  top = "18vh",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  n?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  top?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.72)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div
        className="absolute left-1/2 flex max-h-[70vh] -translate-x-1/2 flex-col"
        style={{ top, width, background: B.bg, boxShadow: `inset 0 0 0 1px ${B.l15}, 0 40px 80px -20px rgba(0,0,0,.9)`, fontFamily: B.font, color: B.text }}
      >
        {title && (
          <div className="flex h-12 shrink-0 items-center gap-3 px-5" style={{ borderBottom: `1px solid ${B.l10}` }}>
            {n && <span style={{ ...T.num, color: B.off }}>{n}</span>}
            <span className="flex-1 truncate" style={T.bodyStrong}>
              {title}
            </span>
            <button type="button" onClick={onClose} className="hover:text-white" style={{ ...T.meta, color: B.text3 }}>
              Esc
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <div className="shrink-0" style={{ borderTop: `1px solid ${B.l10}` }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Task actions + the ONE task card for the whole app
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Store-backed task actions (same rules as the Tasks screen: blockers, undo toasts). */
export function useTaskActions(open: (t: Task) => void = () => {}): TaskActions {
  const { tasks, toggleTask, updateTask, archiveTask, unarchiveTask, deleteTask, restoreTask } = useData();
  const { toast } = useToast();
  return {
    open,
    toggle: (t) => {
      if (!t.done) {
        const blockers = blockingTasks(t, tasks);
        if (blockers.length) {
          toast(`Заблокировано — сначала закройте «${blockers[0].title}»${blockers.length > 1 ? ` (+${blockers.length - 1})` : ""}`);
          return;
        }
      }
      toggleTask(t.id);
    },
    setDue: (id, date) => updateTask(id, { dueDate: date }),
    snooze: (id, until) => {
      updateTask(id, { snoozedUntil: until ?? undefined });
      if (until) toast("Задача отложена");
    },
    setPriority: (id, p) => updateTask(id, { priority: p }),
    setProject: (id, projectId) => updateTask(id, { projectId, section: undefined }),
    toggleTag: (t, tg) => updateTask(t.id, { tags: t.tags.includes(tg) ? t.tags.filter((x) => x !== tg) : [...t.tags, tg] }),
    archive: (t) => {
      archiveTask(t.id);
      const run = pushUndo("Задача в архиве", () => unarchiveTask(t.id));
      toast("В архиве", { actionLabel: "Вернуть", onAction: run });
    },
    remove: (t) => {
      deleteTask(t.id);
      const run = pushUndo("Задача удалена", () => restoreTask(t));
      toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
    },
  };
}

interface TaskPanelCtx {
  /** Open the global task card for this task id (from any screen). */
  open: (id: string) => void;
  /** Open the small card of one subtask (own date / priority / reminder), e.g. from «План дня». */
  openSubtask: (taskId: string, subtaskId: string) => void;
  close: () => void;
  openId: string | null;
}
const Ctx = createContext<TaskPanelCtx | null>(null);

/** Mount once around the app — renders the shared task card when something calls open(id). */
export function TaskPanelHost({ children }: { children: ReactNode }) {
  const { allTasks, projects, allProjects } = useData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sub, setSub] = useState<{ taskId: string; subId: string } | null>(null);
  const open = useCallback((id: string) => {
    setSub(null);
    setOpenId(id);
  }, []);
  const openSubtask = useCallback((taskId: string, subId: string) => setSub({ taskId, subId }), []);
  const close = useCallback(() => setOpenId(null), []);
  const closeSub = useCallback(() => setSub(null), []);
  const act = useTaskActions((t) => setOpenId(t.id));
  const task = openId ? allTasks.find((t) => t.id === openId) : undefined;
  useEffect(() => {
    if (task) pushRecent({ id: task.id, label: task.title, to: "/tasks", state: { openTaskId: task.id } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);
  const value = useMemo(() => ({ open, openSubtask, close, openId }), [open, openSubtask, close, openId]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {task && <TaskPanel key={task.id} task={task} projects={projects} allProjects={allProjects} act={act} onClose={close} />}
      {sub && !task && <SubtaskPanel taskId={sub.taskId} subtaskId={sub.subId} onClose={closeSub} onOpenParent={open} />}
    </Ctx.Provider>
  );
}

export function useTaskPanel(): TaskPanelCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTaskPanel: mount <TaskPanelHost> around the app");
  return v;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * The task card — right, full height. Parity with TaskEditDialog + SubtaskEditDialog +
 * AttachmentRow: title, notes, status, due, priority, project, tags, recurrence, reminder,
 * estimate + timer, subtasks (each with its own card), checklist templates, links, files,
 * comments (editable), dependencies.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const PANEL_CSS = `
@keyframes ixPanelIn { from { transform: translateX(28px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes ixFadeIn { from { opacity: 0 } to { opacity: 1 } }
`;

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Не повторять",
  daily: "Каждый день",
  weekdays: "По будням",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
  "monthly-first-monday": "Первый пн месяца",
};

const dayHint = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
};
const remindLabel = (v: string) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${dueLabel(localDayStr(d))}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
};
const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable);
};

function useAutoHeight(ref: RefObject<HTMLTextAreaElement>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

/** KV row with an interactive value (same anatomy as the kit's KV). */
function CardRow({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[48px] min-w-0 items-center justify-between gap-6" style={{ borderBottom: `1px solid ${B.l10}`, ...T.body }}>
      <span className="shrink-0" style={{ color: B.text3 }}>
        {k}
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 py-2 text-right" style={{ color: B.text, ...tab }}>
        {children}
      </span>
    </div>
  );
}

/** Value-as-button: white text, hover underline, opens a float menu. */
function ValueBtn({ children, onClick, color = B.text }: { children: ReactNode; onClick: (el: HTMLElement) => void; color?: string }) {
  return (
    <button
      type="button"
      data-float-trigger
      onClick={(e) => onClick(e.currentTarget)}
      className="flex min-w-0 items-center gap-2 truncate underline-offset-4 outline-none decoration-white/30 hover:underline focus-visible:underline"
      style={{ ...T.body, color }}
    >
      {children}
    </button>
  );
}

function Fold({ n, title, count, children, meta }: { n: string; title: string; count: number; children: ReactNode; meta?: ReactNode }) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div style={{ borderBottom: `1px solid ${B.l10}` }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="group flex h-14 w-full items-center justify-between outline-none">
        <span className="flex items-baseline gap-3">
          <span style={{ ...T.num, color: B.off }}>{n}</span>
          <span className="transition-colors group-hover:text-white" style={{ ...T.bodyStrong, color: open ? B.text : B.text2 }}>
            {title}
          </span>
          {count > 0 && <span style={{ ...T.meta, color: B.text3, ...tab }}>{count}</span>}
        </span>
        <span className="flex items-center gap-4" style={{ color: B.text3 }}>
          {meta}
          <Sparkle size={12} open={open} />
        </span>
      </button>
      {open && <div className="pb-6">{children}</div>}
    </div>
  );
}

function LineInput({
  placeholder,
  onSubmit,
  small,
  autoFocus,
  onEscape,
}: {
  placeholder: string;
  onSubmit: (v: string) => void;
  small?: boolean;
  autoFocus?: boolean;
  onEscape?: () => void;
}) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex h-11 items-center gap-3"
      style={{ borderBottom: `1px solid ${B.l7}` }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onSubmit(v.trim());
        setV("");
      }}
    >
      <span style={{ color: B.off }}>
        <Hook size={12} />
      </span>
      <input
        value={v}
        autoFocus={autoFocus}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onEscape) {
            e.preventDefault();
            onEscape();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
        style={{ ...(small ? T.meta : T.body), color: B.text }}
      />
    </form>
  );
}

/** Hover-revealed «✕» / small text action at the end of a line. */
function XBtn({ label, onClick, always }: { label: string; onClick: () => void; always?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center outline-none transition-[opacity,color] hover:text-white focus-visible:opacity-100 ${always ? "" : "opacity-0 group-hover:opacity-100"}`}
      style={{ color: B.text3 }}
    >
      <Sparkle size={10} open />
    </button>
  );
}

/* ── Subtask line: check · title (opens its card) · date + reminder · priority · ✕ ──────────── */

function SubtaskLine({ taskId, s, onOpen }: { taskId: string; s: Subtask; onOpen: () => void }) {
  const { toggleSubtask, updateSubtask, deleteSubtask } = useData();
  const due = useFloat();
  const prio = useFloat();
  const p = s.priority ?? 0;
  const overdue = !s.done && isOverdue(s.dueDate);
  return (
    <li className="group flex min-h-11 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
      <Check done={s.done} onClick={() => toggleSubtask(taskId, s.id)} label={s.title} size={14} />
      <button
        type="button"
        onClick={onOpen}
        title="Открыть карточку подзадачи"
        className="min-w-0 flex-1 truncate py-2 text-left outline-none underline-offset-4 decoration-white/30 hover:underline focus-visible:underline"
        style={{ ...T.body, color: s.done ? B.text4 : B.text, textDecoration: s.done ? "line-through" : undefined }}
      >
        {s.title}
      </button>
      <button
        type="button"
        data-float-trigger
        onClick={(e) => due.toggle(e.currentTarget, "right")}
        title="Срок и напоминание подзадачи"
        className={`h-7 shrink-0 outline-none transition-[opacity,color] hover:!text-white focus-visible:opacity-100 ${s.dueDate || s.remindAt ? "" : "opacity-0 group-hover:opacity-100"}`}
        style={{ ...T.meta, ...tab, color: overdue ? B.danger : s.dueDate ? B.text3 : B.off }}
      >
        {s.dueDate ? dueLabel(s.dueDate) : "срок"}
        {s.remindAt ? <span style={{ color: B.text3 }}> · {remindLabel(s.remindAt).split(", ").pop()}</span> : null}
      </button>
      <button
        type="button"
        data-float-trigger
        onClick={(e) => prio.toggle(e.currentTarget, "right")}
        aria-label={`Приоритет подзадачи: ${PRIORITY_META[p].label}`}
        title={`Приоритет: ${PRIORITY_META[p].label}`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center outline-none focus-visible:opacity-100 ${p ? "" : "opacity-0 group-hover:opacity-100"}`}
      >
        <Signal value={PRIORITY_BARS[p]} on={B.text2} off={B.l15} w={3} h={8} />
      </button>
      <XBtn label={`Удалить подзадачу: ${s.title}`} onClick={() => deleteSubtask(taskId, s.id)} />
      {due.at && (
        <FloatMenu at={due.at} onClose={due.close}>
          <DueMenuBody
            value={s.dueDate}
            onPick={(d) => updateSubtask(taskId, s.id, { dueDate: d })}
            remind={{ value: s.remindAt, onChange: (v) => updateSubtask(taskId, s.id, { remindAt: v }) }}
          />
        </FloatMenu>
      )}
      {prio.at && (
        <FloatMenu at={prio.at} onClose={prio.close} width={220}>
          <PriorityMenuBody value={p} onPick={(v) => updateSubtask(taskId, s.id, { priority: v })} />
        </FloatMenu>
      )}
    </li>
  );
}

/* ── Attachments (IndexedDB blobs via lib/attachments) ─────────────────────────────────────── */

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} КБ`;

async function downloadAttachment(att: Attachment) {
  const blob = await loadAttachmentBlob(att.id);
  if (!blob) return;
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = att.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
}

function AttachmentLine({ att, onPreview, onRemove }: { att: Attachment; onPreview: () => void; onRemove: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    if (att.type.startsWith("image/")) {
      loadAttachmentBlob(att.id)
        .then((blob) => {
          if (!blob || !alive) return;
          revoke = URL.createObjectURL(blob);
          setThumb(revoke);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [att.id, att.type]);
  return (
    <li className="group flex h-12 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
      <button type="button" onClick={onPreview} title={`Открыть: ${att.name}`} className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:underline">
        {thumb ? (
          <img src={thumb} alt="" className="h-8 w-8 shrink-0 object-cover" style={{ filter: "grayscale(.15)" }} />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center" style={{ boxShadow: `inset 0 0 0 1px ${B.l10}`, ...T.caps, fontSize: 9, color: B.text3 }}>
            {(att.name.split(".").pop() ?? "").slice(0, 4) || "файл"}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate underline-offset-4 decoration-white/30 group-hover:underline" style={{ ...T.body, color: B.text2 }}>
          {att.name}
        </span>
      </button>
      <span className="shrink-0" style={{ ...T.meta, ...tab, color: B.text3 }}>
        {kb(att.size)}
      </span>
      <button
        type="button"
        onClick={() => downloadAttachment(att)}
        className="shrink-0 opacity-0 outline-none transition-[opacity,color] hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
        style={{ ...T.meta, color: B.text3 }}
      >
        Скачать
      </button>
      <XBtn label={`Удалить вложение: ${att.name}`} onClick={onRemove} />
    </li>
  );
}

/** In-app preview (images, PDF, video, audio, text) — the Индекс take on FilePreviewDialog. */
export function FilePreview({ att, onClose }: { att: Attachment | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setUrl(null);
    setText(null);
    setMissing(false);
    if (!att) return;
    let revoke: string | null = null;
    let alive = true;
    loadAttachmentBlob(att.id)
      .then(async (blob) => {
        if (!alive) return;
        if (!blob) return setMissing(true);
        revoke = URL.createObjectURL(blob);
        setUrl(revoke);
        if (kindOf(att.type, att.name) === "text" && blob.size < 512 * 1024) setText(await blob.text());
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [att]);
  const kind = att ? kindOf(att.type, att.name) : "other";
  const note = (s: string) => (
    <div className="flex h-40 items-center justify-center px-8 text-center" style={{ ...T.body, color: B.text3 }}>
      {s}
    </div>
  );
  return (
    <Modal
      open={!!att}
      onClose={onClose}
      title={att?.name}
      width={880}
      top="8vh"
      footer={
        <div className="flex h-12 items-center justify-between px-5" style={{ ...T.meta, color: B.text3 }}>
          <span style={tab}>{att ? `${kb(att.size)} · ${att.type || "файл"}` : ""}</span>
          <span className="flex items-center gap-6">
            {url && kind !== "other" && (
              <button type="button" className="hover:text-white" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                В новой вкладке
              </button>
            )}
            {att && (
              <button type="button" className="hover:text-white" onClick={() => downloadAttachment(att)} disabled={!url}>
                Скачать
              </button>
            )}
          </span>
        </div>
      }
    >
      {missing
        ? note("Файл не найден на этом устройстве — вложения хранятся локально там, где их добавили.")
        : !url
          ? note("Загрузка…")
          : kind === "image"
            ? <img src={url} alt={att?.name} className="mx-auto max-h-[60vh] object-contain" />
            : kind === "pdf"
              ? <iframe src={url} title={att?.name} className="h-[60vh] w-full" />
              : kind === "video"
                ? <video src={url} controls className="mx-auto max-h-[60vh]" />
                : kind === "audio"
                  ? <div className="px-8 py-10"><audio src={url} controls className="w-full" /></div>
                  : kind === "text" && text !== null
                    ? <pre className="whitespace-pre-wrap break-words px-5 py-4" style={{ ...T.meta, fontFamily: '"Geist Mono", monospace', color: B.text2 }}>{text}</pre>
                    : note("Предпросмотр для этого типа файла недоступен — скачайте его.")}
    </Modal>
  );
}

/* ── Comments: click a comment to edit it, like the real card ──────────────────────────────── */

function CommentLine({ c, onSave, onRemove }: { c: TaskComment; onSave: (text: string) => void; onRemove: () => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(c.text);
  const commit = () => {
    const t = v.trim();
    if (t && t !== c.text) onSave(t);
    setEdit(false);
  };
  return (
    <li className="group py-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
      <div className="flex items-center justify-between" style={{ ...T.meta, color: B.text3 }}>
        <span style={tab}>{formatDate(c.at)}</span>
        <XBtn label="Удалить комментарий" onClick={onRemove} />
      </div>
      {edit ? (
        <textarea
          autoFocus
          value={v}
          rows={2}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setV(c.text);
              setEdit(false);
            }
          }}
          className="mt-1 w-full resize-none bg-transparent outline-none"
          style={{ ...T.body, color: B.text, boxShadow: `inset 0 -1px 0 ${B.l40}` }}
        />
      ) : (
        <p
          className="mt-1 cursor-text whitespace-pre-wrap transition-colors hover:text-white"
          style={{ ...T.body, color: B.text2 }}
          title="Клик — редактировать"
          onClick={() => {
            setV(c.text);
            setEdit(true);
          }}
        >
          {c.text}
        </p>
      )}
    </li>
  );
}

/* ── Panel chrome shared by the task card and the subtask card ─────────────────────────────── */

function CardChrome({
  label,
  eyebrow,
  actions,
  onClose,
  children,
  cta,
  width = 600,
  z = 50,
  dim = true,
}: {
  label: string;
  eyebrow: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  cta: ReactNode;
  width?: number;
  z?: number;
  dim?: boolean;
}) {
  return (
    <>
      <style>{PANEL_CSS}</style>
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ zIndex: z - 10, background: dim ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.35)", animation: `ixFadeIn .3s ${B.easeOut}` }}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={label}
        className="fixed inset-y-0 right-0 flex flex-col"
        style={{
          zIndex: z,
          width: `min(${width}px, 100vw)`,
          background: B.bg,
          borderLeft: `1px solid ${B.l10}`,
          animation: `ixPanelIn .32s ${B.easeOut}`,
          fontFamily: B.font,
          color: B.text,
        }}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-10" style={{ borderBottom: `1px solid ${B.l7}` }}>
          <span className="flex min-w-0 items-center gap-3" style={{ ...T.meta, color: B.text3 }}>
            {eyebrow}
          </span>
          <span className="-mr-2 flex items-center">
            {actions}
            <IconBtn label="Закрыть (Esc)" onClick={onClose}>
              <Sparkle size={14} open />
            </IconBtn>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-16 pt-10">{children}</div>
        {cta}
      </aside>
    </>
  );
}

export function TaskPanel({
  task,
  projects,
  allProjects,
  act,
  onClose,
}: {
  task: Task;
  projects: Project[];
  allProjects: Project[];
  act: TaskActions;
  onClose: () => void;
}) {
  const { tasks, allTasks, settings, updateTask, addSubtask, addChecklistTemplate, startTimer, stopTimer } = useData();
  const { toast } = useToast();
  const host = useContext(Ctx);
  const live = task;
  const [title, setTitle] = useState(live.title);
  const [notes, setNotes] = useState(live.description ?? "");
  const [subOpen, setSubOpen] = useState<string | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [depQ, setDepQ] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useAutoHeight(titleRef, title);
  useAutoHeight(notesRef, notes);
  useEffect(() => {
    setTitle(live.title);
    setNotes(live.description ?? "");
    setSubOpen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.id]);
  useEffect(() => {
    // keep the draft in sync when the title changes elsewhere (e.g. undo), unless editing it
    if (document.activeElement !== titleRef.current) setTitle(live.title);
  }, [live.title]);

  // Esc: blur a field first, then close. Stops here so a list panel underneath stays open.
  // While the subtask card or a preview is on top, they own Esc.
  const layered = !!subOpen || !!preview;
  useEffect(() => {
    if (layered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (isTyping(e.target)) {
        (e.target as HTMLElement).blur();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, layered]);

  const due = useFloat();
  const prio = useFloat();
  const proj = useFloat();
  const rec = useFloat();
  const tpl = useFloat();
  const sec = useFloat();
  const more = useFloat();

  const project = allProjects.find((p) => p.id === live.projectId);
  const sections = project?.sections ?? [];
  // An archived project stays selectable in the menu, as in the real card.
  const projectChoices = project && !projects.some((p) => p.id === project.id) ? [...projects, project] : projects;
  const blockers = blockingTasks(live, tasks);
  const overdue = !live.done && isOverdue(live.dueDate);
  const subDone = live.subtasks.filter((s) => s.done).length;
  const deps = (live.blockedBy ?? []).map((id) => allTasks.find((t) => t.id === id)).filter(Boolean) as Task[];
  const allTags = [...new Set<string>([...FIXED_TAGS, ...live.tags])];
  const depHits = depQ.trim()
    ? tasks
        .filter((t) => t.id !== live.id && !(live.blockedBy ?? []).includes(t.id) && t.title.toLowerCase().includes(depQ.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== live.title) updateTask(live.id, { title: t });
    else setTitle(live.title);
  };
  const commitNotes = () => {
    if ((notes.trim() || undefined) !== live.description) updateTask(live.id, { description: notes.trim() || undefined });
  };
  const openTask = (id: string) => (host ? host.open(id) : undefined);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const added: Attachment[] = [];
    let rejected = 0;
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        rejected++;
        continue;
      }
      const id = uid();
      try {
        await saveAttachmentBlob(id, file);
      } catch {
        rejected++;
        continue;
      }
      added.push({ id, name: file.name, type: file.type, size: file.size, createdAt: new Date().toISOString() });
    }
    if (added.length) updateTask(live.id, { attachments: [...live.attachments, ...added] });
    if (rejected) toast(`Не прикреплено (больше ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} МБ или ошибка): ${rejected}`);
  }
  async function removeAttachment(att: Attachment) {
    await deleteAttachmentBlob(att.id).catch(() => undefined);
    updateTask(live.id, { attachments: live.attachments.filter((a) => a.id !== att.id) });
  }

  const status = live.done ? (
    <span style={{ color: B.text2 }}>Готово{live.completedAt ? ` · ${formatDate(live.completedAt)}` : ""}</span>
  ) : blockers.length ? (
    <button type="button" onClick={() => openTask(blockers[0].id)} style={{ color: B.danger }} className="truncate underline-offset-4 hover:underline">
      Ждёт «{blockers[0].title}»
    </button>
  ) : isSnoozed(live) && live.snoozedUntil ? (
    <span style={{ color: B.text2 }}>Отложена до {dueLabel(live.snoozedUntil)}</span>
  ) : overdue ? (
    <span style={{ color: B.danger }}>Просрочена</span>
  ) : (
    "В работе"
  );

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <CardChrome
        label={`Задача: ${live.title}`}
        onClose={onClose}
        eyebrow={
          <>
            <span style={{ ...T.caps, color: B.off }}>Задача</span>
            {project ? (
              <Link to={`/projects/${project.id}`} onClick={onClose} className="flex min-w-0 items-center gap-1.5 truncate transition-colors hover:text-white">
                {project.name} <Hook size={11} />
              </Link>
            ) : (
              "Без проекта"
            )}
          </>
        }
        actions={
          <IconBtn label="Ещё" onClick={(el) => more.toggle(el, "right")}>
            <Dots />
          </IconBtn>
        }
        cta={
          <CtaBar tone={live.done ? "dark" : "lime"} onClick={() => act.toggle(live)} height={64}>
            {live.done ? "Вернуть в работу" : "Готово"}
          </CtaBar>
        }
      >
        {/* title */}
        <div className="flex items-start gap-4">
          <span className="pt-[9px]">
            <Check done={live.done} onClick={() => act.toggle(live)} label={live.title} size={20} />
          </span>
          <textarea
            ref={titleRef}
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            aria-label="Название задачи"
            className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent outline-none"
            style={{ ...T.displayM, fontWeight: 500, color: live.done ? B.text4 : B.text, textDecoration: live.done ? "line-through" : undefined }}
          />
        </div>
        <textarea
          ref={notesRef}
          value={notes}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder="Заметки, контекст, договорённости…"
          aria-label="Описание"
          className="mt-4 w-full resize-none overflow-hidden bg-transparent pl-9 outline-none placeholder:text-[#454545]"
          style={{ ...T.bodyL, color: B.text2 }}
        />

        {/* properties */}
        <div className="mt-10" style={{ borderTop: `1px solid ${B.l10}` }}>
          <CardRow k="Статус">{status}</CardRow>
          <CardRow k="Срок">
            <ValueBtn onClick={(el) => due.toggle(el, "right")} color={overdue ? B.danger : live.dueDate ? B.text : B.text3}>
              {live.dueDate ? `${dueLabel(live.dueDate)} · ${dayHint(live.dueDate)}` : "Без срока"}
            </ValueBtn>
          </CardRow>
          <CardRow k="Приоритет">
            <ValueBtn onClick={(el) => prio.toggle(el, "right")} color={live.priority ? B.text : B.text3}>
              <Signal value={PRIORITY_BARS[live.priority]} on={B.text2} off={B.l15} w={4} h={10} />
              {PRIORITY_META[live.priority].label}
            </ValueBtn>
          </CardRow>
          <CardRow k="Проект">
            <ValueBtn onClick={(el) => proj.toggle(el, "right")} color={project ? B.text : B.text3}>
              {project ? `${project.name}${projects.some((p) => p.id === project.id) ? "" : " · в архиве"}` : "Без проекта"}
            </ValueBtn>
          </CardRow>
          {sections.length > 0 && (
            <CardRow k="Секция">
              <ValueBtn onClick={(el) => sec.toggle(el, "right")} color={live.section ? B.text : B.text3}>
                {live.section ?? "Без секции"}
              </ValueBtn>
            </CardRow>
          )}
          <CardRow k="Теги">
            {allTags.map((tag) => {
              const on = live.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => act.toggleTag(live, tag)}
                  className="outline-none transition-colors hover:!text-white focus-visible:underline"
                  style={{ ...T.body, color: on ? B.text : B.off }}
                >
                  #{tag}
                </button>
              );
            })}
          </CardRow>
          <CardRow k="Повтор">
            <ValueBtn onClick={(el) => rec.toggle(el, "right")} color={live.recurrence !== "none" ? B.text : B.text3}>
              {RECURRENCE_LABEL[live.recurrence]}
            </ValueBtn>
          </CardRow>
          <CardRow k="Напоминание">
            <input
              type="datetime-local"
              value={live.remindAt ?? ""}
              onChange={(e) => updateTask(live.id, { remindAt: e.target.value || undefined })}
              aria-label="Напоминание"
              className="bg-transparent text-right outline-none"
              style={{ ...T.body, color: live.remindAt ? B.text : B.text3, colorScheme: "dark" }}
            />
            {live.remindAt && <XBtn always label="Убрать напоминание" onClick={() => updateTask(live.id, { remindAt: undefined })} />}
          </CardRow>
          <CardRow k="Время">
            <span>{formatDuration(live.spentMin)}</span>
            <span style={{ color: B.text3 }}>из</span>
            <input
              key={`${live.id}-${live.estimateMin ?? ""}`}
              type="number"
              min={0}
              defaultValue={live.estimateMin ?? ""}
              onBlur={(e) => {
                const n = e.target.value ? Number(e.target.value) : undefined;
                if (n !== live.estimateMin) updateTask(live.id, { estimateMin: n });
              }}
              placeholder="—"
              aria-label="Оценка, минут"
              className="-mx-1 w-12 bg-transparent text-center outline-none placeholder:text-[#7F7F7F] focus:shadow-[inset_0_-1px_0_#ADFB0C] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              style={{ ...T.body, color: B.text }}
            />
            <span style={{ color: B.text3 }}>мин</span>
            <button
              type="button"
              onClick={() => (live.timerStartedAt ? stopTimer(live.id) : startTimer(live.id))}
              className="ml-2 h-7 px-3 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
              style={{ ...T.meta, color: live.timerStartedAt ? B.text : B.text2, boxShadow: `inset 0 0 0 1px ${live.timerStartedAt ? B.l40 : B.l20}` }}
            >
              {live.timerStartedAt ? "Стоп" : "Таймер"}
            </button>
          </CardRow>
        </div>

        {/* subtasks */}
        <div className="mt-12">
          <div className="flex items-baseline justify-between gap-4 pb-3">
            <span className="flex items-baseline gap-3">
              <span style={{ ...T.num, color: B.off }}>01</span>
              <span style={T.title}>Подзадачи</span>
              {live.subtasks.length > 0 && <span style={{ ...T.meta, color: B.text3, ...tab }}>{`${subDone} из ${live.subtasks.length}`}</span>}
            </span>
            <span className="flex items-center gap-5" style={{ ...T.meta, color: B.text3 }}>
              {settings.checklistTemplates.length > 0 && (
                <button type="button" data-float-trigger onClick={(e) => tpl.toggle(e.currentTarget, "right")} className="hover:text-white">
                  Шаблон ↳
                </button>
              )}
              {live.subtasks.length > 0 && (
                <button type="button" onClick={() => setSavingTpl((v) => !v)} className="hover:text-white" title="Сохранить подзадачи как шаблон">
                  В шаблон
                </button>
              )}
            </span>
          </div>
          {savingTpl && (
            <LineInput
              autoFocus
              placeholder="Название шаблона — Enter сохранит"
              onEscape={() => setSavingTpl(false)}
              onSubmit={(name) => {
                addChecklistTemplate(name, live.subtasks.map((s) => s.title));
                toast(`Шаблон «${name}» сохранён`);
                setSavingTpl(false);
              }}
            />
          )}
          <ul style={{ borderTop: `1px solid ${B.l10}` }}>
            {live.subtasks.map((s) => (
              <SubtaskLine key={s.id} taskId={live.id} s={s} onOpen={() => setSubOpen(s.id)} />
            ))}
          </ul>
          <LineInput placeholder="Добавить подзадачу" onSubmit={(v) => addSubtask(live.id, v)} />
        </div>

        {/* secondary */}
        <div className="mt-12" style={{ borderTop: `1px solid ${B.l10}` }}>
          <Fold n="02" title="Ссылки" count={live.links.length}>
            <ul>
              {live.links.map((l) => (
                <li key={l} className="group flex h-10 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
                  <a href={l} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-4 hover:underline" style={{ ...T.body, color: B.text2 }}>
                    {l.replace(/^https?:\/\//, "")}
                  </a>
                  <XBtn label={`Удалить ссылку: ${l}`} onClick={() => updateTask(live.id, { links: live.links.filter((x) => x !== l) })} />
                </li>
              ))}
            </ul>
            <LineInput placeholder="https://…" onSubmit={(v) => updateTask(live.id, { links: [...live.links, v] })} />
          </Fold>
          <Fold n="03" title="Вложения" count={live.attachments.length}>
            <ul>
              {live.attachments.map((a) => (
                <AttachmentLine key={a.id} att={a} onPreview={() => setPreview(a)} onRemove={() => removeAttachment(a)} />
              ))}
            </ul>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-11 w-full items-center gap-3 text-left outline-none transition-colors hover:text-white focus-visible:underline"
              style={{ ...T.body, color: B.text3, borderBottom: `1px solid ${B.l7}` }}
            >
              <span style={{ color: B.off }}>
                <Hook size={12} />
              </span>
              Прикрепить файл
              <span className="ml-auto" style={{ ...T.meta, color: B.off }}>
                до {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} МБ
              </span>
            </button>
          </Fold>
          <Fold n="04" title="Комментарии" count={live.comments.length}>
            <ul className="flex flex-col">
              {live.comments.map((c) => (
                <CommentLine
                  key={c.id}
                  c={c}
                  onSave={(text) => updateTask(live.id, { comments: live.comments.map((x) => (x.id === c.id ? { ...x, text } : x)) })}
                  onRemove={() => updateTask(live.id, { comments: live.comments.filter((x) => x.id !== c.id) })}
                />
              ))}
            </ul>
            <LineInput
              placeholder="Комментарий"
              onSubmit={(v) => updateTask(live.id, { comments: [...live.comments, { id: uid(), text: v, at: new Date().toISOString() }] })}
            />
          </Fold>
          <Fold n="05" title="Зависит от" count={deps.length}>
            <ul>
              {deps.map((d) => (
                <li key={d.id} className="group flex h-10 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
                  <button
                    type="button"
                    onClick={() => openTask(d.id)}
                    className="min-w-0 flex-1 truncate text-left underline-offset-4 decoration-white/30 hover:underline"
                    style={{ ...T.body, color: d.done ? B.text4 : B.text2, textDecoration: d.done ? "line-through" : undefined }}
                  >
                    {d.title}
                  </button>
                  {!d.done && <span style={{ ...T.meta, color: B.danger }}>не закрыта</span>}
                  <XBtn label={`Убрать зависимость: ${d.title}`} onClick={() => updateTask(live.id, { blockedBy: (live.blockedBy ?? []).filter((x) => x !== d.id) })} />
                </li>
              ))}
            </ul>
            <label className="flex h-11 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
              <span style={{ color: B.off }}>
                <Hook size={12} />
              </span>
              <input
                value={depQ}
                onChange={(e) => setDepQ(e.target.value)}
                placeholder="Найти задачу, которую нужно закрыть раньше…"
                aria-label="Добавить зависимость"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
                style={{ ...T.body, color: B.text }}
              />
            </label>
            {depHits.length > 0 && (
              <ul>
                {depHits.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        updateTask(live.id, { blockedBy: [...(live.blockedBy ?? []), t.id] });
                        setDepQ("");
                      }}
                      className="flex h-9 w-full items-center gap-3 pl-6 text-left outline-none transition-colors hover:bg-white/[0.03] hover:text-white focus-visible:bg-white/[0.03]"
                      style={{ ...T.body, color: B.text2 }}
                    >
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.done && <span style={{ ...T.meta, color: B.text3 }}>готово</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {depQ.trim() && depHits.length === 0 && (
              <p className="py-3 pl-6" style={{ ...T.meta, color: B.text3 }}>
                Ничего не найдено.
              </p>
            )}
          </Fold>
        </div>

        <div className="mt-8" style={{ ...T.meta, color: B.off, ...tab }}>
          Создана {formatDate(live.createdAt)}
          {live.subtasks.length > 0 ? ` · ${live.subtasks.length} ${plural(live.subtasks.length, "подзадача", "подзадачи", "подзадач")}` : ""}
        </div>

        {due.at && (
          <FloatMenu at={due.at} onClose={due.close}>
            <DueMenuBody
              value={live.dueDate}
              onPick={(d) => act.setDue(live.id, d)}
              snooze={{ snoozed: isSnoozed(live), onSnooze: (u) => act.snooze(live.id, u) }}
            />
          </FloatMenu>
        )}
        {prio.at && (
          <FloatMenu at={prio.at} onClose={prio.close} width={220}>
            <PriorityMenuBody value={live.priority} onPick={(p) => act.setPriority(live.id, p)} />
          </FloatMenu>
        )}
        {proj.at && (
          <FloatMenu at={proj.at} onClose={proj.close}>
            <ProjectMenuBody value={live.projectId} projects={projectChoices} onPick={(id) => act.setProject(live.id, id)} />
          </FloatMenu>
        )}
        {rec.at && (
          <FloatMenu at={rec.at} onClose={rec.close} width={240}>
            <MenuLabel>Повтор</MenuLabel>
            {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
              <MenuItem key={r} checked={live.recurrence === r} onSelect={() => updateTask(live.id, { recurrence: r })}>
                {RECURRENCE_LABEL[r]}
              </MenuItem>
            ))}
          </FloatMenu>
        )}
        {sec.at && (
          <FloatMenu at={sec.at} onClose={sec.close} width={240}>
            <MenuLabel>Секция</MenuLabel>
            <MenuItem checked={!live.section} onSelect={() => updateTask(live.id, { section: undefined })}>
              Без секции
            </MenuItem>
            {sections.map((s) => (
              <MenuItem key={s} checked={live.section === s} onSelect={() => updateTask(live.id, { section: s })}>
                {s}
              </MenuItem>
            ))}
          </FloatMenu>
        )}
        {tpl.at && (
          <FloatMenu at={tpl.at} onClose={tpl.close}>
            <MenuLabel>Добавить из шаблона</MenuLabel>
            {settings.checklistTemplates.map((t) => (
              <MenuItem key={t.id} hint={t.items.length} onSelect={() => t.items.forEach((it) => addSubtask(live.id, it))}>
                {t.name}
              </MenuItem>
            ))}
          </FloatMenu>
        )}
        {more.at && (
          <FloatMenu at={more.at} onClose={more.close}>
            <MenuLabel>Отложить</MenuLabel>
            {isSnoozed(live) ? (
              <MenuItem onSelect={() => act.snooze(live.id, null)}>Вернуть из отложенных</MenuItem>
            ) : (
              <>
                <MenuItem onSelect={() => act.snooze(live.id, inDays(1))}>До завтра</MenuItem>
                <MenuItem onSelect={() => act.snooze(live.id, nextMonday())}>До понедельника</MenuItem>
                <MenuItem onSelect={() => act.snooze(live.id, inDays(7))}>На неделю</MenuItem>
              </>
            )}
            <MenuSep />
            <MenuItem onSelect={() => fileRef.current?.click()}>Прикрепить файл</MenuItem>
            <MenuSep />
            <MenuItem
              onSelect={() => {
                act.archive(live);
                onClose();
              }}
            >
              В архив
            </MenuItem>
            <MenuItem
              danger
              onSelect={() => {
                act.remove(live);
                onClose();
              }}
            >
              Удалить задачу
            </MenuItem>
          </FloatMenu>
        )}
      </CardChrome>

      {subOpen && <SubtaskPanel taskId={live.id} subtaskId={subOpen} onClose={() => setSubOpen(null)} onOpenParent={() => setSubOpen(null)} stacked />}
      <FilePreview att={preview} onClose={() => setPreview(null)} />
    </>
  );
}

/* ── Subtask card — the small-task counterpart: own date, reminder, priority, notes ─────────── */

export function SubtaskPanel({
  taskId,
  subtaskId,
  onClose,
  onOpenParent,
  stacked,
}: {
  taskId: string;
  subtaskId: string;
  onClose: () => void;
  /** Click on the parent's title. */
  onOpenParent: (parentId: string) => void;
  /** Opened over the parent's own card — narrower, lighter dim. */
  stacked?: boolean;
}) {
  const { allTasks, toggleSubtask, updateSubtask, deleteSubtask } = useData();
  const parent = allTasks.find((t) => t.id === taskId);
  const live = parent?.subtasks.find((s) => s.id === subtaskId);
  const [title, setTitle] = useState(live?.title ?? "");
  const [notes, setNotes] = useState(live?.description ?? "");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(titleRef, title);
  useAutoHeight(notesRef, notes);
  useEffect(() => {
    setTitle(live?.title ?? "");
    setNotes(live?.description ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, subtaskId]);
  const due = useFloat();
  const prio = useFloat();

  // Window capture runs before the task card's own Esc — the top layer closes first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[data-float-menu]")) return;
      e.stopPropagation();
      if (isTyping(e.target)) {
        (e.target as HTMLElement).blur();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!parent || !live) return null;
  const set = (patch: Partial<Subtask>) => updateSubtask(parent.id, live.id, patch);
  const p = live.priority ?? 0;
  const overdue = !live.done && isOverdue(live.dueDate);

  return (
    <CardChrome
      label={`Подзадача: ${live.title}`}
      onClose={onClose}
      width={stacked ? 520 : 560}
      z={stacked ? 62 : 50}
      dim={!stacked}
      eyebrow={
        <>
          <span style={{ ...T.caps, color: B.off }}>Подзадача</span>
          <button
            type="button"
            onClick={() => onOpenParent(parent.id)}
            title="Открыть родительскую задачу"
            className="flex min-w-0 items-center gap-1.5 truncate transition-colors hover:text-white"
          >
            <span className="truncate">{parent.title}</span> <Hook size={11} />
          </button>
        </>
      }
      cta={
        <CtaBar tone={live.done ? "dark" : "lime"} onClick={() => toggleSubtask(parent.id, live.id)} height={64}>
          {live.done ? "Вернуть в работу" : "Готово"}
        </CtaBar>
      }
    >
      <div className="flex items-start gap-4">
        <span className="pt-[7px]">
          <Check done={live.done} onClick={() => toggleSubtask(parent.id, live.id)} label={live.title} size={18} />
        </span>
        <textarea
          ref={titleRef}
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          onBlur={() => {
            const t = title.trim();
            if (t && t !== live.title) set({ title: t });
            else setTitle(live.title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          aria-label="Название подзадачи"
          className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent outline-none"
          style={{ ...T.displayS, color: live.done ? B.text4 : B.text, textDecoration: live.done ? "line-through" : undefined }}
        />
      </div>
      <textarea
        ref={notesRef}
        value={notes}
        rows={2}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => (notes.trim() || undefined) !== live.description && set({ description: notes.trim() || undefined })}
        placeholder="Заметки"
        aria-label="Заметки подзадачи"
        className="mt-4 w-full resize-none overflow-hidden bg-transparent pl-[34px] outline-none placeholder:text-[#454545]"
        style={{ ...T.bodyL, color: B.text2 }}
      />

      <div className="mt-10" style={{ borderTop: `1px solid ${B.l10}` }}>
        <CardRow k="Статус">
          {live.done ? (
            <span style={{ color: B.text2 }}>Готово{live.completedAt ? ` · ${formatDate(live.completedAt)}` : ""}</span>
          ) : overdue ? (
            <span style={{ color: B.danger }}>Просрочена</span>
          ) : (
            "В работе"
          )}
        </CardRow>
        <CardRow k="Срок">
          <ValueBtn onClick={(el) => due.toggle(el, "right")} color={overdue ? B.danger : live.dueDate ? B.text : B.text3}>
            {live.dueDate ? `${dueLabel(live.dueDate)} · ${dayHint(live.dueDate)}` : "Без срока"}
          </ValueBtn>
        </CardRow>
        <CardRow k="Приоритет">
          <ValueBtn onClick={(el) => prio.toggle(el, "right")} color={p ? B.text : B.text3}>
            <Signal value={PRIORITY_BARS[p]} on={B.text2} off={B.l15} w={4} h={10} />
            {PRIORITY_META[p].label}
          </ValueBtn>
        </CardRow>
        <CardRow k="Напоминание">
          <input
            type="datetime-local"
            value={live.remindAt ?? ""}
            onChange={(e) => set({ remindAt: e.target.value || undefined })}
            aria-label="Напоминание подзадачи"
            className="bg-transparent text-right outline-none"
            style={{ ...T.body, color: live.remindAt ? B.text : B.text3, colorScheme: "dark" }}
          />
          {live.remindAt && <XBtn always label="Убрать напоминание" onClick={() => set({ remindAt: undefined })} />}
        </CardRow>
        <CardRow k="Задача">
          <button type="button" onClick={() => onOpenParent(parent.id)} className="truncate underline-offset-4 decoration-white/30 hover:underline">
            {parent.title}
          </button>
        </CardRow>
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          deleteSubtask(parent.id, live.id);
        }}
        className="mt-12 outline-none transition-colors duration-200 hover:text-[#FF5A36] focus-visible:underline"
        style={{ ...T.meta, color: B.text3 }}
      >
        Удалить подзадачу
      </button>

      {due.at && (
        <FloatMenu at={due.at} onClose={due.close}>
          <DueMenuBody value={live.dueDate} onPick={(d) => set({ dueDate: d })} remind={{ value: live.remindAt, onChange: (v) => set({ remindAt: v }) }} />
        </FloatMenu>
      )}
      {prio.at && (
        <FloatMenu at={prio.at} onClose={prio.close} width={220}>
          <PriorityMenuBody value={p} onPick={(v) => set({ priority: v })} />
        </FloatMenu>
      )}
    </CardChrome>
  );
}
