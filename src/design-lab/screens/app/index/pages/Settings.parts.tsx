/**
 * «Индекс» · minimal settings controls, built locally (the kit has none):
 * switch · segmented · select · text/number input · settings row · numbered group.
 * White/grey only — lime is reserved for the page's single "where I am" marker.
 */
import { useId, useState, type ReactNode } from "react";

import { B, T, tab, Sparkle } from "@/design-lab/screens/_kit/index";

const focusRing = "outline-none focus-visible:ring-1 focus-visible:ring-[#ADFB0C] focus-visible:ring-offset-2 focus-visible:ring-offset-black";

/** Square switch 32×18: off = hairline + grey knob, on = white track + black knob. */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[18px] w-8 shrink-0 items-center transition-colors duration-200 disabled:opacity-40 ${focusRing}`}
      style={{ background: on ? B.text : "transparent", boxShadow: on ? undefined : `inset 0 0 0 1px ${B.l25}` }}
    >
      <span
        className="absolute top-[3px] h-3 w-3 transition-[left,background] duration-200"
        style={{ left: on ? 17 : 3, background: on ? B.bg : B.text3, transitionTimingFunction: B.easeOut }}
      />
    </button>
  );
}

/** Compact segmented control: no plates — active label white with a 1px white underline. */
export function Seg<V extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; title?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`relative h-7 whitespace-nowrap transition-colors duration-200 hover:text-white ${focusRing}`}
            style={{ ...T.body, ...tab, color: on ? B.text : B.text3 }}
          >
            {o.label}
            <span className="absolute inset-x-0 bottom-0 h-px transition-opacity duration-200" style={{ background: B.text, opacity: on ? 1 : 0 }} />
          </button>
        );
      })}
    </div>
  );
}

const fieldBase = "h-9 bg-white/[0.02] px-3 outline-none transition-shadow duration-200 placeholder:text-[#454545] disabled:opacity-40";
const fieldStyle = { ...T.body, color: B.text, boxShadow: `inset 0 0 0 1px ${B.l15}` };
const fieldFocus = "focus:!shadow-[inset_0_0_0_1px_#ADFB0C]";

export function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
  width = 320,
  label,
  disabled,
  onEnter,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  width?: number | string;
  label: string;
  disabled?: boolean;
  onEnter?: () => void;
  suffix?: ReactNode;
}) {
  return (
    <span className="relative inline-flex max-w-full" style={{ width }}>
      <input
        type={type}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className={`${fieldBase} ${fieldFocus} w-full ${suffix ? "pr-10" : ""}`}
        style={fieldStyle}
      />
      {suffix && <span className="absolute inset-y-0 right-0 flex items-center pr-2">{suffix}</span>}
    </span>
  );
}

/** Number input with an optional unit after it («14  дней»). Clamps on change, like the real page. */
export function NumField({
  value,
  onChange,
  min = 0,
  max,
  unit,
  label,
  width = 64,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  width?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        onChange={(e) => {
          let n = Number(e.target.value) || min;
          n = Math.max(min, n);
          if (max !== undefined) n = Math.min(max, n);
          onChange(n);
        }}
        className={`${fieldBase} ${fieldFocus} text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        style={{ ...fieldStyle, ...tab, width }}
      />
      {unit && <span style={{ ...T.meta, color: B.text3 }}>{unit}</span>}
    </span>
  );
}

/** Native select dressed as the input: hairline box + 1px chevron. */
export function Select<V extends string>({
  value,
  onChange,
  options,
  label,
  width = 320,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
  label: string;
  width?: number;
}) {
  return (
    <span className="relative inline-flex max-w-full" style={{ width }}>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as V)}
        className={`${fieldBase} ${fieldFocus} w-full cursor-pointer appearance-none pr-9 [&>option]:bg-black`}
        style={fieldStyle}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg aria-hidden width="10" height="6" viewBox="0 0 10 6" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <path d="M0.5 0.5L5 5L9.5 0.5" stroke={B.text3} fill="none" strokeWidth="1" />
      </svg>
    </span>
  );
}

/** Plain text action («Отключить», «Удалить») — grey, white on hover; `danger` for destructive. */
export function TextAction({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 whitespace-nowrap transition-colors duration-200 disabled:opacity-40 ${danger ? "hover:brightness-125" : "hover:text-white"} ${focusRing}`}
      style={{ ...T.body, color: danger ? B.danger : B.text3 }}
    >
      {children}
    </button>
  );
}

/** One settings row: «label + description | control» on a hairline. */
export function Row({
  label,
  desc,
  children,
  under,
  last,
}: {
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  /** Extra content under the whole row (a nested field, a status line). */
  under?: ReactNode;
  last?: boolean;
}) {
  return (
    <div className="py-5" style={{ borderBottom: last ? undefined : `1px solid ${B.l7}` }}>
      <div className="grid items-start gap-x-5 gap-y-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.25fr)" }}>
        <div className="min-w-0 pr-6">
          <div style={{ ...T.bodyStrong, color: B.text }}>{label}</div>
          {desc && (
            <p className="mt-1.5 max-w-[420px]" style={{ ...T.meta, color: B.text3 }}>
              {desc}
            </p>
          )}
        </div>
        <div className="flex min-h-7 min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">{children}</div>
      </div>
      {under && <div className="mt-4">{under}</div>}
    </div>
  );
}

/** Status line: small square + text; `tone` picks white (ok), grey (idle) or red (error). */
export function Status({ tone = "idle", children }: { tone?: "ok" | "idle" | "error"; children: ReactNode }) {
  const c = tone === "ok" ? B.text : tone === "error" ? B.danger : B.text3;
  return (
    <span className="inline-flex items-center gap-2" style={{ ...T.meta, color: tone === "ok" ? B.text2 : c }}>
      <span className="h-1.5 w-1.5 shrink-0" style={{ background: c }} />
      {children}
    </span>
  );
}

/** Collapsible group in the FAQ manner: «⊹» rotates into «✕», open body on surface-1. */
export function Disclosure({ title, meta, children, defaultOpen = false }: { title: ReactNode; meta?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div style={{ borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l10}` }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`group flex h-16 w-full items-center justify-between gap-6 text-left transition-colors duration-200 hover:bg-white/[0.02] ${focusRing}`}
      >
        <span className="flex min-w-0 items-baseline gap-4">
          <span className="shrink-0" style={T.title}>{title}</span>
          {meta && <span className="truncate" style={{ ...T.meta, color: B.text3 }}>{meta}</span>}
        </span>
        <span style={{ color: open ? B.text : B.text3 }}>
          <Sparkle size={14} open={open} />
        </span>
      </button>
      {open && <div id={id}>{children}</div>}
    </div>
  );
}

/** Sub-heading inside a group (caps, grey). */
export function SubHead({ children }: { children: ReactNode }) {
  return (
    <div className="pb-1 pt-8" style={{ ...T.caps, color: B.text3 }}>
      {children}
    </div>
  );
}
