/**
 * «Повторяющиеся задачи» (owner, 2026-11-14) — the window behind «Повтор» on the Tasks page: the
 * list of routines and the form that creates or edits one (title, weekdays, priority — always set).
 * The tasks themselves are spawned by the store (lib/routines.ts) and live on the week board.
 *
 *   ┌ Повторяющиеся задачи ─────────────────────────────── × ┐
 *   │ [Название                                            ] │
 *   │ Дни   (Пн)(Вт)(Ср)(Чт)(Пт)(Сб)(Вс)                      │
 *   │ Приоритет  (Высокий)(Средний)(Низкий)(Без)              │
 *   │                                         [Создать]       │
 *   │ ─ Тренировка        Вт · Чт · Сб   Высокий         🗑    │
 *   │ ─ Английский        Ср             Высокий         🗑    │
 *   └─────────────────────────────────────────────────────────┘
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Repeat, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, R, T, dashed } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { WEEKDAYS, daysLabel } from "@/lib/routines";
import type { Priority, Routine } from "@/types";
import { ICON, PrioChip, tint } from "./_parts";

const PRIOS: { p: Priority; label: string }[] = [
  { p: 1, label: "Высокий" },
  { p: 2, label: "Средний" },
  { p: 3, label: "Низкий" },
  { p: 0, label: "Без приоритета" },
];

const fieldStyle: CSSProperties = { height: 52, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 16, color: C.text };
const labelStyle: CSSProperties = { ...T.foot, color: C.text3, marginBottom: 8 };

/** A pill toggle — soft blue tint when on (owner's taste: no bright outlines). */
function Pill({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className="inline-flex shrink-0 items-center justify-center px-3.5 transition-colors duration-150 hover:brightness-125"
      style={{ height: 40, minWidth: 48, borderRadius: 999, fontSize: 14, background: on ? tint : C.card, color: on ? "#5AA9FF" : C.text2, boxShadow: on ? "none" : `inset 0 0 0 1px ${C.line}` }}
    >
      {children}
    </button>
  );
}

type Draft = { id?: string; title: string; days: number[]; priority: Priority };
const EMPTY: Draft = { title: "", days: [], priority: 1 };

export function RoutinesDialog({ onClose }: { onClose: () => void }) {
  const { routines = [], addRoutine, updateRoutine, deleteRoutine } = useData();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const editing = !!draft.id;
  const ready = !!draft.title.trim() && draft.days.length > 0;
  const toggleDay = (d: number) =>
    setDraft((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d].sort((a, b) => a - b) }));
  const save = () => {
    if (!ready) return;
    const fields = { title: draft.title.trim(), days: draft.days, priority: draft.priority };
    if (draft.id) {
      updateRoutine(draft.id, fields);
      toast("Повторяющаяся задача сохранена");
    } else {
      addRoutine(fields);
      toast(`«${fields.title}» · ${daysLabel(fields.days)} — задачи появятся на неделе`);
    }
    setDraft(EMPTY);
  };
  const edit = (r: Routine) => setDraft({ id: r.id, title: r.title, days: [...r.days], priority: r.priority });
  const remove = (r: Routine) => {
    deleteRoutine(r.id);
    if (draft.id === r.id) setDraft(EMPTY);
    toast(`«${r.title}» больше не повторяется`);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        data-lab-block="routines"
        aria-label="Повторяющиеся задачи"
        className="flex w-full max-w-[620px] flex-col gap-5 p-6"
        style={{ background: C.panel, borderRadius: R.page, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span style={T.h2}>Повторяющиеся задачи</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft((x) => ({ ...x, title: e.target.value }))}
            className="w-full bg-transparent outline-none placeholder:text-[#5E6068]"
            style={fieldStyle}
            placeholder={editing ? "Название" : "Новая повторяющаяся задача"}
          />
          <div>
            <div style={labelStyle}>Дни недели</div>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => (
                <Pill key={w.d} on={draft.days.includes(w.d)} onClick={() => toggleDay(w.d)}>
                  {w.short}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Приоритет</div>
            <div className="flex flex-wrap gap-1.5">
              {PRIOS.map((o) => (
                <Pill key={o.p} on={draft.priority === o.p} onClick={() => setDraft((x) => ({ ...x, priority: o.p }))}>
                  {o.label}
                </Pill>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            {editing && (
              <Btn kind="ghost" onClick={() => setDraft(EMPTY)}>
                Отмена
              </Btn>
            )}
            <Btn type="submit" disabled={!ready}>
              {editing ? "Сохранить" : "Создать"}
            </Btn>
          </div>
        </form>

        {routines.length > 0 && (
          <div className="flex flex-col" style={{ background: C.card, borderRadius: R.inner }}>
            {routines.map((r) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => edit(r)}
                onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && edit(r)}
                className="group flex cursor-pointer items-center gap-3 px-4 outline-none transition-colors duration-150 hover:bg-[#202025] focus-visible:bg-[#202025]"
                style={{ minHeight: 56, ...dashed, background: draft.id === r.id ? tint : undefined }}
              >
                <Repeat size={16} strokeWidth={1.75} color={C.text3} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate" style={T.body}>
                  {r.title}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={{ ...T.body, color: C.text2 }}>
                  {daysLabel(r.days)}
                </span>
                <PrioChip p={r.priority} />
                <button
                  type="button"
                  title="Удалить — перестанет повторяться"
                  aria-label={`Удалить «${r.title}»`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(r);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="grid shrink-0 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF6B63] focus-visible:opacity-100 group-hover:opacity-100"
                  style={{ width: 32, height: 32, color: C.text3 }}
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** «Повтор» in the Tasks topbar — outline pill next to «Встреча». */
export function RoutinesBtn({ onClick }: { onClick: () => void }) {
  return (
    <Btn kind="outline" icon={<Repeat size={16} strokeWidth={1.75} />} onClick={onClick}>
      Повтор
    </Btn>
  );
}
