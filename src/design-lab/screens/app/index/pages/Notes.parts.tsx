/**
 * «Индекс» · shared pieces for the text-heavy screens (Заметки, База знаний).
 * Local by the brief's rule — nothing here touches _kit. Quiet controls only: underlined fields,
 * text segments, hairline menus; the one lime per screen stays with the page header's action.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { NoteEditor } from "@/components/notes/NoteEditor";
import { B, T, tab, Pixel, PIX, ThinCheck, Sparkle } from "@/design-lab/screens/_kit/index";

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Search / text fields
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function SearchField({
  value,
  onChange,
  placeholder = "Поиск…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label
      className={`group flex h-10 min-w-0 items-center gap-3 transition-colors duration-200 focus-within:!border-white/40 ${className}`}
      style={{ borderBottom: `1px solid ${B.l10}` }}
    >
      <span style={{ color: B.text3 }}>
        <Pixel map={PIX.search} px={2} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
        style={{ ...T.body, color: B.text }}
      />
      {value && (
        <button type="button" aria-label="Очистить" onClick={() => onChange("")} className="shrink-0 transition-colors hover:text-white" style={{ color: B.text3 }}>
          <Sparkle size={10} open />
        </button>
      )}
    </label>
  );
}

/** Borderless text input that only shows a hairline on hover/focus — for in-place property edits. */
export function InlineInput({
  value,
  onCommit,
  placeholder,
  style,
  className = "",
  align = "left",
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  className?: string;
  align?: "left" | "right";
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className={`min-w-0 bg-transparent outline-none transition-colors placeholder:text-[#454545] hover:shadow-[inset_0_-1px_0_rgba(255,255,255,0.15)] focus:shadow-[inset_0_-1px_0_rgba(255,255,255,0.4)] ${className}`}
      style={{ ...T.body, color: B.text, textAlign: align, ...style }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Segments, toggles, checks
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Compact segment without numbers: active white, the rest grey, no plates (owner-site §11). */
export function Seg<Id extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: Id; label: ReactNode; count?: number; title?: string }[];
  value: Id;
  onChange: (id: Id) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={it.title}
            onClick={() => onChange(it.id)}
            className="flex h-8 items-center gap-1.5 whitespace-nowrap outline-none transition-colors duration-200 hover:!text-white focus-visible:underline"
            style={{ ...T.body, color: on ? B.text : B.text3 }}
          >
            {it.label}
            {it.count !== undefined && <span style={{ ...T.num, fontSize: 11, color: on ? B.text3 : B.off }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** «#тег» filter toggle — hairline outline, white when on. */
export function TagToggle({ on, onClick, children, count }: { on: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap px-2 outline-none transition-colors duration-200 hover:!text-white focus-visible:ring-1 focus-visible:ring-white/40"
      style={{ ...T.meta, color: on ? B.text : B.text3, boxShadow: `inset 0 0 0 1px ${on ? B.l40 : B.l15}` }}
    >
      {children}
      {count !== undefined && <span style={{ ...T.num, fontSize: 10, color: on ? B.text3 : B.off }}>{count}</span>}
    </button>
  );
}

/** A check that stays white — keeps the screen's single lime for the main action. */
export function QuietCheck({ done, onClick, label, size = 14 }: { done: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex shrink-0 items-center justify-center outline-none transition-colors duration-200 hover:!border-white/40 focus-visible:ring-1 focus-visible:ring-white/40"
      style={{ width: size, height: size, border: `1px solid ${done ? B.text2 : B.l20}`, background: done ? B.text2 : "transparent" }}
    >
      {done && <ThinCheck size={size - 5} color={B.bg} />}
    </button>
  );
}

/** Text action row: «↳ Закрепить». Danger only when it really destroys. */
export function ActionRow({
  children,
  onClick,
  hint,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex h-10 w-full items-center gap-3 text-left outline-none transition-colors duration-200 focus-visible:bg-white/[0.04] disabled:opacity-40 ${danger ? "hover:!text-[#FF5A36]" : "hover:!text-white"}`}
      style={{ ...T.body, color: B.text2, borderBottom: `1px solid ${B.l7}` }}
    >
      <span className="flex-1 truncate">{children}</span>
      {hint !== undefined && <span style={{ ...T.meta, color: B.text3, ...tab }}>{hint}</span>}
    </button>
  );
}

/** Small caps label above a column. */
export function Caps({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} style={{ ...T.caps, color: B.text3 }}>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Menu — hairline popover with the floating shadow
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export type MenuItem =
  | { label: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; active?: boolean; hint?: ReactNode }
  | { sep: true }
  | { heading: ReactNode };

export function Menu({
  trigger,
  items,
  align = "right",
  label = "Действия",
  width = 220,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  label?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center outline-none transition-colors duration-200 hover:!text-white focus-visible:ring-1 focus-visible:ring-white/40"
        style={{ color: open ? B.text : B.text3 }}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-2 max-h-80 overflow-y-auto py-1 ${align === "right" ? "right-0" : "left-0"}`}
          style={{ width, background: B.bg, boxShadow: B.shadowFloat }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) =>
            "sep" in it ? (
              <div key={i} className="my-1" style={{ borderTop: `1px solid ${B.l7}` }} />
            ) : "heading" in it ? (
              <div key={i} className="px-3 pb-1 pt-2" style={{ ...T.caps, color: B.off }}>
                {it.heading}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`flex h-8 w-full items-center gap-2 px-3 text-left outline-none transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] disabled:opacity-35 ${it.danger ? "hover:!text-[#FF5A36]" : "hover:!text-white"}`}
                style={{ ...T.body, color: it.active ? B.text : B.text2 }}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint !== undefined && <span style={{ ...T.meta, color: B.text3 }}>{it.hint}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** «⋯» glyph, three 2px squares — the pixel version of a kebab. */
export function Dots() {
  return (
    <span className="flex h-6 w-6 items-center justify-center gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-[2px] w-[2px]" style={{ background: "currentColor" }} />
      ))}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Quiet save state — writes may fail (lab sandbox, offline); the screen keeps the change and
 * says so in one grey line instead of a red toast.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export type SyncState = "idle" | "saving" | "saved" | "local";

export function useQuietSync() {
  const [state, setState] = useState<SyncState>("idle");
  const inflight = useRef(0);
  const failed = useRef(false);
  const run = useCallback(<R,>(p: Promise<R>): Promise<R | undefined> => {
    inflight.current += 1;
    setState("saving");
    return p
      .then((r) => r)
      .catch(() => {
        failed.current = true;
        return undefined;
      })
      .finally(() => {
        inflight.current -= 1;
        if (inflight.current === 0) setState(failed.current ? "local" : "saved");
      });
  }, []);
  return { state, run };
}

export function SyncNote({ state, idle = "Синхронизируется с облаком" }: { state: SyncState; idle?: string }) {
  const text =
    state === "saving" ? "Сохраняю…" : state === "saved" ? "Сохранено" : state === "local" ? "Не сохранено · только в этом окне" : idle;
  return (
    <div className="flex items-center gap-2" style={{ ...T.meta, color: state === "local" ? B.text3 : B.off }} title={state === "local" ? "Запись не прошла (песочница или нет связи)" : undefined}>
      <span className="h-[5px] w-[5px] shrink-0" style={{ background: state === "saving" ? B.text3 : state === "local" ? B.text3 : B.off }} />
      <span className="truncate">{text}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Search highlight
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} style={{ background: "rgba(255,255,255,0.16)", color: B.text }}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Prose — the app's TipTap NoteEditor, re-skinned into the Индекс typography
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const PROSE_CSS = `
.ix-prose { --ix-text: rgba(255,255,255,.86); }
.ix-prose > div > div:first-child { padding: 0 0 10px; gap: 2px; border-bottom: 1px solid ${B.l7}; margin-bottom: 28px; }
.ix-prose > div > div:first-child > span { background: ${B.l10}; margin: 0 6px; }
.ix-prose button[aria-pressed] { border-radius: 0; color: ${B.text3}; width: 26px; height: 26px; }
.ix-prose button[aria-pressed]:hover { background: rgba(255,255,255,.05); color: #fff; }
.ix-prose button[aria-pressed="true"] { background: rgba(255,255,255,.08); color: #fff; }
.ix-prose button svg { width: 14px; height: 14px; stroke-width: 1.4; }
.ix-prose .note-prose { padding: 0 0 96px; font-family: ${B.font}; font-size: 17px; line-height: 1.65; letter-spacing: -0.022em; color: var(--ix-text); outline: none; min-height: 320px; }
.ix-prose .note-prose > * + * { margin-top: .75em; }
.ix-prose .note-prose h1 { font-size: 30px; line-height: 1.1; font-weight: 500; letter-spacing: -0.045em; color: #fff; margin-top: 1.6em; }
.ix-prose .note-prose h2 { font-size: 23px; line-height: 1.2; font-weight: 500; letter-spacing: -0.04em; color: #fff; margin-top: 1.5em; }
.ix-prose .note-prose h3 { font-size: 18px; line-height: 1.3; font-weight: 500; letter-spacing: -0.035em; color: #fff; margin-top: 1.3em; }
.ix-prose .note-prose > :first-child { margin-top: 0; }
.ix-prose .note-prose strong { font-weight: 600; color: #fff; }
.ix-prose .note-prose a { color: #fff; text-decoration: underline; text-decoration-color: ${B.l40}; text-underline-offset: 4px; text-decoration-thickness: 1px; }
.ix-prose .note-prose a:hover { text-decoration-color: #fff; }
.ix-prose .note-prose code { font-family: "Geist Mono", "JetBrains Mono", monospace; font-size: .82em; padding: .1em .35em; border-radius: 0; background: ${B.s2}; color: #fff; }
.ix-prose .note-prose pre { border-radius: 0; background: ${B.raised}; box-shadow: inset 0 0 0 1px ${B.l7}; padding: 16px 18px; }
.ix-prose .note-prose pre code { background: none; padding: 0; font-size: 13px; line-height: 1.6; color: ${B.text2}; }
.ix-prose .note-prose blockquote { border-left: 1px solid ${B.l40}; padding-left: 20px; color: ${B.text2}; font-style: normal; }
.ix-prose .note-prose ul, .ix-prose .note-prose ol { padding-left: 1.3em; }
.ix-prose .note-prose li::marker { color: ${B.off}; }
.ix-prose .note-prose ol li::marker { font-variant-numeric: tabular-nums; font-size: .85em; }
.ix-prose .note-prose hr { border-top: 1px solid ${B.l10}; margin: 2.2em 0; }
.ix-prose .note-prose img { border-radius: 0; filter: grayscale(.15); }
.ix-prose .note-prose img.ProseMirror-selectednode { outline: 1px solid ${B.l40}; }
.ix-prose .note-prose ul[data-type="taskList"] { padding-left: 0; }
.ix-prose .note-prose ul[data-type="taskList"] li > label { margin-top: .42em; }
.ix-prose .note-prose ul[data-type="taskList"] input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 14px; height: 14px; border: 1px solid ${B.l20}; border-radius: 0; background: transparent; display: grid; place-content: center; margin: 0; cursor: pointer; }
.ix-prose .note-prose ul[data-type="taskList"] input[type="checkbox"]:hover { border-color: ${B.l40}; }
.ix-prose .note-prose ul[data-type="taskList"] input[type="checkbox"]:checked { background: ${B.text2}; border-color: ${B.text2}; }
.ix-prose .note-prose ul[data-type="taskList"] input[type="checkbox"]:checked::after { content: ""; width: 7px; height: 4px; border-left: 1px solid #000; border-bottom: 1px solid #000; transform: rotate(-45deg) translate(1px, -1px); }
.ix-prose .note-prose ul[data-type="taskList"] li[data-checked="true"] > div { color: ${B.text4}; }
.ix-prose .note-prose p.is-empty::before, .ix-prose .note-prose h1.is-empty::before, .ix-prose .note-prose h2.is-empty::before, .ix-prose .note-prose h3.is-empty::before { color: ${B.off}; }
.ix-prose .note-prose ::selection, .ix-prose ::selection { background: rgba(255,255,255,.18); }
.ix-prose [data-tippy-root] > div, .ix-prose .shadow-lg { border-radius: 0 !important; background: ${B.bg} !important; border: 0 !important; box-shadow: ${B.shadowFloat} !important; }
`;

/** Mount once per page: the scoped skin for the prose editor. */
export function ProseStyles() {
  return <style>{PROSE_CSS}</style>;
}

/** The real NoteEditor (markdown in/out, TipTap), dressed in the Индекс type. */
export function IxEditor({
  editorKey,
  initial,
  onChange,
  onOpenNote,
}: {
  editorKey: string;
  initial: string;
  onChange: (md: string) => void;
  onOpenNote?: (id: string) => void;
}) {
  return (
    <div className="ix-prose flex min-w-0 flex-col">
      <NoteEditor key={editorKey} initial={initial} onChange={onChange} onOpenNote={onOpenNote} />
    </div>
  );
}

/** Title field that grows with its text — display type, no chrome. */
export function TitleField({
  value,
  onChange,
  onEnter,
  placeholder,
  size = 44,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder: string;
  size?: number;
  inputRef?: RefObject<HTMLTextAreaElement>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || (e.key === "ArrowDown" && (e.target as HTMLTextAreaElement).selectionStart === value.length)) {
          e.preventDefault();
          onEnter?.();
        }
      }}
      placeholder={placeholder}
      className="block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-[#454545]"
      style={{
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: "-0.05em",
        fontWeight: 500,
        color: B.text,
        fontFamily: B.font,
      }}
    />
  );
}

/** Focuses the TipTap body under `root` (title → Enter). */
export function focusProse(root: HTMLElement | null) {
  (root?.querySelector(".note-prose") as HTMLElement | null)?.focus();
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Right slide-in panel — entity details, full height, hairline on the left
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function SidePanel({
  open,
  onClose,
  children,
  width = 560,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{ background: "rgba(0,0,0,0.55)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      <aside
        role="dialog"
        aria-label={label}
        aria-hidden={!open}
        className="fixed inset-y-0 right-0 z-50 flex flex-col"
        style={{
          width: `min(${width}px, 94vw)`,
          background: B.bg,
          borderLeft: `1px solid ${B.l10}`,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: `transform .35s ${B.easeOut}`,
          visibility: open ? "visible" : "hidden",
        }}
      >
        {children}
      </aside>
    </>
  );
}

/** «Закрыть ✕» for panel heads. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 outline-none transition-colors duration-200 hover:!text-white focus-visible:underline"
      style={{ ...T.meta, color: B.text3 }}
    >
      Закрыть
      <Sparkle size={12} open />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Small text helpers
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** «сегодня, 14:05» · «вчера» · «13 июл.» · «13 июл. 2025». */
export function whenLabel(iso: string, withTime = true): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(now)) return withTime ? `сегодня, ${time}` : "сегодня";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (day(d) === day(y)) return withTime ? `вчера, ${time}` : "вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export function wordCount(md: string): number {
  const t = md.replace(/[#>*_`~\-[\]()!]/g, " ").trim();
  return t ? t.split(/\s+/).length : 0;
}
