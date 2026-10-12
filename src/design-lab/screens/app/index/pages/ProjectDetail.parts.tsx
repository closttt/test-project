/**
 * «Индекс» · Проект — local parts: the task row (hairline, check, title, signal, due, ⋯), the
 * due-date menu. The task card itself is the shared one (useTaskPanel from _kit/index-ui).
 */
import { useEffect, useRef, useState } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { addDays, dueLabel, isOverdue, formatDuration } from "@/lib/format";
import { pushUndo } from "@/lib/undoStack";
import { PRIORITY_META, type Task } from "@/types";
import { B, T, tab, display, Check, CtaBar, Hook } from "@/design-lab/screens/_kit/index";
import { DragRow } from "@/components/dnd/DragRows";
import { useTaskPanel } from "@/design-lab/screens/_kit/index-ui";
import { Menu, DotsButton, PriorityPick, Panel, FieldRow, ValueButton, PH, type MenuItem } from "./Projects.parts";

/* ── Glyphs ────────────────────────────────────────────────────────────────────────────────── */

export function Chevron({ open, size = 10 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden
      style={{ transform: open ? "rotate(90deg)" : undefined, transition: `transform .2s ${B.easeOut}` }}
    >
      <path d="M3.5 1.5 7 5 3.5 8.5" fill="none" stroke="currentColor" strokeWidth={1.1} />
    </svg>
  );
}

/** 2×3 pixel grip — drag handle for sections. */
export function Grip() {
  return (
    <svg width="6" height="10" viewBox="0 0 6 10" aria-hidden>
      {[0, 4, 8].map((y) => (
        <g key={y}>
          <rect x="0" y={y} width="2" height="2" fill="currentColor" />
          <rect x="4" y={y} width="2" height="2" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

/* ── Due date: presets + native picker ─────────────────────────────────────────────────────── */

export function DueMenu({
  value,
  onChange,
  placeholder = "Срок",
  done,
  align = "right",
  large,
}: {
  value?: string;
  onChange: (d: string | undefined) => void;
  placeholder?: string;
  done?: boolean;
  align?: "left" | "right";
  large?: boolean;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const overdue = !done && isOverdue(value);
  const items: MenuItem[] = [
    { label: "Сегодня", onSelect: () => onChange(addDays(new Date(), 0)) },
    { label: "Завтра", onSelect: () => onChange(addDays(new Date(), 1)) },
    { label: "Через неделю", onSelect: () => onChange(addDays(new Date(), 7)) },
    {
      label: "Выбрать дату…",
      onSelect: () => {
        const el = pick.current;
        if (!el) return;
        try {
          el.showPicker();
        } catch {
          el.click();
        }
      },
    },
    ...(value ? ([{ kind: "sep" }, { label: "Убрать срок", danger: true, onSelect: () => onChange(undefined) }] as MenuItem[]) : []),
  ];
  return (
    <span className="relative inline-flex">
      <Menu
        align={align}
        width={200}
        label="Срок"
        items={items}
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-expanded={open}
            aria-label={value ? `Срок: ${dueLabel(value)}` : "Назначить срок"}
            className="outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
            style={{ ...(large ? T.body : T.meta), ...tab, color: value ? (overdue ? B.danger : large ? B.text : B.text3) : large ? B.text3 : B.off }}
          >
            {value ? dueLabel(value) : placeholder}
          </button>
        )}
      />
      <input
        ref={pick}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </span>
  );
}

/* ── Task row ──────────────────────────────────────────────────────────────────────────────── */

export const ROW_COLS = "14px 16px minmax(0,1fr) 40px 64px 32px";

export function TaskRow({
  t,
  sections,
  projects,
  currentProjectId,
  expanded,
  onToggleExpand,
  onOpen,
}: {
  t: Task;
  sections: string[];
  projects: { id: string; name: string }[];
  currentProjectId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
}) {
  const { toggleTask, updateTask, deleteTask, restoreTask, toggleSubtask } = useData();
  const { toast } = useToast();
  const card = useTaskPanel();
  const subDone = t.subtasks.filter((s) => s.done).length;

  const remove = () => {
    deleteTask(t.id);
    const run = pushUndo("Задача удалена", () => restoreTask(t));
    toast("Задача удалена", { actionLabel: "Вернуть", onAction: run });
  };

  const moveItems: MenuItem[] = [
    { label: "Открыть карточку", onSelect: onOpen },
    ...(sections.length
      ? ([
          { kind: "head", label: "В секцию" },
          { label: "Без секции", active: !t.section, onSelect: () => updateTask(t.id, { section: undefined }) },
          ...sections.map((s) => ({ label: s, active: t.section === s, hint: t.section === s ? "✓" : undefined, onSelect: () => updateTask(t.id, { section: s }) })),
        ] as MenuItem[])
      : []),
    { kind: "head", label: "В проект" },
    { label: "Без проекта", onSelect: () => updateTask(t.id, { projectId: undefined, section: undefined }) },
    ...projects
      .filter((p) => p.id !== currentProjectId)
      .map((p) => ({ label: p.name, onSelect: () => updateTask(t.id, { projectId: p.id, section: undefined }) })),
    { kind: "sep" },
    { label: "Удалить задачу", danger: true, onSelect: remove },
  ];

  return (
    <DragRow id={t.id} data={{ type: "task" }}>
      <div
        className="group grid min-h-[52px] items-center gap-x-3 transition-colors duration-200 hover:bg-white/[0.02]"
        style={{ gridTemplateColumns: ROW_COLS, borderBottom: `1px solid ${B.l7}` }}
      >
        <span className="flex justify-center" style={{ color: B.text3 }}>
          {t.subtasks.length > 0 && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              aria-label={expanded ? "Свернуть подзадачи" : "Развернуть подзадачи"}
              className="flex h-6 w-4 items-center justify-center outline-none hover:text-white focus-visible:text-white"
            >
              <Chevron open={expanded} />
            </button>
          )}
        </span>
        <Check done={t.done} onClick={() => toggleTask(t.id)} label={t.title} />
        <span className="min-w-0 py-2">
          <button
            type="button"
            onClick={onOpen}
            title="Открыть карточку задачи"
            className="block max-w-full truncate text-left outline-none transition-colors duration-200 hover:text-white focus-visible:underline"
            style={{ ...T.bodyL, color: t.done ? B.text4 : B.text, textDecoration: t.done ? "line-through" : undefined }}
          >
            {t.title}
          </button>
          {(t.subtasks.length > 0 || t.tags.length > 0 || t.estimateMin) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3" style={{ ...T.meta, color: B.text3 }}>
              {t.subtasks.length > 0 && (
                <button type="button" onClick={onToggleExpand} className="outline-none hover:text-white" style={tab}>
                  {subDone}/{t.subtasks.length} подзадач
                </button>
              )}
              {t.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
              {t.estimateMin ? <span style={tab}>≈ {formatDuration(t.estimateMin)}</span> : null}
            </span>
          )}
        </span>
        <span className="flex justify-center">
          <PriorityPick value={t.priority} onChange={(p) => updateTask(t.id, { priority: p })} />
        </span>
        <span className="flex justify-end">
          <DueMenu value={t.dueDate} done={t.done} onChange={(d) => updateTask(t.id, { dueDate: d })} />
        </span>
        <span className="flex justify-end">
          <Menu
            width={240}
            label={`Действия: ${t.title}`}
            items={moveItems}
            trigger={({ toggle, open }) => (
              <span className="opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100" style={open ? { opacity: 1 } : undefined}>
                <DotsButton label={`Действия: ${t.title}`} onClick={toggle} open={open} size={28} />
              </span>
            )}
          />
        </span>
      </div>
      {expanded && t.subtasks.length > 0 && (
        <ul className="pb-2 pl-[58px]" style={{ borderBottom: `1px solid ${B.l7}` }}>
          {t.subtasks.map((s) => (
            <li key={s.id} className="flex h-9 items-center gap-3">
              <Check done={s.done} onClick={() => toggleSubtask(t.id, s.id)} label={s.title} size={14} />
              <button
                type="button"
                onClick={() => card.openSubtask(t.id, s.id)}
                title="Открыть карточку подзадачи"
                className="min-w-0 flex-1 truncate text-left outline-none transition-colors hover:text-white focus-visible:underline"
                style={{ ...T.body, color: s.done ? B.text4 : B.text2, textDecoration: s.done ? "line-through" : undefined }}
              >
                {s.title}
              </button>
              {s.dueDate && (
                <span style={{ ...T.meta, ...tab, color: !s.done && isOverdue(s.dueDate) ? B.danger : B.text3 }}>{dueLabel(s.dueDate)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </DragRow>
  );
}

/* ── Inline add row («↳ Задача в …») ───────────────────────────────────────────────────────── */

export function AddRow({ placeholder, onAdd, id, quiet }: { placeholder: string; onAdd: (text: string) => void; id?: string; quiet?: boolean }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex h-11 items-center gap-3"
      style={{ borderBottom: quiet ? undefined : `1px solid ${B.l7}` }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v.trim());
        setV("");
      }}
    >
      <span className="flex w-[14px] justify-center" style={{ color: B.off }}>
        <Hook size={12} />
      </span>
      <input
        id={id}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className={`min-w-0 flex-1 bg-transparent outline-none ${PH}`}
        style={{ ...T.body, color: B.text }}
      />
    </form>
  );
}
