/**
 * Клиенты · Craft Dark · v5 «Касса» — money report / ledger (ref 5 Relatel report, 14 Azura, 1 Wallet).
 * The live /clients page. Two tabs — «Клиенты» and «Ученики» — share one ledger layout.
 *
 *   [tile] Клиенты  5 клиентов · 5 оплат ждут  (Клиенты | Ученики)          Новый клиент
 *   ┌ Получено за всё время  740 000 ₽ · 12 месяцев (capsules) ┐ ┌ gauge собрано % ┐
 *   ┌ Ожидаемые оплаты (all payers, by date) ──────┐ ┌ Клиенты (ranked by paid) ┐
 *   │ ○ 65 000 ₽  Артем · Excellent    с 19 июл.  │ │ Николай ▬▬▬▬▬ 400 000 ₽   │
 *   │ …  tick = paid, hover trash                  │ │ …                          │
 *   │ + payer · amount · date · Ожидается/Оплачено │ │                            │
 *   │ Последние поступления                        │ │                            │
 *   └──────────────────────────────────────────────┘ └────────────────────────────┘
 *
 * Tab: `?tab=students` in the URL wins, else the last tab from localStorage.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { Btn, C, CapsuleBars, Empty, Gauge, R, RoundCheck, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { useData } from "@/store/DataProvider";
import { todayStr } from "@/lib/format";
import { paymentState, type PaymentState } from "@/lib/payments";
import type { Payment } from "@/types";
import { HoverTrash, Initials, Pills, Rub, dayMonth, daysTo, field, moneyOf, num, revenueBuckets, useClientDialogs, useClientsModel } from "./_parts";
import { feeLine, perPart, useStudentDialogs, useStudentsModel } from "./_students";

// ── Tabs ──────────────────────────────────────────────────────────────────────────────────────

type Tab = "clients" | "students";
const TAB_KEY = "crm.clients.tab";
const TABS: { id: Tab; label: string }[] = [
  { id: "clients", label: "Клиенты" },
  { id: "students", label: "Ученики" },
];
const asTab = (v: string | null): Tab | null => (v === "clients" || v === "students" ? v : null);

function readTab(): Tab {
  try {
    return asTab(localStorage.getItem(TAB_KEY)) ?? "clients";
  } catch {
    return "clients";
  }
}
function writeTab(t: Tab) {
  try {
    localStorage.setItem(TAB_KEY, t);
  } catch {
    /* private mode — the tab just isn't remembered */
  }
}

const WORDS: Record<Tab, { one: string; few: string; many: string; list: string; pick: string; none: string; add: string; search: string }> = {
  clients: { one: "клиент", few: "клиента", many: "клиентов", list: "Клиенты", pick: "Клиент", none: "Клиентов пока нет", add: "Новый клиент", search: "Поиск клиентов" },
  students: { one: "ученик", few: "ученика", many: "учеников", list: "Ученики", pick: "Ученик", none: "Учеников пока нет", add: "Новый ученик", search: "Поиск учеников" },
};

// ── Ledger model (a client or a student — same payment shape) ─────────────────────────────────

interface Payer {
  id: string;
  name: string;
  /** Shown after the name in a payment row (client's company). */
  company?: string;
  /** Second line in the ranking (company / monthly fee). */
  sub?: string;
  /** Archived client / student who no longer studies. */
  dim?: boolean;
  payments: Payment[];
  /** Default amount for a new payment (a student's per-payment share). */
  perPart?: number;
}

interface LedgerPay {
  p: Payment;
  payer: Payer;
  state: PaymentState;
}

interface LedgerApi {
  add: (id: string, p: Omit<Payment, "id">) => void;
  update: (id: string, paymentId: string, patch: Partial<Payment>) => void;
  remove: (id: string, paymentId: string) => void;
  open: (id: string) => void;
}

// ── Rows ──────────────────────────────────────────────────────────────────────────────────────

function PayLine({ r, onToggle, onDelete, onOpen }: { r: LedgerPay; onToggle: () => void; onDelete: () => void; onOpen: () => void }) {
  const late = r.state === "overdue";
  const paid = r.state === "paid";
  const dd = daysTo(r.p.date);
  const when = paid ? dayMonth(r.p.date) : late ? `просрочено с ${dayMonth(r.p.date)}` : dd === 0 ? "сегодня" : dd === 1 ? "завтра" : dd <= 7 ? `через ${dd} ${plural(dd, "день", "дня", "дней")}` : dayMonth(r.p.date);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group grid cursor-pointer items-center gap-4 px-6 outline-none transition-colors duration-150 hover:bg-[#17171A] focus-visible:bg-[#17171A]"
      style={{ gridTemplateColumns: "22px 128px minmax(0,1fr) auto 32px", minHeight: 56, ...dashed }}
    >
      <RoundCheck done={paid} onChange={onToggle} />
      <Rub v={r.p.amount} size={15} color={paid ? C.text2 : C.text} />
      <span className="min-w-0 truncate" style={{ ...T.body, color: paid ? C.text3 : C.text2 }}>
        <span style={{ color: paid ? C.text2 : C.text }}>{r.payer.name}</span>
        {r.payer.company ? ` · ${r.payer.company}` : ""}
        {r.p.note ? ` · ${r.p.note}` : ""}
      </span>
      <span className="whitespace-nowrap text-right" style={{ ...T.body, color: late ? TONE.amber.fg : r.state === "soon" ? "#5AA9FF" : C.text3 }}>
        {when}
      </span>
      <HoverTrash title="Удалить оплату" onClick={onDelete} />
    </div>
  );
}

function AddPayment({ payers, pick, onAdd }: { payers: Payer[]; pick: string; onAdd: (id: string, amount: number, date: string, status: "paid" | "pending") => void }) {
  const [cid, setCid] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const fallback = payers.find((p) => p.id === cid)?.perPart ?? 0;
  const n = amount.trim() ? Math.round(Number(amount.replace(/\s/g, ""))) : fallback;
  const ok = !!cid && Number.isFinite(n) && n > 0;
  const go = (s: "paid" | "pending") => {
    if (!ok) return;
    onAdd(cid, n, date, s);
    setAmount("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 p-1.5" style={{ borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
      <select value={cid} onChange={(e) => setCid(e.target.value)} className="min-w-[160px] flex-1 outline-none [color-scheme:dark]" style={{ ...field(C.raise), width: "auto", boxShadow: "none", color: cid ? C.text : C.text3 }} aria-label={pick}>
        <option value="">{pick}</option>
        {payers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))} onKeyDown={(e) => e.key === "Enter" && go("pending")} placeholder={fallback ? `${num(fallback)} ₽` : "Сумма, ₽"} aria-label="Сумма, ₽" className="shrink-0 outline-none placeholder:text-[#5E6068]" style={{ ...field(C.raise), width: 120, boxShadow: "none" }} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())} className="shrink-0 outline-none [color-scheme:dark]" style={{ ...field(C.raise), width: 150, boxShadow: "none" }} aria-label="Дата" />
      <div className="ml-auto flex gap-2">
        <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={() => go("pending")} disabled={!ok}>
          Ожидается
        </Btn>
        <Btn kind="ghost" onClick={() => go("paid")} disabled={!ok}>
          Оплачено
        </Btn>
      </div>
    </div>
  );
}

// ── The ledger body (shared by both tabs) ─────────────────────────────────────────────────────

const TWO_COL = "grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]";

function Ledger({ all, rows, pending, paid, query, words, api, monthReceipts }: { all: Payer[]; rows: Payer[]; pending: LedgerPay[]; paid: LedgerPay[]; query: string; words: (typeof WORDS)[Tab]; api: LedgerApi; monthReceipts?: boolean }) {
  const [showPaid, setShowPaid] = useState(false);
  // Students: the receipts block is this month's operations in full — no «Все N» cap.
  const month = todayStr().slice(0, 7);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("ru-RU", { month: "long" });
  const paidMonth = useMemo(() => paid.filter((r) => r.p.date.slice(0, 7) === month), [paid, month]);
  const paidShown = monthReceipts ? paidMonth : showPaid ? paid : paid.slice(0, 3);

  const t = useMemo(() => moneyOf(all.flatMap((p) => p.payments)), [all]);
  const rev = useMemo(() => revenueBuckets(all.flatMap((p) => p.payments), 12), [all]);
  const billed = t.paidTotal + t.pending;
  const year = rev.reduce((s, b) => s + b.value, 0);
  const best = rev.reduce((bi, b, i) => (b.value > rev[bi].value ? i : bi), rev.length - 1);
  const ranked = useMemo(
    () =>
      rows
        .map((r) => ({ r, money: moneyOf(r.payments) }))
        .sort((a, b) => b.money.paidTotal - a.money.paidTotal || b.money.pending - a.money.pending),
    [rows]
  );
  const max = Math.max(1, ...ranked.map((x) => x.money.paidTotal + x.money.pending));
  const searching = !!query.trim();

  return (
    <>
      <div className={`mt-6 ${TWO_COL}`}>
        <section data-lab-block="revenue" className="flex min-w-0 gap-8 p-6" style={{ background: C.card, borderRadius: R.card }}>
          <div className="flex shrink-0 flex-col justify-between">
            <div>
              <div style={{ ...T.body, color: C.text2 }}>Получено за всё время</div>
              <div className="mt-3">
                <Rub v={t.paidTotal} size={48} />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-6">
              <div>
                <div style={{ ...T.foot, color: C.text3 }}>В этом месяце</div>
                <div className="mt-1">
                  <Rub v={t.paidThisMonth} size={18} />
                </div>
              </div>
              <div>
                <div style={{ ...T.foot, color: C.text3 }}>За 12 месяцев</div>
                <div className="mt-1">
                  <Rub v={year} size={18} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-baseline justify-between" style={{ ...T.foot, color: C.text3 }}>
              <span>по месяцам</span>
              <span>тыс. ₽</span>
            </div>
            <div className="mt-auto min-w-0 pt-4">
              <CapsuleBars data={rev.map((b) => ({ label: b.label, value: Math.round(b.value / 1000) }))} highlight={best} height={132} showLabels={false} />
              {/* Own month row so the labels can shrink with the bars on narrow screens (no overflow). */}
              <div className="mt-2 flex gap-1.5">
                {rev.map((b, i) => (
                  <span key={b.key} className="min-w-0 flex-1 overflow-hidden text-center" style={{ fontSize: 10, color: i === best ? C.text2 : C.text3 }}>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section data-lab-block="collected" className="flex min-w-0 flex-col items-center p-6" style={{ background: C.card, borderRadius: R.card }}>
          <div className="self-start" style={{ ...T.body, color: C.text2 }}>
            Собрано из выставленного
          </div>
          <div className="flex flex-1 items-center py-4">
            <Gauge pct={billed ? (t.paidTotal / billed) * 100 : 0} size={200} label={`из ${num(billed)} ₽`} />
          </div>
          <div className="grid w-full grid-cols-2 gap-4 pt-4" style={{ ...dashed, backgroundPosition: "left top" }}>
            <div>
              <div style={{ ...T.foot, color: C.text3 }}>Ждём</div>
              <div className="mt-1">
                <Rub v={t.pending - t.overdue} size={18} />
              </div>
            </div>
            <div>
              <div style={{ ...T.foot, color: C.text3 }}>Просрочено</div>
              <div className="mt-1">
                <Rub v={t.overdue} size={18} color={t.overdue ? TONE.amber.fg : undefined} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={`mt-3 items-start ${TWO_COL}`}>
        <section data-lab-block="payments" className="flex min-w-0 flex-col overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
          <header className="flex items-center justify-between gap-4 px-6" style={{ height: 68, ...dashed }}>
            <h2 style={T.title}>Ожидаемые оплаты</h2>
            <span style={{ ...T.body, color: C.text3 }}>
              <span style={{ ...T.num, color: C.text }}>{num(t.pending)} ₽</span> всего
            </span>
          </header>
          {pending.length === 0 ? (
            <div className="px-6 pt-5">
              <Empty>{searching ? "Ничего не нашли" : all.length === 0 ? words.none : "Все оплаты получены"}</Empty>
            </div>
          ) : (
            pending.map((r, i) => (
              <div key={r.p.id} data-lab-block={i === 0 ? "pay-row" : undefined}>
                <PayLine r={r} onOpen={() => api.open(r.payer.id)} onToggle={() => api.update(r.payer.id, r.p.id, { status: "paid" })} onDelete={() => api.remove(r.payer.id, r.p.id)} />
              </div>
            ))
          )}
          {all.length > 0 ? (
            <div data-lab-block="add-payment" className="p-6 pt-5">
              <AddPayment payers={all} pick={words.pick} onAdd={(id, amount, date, status) => api.add(id, { amount, date, status })} />
            </div>
          ) : (
            <div className="h-6" />
          )}
          {monthReceipts ? (
            <div data-lab-block="receipts">
              <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-1">
                <span style={{ ...T.body, fontWeight: 500 }}>Поступления за {monthLabel}</span>
                <span style={{ ...T.body, ...T.num, fontWeight: 400, color: C.text3 }}>
                  {paidMonth.length} · {paidMonth.reduce((s, r) => s + r.p.amount, 0).toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div style={{ backgroundImage: dashed.backgroundImage, backgroundSize: dashed.backgroundSize, backgroundRepeat: "repeat-x", backgroundPosition: "left top" }}>
                {paidMonth.length === 0 ? (
                  <div className="px-6 py-4" style={{ ...T.body, color: C.text3 }}>
                    В этом месяце поступлений пока нет
                  </div>
                ) : (
                  paidShown.map((r) => (
                    <PayLine key={r.p.id} r={r} onOpen={() => api.open(r.payer.id)} onToggle={() => api.update(r.payer.id, r.p.id, { status: "pending" })} onDelete={() => api.remove(r.payer.id, r.p.id)} />
                  ))
                )}
              </div>
              <div className="h-3" />
            </div>
          ) : paid.length > 0 && (
            <div data-lab-block="receipts">
              <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-1">
                <span style={{ ...T.body, fontWeight: 500 }}>Последние поступления</span>
                {paid.length > 3 && (
                  <button type="button" onClick={() => setShowPaid((x) => !x)} className="transition-colors hover:text-[#5AA9FF]" style={{ ...T.body, color: C.text3 }}>
                    {showPaid ? "Свернуть" : `Все ${paid.length}`}
                  </button>
                )}
              </div>
              <div style={{ backgroundImage: dashed.backgroundImage, backgroundSize: dashed.backgroundSize, backgroundRepeat: "repeat-x", backgroundPosition: "left top" }}>
                {paidShown.map((r) => (
                  <PayLine key={r.p.id} r={r} onOpen={() => api.open(r.payer.id)} onToggle={() => api.update(r.payer.id, r.p.id, { status: "pending" })} onDelete={() => api.remove(r.payer.id, r.p.id)} />
                ))}
              </div>
              <div className="h-3" />
            </div>
          )}
        </section>

        <section data-lab-block="ranking" className="flex min-w-0 flex-col overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
          <header className="flex items-center justify-between gap-4 px-6" style={{ height: 68, ...dashed }}>
            <h2 style={T.title}>{words.list}</h2>
            <span style={{ ...T.foot, color: C.text3 }}>по оплатам</span>
          </header>
          {ranked.length === 0 ? (
            <div className="p-6">
              <Empty>{searching ? "Никого не нашли" : words.none}</Empty>
            </div>
          ) : (
            ranked.map(({ r, money }, i) => (
              <div
                key={r.id}
                data-lab-block={i === 0 ? "rank-row" : undefined}
                role="button"
                tabIndex={0}
                onClick={() => api.open(r.id)}
                onKeyDown={(e) => e.key === "Enter" && api.open(r.id)}
                className="group flex cursor-pointer flex-col gap-2.5 px-6 py-4 outline-none transition-colors duration-150 hover:bg-[#17171A] focus-visible:bg-[#17171A]"
                style={{ ...dashed, opacity: r.dim ? 0.6 : 1 }}
              >
                <div className="flex items-center gap-3">
                  <Initials name={r.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ ...T.body, fontSize: 15 }}>
                      {r.name}
                    </div>
                    {r.sub && (
                      <div className="truncate" style={{ ...T.foot, color: C.text3 }}>
                        {r.sub}
                      </div>
                    )}
                  </div>
                  <Rub v={money.paidTotal} size={15} color={money.paidTotal ? C.text : C.text3} />
                </div>
                <div className="flex w-full gap-1" style={{ height: 5 }}>
                  {money.paidTotal > 0 && <span style={{ width: `${(money.paidTotal / max) * 100}%`, borderRadius: 999, background: C.accent }} />}
                  {money.pending > 0 && <span style={{ width: `${(money.pending / max) * 100}%`, borderRadius: 999, background: money.overdue ? "rgba(255,185,56,0.55)" : "#3A3A42" }} />}
                  <span className="flex-1" style={{ borderRadius: 999, background: C.raise }} />
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────────────────────

export default function ClientsCash() {
  const { addPayment, updatePayment, deletePayment, addStudentPayment, updateStudentPayment, deleteStudentPayment } = useData();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const urlTab = asTab(params.get("tab"));
  const [tab, setTabState] = useState<Tab>(() => urlTab ?? readTab());
  const [query, setQuery] = useState("");

  // The URL can change the tab later too (a link to /clients?tab=students while already here).
  useEffect(() => {
    if (urlTab) setTabState(urlTab);
  }, [urlTab]);

  const setTab = (t: Tab) => {
    setTabState(t);
    writeTab(t);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === "students") next.set("tab", "students");
        else next.delete("tab");
        return next;
      },
      { replace: true }
    );
  };

  const cm = useClientsModel(query);
  const sm = useStudentsModel(query);
  const d = useClientDialogs();
  const sd = useStudentDialogs();

  // Deep link from the command palette («Клиенты» group): { openClientId } opens the client's card.
  const openClientId = (location.state as { openClientId?: string } | null)?.openClientId;
  useEffect(() => {
    if (!openClientId) return;
    setTabState("clients");
    d.open(openClientId);
  }, [openClientId]);

  const view = useMemo(() => {
    if (tab === "clients") {
      const toPayer = (r: (typeof cm.all)[number]): Payer => ({ id: r.c.id, name: r.c.name, company: r.c.company, sub: r.c.company, dim: r.c.status === "archived", payments: r.c.payments });
      return { all: cm.all.map(toPayer), rows: cm.rows.map(toPayer) };
    }
    const toPayer = (r: (typeof sm.all)[number]): Payer => ({ id: r.s.id, name: r.s.name, sub: feeLine(r.s), dim: !r.s.active, payments: r.s.payments, perPart: perPart(r.s) || undefined });
    return { all: sm.all.map(toPayer), rows: sm.rows.map(toPayer) };
  }, [tab, cm, sm]);

  const { pending, paid } = useMemo(() => {
    const today = todayStr();
    const pays: LedgerPay[] = view.rows.flatMap((payer) => payer.payments.map((p) => ({ p, payer, state: paymentState(p, today) })));
    return {
      pending: pays.filter((x) => x.p.status === "pending").sort((a, b) => a.p.date.localeCompare(b.p.date)),
      paid: pays.filter((x) => x.p.status === "paid").sort((a, b) => b.p.date.localeCompare(a.p.date)),
    };
  }, [view]);

  const api: LedgerApi =
    tab === "clients"
      ? { add: addPayment, update: updatePayment, remove: deletePayment, open: d.open }
      : { add: addStudentPayment, update: updateStudentPayment, remove: deleteStudentPayment, open: sd.open };

  const w = WORDS[tab];
  const count = view.all.length;

  return (
    <CraftShell
      active="clients"
      crumb="Клиенты"
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="whitespace-nowrap">
            {count} {plural(count, w.one, w.few, w.many)} · {pending.length} {plural(pending.length, "оплата ждёт", "оплаты ждут", "оплат ждут")}
          </span>
          <Pills tabs framed size={32} label="Раздел" items={TABS} value={tab} onChange={setTab} />
        </span>
      }
      search={{ value: query, onChange: setQuery, placeholder: w.search }}
      actions={
        <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={() => (tab === "clients" ? d.startNew() : sd.startNew())}>
          {w.add}
        </Btn>
      }
    >
      <Ledger key={tab} all={view.all} rows={view.rows} pending={pending} paid={paid} query={query} words={w} api={api} monthReceipts={tab === "students"} />
      {d.dialogs}
      {sd.dialogs}
    </CraftShell>
  );
}
