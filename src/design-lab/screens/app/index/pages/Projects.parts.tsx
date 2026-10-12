/**
 * «Индекс» · Проекты — local parts shared by the projects index and the project «case» page:
 * derived project numbers, a quiet popover menu, the right slide-over panel, the priority signal
 * picker, a compact text segment and the cover loader. Kept here (not in _kit) per the brief.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { isOverdue } from "@/lib/format";
import { projectHealth, HEALTH_META, type HealthLevel } from "@/lib/projectHealth";
import { loadAttachmentBlob } from "@/lib/attachments";
import { PRIORITY_META, type Priority, type ProjectStatus, type Task } from "@/types";
import { B, T, tab, Signal, PRIORITY_BARS } from "@/design-lab/screens/_kit/index";

/* ── Words ─────────────────────────────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Не начат",
  active: "В работе",
  done: "Завершён",
  archived: "Архив",
};
export const STATUS_ORDER: ProjectStatus[] = ["planned", "active", "done", "archived"];

export function healthLabel(h: HealthLevel) {
  return h === "empty" ? "Нет задач" : HEALTH_META[h].label;
}

/** Health word colour: red only for «сорвано», warm for «риск», the rest stays grey. */
export function healthTone(h: HealthLevel) {
  if (h === "off-track") return B.danger;
  if (h === "at-risk") return B.warn;
  if (h === "on-track") return B.text2;
  return B.text3;
}

/** Sort rank — high (1) first, «без приоритета» (0) last. */
export const PRIORITY_RANK: Record<number, number> = { 1: 0, 2: 1, 3: 2, 0: 3 };
/** Worst-first — slipping projects float up when sorting by health. */
export const HEALTH_RANK: Record<HealthLevel, number> = { "off-track": 0, "at-risk": 1, "on-track": 2, done: 3, empty: 4 };

/* ── Numbers of one project ────────────────────────────────────────────────────────────────── */

export function projectNumbers(list: Task[]) {
  const done = list.filter((t) => t.done).length;
  const open = list.length - done;
  return {
    total: list.length,
    done,
    open,
    pct: list.length ? (done / list.length) * 100 : 0,
    overdue: list.filter((t) => !t.done && isOverdue(t.dueDate)).length,
    estimateMin: list.filter((t) => !t.done).reduce((s, t) => s + (t.estimateMin ?? 0), 0),
    spentMin: list.reduce((s, t) => s + (t.spentMin ?? 0), 0),
    health: projectHealth(list),
  };
}

/* ── Cover (IndexedDB blob → object URL) ───────────────────────────────────────────────────── */

export function useAttachmentUrl(id?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    setUrl(null);
    if (id) {
      loadAttachmentBlob(id)
        .then((blob) => {
          if (blob && alive) {
            const u = URL.createObjectURL(blob);
            revoke = u;
            setUrl(u);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [id]);
  return url;
}

/* ── Menu: a black floating plate, 36px items, closes on outside click / Esc ──────────────── */

export type MenuItem =
  | { kind?: "item"; label: ReactNode; onSelect: () => void; danger?: boolean; active?: boolean; hint?: ReactNode }
  | { kind: "sep" }
  | { kind: "head"; label: string };

export function Menu({
  trigger,
  items,
  align = "right",
  width = 240,
  label,
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[] | (() => MenuItem[]);
  align?: "left" | "right";
  width?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const list = open ? (typeof items === "function" ? items() : items) : [];
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-full z-40 mt-2 max-h-[360px] overflow-y-auto py-1"
          style={{ [align]: 0, width, background: B.bg, boxShadow: B.shadowFloat } as CSSProperties}
        >
          {list.map((it, i) => {
            if (it.kind === "sep") return <div key={i} className="my-1 h-px" style={{ background: B.l7 }} />;
            if (it.kind === "head")
              return (
                <div key={i} className="px-3 pb-1 pt-2" style={{ ...T.caps, color: B.off }}>
                  {it.label}
                </div>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className="flex h-9 w-full items-center gap-3 px-3 text-left outline-none transition-colors duration-200 hover:bg-white/[0.05] focus-visible:bg-white/[0.05]"
                style={{ ...T.body, color: it.danger ? B.danger : it.active ? B.text : B.text2 }}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint !== undefined && <span className="shrink-0" style={{ ...T.meta, color: B.text3 }}>{it.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** «⋯» trigger: 32×32 square, no border, hover surface. */
export function DotsButton({ onClick, label, open, size = 32, outline }: { onClick: () => void; label: string; open?: boolean; size?: number; outline?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
      className="flex shrink-0 items-center justify-center outline-none transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
      style={{
        width: size,
        height: size,
        color: open ? B.text : outline ? B.text2 : B.text3,
        background: open ? "rgba(255,255,255,0.06)" : outline ? B.bg : undefined,
        boxShadow: outline ? `inset 0 0 0 1px ${B.l20}` : undefined,
      }}
    >
      <svg width="14" height="4" viewBox="0 0 14 4" aria-hidden>
        <rect x="0" y="1" width="2" height="2" fill="currentColor" />
        <rect x="6" y="1" width="2" height="2" fill="currentColor" />
        <rect x="12" y="1" width="2" height="2" fill="currentColor" />
      </svg>
    </button>
  );
}

/* ── Priority: the 3-bar signal is the control ─────────────────────────────────────────────── */

const PRIORITIES: Priority[] = [1, 2, 3, 0];

export function PriorityPick({ value, onChange, align = "right" }: { value: Priority; onChange: (p: Priority) => void; align?: "left" | "right" }) {
  return (
    <Menu
      align={align}
      width={200}
      label="Приоритет"
      items={PRIORITIES.map((p) => ({
        label: (
          <span className="flex items-center gap-3">
            <Signal value={PRIORITY_BARS[p]} on={B.text2} w={4} h={9} />
            {PRIORITY_META[p].label}
          </span>
        ),
        active: p === value,
        hint: p === value ? "✓" : undefined,
        onSelect: () => onChange(p),
      }))}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={`Приоритет: ${PRIORITY_META[value].label}`}
          title={`Приоритет: ${PRIORITY_META[value].label}`}
          className="flex h-7 items-center justify-center px-1 outline-none transition-opacity duration-200 hover:opacity-100 focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
          style={{ opacity: open ? 1 : 0.9 }}
        >
          <Signal value={PRIORITY_BARS[value]} on={B.text2} label={PRIORITY_META[value].label} />
        </button>
      )}
    />
  );
}

/* ── Compact text segment (inside sections): active white, idle grey, no plates ────────────── */

export function TextSeg<V extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: V; label: string; count?: number }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(it.value)}
            className="relative py-1 outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
            style={{ ...T.meta, color: on ? B.text : B.text3 }}
          >
            {it.label}
            {it.count !== undefined && <span style={{ ...tab, color: on ? B.text3 : B.off }}> {it.count}</span>}
            {on && <span className="absolute inset-x-0 -bottom-px h-px" style={{ background: B.text }} />}
          </button>
        );
      })}
    </div>
  );
}

/* ── Right slide-over panel (entity «case») ─────────────────────────────────────────────────── */

export function Panel({
  open,
  onClose,
  eyebrow,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const [shown, setShown] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const r = requestAnimationFrame(() => setShown(true));
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(r);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: "rgba(0,0,0,0.6)", opacity: shown ? 1 : 0 }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex max-w-full flex-col"
        style={{
          width,
          background: B.bg,
          borderLeft: `1px solid ${B.l10}`,
          transform: shown ? "none" : "translateX(24px)",
          opacity: shown ? 1 : 0,
          transition: `transform .3s ${B.easeOut}, opacity .3s ${B.easeOut}`,
        }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-8" style={{ borderBottom: `1px solid ${B.l7}` }}>
          <span style={{ ...T.meta, color: B.text3 }}>{eyebrow}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
            style={{ ...T.meta, color: B.text3 }}
          >
            Закрыть <span aria-hidden style={{ fontSize: 14 }}>✕</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-8">{children}</div>
        {footer}
      </aside>
    </div>
  );
}

/** KV-shaped row whose value is a control (form inside the panel). */
export function FieldRow({ k, children, last }: { k: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-6 py-2" style={{ borderBottom: last ? undefined : `1px solid ${B.l10}` }}>
      <span className="shrink-0" style={{ ...T.body, color: B.text3 }}>{k}</span>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
    </div>
  );
}

/** Value-looking button that opens a menu (status / client / date …). */
export function ValueButton({ children, onClick, open, muted, danger }: { children: ReactNode; onClick: () => void; open?: boolean; muted?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-expanded={open}
      className="group inline-flex max-w-full items-center gap-2 outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
      style={{ ...T.body, ...tab, color: danger ? B.danger : muted ? B.text3 : B.text }}
    >
      <span className="truncate">{children}</span>
      <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden className="shrink-0 opacity-50 transition-opacity group-hover:opacity-100">
        <path d="M.5.5 4 4 7.5.5" fill="none" stroke="currentColor" />
      </svg>
    </button>
  );
}

/** Placeholder colour used across inputs (#454545 = B.off). */
export const PH = "placeholder:text-[#454545]";
