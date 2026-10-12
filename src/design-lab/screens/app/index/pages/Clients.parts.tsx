/**
 * «Индекс» · local parts shared by Клиенты and Планер: the right-side «case» panel, a compact
 * text segment, editable property rows, the payments ledger. Candidates for _kit if other
 * sections end up needing the same panel.
 */
import { useEffect, type CSSProperties, type ReactNode, type Ref } from "react";

import { B, T, tab, display, Sparkle, CtaBar, ThinCheck } from "@/design-lab/screens/_kit/index";
import { formatMoney } from "@/lib/format";
import { paymentState, type PaymentState } from "@/lib/payments";
import type { Payment } from "@/types";

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Case panel — full-height, slides in from the right, black, hairline on the left
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function CasePanel({
  open,
  onClose,
  eyebrow,
  title,
  deck,
  children,
  cta,
  onCta,
  ctaDisabled,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: ReactNode;
  title: ReactNode;
  deck?: ReactNode;
  children: ReactNode;
  cta?: ReactNode;
  onCta?: () => void;
  ctaDisabled?: boolean;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 animate-in fade-in-0 duration-200" style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 flex max-w-full flex-col animate-in slide-in-from-right-8 fade-in-0 duration-300"
        style={{ width, background: B.bg, borderLeft: `1px solid ${B.l10}`, fontFamily: B.font, color: B.text }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-8" style={{ borderBottom: `1px solid ${B.l7}` }}>
          <span style={{ ...T.meta, color: B.text3, ...tab }}>{eyebrow}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="-mr-2 flex h-8 w-8 items-center justify-center outline-none transition-colors duration-200 hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
            style={{ color: B.text2 }}
          >
            <Sparkle open size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-8">
          <h2 style={display(44)}>{title}</h2>
          {deck && (
            <p className="mt-3" style={{ ...T.bodyL, color: B.text2 }}>
              {deck}
            </p>
          )}
          {children}
        </div>
        {cta && (
          <CtaBar onClick={onCta} disabled={ctaDisabled} height={60}>
            {cta}
          </CtaBar>
        )}
      </aside>
    </>
  );
}

/** Section title inside the panel: «01  Оплаты ……… meta». */
export function PanelHead({ n, title, meta }: { n: string; title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mt-12 flex items-baseline justify-between gap-4 pb-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
      <div className="flex items-baseline gap-3">
        <span style={{ ...T.num, color: B.off }}>{n}</span>
        <h3 style={T.title}>{title}</h3>
      </div>
      {meta !== undefined && <span style={{ ...T.meta, color: B.text3, ...tab }}>{meta}</span>}
    </div>
  );
}

/** Editable property row: grey key left, control right, hairline under. */
export function Prop({ k, children, last }: { k: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div
      className="grid min-h-[48px] items-center gap-4"
      style={{ gridTemplateColumns: "128px minmax(0,1fr)", borderBottom: last ? undefined : `1px solid ${B.l7}` }}
    >
      <span style={{ ...T.body, color: B.text3 }}>{k}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

/** Borderless text input that reads as a value until focused. */
export function FieldInput({
  value,
  onChange,
  placeholder,
  type = "text",
  align = "right",
  autoFocus,
  inputRef,
  onEnter,
  id,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "date" | "time" | "url" | "email" | "tel";
  align?: "left" | "right";
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onEnter?: () => void;
  id?: string;
  width?: number | string;
}) {
  return (
    <input
      id={id}
      ref={inputRef}
      type={type}
      inputMode={type === "number" ? "numeric" : undefined}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      className="h-9 min-w-0 bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none transition-[box-shadow] duration-200 placeholder:text-[#454545] focus:shadow-[inset_0_-1px_0_rgba(255,255,255,0.4)]"
      style={{ ...T.body, ...tab, color: type === "date" && !value ? B.off : B.text, textAlign: align, width: width ?? "100%", colorScheme: "dark" }}
    />
  );
}

/** Compact segment without numbers: active white, the rest grey, no plates. */
export function Segment<Id extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: Id; label: ReactNode; count?: number }[];
  value: Id;
  onChange: (id: Id) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-5">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(it.id)}
            className="flex items-baseline gap-1.5 outline-none transition-colors duration-200 hover:text-white focus-visible:underline"
            style={{ ...T.body, color: on ? B.text : B.text3 }}
          >
            {it.label}
            {it.count !== undefined && <span style={{ ...T.num, color: on ? B.text2 : B.off }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Money as editorial numeral: big tabular figure + small grey «₽». */
export function Money({ n, size = "l", color = B.text }: { n: number; size?: "l" | "s"; color?: string }) {
  const num = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
  return (
    <span className="whitespace-nowrap" style={{ ...tab, color }}>
      {num}
      <span style={{ ...(size === "l" ? T.title : T.meta), color: B.text3, marginLeft: size === "l" ? 6 : 3, letterSpacing: 0 }}>₽</span>
    </span>
  );
}

/** Three quiet figures under the panel title. */
export function PanelFigures({ items }: { items: { k: string; v: number; hot?: boolean }[] }) {
  return (
    <div className="mt-8 grid grid-cols-3" style={{ borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l10}` }}>
      {items.map((it, i) => (
        <div key={it.k} className="min-w-0 py-4" style={{ paddingLeft: i ? 16 : 0, borderLeft: i ? `1px solid ${B.l7}` : undefined }}>
          <div style={{ ...T.meta, color: B.text3 }}>{it.k}</div>
          <div className="mt-3 truncate" style={{ ...T.displayS }}>
            <Money n={it.v} size="s" color={it.hot && it.v > 0 ? B.danger : B.text} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Payments ledger
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export const STATE_WORD: Record<PaymentState, { label: string; color: string }> = {
  paid: { label: "оплачено", color: B.text3 },
  overdue: { label: "просрочено", color: B.danger },
  soon: { label: "скоро оплата", color: B.text },
  scheduled: { label: "запланировано", color: B.text2 },
};

const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "2-digit" });

/** Square paid-toggle: hairline when pending, white fill + black tick when paid (lime stays for the CTA). */
function PaidBox({ paid, onClick, label }: { paid: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={paid}
      aria-label={paid ? `Вернуть в ожидание: ${label}` : `Отметить оплаченным: ${label}`}
      title={paid ? "Вернуть в ожидание" : "Отметить оплаченным"}
      className="flex h-4 w-4 shrink-0 items-center justify-center outline-none transition-colors duration-200 hover:!border-white/40 focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
      style={{ border: `1px solid ${paid ? B.text : B.l20}`, background: paid ? B.text : "transparent" }}
    >
      {paid && <ThinCheck size={10} color={B.bg} />}
    </button>
  );
}

export function Ledger({
  payments,
  onToggle,
  onDelete,
}: {
  payments: Payment[];
  onToggle: (p: Payment) => void;
  onDelete: (p: Payment) => void;
}) {
  const rows = [...payments].sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length === 0)
    return (
      <p className="py-4" style={{ ...T.body, color: B.text3, borderBottom: `1px solid ${B.l7}` }}>
        Пока нет оплат.
      </p>
    );
  return (
    <ul>
      {rows.map((p) => {
        const st = paymentState(p);
        const w = STATE_WORD[st];
        return (
          <li
            key={p.id}
            className="group grid h-12 items-center gap-4"
            style={{ gridTemplateColumns: "16px 88px minmax(0,1fr) auto 24px", borderBottom: `1px solid ${B.l7}` }}
          >
            <PaidBox paid={p.status === "paid"} onClick={() => onToggle(p)} label={formatMoney(p.amount)} />
            <span style={{ ...T.meta, color: B.text3, ...tab }}>{shortDate(p.date)}</span>
            <span className="truncate" style={{ ...T.meta, color: w.color }}>
              {w.label}
            </span>
            <span style={{ ...T.bodyStrong, color: p.status === "paid" ? B.text2 : B.text }}>
              <Money n={p.amount} size="s" color={p.status === "paid" ? B.text2 : B.text} />
            </span>
            <button
              type="button"
              onClick={() => onDelete(p)}
              aria-label={`Удалить оплату ${formatMoney(p.amount)}`}
              title="Удалить оплату"
              className="flex h-6 w-6 items-center justify-center opacity-0 outline-none transition-opacity duration-200 hover:text-[#FF5A36] focus-visible:opacity-100 group-hover:opacity-100"
              style={{ color: B.text3 }}
            >
              <Sparkle open size={10} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Inline «add a payment» row: amount · date · paid / expected. Submitted by the panel's CtaBar. */
export function AddPaymentRow({
  amount,
  setAmount,
  date,
  setDate,
  kind,
  setKind,
  placeholder = "Сумма",
  inputRef,
  onSubmit,
  pendingLabel = "Ожидается",
}: {
  amount: string;
  setAmount: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  kind: "paid" | "pending";
  setKind: (k: "paid" | "pending") => void;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  onSubmit: () => void;
  pendingLabel?: string;
}) {
  return (
    <div className="grid h-14 items-center gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) 136px auto", borderBottom: `1px solid ${B.l7}` }}>
      <FieldInput inputRef={inputRef} type="number" value={amount} onChange={setAmount} placeholder={placeholder} align="left" onEnter={onSubmit} />
      <FieldInput type="date" value={date} onChange={(v) => setDate(v)} align="left" />
      <Segment
        label="Тип оплаты"
        value={kind}
        onChange={setKind}
        items={[
          { id: "paid", label: "Оплачено" },
          { id: "pending", label: pendingLabel },
        ]}
      />
    </div>
  );
}

/** Quiet danger link at the end of a case. */
export function DangerLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-12 outline-none transition-colors duration-200 hover:text-[#FF5A36] focus-visible:underline"
      style={{ ...T.meta, color: B.text3 }}
    >
      {children}
    </button>
  );
}

export const caps: CSSProperties = { ...T.caps, color: B.text3 };
