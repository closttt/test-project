/**
 * «Индекс» · quick add task (N). Parity with src/components/QuickAddDialog.tsx: one line with live
 * natural-language parsing (date, time → reminder, ~estimate, repeat, #tags, !важно — plus the
 * Index add bar's «@проект»), priority, due date (an explicit pick wins over the NLP guess) and
 * project — defaulting to the project on screen when opened from /projects/:id.
 */
import { useEffect, useState } from "react";
import { useMatch } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { addDays, dueLabel, formatDuration } from "@/lib/format";
import { PRIORITY_META, type Priority } from "@/types";
import { B, T, tab, Signal, PRIORITY_BARS, Tag } from "@/design-lab/screens/_kit/index";
import { Modal, Prop, Select, parseQuick } from "@/design-lab/screens/_kit/index-ui";
import { ActionButton, DialogFoot, LineInput, MOD, Kbd } from "./ui";

const RECURRENCE_LABEL: Record<string, string> = {
  daily: "каждый день",
  weekdays: "по будням",
  weekly: "каждую неделю",
  monthly: "каждый месяц",
  "monthly-first-monday": "первый пн месяца",
};

const NONE = "none";

function nextMonday(): string {
  const d = new Date();
  const diff = (8 - d.getDay()) % 7 || 7;
  return addDays(d, diff);
}

/** Text option of a minimal segmented row: active = white + 1px underline. */
function Opt({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className="relative flex h-8 items-center gap-2 whitespace-nowrap outline-none transition-colors duration-200 hover:text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
      style={{ ...T.body, ...tab, color: on ? B.text : B.text3 }}
    >
      {children}
      <span className="absolute inset-x-0 bottom-0.5 h-px transition-opacity duration-200" style={{ background: B.text, opacity: on ? 1 : 0 }} />
    </button>
  );
}

export function QuickAdd() {
  const { addTask, projects } = useData();
  const { quickAddOpen, setQuickAddOpen } = useUI();
  const { toast } = useToast();
  // Opened while looking at a project → file into that project by default (same as AppLayout).
  const projectMatch = useMatch("/projects/:id");
  const defaultProjectId = projectMatch?.params.id;

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? NONE);
  const [projectTouched, setProjectTouched] = useState(false);
  const [priority, setPriority] = useState<Priority>(0);
  const [dueOverride, setDueOverride] = useState<string | null>(null);

  useEffect(() => {
    if (quickAddOpen) {
      setProjectId(defaultProjectId ?? NONE);
      setProjectTouched(false);
    } else {
      setTitle("");
      setPriority(0);
      setDueOverride(null);
    }
  }, [quickAddOpen, defaultProjectId]);

  const parsed = parseQuick(title, projects);
  // Explicit picks win over what the line says.
  const effectiveDue = dueOverride !== null ? dueOverride || undefined : parsed.dueDate;
  const effectiveProject = projectTouched ? (projectId === NONE ? undefined : projectId) : parsed.projectId ?? (projectId === NONE ? undefined : projectId);

  function submit() {
    const finalTitle = parsed.title.trim() || title.trim();
    if (!finalTitle) return;
    addTask({
      title: finalTitle,
      done: false,
      projectId: effectiveProject,
      dueDate: effectiveDue,
      tags: parsed.tags,
      important: parsed.important,
      priority,
      remindAt: parsed.remindAt,
      estimateMin: parsed.estimateMin,
      recurrence: parsed.recurrence,
    });
    const where = effectiveProject ? projects.find((p) => p.id === effectiveProject)?.name : undefined;
    toast(where ? `Задача добавлена в «${where}»` : "Задача добавлена");
    setQuickAddOpen(false);
  }

  const hints = [
    parsed.dueDate && `срок ${dueLabel(parsed.dueDate).toLowerCase()}`,
    parsed.remindAt && `напомнить в ${parsed.remindAt.slice(11, 16)}`,
    parsed.estimateMin && `≈ ${formatDuration(parsed.estimateMin)}`,
    parsed.recurrence && RECURRENCE_LABEL[parsed.recurrence],
    parsed.important && "!важно",
    parsed.projectName && `@${parsed.projectName}`,
    ...parsed.tags.map((t) => `#${t}`),
  ].filter(Boolean) as string[];

  const picks: [string, string][] = [
    ["Сегодня", addDays(new Date(), 0)],
    ["Завтра", addDays(new Date(), 1)],
    ["Понедельник", nextMonday()],
    ["Через неделю", addDays(new Date(), 7)],
  ];

  return (
    <Modal
      open={quickAddOpen}
      onClose={() => setQuickAddOpen(false)}
      n="N"
      title="Новая задача"
      width={620}
      top="14vh"
      footer={
        <DialogFoot
          hint={
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> добавить <span style={{ color: B.off }}>·</span> <Kbd>{MOD}</Kbd>
              <Kbd>↵</Kbd> из любого поля
            </span>
          }
          onCancel={() => setQuickAddOpen(false)}
          primary={
            <ActionButton onClick={submit} disabled={!title.trim()}>
              Добавить
            </ActionButton>
          }
        />
      }
    >
      <div
        className="px-5 pb-2 pt-6"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <LineInput
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.metaKey && !e.ctrlKey && submit()}
          placeholder="Отправить прайс завтра #клиент !важно"
          aria-label="Название задачи"
        />
        <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 pt-3">
          {hints.length ? (
            hints.map((h) => (
              <Tag key={h} color={B.text2}>
                {h}
              </Tag>
            ))
          ) : (
            <span style={{ ...T.meta, color: B.off }}>
              Пишите прямо в строке: «завтра в 15:00», «через 3 дня», «~30м», «каждый день», «#тег», «!важно», «@проект».
            </span>
          )}
        </div>

        <div className="mt-4" style={{ borderTop: `1px solid ${B.l10}` }}>
          <Prop k="Приоритет">
            <div className="flex flex-wrap items-center justify-end gap-x-5">
              {([1, 2, 3, 0] as Priority[]).map((p) => (
                <Opt key={p} on={priority === p} onClick={() => setPriority(p)}>
                  {p !== 0 && <Signal value={PRIORITY_BARS[p]} on={priority === p ? B.text : B.text3} off={B.l15} w={3} h={9} />}
                  {p === 0 ? "Нет" : PRIORITY_META[p].short}
                </Opt>
              ))}
            </div>
          </Prop>
          <Prop k="Срок">
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
              {picks.map(([label, d]) => (
                <Opt key={label} on={effectiveDue === d} onClick={() => setDueOverride(effectiveDue === d ? "" : d)}>
                  {label}
                </Opt>
              ))}
              <input
                type="date"
                aria-label="Выбрать дату"
                value={effectiveDue ?? ""}
                onChange={(e) => setDueOverride(e.target.value)}
                className="h-8 w-[132px] bg-white/[0.02] px-2 outline-none focus:!shadow-[inset_0_0_0_1px_#ADFB0C]"
                style={{ ...T.meta, ...tab, color: effectiveDue ? B.text : B.text3, colorScheme: "dark", boxShadow: `inset 0 0 0 1px ${B.l15}` }}
              />
            </div>
          </Prop>
          <Prop k="Проект" last>
            <Select
              label="Проект"
              width={260}
              value={effectiveProject ?? NONE}
              onChange={(v) => {
                setProjectTouched(true);
                setProjectId(v);
              }}
              options={[{ value: NONE, label: "Без проекта" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </Prop>
        </div>
      </div>
    </Modal>
  );
}
