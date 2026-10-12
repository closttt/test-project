/**
 * Craft Dark · form controls that replace the browser's native pickers (which open in the OS
 * style and can't be themed): a pill `Select`, a `DatePicker` with a month calendar, the bare
 * `CalendarPanel` for in-place date popovers, and a `TagInput` / `TagChips` pair for task tags.
 *
 * Every popup goes through `Floating`: portaled to <body>, fixed-positioned against its anchor, so
 * it never gets clipped by a card's overflow or widens a narrow column; it flips above the anchor
 * when there's no room below and follows the anchor on scroll/resize. While open it owns the
 * keyboard (window capture), so Escape closes the popup and not the dialog underneath.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { C, R, T, TONE, font } from "@/design-lab/screens/_kit/craft";
import { addDays, localDayStr } from "@/lib/format";
import { weekStart } from "@/lib/weekBoard";

const TINT = "rgba(10,132,255,0.14)";
/** Soft drop shadow + the faintest hairline, so a popup still separates from a dialog of the same tone. */
const SHADOW = `inset 0 0 0 1px ${C.line}, 0 18px 50px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)`;
const stop = (e: SyntheticEvent) => e.stopPropagation();

// ── Floating ────────────────────────────────────────────────────────────────────────────────────

/**
 * A popup anchored to `anchor`. `width` = a number, or "anchor" to match the anchor (min 200).
 * `onKey` sees every keydown while open (return true when handled); Escape and Tab close it.
 */
export function Floating({
  anchor,
  onClose,
  width = "anchor",
  align = "start",
  onKey,
  children,
  label,
  pad = 6,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  width?: number | "anchor";
  align?: "start" | "end";
  onKey?: (e: KeyboardEvent) => boolean | void;
  children: ReactNode;
  label?: string;
  pad?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; w: number; maxH: number } | null>(null);
  const keyRef = useRef(onKey);
  keyRef.current = onKey;

  const place = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(vw - 16, width === "anchor" ? Math.max(200, r.width) : width);
    const h = ref.current?.scrollHeight ?? 240;
    const below = vh - r.bottom - 14;
    const above = r.top - 14;
    const up = h > below && above > below;
    const maxH = Math.max(160, up ? above : below);
    const shown = Math.min(h, maxH);
    let left = align === "end" ? r.right - w : r.left;
    left = Math.min(Math.max(8, left), vw - w - 8);
    setPos({ left, w, maxH, top: up ? Math.max(8, r.top - 6 - shown) : r.bottom + 6 });
  }, [anchor, width, align]);

  useLayoutEffect(place, [place]);

  useEffect(() => {
    const outside = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && (ref.current?.contains(t) || anchor.contains(t))) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
        }
        onClose();
        return;
      }
      if (keyRef.current?.(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const reflow = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("touchstart", outside, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("touchstart", outside, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, onClose, place]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      onClick={stop}
      onMouseDown={stop}
      onKeyDown={stop}
      onDragStart={stop}
      className="overflow-y-auto"
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.w ?? (typeof width === "number" ? width : 200),
        maxHeight: pos?.maxH,
        visibility: pos ? "visible" : "hidden",
        zIndex: 80,
        padding: pad,
        background: C.panel,
        borderRadius: R.inner,
        boxShadow: SHADOW,
        fontFamily: font,
        color: C.text,
        fontWeight: 400,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/** Shared trigger look — the kit's field: 44 tall, 12 radius, hairline on the panel, chevron inside. */
function triggerStyle(height: number, surface: "panel" | "card", round: boolean): CSSProperties {
  return {
    height,
    borderRadius: round ? 999 : 12,
    background: surface === "card" ? C.raise : C.card,
    boxShadow: surface === "card" ? "none" : `inset 0 0 0 1px ${C.line}`,
    paddingLeft: 14,
    paddingRight: 12,
    fontSize: 14,
    color: C.text,
  };
}

// ── Select ──────────────────────────────────────────────────────────────────────────────────────

export interface SelectOption<V extends string> {
  value: V;
  label: string;
  /** Muted text on the right (a count). */
  hint?: ReactNode;
  /** A small colour dot before the label (priorities). */
  dot?: string;
}

/**
 * Pill/field select. `surface` = what it sits on (dialog panel → hairline field; card → raised fill).
 * `round` makes a full pill (toolbar filters); `active` paints the trigger with the soft blue tint.
 */
export function Select<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  height = 44,
  surface = "panel",
  round,
  active,
  maxWidth,
  icon,
  id,
}: {
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  ariaLabel?: string;
  height?: number;
  surface?: "panel" | "card";
  round?: boolean;
  active?: boolean;
  maxWidth?: number;
  icon?: ReactNode;
  id?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const cur = options.find((o) => o.value === value) ?? options[0];
  const close = useCallback(() => setOpen(false), []);
  const show = () => {
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (v: V) => {
    onChange(v);
    setOpen(false);
    btn.current?.focus();
  };
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, hi]);
  const base = triggerStyle(height, surface, !!round);
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          open ? setOpen(false) : show();
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
        className="flex min-w-0 items-center gap-2 text-left outline-none transition-[background,box-shadow] duration-150 focus-visible:shadow-[inset_0_0_0_1px_rgba(10,132,255,0.5)]"
        style={{
          ...base,
          maxWidth,
          ...(active ? { background: TINT, boxShadow: "none" } : null),
          ...(open && !active ? { boxShadow: `inset 0 0 0 1px ${C.line2}` } : null),
        }}
      >
        {icon}
        {cur?.dot && <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: cur.dot }} />}
        <span className="min-w-0 flex-1 truncate">{cur?.label}</span>
        {cur?.hint !== undefined && round && <span style={{ ...T.num, fontWeight: 400, fontSize: 12, color: active ? "#5AA9FF" : C.text3 }}>{cur.hint}</span>}
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className="shrink-0"
          color={C.text2}
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
        />
      </button>
      {open && btn.current && (
        <Floating
          anchor={btn.current}
          onClose={close}
          label={ariaLabel}
          onKey={(e) => {
            if (e.key === "ArrowDown") return setHi((i) => Math.min(options.length - 1, i + 1)), true;
            if (e.key === "ArrowUp") return setHi((i) => Math.max(0, i - 1)), true;
            if (e.key === "Home") return setHi(0), true;
            if (e.key === "End") return setHi(options.length - 1), true;
            if (e.key === "Enter" || e.key === " ") {
              const o = options[hi];
              if (o) pick(o.value);
              return true;
            }
          }}
        >
          <div ref={listRef} role="listbox" aria-label={ariaLabel} className="flex flex-col gap-0.5">
            {options.map((o, i) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value || "__empty"}
                  data-i={i}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o.value)}
                  className="flex w-full shrink-0 items-center gap-2.5 px-3 text-left transition-colors duration-100"
                  style={{ minHeight: 38, borderRadius: 10, fontSize: 14, background: on ? TINT : i === hi ? C.hover : undefined, color: on ? C.text : C.text2 }}
                >
                  {o.dot && <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: o.dot }} />}
                  <span className="min-w-0 flex-1 truncate" style={{ color: on || i === hi ? C.text : undefined }}>
                    {o.label}
                  </span>
                  {o.hint !== undefined && <span style={{ ...T.num, fontWeight: 400, fontSize: 12, color: on ? "#5AA9FF" : C.text3 }}>{o.hint}</span>}
                  {on && <Check size={14} strokeWidth={2} color="#5AA9FF" className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </Floating>
      )}
    </>
  );
}

// ── Dates ───────────────────────────────────────────────────────────────────────────────────────

/** Midnight-local Date for YYYY-MM-DD (never `new Date(str)`, which parses as UTC). */
function fromDay(s: string): Date {
  const [y, mo, d] = s.split("-").map(Number);
  return new Date(y, (mo ?? 1) - 1, d ?? 1);
}

/** «12 окт., пн» */
export function formatPicked(s: string): string {
  const d = fromDay(s);
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const wd = d.toLocaleDateString("ru-RU", { weekday: "short" });
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${day}${year}, ${wd}`;
}

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WD_MON = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WD_SUN = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Today, tomorrow, the first day of next week. */
export function quickDays(weekStartsMonday = true): { label: string; date: string }[] {
  return [
    { label: "Сегодня", date: localDayStr() },
    { label: "Завтра", date: addDays(new Date(), 1) },
    { label: "След. неделя", date: weekStart(1, weekStartsMonday) },
  ];
}

/**
 * Month calendar with quick chips. `value` "" = no date. Keyboard while mounted in a Floating:
 * arrows move the highlighted day, PageUp/PageDown change month, Enter picks — wire `keyRef`.
 */
export function CalendarPanel({
  value,
  onPick,
  weekStartsMonday = true,
  allowNone = true,
  keyRef,
}: {
  value: string;
  onPick: (v: string) => void;
  weekStartsMonday?: boolean;
  allowNone?: boolean;
  keyRef?: React.MutableRefObject<((e: KeyboardEvent) => boolean | void) | null>;
}) {
  const today = localDayStr();
  const [cursor, setCursor] = useState(value || today);
  const c = fromDay(cursor);
  const y = c.getFullYear();
  const mo = c.getMonth();
  const cells = useMemo(() => {
    const first = new Date(y, mo, 1);
    const lead = weekStartsMonday ? (first.getDay() + 6) % 7 : first.getDay();
    const start = new Date(y, mo, 1 - lead);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { key: localDayStr(d), day: d.getDate(), inMonth: d.getMonth() === mo };
    });
  }, [y, mo, weekStartsMonday]);
  // Drop the sixth row when the month fits in five.
  const rows = cells.slice(35).every((x) => !x.inMonth) ? cells.slice(0, 35) : cells;
  const shiftMonth = (n: number) => {
    const d = new Date(y, mo + n, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(c.getDate(), last));
    setCursor(localDayStr(d));
  };
  if (keyRef)
    keyRef.current = (e) => {
      const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (move) return setCursor((s) => addDays(fromDay(s), move)), true;
      if (e.key === "PageUp") return shiftMonth(-1), true;
      if (e.key === "PageDown") return shiftMonth(1), true;
      if (e.key === "Enter") return onPick(cursor), true;
    };
  const chip = (on: boolean): CSSProperties => ({
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 13,
    background: on ? TINT : C.card,
    color: on ? C.text : C.text2,
  });
  return (
    <div className="flex flex-col gap-2 p-1.5">
      <div className="flex flex-wrap gap-1">
        {quickDays(weekStartsMonday).map((q) => (
          <button key={q.label} type="button" onClick={() => onPick(q.date)} className="whitespace-nowrap transition-colors hover:text-[#F4F5F7]" style={chip(value === q.date)}>
            {q.label}
          </button>
        ))}
        {allowNone && (
          <button type="button" onClick={() => onPick("")} className="whitespace-nowrap transition-colors hover:text-[#F4F5F7]" style={chip(value === "")}>
            Без срока
          </button>
        )}
      </div>
      <div className="flex items-center justify-between pl-1.5 pt-1">
        <span style={{ fontSize: 14, fontWeight: 500 }}>
          {MONTHS[mo]} <span style={{ color: C.text3, fontWeight: 400 }}>{y}</span>
        </span>
        <div className="flex gap-0.5">
          {[
            { d: -1, I: ChevronLeft, l: "Предыдущий месяц" },
            { d: 1, I: ChevronRight, l: "Следующий месяц" },
          ].map(({ d, I, l }) => (
            <button
              key={d}
              type="button"
              aria-label={l}
              onClick={() => shiftMonth(d)}
              className="grid place-items-center transition-colors hover:bg-[#19191C]"
              style={{ width: 30, height: 30, borderRadius: 999, color: C.text2 }}
            >
              <I size={16} strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {(weekStartsMonday ? WD_MON : WD_SUN).map((w) => (
          <span key={w} className="grid place-items-center" style={{ height: 24, fontSize: 11, color: C.text3 }}>
            {w}
          </span>
        ))}
        {rows.map((x) => {
          const sel = x.key === value;
          const isToday = x.key === today;
          const isCur = x.key === cursor && !sel;
          return (
            <button
              key={x.key}
              type="button"
              aria-label={formatPicked(x.key)}
              aria-pressed={sel}
              onClick={() => onPick(x.key)}
              onMouseEnter={() => setCursor(x.key)}
              className="grid place-items-center transition-colors duration-100"
              style={{
                height: 34,
                borderRadius: 999,
                fontSize: 13,
                ...T.num,
                fontWeight: sel ? 500 : 400,
                letterSpacing: 0,
                background: sel ? C.accent : isCur ? C.raise : undefined,
                color: sel ? "#fff" : isToday ? "#5AA9FF" : x.inMonth ? C.text : C.text3,
                boxShadow: isToday && !sel ? `inset 0 0 0 1px rgba(10,132,255,0.55)` : undefined,
              }}
            >
              {x.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Field trigger + calendar popover. Value = "YYYY-MM-DD" or "" (no date). */
export function DatePicker({
  value,
  onChange,
  weekStartsMonday = true,
  height = 44,
  surface = "panel",
  ariaLabel = "Срок",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  weekStartsMonday?: boolean;
  height?: number;
  surface?: "panel" | "card";
  ariaLabel?: string;
  id?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const keyRef = useRef<((e: KeyboardEvent) => boolean | void) | null>(null);
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex min-w-0 items-center gap-2 text-left outline-none transition-[box-shadow] duration-150 focus-visible:shadow-[inset_0_0_0_1px_rgba(10,132,255,0.5)]"
        style={{ ...triggerStyle(height, surface, false), ...(open ? { boxShadow: `inset 0 0 0 1px ${C.line2}` } : null) }}
      >
        <CalendarDays size={16} strokeWidth={1.75} color={value ? C.text2 : C.text3} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate" style={{ color: value ? C.text : C.text3 }}>
          {value ? formatPicked(value) : "Без срока"}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} color={C.text2} className="shrink-0" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {open && btn.current && (
        <Floating anchor={btn.current} onClose={close} width={292} label={ariaLabel} onKey={(e) => keyRef.current?.(e)}>
          <CalendarPanel
            value={value}
            weekStartsMonday={weekStartsMonday}
            keyRef={keyRef}
            onPick={(v) => {
              onChange(v);
              setOpen(false);
              btn.current?.focus();
            }}
          />
        </Floating>
      )}
    </>
  );
}

// ── Tags ────────────────────────────────────────────────────────────────────────────────────────

/** «#Дизайн » → «дизайн». */
export const normTag = (s: string) => s.trim().replace(/^#+/, "").trim().toLowerCase();

/** Shared meta-chip box (priority, project, tags, dates on task cards/rows): 22 tall, 12px. */
export const metaChip: CSSProperties = {
  height: 22,
  padding: "0 8px",
  borderRadius: 999,
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

/** Tag chips — violet tint (tags' own hue, apart from the priority red/amber/blue): up to `max`, then «+N». */
export function TagChips({ tags, max = 2 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  const s: CSSProperties = { ...metaChip, background: TONE.violet.bg, color: TONE.violet.fg };
  return (
    <span className="inline-flex min-w-0 shrink items-center gap-1 overflow-hidden" title={tags.map((t) => `#${t}`).join(" ")}>
      {shown.map((t) => (
        <span key={t} className="inline-flex min-w-0 items-center" style={{ ...s, maxWidth: 130 }}>
          <span className="truncate">#{t}</span>
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex shrink-0 items-center" style={{ ...s, background: C.line2, color: C.text2 }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

/**
 * Tag editor: chips with ×, an input that adds on Enter or comma (Backspace on empty removes the
 * last), and the not-yet-used existing tags offered as quiet «+ #tag» chips below (filtered as you type).
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  surface = "panel",
  id,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  surface?: "panel" | "card";
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map(normTag).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };
  const q = normTag(draft);
  const offer = suggestions.filter((s) => !value.includes(s) && (!q || s.includes(q))).slice(0, 8);
  const box = triggerStyle(44, surface, false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 py-1.5" style={{ ...box, height: "auto", paddingLeft: 8, paddingRight: 8 }}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 whitespace-nowrap" style={{ height: 30, padding: "0 6px 0 11px", borderRadius: 999, fontSize: 13, background: TONE.violet.bg, color: TONE.violet.fg }}>
            #{t}
            <button
              type="button"
              aria-label={`Убрать тег #${t}`}
              onClick={() => onChange(value.filter((x) => x !== t))}
              className="grid place-items-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.08)]"
              style={{ width: 20, height: 20, color: C.text2 }}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (draft.trim()) add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : "Добавить тег"}
          className="min-w-[90px] flex-1 bg-transparent px-1.5 outline-none placeholder:text-[#5E6068]"
          style={{ height: 30, fontSize: 14, color: C.text }}
        />
      </div>
      {offer.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {offer.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-[#F4F5F7]"
              style={{ height: 28, padding: "0 10px 0 8px", borderRadius: 999, fontSize: 13, background: surface === "card" ? C.raise : C.card, color: C.text2 }}
            >
              <Plus size={12} strokeWidth={2} />#{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
