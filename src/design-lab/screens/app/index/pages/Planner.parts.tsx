/**
 * «Индекс» · Планер — local parts: square switch, ± stepper, the block's case panel.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { B, T, tab, display, Signal, PRIORITY_BARS } from "@/design-lab/screens/_kit/index";
import { DAY_MIN, SLOT_MIN, startFromOffset, formatClock, formatRange, formatDuration } from "@/lib/planner";
import { PRIORITY_META, type PlanBlock, type PlanTemplate, type Task, type Project } from "@/types";

import { CasePanel, PanelHead, Prop, DangerLink, useTaskPanel } from "@/design-lab/screens/_kit/index-ui";

/** Square 32×18 switch; on = white (the screen's lime belongs to «сегодня»). */
export function Switch({ on, onChange, label, children }: { on: boolean; onChange: (v: boolean) => void; label: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className="group flex items-center gap-3 outline-none focus-visible:underline"
      style={{ ...T.body, color: on ? B.text : B.text3 }}
    >
      <span className="relative h-[18px] w-8 shrink-0 transition-colors duration-200" style={{ boxShadow: `inset 0 0 0 1px ${on ? B.text : B.l25}`, background: on ? B.text : "transparent" }}>
        <span
          className="absolute top-[3px] h-3 w-3 transition-[left,background] duration-200"
          style={{ left: on ? 17 : 3, background: on ? B.bg : B.text3, transitionTimingFunction: B.easeOut }}
        />
      </span>
      {children}
    </button>
  );
}

/** «− 09:00 +» */
export function Stepper({ value, onMinus, onPlus, label }: { value: ReactNode; onMinus: () => void; onPlus: () => void; label: string }) {
  const btn =
    "flex h-8 w-8 items-center justify-center outline-none transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C]";
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={onMinus} aria-label={`${label}: меньше`} className={btn} style={{ color: B.text2, boxShadow: `inset 0 0 0 1px ${B.l15}` }}>
        −
      </button>
      <span className="min-w-[112px] text-center" style={{ ...T.body, ...tab, color: B.text }}>
        {value}
      </span>
      <button type="button" onClick={onPlus} aria-label={`${label}: больше`} className={btn} style={{ color: B.text2, boxShadow: `inset 0 0 0 1px ${B.l15}` }}>
        +
      </button>
    </span>
  );
}

const longDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

/** The block's card as a right-side case: title, time steppers, links, CtaBar «Готово». */
export function BlockCase({
  block,
  title,
  done,
  task,
  project,
  template,
  onClose,
  onRename,
  onPatch,
  onToggleDone,
  onDelete,
}: {
  block: PlanBlock | null;
  title: string;
  done: boolean;
  task?: Task;
  project?: Project;
  template?: PlanTemplate;
  onClose: () => void;
  onRename: (title: string) => void;
  onPatch: (patch: Partial<PlanBlock>) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(title);
  const card = useTaskPanel();
  useEffect(() => setDraft(title), [title, block?.id]);
  if (!block) return null;
  const commit = () => {
    const t = draft.trim();
    if (t && t !== title) onRename(t);
  };
  const setDuration = (min: number) => onPatch({ durationMin: Math.max(SLOT_MIN, Math.min(DAY_MIN - block.startMin, min)) });
  const setStart = (min: number) => onPatch({ startMin: startFromOffset(min, block.durationMin) });

  return (
    <CasePanel
      open
      onClose={onClose}
      eyebrow={`Планер · ${longDay(block.date)}`}
      title={
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          aria-label="Название блока"
          className="w-full bg-transparent outline-none"
          style={{ ...display(44), color: done ? B.text4 : B.text, textDecoration: done ? "line-through" : undefined }}
        />
      }
      deck={
        <span style={tab}>
          {formatRange(block.startMin, block.durationMin)} · {formatDuration(block.durationMin)}
          {done ? " · готово" : ""}
        </span>
      }
      cta={done ? "Вернуть в работу" : "Готово"}
      onCta={onToggleDone}
    >
      <PanelHead n="01" title="Время" />
      <Prop k="Начало">
        <Stepper label="Начало" value={formatClock(block.startMin)} onMinus={() => setStart(block.startMin - SLOT_MIN)} onPlus={() => setStart(block.startMin + SLOT_MIN)} />
      </Prop>
      <Prop k="Длительность" last>
        <Stepper
          label="Длительность"
          value={`${formatDuration(block.durationMin)} · до ${formatRange(block.startMin, block.durationMin).split("–")[1]}`}
          onMinus={() => setDuration(block.durationMin - SLOT_MIN)}
          onPlus={() => setDuration(block.durationMin + SLOT_MIN)}
        />
      </Prop>

      {(task || template) && (
        <>
          <PanelHead n="02" title="Связи" />
          {task && (
            <>
              <Prop k="Задача">
                <button
                  type="button"
                  onClick={() => card.open(task.id)}
                  title="Открыть задачу"
                  className="min-w-0 truncate text-right outline-none transition-colors hover:text-white focus-visible:underline"
                  style={{ ...T.body, color: B.text2 }}
                >
                  {task.title} <span style={{ color: B.text3 }}>↳</span>
                </button>
              </Prop>
              <Prop k="Приоритет" last={!project && !template}>
                <span className="flex items-center gap-3" style={{ ...T.body, color: B.text2 }}>
                  {task.priority ? <Signal value={PRIORITY_BARS[task.priority]} on={B.text2} /> : null}
                  {PRIORITY_META[task.priority].label}
                </span>
              </Prop>
              {project && (
                <Prop k="Проект" last={!template}>
                  <Link to={`/projects/${project.id}`} className="truncate transition-colors hover:text-white" style={{ ...T.body, color: B.text2 }}>
                    {project.name}
                  </Link>
                </Prop>
              )}
            </>
          )}
          {template && (
            <Prop k="Ритуал" last>
              <span style={{ ...T.body, color: B.text2 }}>
                {template.title} · {formatDuration(template.durationMin)}
              </span>
            </Prop>
          )}
        </>
      )}

      <div>
        <DangerLink onClick={onDelete}>Убрать из планера</DangerLink>
      </div>
    </CasePanel>
  );
}
