/**
 * «Индекс» · global layer — tiny primitives the overlays share that the kit doesn't have yet:
 * Kbd (key chip), the modifier label, the «is the user typing» guard, the dialog footer and the
 * big underlined input. Candidates for _kit/index-ui.tsx in stage 2.
 */
import { forwardRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";

import { B, T, Hook } from "@/design-lab/screens/_kit/index";

/** «⌘» on macOS, «Ctrl» elsewhere. */
export const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

/** True when a keystroke belongs to a field (inputs, selects, rich editors) — globals must stay quiet. */
export function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable || t.getAttribute?.("role") === "textbox";
}

/** Key chip: hairline square, tabular 11px — «N», «⌘», «Esc». */
export function Kbd({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "bright" }) {
  return (
    <kbd
      className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center px-1.5"
      style={{
        ...T.num,
        fontSize: 11,
        fontFamily: B.font,
        color: tone === "bright" ? B.text : B.text3,
        boxShadow: `inset 0 0 0 1px ${tone === "bright" ? B.l25 : B.l15}`,
      }}
    >
      {children}
    </kbd>
  );
}

/** A row of key chips with an optional «затем» between them. */
export function Keys({ keys, then = false }: { keys: string[]; then?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && then && <span style={{ ...T.meta, color: B.off }}>→</span>}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}

/** Big underlined input — the dialogs' headline field. Focus = 1px lime underline. */
export const LineInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: "l" | "m" }>(function LineInput(
  { size = "l", style, className = "", ...rest },
  ref
) {
  const type: CSSProperties = size === "l" ? { fontSize: 24, lineHeight: 1.2, fontWeight: 500, letterSpacing: "-0.045em" } : T.bodyL;
  return (
    <input
      ref={ref}
      autoComplete="off"
      spellCheck={false}
      {...rest}
      className={`w-full bg-transparent pb-3 outline-none selection:bg-white/25 transition-[border-color] duration-200 placeholder:text-[#454545] focus:!border-[#ADFB0C] ${className}`}
      style={{ ...type, color: B.text, borderBottom: `1px solid ${B.l20}`, fontFamily: B.font, ...style }}
    />
  );
});

/** Dialog foot: a meta hint on the left, plain text cancel + the one primary action on the right. */
export function DialogFoot({
  hint,
  onCancel,
  cancelLabel = "Отмена",
  primary,
}: {
  hint?: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
  primary: ReactNode;
}) {
  return (
    <div className="flex h-14 items-center gap-5 pl-5 pr-2">
      <div className="min-w-0 flex-1 truncate" style={{ ...T.meta, color: B.text3 }}>
        {hint}
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-2 outline-none transition-colors duration-200 hover:text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
          style={{ ...T.body, color: B.text3 }}
        >
          {cancelLabel}
        </button>
      )}
      {primary}
    </div>
  );
}

/** Square-cornered action for dialogs: lime (primary), danger outline, or plain. */
export function ActionButton({
  children,
  onClick,
  tone = "lime",
  disabled,
  autoFocus,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "lime" | "danger" | "plain";
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const p: Record<string, CSSProperties> = {
    lime: { background: B.lime, color: B.onLime },
    danger: { background: "transparent", color: B.danger, boxShadow: `inset 0 0 0 1px ${B.danger}` },
    plain: { background: "transparent", color: B.text, boxShadow: `inset 0 0 0 1px ${B.l20}` },
  };
  const hover = tone === "lime" ? "hover:brightness-[1.06]" : tone === "danger" ? "hover:bg-[rgba(255,90,54,0.12)]" : "hover:bg-white/[0.06]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`inline-flex h-9 shrink-0 items-center gap-2 px-4 outline-none transition-[filter,background] duration-200 focus-visible:ring-1 focus-visible:ring-[#ADFB0C] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40 ${hover}`}
      style={{ ...T.btn, ...p[tone] }}
    >
      <Hook size={14} />
      {children}
    </button>
  );
}

/** Group heading inside lists: «01  НЕДАВНЕЕ ……… 3». */
export function GroupHead({ n, label, meta }: { n: string; label: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 px-5 pb-2 pt-5">
      <span style={{ ...T.num, color: B.off }}>{n}</span>
      <span style={{ ...T.caps, color: B.text3 }}>{label}</span>
      {meta !== undefined && (
        <span className="ml-auto" style={{ ...T.num, color: B.off }}>
          {meta}
        </span>
      )}
    </div>
  );
}

/** Cross-component signals that aren't in UIProvider (shortcuts sheet, celebrations). */
export const IX_EVENTS = {
  shortcuts: "ix:shortcuts",
  celebrate: "ix:celebrate",
} as const;

export function openShortcuts() {
  window.dispatchEvent(new CustomEvent(IX_EVENTS.shortcuts));
}
