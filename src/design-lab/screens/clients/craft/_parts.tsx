/**
 * Клиенты · Craft Dark — pieces for the chosen «Касса» screen: the data model over the real store
 * (clientMoney / clientRisk / isRepeatClient / paymentState, same as src/pages/Clients.tsx and
 * ClientDetailDialog), the client editor in the main screen's TaskEditor language, the «Новый клиент»
 * dialog, money/date helpers and a few small visual atoms.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FolderKanban, Link2, Mail, Phone, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Btn, C, IconBtn, R, StatusPill, T, TONE, dashed, plural, type Tone } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { clientMoney, isRepeatClient, type ClientMoney } from "@/lib/clients";
import { paymentState, type PaymentState } from "@/lib/payments";
import { daysSince, todayStr } from "@/lib/format";
import type { Client, ClientStatus, Payment, Project, RiskLevel } from "@/types";

// ── Labels & tones ────────────────────────────────────────────────────────────────────────────

const STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  negotiation: { label: "Переговоры", tone: "blue" },
  active: { label: "Активный", tone: "green" },
  archived: { label: "Архив", tone: "neutral" },
};

const PAY_STATE: Record<PaymentState, { label: string; tone: Tone }> = {
  paid: { label: "Оплачено", tone: "green" },
  overdue: { label: "Просрочено", tone: "amber" },
  soon: { label: "Скоро оплата", tone: "blue" },
  scheduled: { label: "Запланировано", tone: "neutral" },
};

// ── Formatting ────────────────────────────────────────────────────────────────────────────────

const NUM = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const num = (n: number) => NUM.format(n);

/** «15 сент.» — a YYYY-MM-DD (local) or ISO date. */
export function dayMonth(d: string) {
  const date = d.length === 10 ? new Date(`${d}T00:00`) : new Date(d);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function ago(iso: string) {
  const n = Math.max(0, daysSince(iso));
  if (n === 0) return "сегодня";
  if (n === 1) return "вчера";
  return `${n} ${plural(n, "день", "дня", "дней")} назад`;
}

/** Days from today to a YYYY-MM-DD (negative = past). */
export function daysTo(d: string) {
  const a = new Date(`${todayStr()}T00:00`).getTime();
  const b = new Date(`${d}T00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "·";

// ── Model ─────────────────────────────────────────────────────────────────────────────────────

interface ClientRow {
  c: Client;
  money: ClientMoney;
  projects: Project[];
  risk: RiskLevel;
  repeat: boolean;
  /** Days since the last activity. */
  quiet: number;
  /** Earliest unpaid payment. */
  next?: Payment;
  followDue: boolean;
}

export interface PayRow {
  p: Payment;
  client: Client;
  state: PaymentState;
}

export function useClientsModel(query = "") {
  const { clients, projects, clientRisk } = useData();
  return useMemo(() => {
    const today = todayStr();
    const q = query.trim().toLowerCase();
    const all: ClientRow[] = clients.map((c) => {
      const linked = projects.filter((p) => p.clientId === c.id);
      const pending = c.payments.filter((p) => p.status === "pending").sort((a, b) => a.date.localeCompare(b.date));
      return {
        c,
        money: clientMoney(c, today),
        projects: linked,
        risk: clientRisk(c),
        repeat: isRepeatClient(c, linked.length),
        quiet: Math.max(0, daysSince(c.lastActivityAt)),
        next: pending[0],
        followDue: !!c.followUpAt && c.followUpAt <= today,
      };
    });
    const match = (r: ClientRow) =>
      !q ||
      [r.c.name, r.c.company, r.c.email, r.c.phone, ...r.c.tags].some((s) => (s ?? "").toLowerCase().includes(q));
    const rows = all.filter(match);

    const totals = all.reduce(
      (s, r) => ({
        paidTotal: s.paidTotal + r.money.paidTotal,
        paidThisMonth: s.paidThisMonth + r.money.paidThisMonth,
        pending: s.pending + r.money.pending,
        overdue: s.overdue + r.money.overdue,
      }),
      { paidTotal: 0, paidThisMonth: 0, pending: 0, overdue: 0 }
    );

    const counts: Record<ClientStatus, number> = { active: 0, negotiation: 0, archived: 0 };
    for (const r of all) counts[r.c.status] += 1;

    const payments: PayRow[] = clients.flatMap((c) => c.payments.map((p) => ({ p, client: c, state: paymentState(p, today) })));

    return { all, rows, totals, counts, payments, today };
  }, [clients, projects, clientRisk, query]);
}

/** Paid money per month, `n` months back to the current one (same buckets as the real page). */
export function revenueBuckets(payments: Payment[], n = 6) {
  const now = new Date();
  const buckets = Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
      long: d.toLocaleDateString("ru-RU", { month: "long" }),
      value: 0,
    };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const i = idx.get(p.date.slice(0, 7));
    if (i !== undefined) buckets[i].value += p.amount;
  }
  return buckets;
}

/** Same aggregation as clientMoney(), over any payment log (clients and students share the shape). */
export function moneyOf(payments: Payment[], today = todayStr()): ClientMoney {
  let paidTotal = 0;
  let paidThisMonth = 0;
  let pending = 0;
  let overdue = 0;
  for (const p of payments) {
    if (p.status === "paid") {
      paidTotal += p.amount;
      if (p.date.slice(0, 7) === today.slice(0, 7)) paidThisMonth += p.amount;
    } else {
      pending += p.amount;
      if (p.date < today) overdue += p.amount;
    }
  }
  return { paidTotal, paidThisMonth, pending, overdue };
}

export function useRevenue(n = 6) {
  const { clients } = useData();
  return useMemo(() => revenueBuckets(clients.flatMap((c) => c.payments), n), [clients, n]);
}

/** Delete with an undo toast (same as the real ClientDetailDialog). */
function useRemoveClient() {
  const { deleteClient, restoreClient } = useData();
  const { toast } = useToast();
  return (c: Client) => {
    deleteClient(c.id);
    toast("Клиент удалён", { actionLabel: "Вернуть", onAction: () => restoreClient(c) });
  };
}

type NewClientInput = { name: string; company?: string; status: ClientStatus; email?: string; phone?: string };

/** addClient() returns nothing — this remembers the ids before and reports the new client's id. */
function useCreateClient(onCreated?: (id: string) => void) {
  const { clients, addClient } = useData();
  const before = useRef<Set<string> | null>(null);
  const cb = useRef(onCreated);
  cb.current = onCreated;
  useEffect(() => {
    if (!before.current) return;
    const fresh = clients.find((c) => !before.current!.has(c.id));
    if (fresh) {
      before.current = null;
      cb.current?.(fresh.id);
    }
  }, [clients]);
  return (input: NewClientInput) => {
    if (!input.name.trim()) return;
    before.current = new Set(clients.map((c) => c.id));
    addClient({
      name: input.name.trim(),
      company: input.company?.trim() || undefined,
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      status: input.status,
      revenue: 0,
      expectedPayment: 0,
      payments: [],
      lastActivityAt: new Date().toISOString(),
    });
  };
}

export function useEsc(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
}

// ── Atoms ─────────────────────────────────────────────────────────────────────────────────────

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const ICON16 = { size: 16, strokeWidth: 1.75 } as const;

/** Big money number with a quieter ₽. */
export function Rub({ v, size = 16, color, weight = 500 }: { v: number; size?: number; color?: string; weight?: 400 | 500 }) {
  return (
    <span className="whitespace-nowrap" style={{ ...T.num, fontWeight: weight, fontSize: size, lineHeight: 1.05, color: color ?? C.text, letterSpacing: size >= 28 ? "-0.04em" : "-0.02em" }}>
      {num(v)}
      <span style={{ color: C.text3, fontWeight: 400, marginLeft: size >= 28 ? 6 : 3, fontSize: size >= 28 ? Math.round(size * 0.55) : undefined, letterSpacing: 0 }}>₽</span>
    </span>
  );
}

/** Initials in a quiet round — no photos in the data, no colours. */
export function Initials({ name, size = 40, tint }: { name: string; size?: number; tint?: boolean }) {
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: tint ? "rgba(10,132,255,0.14)" : C.raise,
        color: tint ? "#5AA9FF" : C.text2,
        fontSize: size >= 56 ? 20 : size >= 44 ? 15 : 13,
        fontWeight: 500,
        letterSpacing: "-0.02em",
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Hover-revealed round trash button (rows / cards with `group`). */
export function HoverTrash({ onClick, title = "Удалить", always }: { onClick: () => void; title?: string; always?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF6B63] focus-visible:opacity-100 ${always ? "" : "opacity-0 group-hover:opacity-100"}`}
      style={{ color: C.text3 }}
    >
      <Trash2 {...ICON16} />
    </button>
  );
}

/** Pill segmented choice for client status (like the TaskEditor priority pills). */
function StatusChoice({ value, onChange, bg }: { value: ClientStatus; onChange: (s: ClientStatus) => void; bg?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["active", "negotiation", "archived"] as ClientStatus[]).map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="inline-flex items-center gap-2 px-3.5 transition-colors"
            style={{
              height: 36,
              borderRadius: 999,
              fontSize: 14,
              background: on ? bg ?? C.raise : "transparent",
              boxShadow: `inset 0 0 0 1px ${on ? C.line2 : C.line}`,
              color: on ? C.text : C.text2,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 9, background: TONE[STATUS[s].tone].dot === C.text ? C.text3 : TONE[STATUS[s].tone].dot }} />
            {STATUS[s].label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pill segmented control: active = soft blue tint, no outline. `role="tablist"` + arrow keys when
 * used as page tabs; also used for small in-form choices (деление, занимается).
 */
export function Pills<K extends string>({
  items,
  value,
  onChange,
  label,
  tabs,
  size = 36,
  framed,
}: {
  items: { id: K; label: string }[];
  value: K;
  onChange: (id: K) => void;
  label: string;
  tabs?: boolean;
  size?: number;
  /** Quiet card-coloured track behind the pills (page tabs). */
  framed?: boolean;
}) {
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = items.findIndex((it) => it.id === value);
    const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    onChange(next.id);
    const host = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => host.querySelector<HTMLButtonElement>('[aria-selected="true"],[aria-pressed="true"]')?.focus());
  };
  return (
    <div
      role={tabs ? "tablist" : "group"}
      aria-label={label}
      onKeyDown={onKey}
      className="inline-flex shrink-0 items-center gap-1"
      style={framed ? { padding: 4, borderRadius: 999, background: C.card } : undefined}
    >
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role={tabs ? "tab" : undefined}
            aria-selected={tabs ? on : undefined}
            aria-pressed={tabs ? undefined : on}
            tabIndex={tabs && !on ? -1 : 0}
            onClick={() => onChange(it.id)}
            className={`whitespace-nowrap px-3.5 outline-none transition-colors duration-150 focus-visible:text-[#F4F5F7] ${
              on ? "text-[#F4F5F7]" : framed ? "text-[#5E6068] hover:text-[#9A9CA3]" : "text-[#9A9CA3] hover:text-[#F4F5F7]"
            }`}
            style={{
              height: size,
              borderRadius: 999,
              fontSize: 14,
              background: on ? "rgba(10,132,255,0.14)" : framed ? "transparent" : C.card,
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export const field = (bg: string = C.card): CSSProperties => ({
  height: 44,
  borderRadius: 12,
  background: bg,
  boxShadow: `inset 0 0 0 1px ${C.line}`,
  padding: "0 14px",
  fontSize: 14,
  color: C.text,
  width: "100%",
});

export const fieldLabel: CSSProperties = { ...T.foot, color: C.text3, marginBottom: 6 };

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col ${className}`}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

/** Dialog frame — panel radius 24, blurred backdrop, Esc closes. */
export function Dialog({ label, width = 560, onClose, children }: { label: string; width?: number; onClose: () => void; children: ReactNode }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={label}
        className="flex max-h-[calc(100vh-48px)] w-full flex-col overflow-hidden"
        style={{ maxWidth: width, background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ── Payments & projects blocks (used by the editor and the split view's card) ─────────────────

type PayDraft = Omit<Payment, "id">;

/**
 * A payment log + «add payment» row over any payer (client or student). `defaultAmount` pre-fills
 * an empty amount (a student's per-payment share).
 */
export function PaymentLog({
  payments,
  onAdd,
  onUpdate,
  onDelete,
  defaultAmount,
  bg = C.card,
  rowBg,
}: {
  payments: Payment[];
  onAdd: (p: PayDraft) => void;
  onUpdate: (paymentId: string, patch: Partial<Payment>) => void;
  onDelete: (paymentId: string) => void;
  defaultAmount?: number;
  bg?: string;
  rowBg?: string;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const list = [...payments].sort((a, b) => b.date.localeCompare(a.date));
  const typed = Math.round(Number(amount.replace(/\s/g, "")));
  const value = amount.trim() ? typed : defaultAmount ?? 0;
  const ok = Number.isFinite(value) && value > 0;
  const add = (status: "paid" | "pending") => {
    if (!ok) return;
    onAdd({ amount: value, status, date });
    setAmount("");
    setDate(todayStr());
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col overflow-hidden" style={{ background: rowBg ?? bg, borderRadius: R.inner }}>
        {list.length === 0 ? (
          <div className="px-4 py-5" style={{ ...T.body, color: C.text3 }}>
            Оплат пока нет
          </div>
        ) : (
          list.map((p) => {
            const st = paymentState(p);
            return (
              <div key={p.id} className="group flex items-center gap-3 pl-4 pr-2" style={{ minHeight: 52, ...dashed }}>
                <span className="w-[112px] shrink-0">
                  <Rub v={p.amount} size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text3 }}>
                  {dayMonth(p.date)}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <StatusPill tone={PAY_STATE[st].tone} size={28}>
                  {PAY_STATE[st].label}
                </StatusPill>
                <span className="flex items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    title={p.status === "paid" ? "Вернуть в ожидание" : "Отметить оплаченным"}
                    aria-label={p.status === "paid" ? "Вернуть в ожидание" : "Отметить оплаченным"}
                    onClick={() => onUpdate(p.id, { status: p.status === "paid" ? "pending" : "paid" })}
                    className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[#1D1D21]"
                    style={{ color: C.text2 }}
                  >
                    {p.status === "paid" ? <RotateCcw {...ICON16} /> : <Check {...ICON16} />}
                  </button>
                  <HoverTrash always title="Удалить оплату" onClick={() => onDelete(p.id)} />
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Сумма, ₽" className="w-[132px] shrink-0">
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))} onKeyDown={(e) => e.key === "Enter" && add("paid")} placeholder={defaultAmount ? num(defaultAmount) : "0"} className="outline-none placeholder:text-[#5E6068]" style={field(bg)} />
        </Field>
        <Field label="Дата" className="min-w-[140px] flex-1">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())} className="outline-none [color-scheme:dark]" style={field(bg)} />
        </Field>
        <div className="flex gap-2">
          <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={() => add("paid")} disabled={!ok}>
            Оплачено
          </Btn>
          <Btn kind="ghost" onClick={() => add("pending")} disabled={!ok}>
            Ожидается
          </Btn>
        </div>
      </div>
    </div>
  );
}

function PaymentsBlock({ client, bg = C.card, rowBg }: { client: Client; bg?: string; rowBg?: string }) {
  const { addPayment, updatePayment, deletePayment } = useData();
  return (
    <PaymentLog
      payments={client.payments}
      onAdd={(p) => addPayment(client.id, p)}
      onUpdate={(id, patch) => updatePayment(client.id, id, patch)}
      onDelete={(id) => deletePayment(client.id, id)}
      bg={bg}
      rowBg={rowBg}
    />
  );
}

function ProjectsBlock({ client, bg = C.card, rowBg }: { client: Client; bg?: string; rowBg?: string }) {
  const { projects, updateProject } = useData();
  const navigate = useNavigate();
  const linked = projects.filter((p) => p.clientId === client.id);
  const linkable = projects.filter((p) => !p.clientId);
  const [pick, setPick] = useState("");
  return (
    <div className="flex flex-col gap-3">
      {linked.length > 0 && (
        <div className="flex flex-col overflow-hidden" style={{ background: rowBg ?? bg, borderRadius: R.inner }}>
          {linked.map((p) => (
            <div key={p.id} className="group flex items-center gap-3 pl-4 pr-2" style={{ minHeight: 48, ...dashed }}>
              <FolderKanban {...ICON16} color={C.text2} />
              <button type="button" title="Открыть проект" onClick={() => navigate(`/projects/${p.id}`)} className="min-w-0 flex-1 truncate text-left transition-colors hover:text-[#5AA9FF]" style={{ ...T.body, color: C.text }}>
                {p.name}
              </button>
              <span style={{ ...T.foot, color: C.text3 }}>{p.status === "done" ? "завершён" : p.status === "planned" ? "в планах" : p.status === "archived" ? "в архиве" : "в работе"}</span>
              <button
                type="button"
                title="Отвязать проект"
                aria-label={`Отвязать проект: ${p.name}`}
                onClick={() => updateProject(p.id, { clientId: undefined })}
                className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-[opacity,background] duration-150 hover:bg-[#1D1D21] group-hover:opacity-100 focus-visible:opacity-100"
                style={{ color: C.text2 }}
              >
                <X {...ICON16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {linkable.length > 0 ? (
        <div className="flex items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1 outline-none [color-scheme:dark]" style={{ ...field(bg), color: pick ? C.text : C.text3 }}>
            <option value="">{linked.length ? "Привязать ещё проект" : "Привязать проект"}</option>
            {linkable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Btn
            kind="ghost"
            icon={<Link2 {...ICON16} />}
            disabled={!pick}
            onClick={() => {
              updateProject(pick, { clientId: client.id });
              setPick("");
            }}
          >
            Привязать
          </Btn>
        </div>
      ) : (
        linked.length === 0 && <div style={{ ...T.body, color: C.text3 }}>Свободных проектов нет</div>
      )}
    </div>
  );
}

export function MoneyTriplet({ m, bg = C.card }: { m: Pick<ClientMoney, "paidTotal" | "pending" | "overdue">; bg?: string }) {
  const cell = (label: string, v: number, color?: string) => (
    <div className="min-w-0 px-4 py-3" style={{ background: bg, borderRadius: R.inner }}>
      <div style={{ ...T.foot, color: C.text3 }}>{label}</div>
      <div className="mt-1.5 truncate">
        <Rub v={v} size={20} color={color} />
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      {cell("Оплачено", m.paidTotal)}
      {cell("Ожидается", m.pending)}
      {cell("Просрочено", m.overdue, m.overdue > 0 ? TONE.amber.fg : undefined)}
    </div>
  );
}

export function SubHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <span style={{ ...T.body, fontWeight: 500, color: C.text }}>{children}</span>
      {right}
    </div>
  );
}

// ── Client editor (dialog) ────────────────────────────────────────────────────────────────────

/**
 * Opens on a client click. Left: the client's fields (saved with «Сохранить»). Right: money, the
 * payment log and linked projects — these apply at once, like on the real card.
 */
function ClientEditor({ client, onClose, onDelete }: { client: Client; onClose: () => void; onDelete: () => void }) {
  const { updateClient, touchClient } = useData();
  const [name, setName] = useState(client.name);
  const [company, setCompany] = useState(client.company ?? "");
  const [status, setStatus] = useState<ClientStatus>(client.status);
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [follow, setFollow] = useState(client.followUpAt ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const money = clientMoney(client);
  const save = () => {
    if (!name.trim()) return;
    updateClient(client.id, {
      name: name.trim(),
      company: company.trim() || undefined,
      status,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      followUpAt: follow || undefined,
      notes: notes.trim() || undefined,
    });
    onClose();
  };
  return (
    <Dialog label="Клиент" width={980} onClose={onClose}>
      <div className="flex items-center justify-between gap-4 px-6 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <Initials name={client.name} size={44} tint />
          <div className="min-w-0">
            <div className="truncate" style={T.h2}>
              {client.name}
            </div>
            <div className="mt-0.5 flex items-center gap-2" style={{ ...T.body, color: C.text3 }}>
              <span>Последний контакт {ago(client.lastActivityAt)}</span>
              <span style={{ color: C.line2 }}>·</span>
              <button type="button" onClick={() => touchClient(client.id)} className="transition-colors hover:text-[#5AA9FF]" style={{ color: C.text2 }}>
                Отметить контакт сегодня
              </button>
            </div>
          </div>
        </div>
        <IconBtn title="Закрыть" onClick={onClose}>
          <X {...ICON} />
        </IconBtn>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-2 pt-5" style={{ gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.1fr)" }}>
        <div className="flex flex-col gap-4">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Имя клиента" className="outline-none placeholder:text-[#5E6068]" style={{ ...field(), height: 52, fontSize: 16 }} />
          <Field label="Компания">
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="—" className="outline-none placeholder:text-[#5E6068]" style={field()} />
          </Field>
          <div className="flex flex-col">
            <span style={fieldLabel}>Статус</span>
            <StatusChoice value={status} onChange={setStatus} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="—" className="outline-none placeholder:text-[#5E6068]" style={field()} />
            </Field>
            <Field label="Телефон">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" className="outline-none placeholder:text-[#5E6068]" style={field()} />
            </Field>
          </div>
          <Field label="Следующий контакт">
            <input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} className="outline-none [color-scheme:dark]" style={{ ...field(), color: follow ? C.text : C.text3 }} />
          </Field>
          <Field label="Заметка">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Контекст, договорённости…" className="resize-none outline-none placeholder:text-[#5E6068]" style={{ ...field(), height: "auto", padding: "12px 14px", lineHeight: 1.45 }} />
          </Field>
        </div>

        <div className="flex flex-col gap-5">
          <MoneyTriplet m={money} />
          <div>
            <SubHead right={<span style={{ ...T.foot, color: C.text3 }}>{client.payments.length} {plural(client.payments.length, "запись", "записи", "записей")}</span>}>Оплаты</SubHead>
            <PaymentsBlock client={client} />
          </div>
          <div>
            <SubHead>Проекты</SubHead>
            <ProjectsBlock client={client} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 pb-6 pt-4">
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]" style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}>
          <Trash2 {...ICON16} />
          Удалить
        </button>
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn onClick={save} disabled={!name.trim()}>
            Сохранить
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}

// ── New client dialog ─────────────────────────────────────────────────────────────────────────

function NewClientDialog({ initialStatus = "active", onClose, onCreate }: { initialStatus?: ClientStatus; onClose: () => void; onCreate: (x: NewClientInput) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ClientStatus>(initialStatus);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name, company, status, email, phone });
    onClose();
  };
  return (
    <Dialog label="Новый клиент" onClose={onClose}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <span style={T.h2}>Новый клиент</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Имя клиента" className="outline-none placeholder:text-[#5E6068]" style={{ ...field(), height: 52, fontSize: 16 }} />
        <Field label="Компания">
          <input value={company} onChange={(e) => setCompany(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="—" className="outline-none placeholder:text-[#5E6068]" style={field()} />
        </Field>
        <div className="flex flex-col">
          <span style={fieldLabel}>Статус</span>
          <StatusChoice value={status} onChange={setStatus} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <span className="relative block">
              <Mail size={15} strokeWidth={1.75} color={C.text3} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="—" className="outline-none placeholder:text-[#5E6068]" style={{ ...field(), paddingLeft: 38 }} />
            </span>
          </Field>
          <Field label="Телефон">
            <span className="relative block">
              <Phone size={15} strokeWidth={1.75} color={C.text3} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" className="outline-none placeholder:text-[#5E6068]" style={{ ...field(), paddingLeft: 38 }} />
            </span>
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Btn kind="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn onClick={submit} disabled={!name.trim()}>
            Добавить
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Editor + new-client wiring: `open(id)`, `create()`, and the
 * rendered dialogs. A freshly added client opens straight into its card for payments.
 */
export function useClientDialogs() {
  const { clients } = useData();
  const remove = useRemoveClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<ClientStatus | null>(null);
  const create = useCreateClient((id) => setEditId(id));
  const editing = editId ? clients.find((c) => c.id === editId) : undefined;
  const dialogs = (
    <>
      {editing && (
        <ClientEditor
          key={editing.id}
          client={editing}
          onClose={() => setEditId(null)}
          onDelete={() => {
            setEditId(null);
            remove(editing);
          }}
        />
      )}
      {newStatus && <NewClientDialog initialStatus={newStatus} onClose={() => setNewStatus(null)} onCreate={create} />}
    </>
  );
  return { open: setEditId, startNew: (s: ClientStatus = "active") => setNewStatus(s), create, remove, dialogs };
}

export function NewClientBtn({ onClick }: { onClick: () => void }) {
  return (
    <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={onClick}>
      Новый клиент
    </Btn>
  );
}
