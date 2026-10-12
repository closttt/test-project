/**
 * «Индекс» · Клиенты — money first, then the index of people. Two numbered tabs (клиенты /
 * ученики), a hairline KPI strip, one full-width table; below it revenue as dot-columns and the
 * «связаться» list. A row opens the right-side case panel (properties, ledger, projects, note)
 * with «Записать оплату» as its CtaBar. One lime element: «Новый клиент».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatMoney, todayStr, addDays, daysSince } from "@/lib/format";
import { clientMoney, isRepeatClient } from "@/lib/clients";
import { studentStatus, studentTotals, STUDENT_STATUS_META, type StudentPayStatus } from "@/lib/students";
import type { Client, ClientStatus, Student } from "@/types";
import {
  B,
  T,
  tab,
  pad2,
  Page,
  PageHeader,
  SectionHead,
  Stats,
  NumTabs,
  Button,
  Empty,
  plural,
} from "@/design-lab/screens/_kit/index";

import {
  CasePanel,
  PanelHead,
  Prop,
  FieldInput,
  Segment,
  Money,
  PanelFigures,
  Ledger,
  AddPaymentRow,
  DangerLink,
  caps,
} from "./Clients.parts";

type TabId = "clients" | "students";
type Filter = "all" | ClientStatus;

const STATUS_LABEL: Record<ClientStatus, string> = { active: "Активный", negotiation: "Переговоры", archived: "Архив" };
const STATUS_ITEMS: { id: ClientStatus; label: string }[] = [
  { id: "active", label: "Активный" },
  { id: "negotiation", label: "Переговоры" },
  { id: "archived", label: "Архив" },
];

const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

/** Panel target: an existing client / student, or the «new» form. */
type Open =
  | { kind: "client"; id: string }
  | { kind: "student"; id: string }
  | { kind: "newClient" }
  | { kind: "newStudent" }
  | null;

export default function Clients() {
  const { clients, students, projects, clientRisk } = useData();
  const location = useLocation();
  const [tabId, setTabId] = useState<TabId>("clients");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Open>(null);

  // Deep link from the command palette: { openClientId }.
  useEffect(() => {
    const id = (location.state as { openClientId?: string } | null)?.openClientId;
    if (id) {
      setTabId("clients");
      setOpen({ kind: "client", id });
    }
  }, [location.state]);

  const today = todayStr();

  const totals = useMemo(() => {
    const t = { paidThisMonth: 0, pending: 0, overdue: 0, paidTotal: 0 };
    for (const c of clients) {
      const m = clientMoney(c);
      t.paidThisMonth += m.paidThisMonth;
      t.pending += m.pending;
      t.overdue += m.overdue;
      t.paidTotal += m.paidTotal;
    }
    return t;
  }, [clients]);

  const studentSum = useMemo(() => {
    const t = { paidThisMonth: 0, outstanding: 0, monthly: 0, active: 0 };
    for (const s of students) {
      const x = studentTotals(s);
      t.paidThisMonth += x.paidThisMonth;
      t.outstanding += x.outstanding;
      if (s.active) {
        t.monthly += s.monthlyFee;
        t.active += 1;
      }
    }
    return t;
  }, [students]);

  const revenue = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""), value: 0 };
    });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const c of clients)
      for (const p of c.payments) {
        if (p.status !== "paid") continue;
        const i = idx.get(p.date.slice(0, 7));
        if (i !== undefined) buckets[i].value += p.amount;
      }
    return buckets;
  }, [clients]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: clients.length, active: 0, negotiation: 0, archived: 0 };
    for (const x of clients) c[x.status] += 1;
    return c;
  }, [clients]);

  const visible = filter === "all" ? clients : clients.filter((c) => c.status === filter);

  /** «Связаться»: follow-ups due within 3 days, then clients gone quiet (risk / attention). */
  const attention = useMemo(() => {
    const soon = addDays(today, 3);
    const out: { c: Client; reason: string; hot: boolean; sort: string }[] = [];
    for (const c of clients) {
      if (c.status === "archived") continue;
      if (c.followUpAt && c.followUpAt <= soon) {
        out.push({ c, reason: c.followUpAt < today ? `связаться с ${dayLabel(c.followUpAt)}` : `связаться ${dayLabel(c.followUpAt)}`, hot: c.followUpAt < today, sort: c.followUpAt });
        continue;
      }
      const r = clientRisk(c);
      if (r !== "none") {
        const d = daysSince(c.lastActivityAt);
        out.push({ c, reason: `тишина ${d} ${plural(d, "день", "дня", "дней")}`, hot: false, sort: `~${pad2(99 - Math.min(99, Math.floor(d / 4)))}` });
      }
    }
    return out.sort((a, b) => a.sort.localeCompare(b.sort)).slice(0, 6);
  }, [clients, clientRisk, today]);

  const linkedCount = (id: string) => projects.filter((p) => p.clientId === id).length;
  const isClients = tabId === "clients";

  return (
    <Page>
      <PageHeader
        title="Клиенты"
        deck={
          isClients ? (
            <>
              {clients.length} {plural(clients.length, "клиент", "клиента", "клиентов")}, {counts.active} в работе. Ждём {formatMoney(totals.pending)}
              {totals.overdue ? <>, из них просрочено {formatMoney(totals.overdue)}</> : null}.
            </>
          ) : (
            <>
              {studentSum.active} {plural(studentSum.active, "ученик", "ученика", "учеников")} на помесячной оплате — {formatMoney(studentSum.monthly)} в месяц.
            </>
          )
        }
        graphic="topo"
        seed={7}
        size={80}
        actions={
          <Button size="lg" onClick={() => setOpen({ kind: isClients ? "newClient" : "newStudent" })}>
            {isClients ? "Новый клиент" : "Новый ученик"}
          </Button>
        }
      />

      <div className="mb-10 max-w-[520px]">
        <NumTabs
          items={[
            { id: "clients" as TabId, label: "Клиенты", count: clients.length },
            { id: "students" as TabId, label: "Ученики", count: students.length },
          ]}
          value={tabId}
          onChange={setTabId}
        />
      </div>

      {isClients ? (
        <>
          <Stats
            items={[
              { k: `Оплачено · ${new Date().toLocaleDateString("ru-RU", { month: "long" })}`, v: <Money n={totals.paidThisMonth} />, sub: "получено в этом месяце" },
              { k: "Ожидается", v: <Money n={totals.pending} />, sub: "все неоплаченные счета" },
              { k: "Просрочено", v: <Money n={totals.overdue} />, sub: totals.overdue ? "дата оплаты прошла" : "без просрочек", hot: totals.overdue > 0 },
              { k: "Получено всего", v: <Money n={totals.paidTotal} />, sub: `${clients.reduce((s, c) => s + c.payments.filter((p) => p.status === "paid").length, 0)} оплат` },
            ]}
          />

          <section className="mt-16">
            <SectionHead
              n="01"
              title="Клиенты"
              meta={
                <Segment
                  label="Фильтр по статусу"
                  value={filter}
                  onChange={setFilter}
                  items={[
                    { id: "all", label: "Все", count: counts.all },
                    { id: "active", label: "Активные", count: counts.active },
                    { id: "negotiation", label: "Переговоры", count: counts.negotiation },
                    { id: "archived", label: "Архив", count: counts.archived },
                  ]}
                />
              }
            />
            {clients.length === 0 ? (
              <div className="mt-8 max-w-[360px]">
                <Empty title="Пока нет клиентов" text="Добавьте клиента и ведите деньги по нему: оплаты, ожидания, проекты." seed={7} />
              </div>
            ) : (
              <ClientTable
                rows={visible}
                selectedId={open?.kind === "client" ? open.id : null}
                onOpen={(id) => setOpen({ kind: "client", id })}
                linkedCount={linkedCount}
                riskOf={clientRisk}
                today={today}
                onReset={() => setFilter("all")}
              />
            )}
          </section>

          <div className="mt-20 grid grid-cols-4 gap-x-5" style={{ borderTop: `1px solid ${B.l10}` }}>
            <section className="col-span-2 min-w-0 pr-5 pt-6">
              <SectionHead n="02" title="Выручка" size="s" meta="оплачено за 6 месяцев" />
              <RevenueDots data={revenue} />
            </section>
            <section className="col-span-2 min-w-0 pt-6">
              <SectionHead n="03" title="Связаться" size="s" meta={attention.length || undefined} />
              <div className="mt-6">
                {attention.length === 0 ? (
                  <Empty title="Все на связи" text="Нет назначенных касаний и затихших клиентов." seed={3} height={72} />
                ) : (
                  <ul style={{ borderTop: `1px solid ${B.l7}` }}>
                    {attention.map(({ c, reason, hot }) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setOpen({ kind: "client", id: c.id })}
                          className="group flex h-12 w-full items-center gap-4 text-left outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
                          style={{ borderBottom: `1px solid ${B.l7}` }}
                        >
                          <span className="min-w-0 flex-1 truncate transition-colors group-hover:text-white" style={{ ...T.body, color: B.text2 }}>
                            {c.name}
                            {c.company && <span style={{ color: B.text3 }}> · {c.company}</span>}
                          </span>
                          <span style={{ ...T.meta, color: hot ? B.danger : B.text3 }}>{reason}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <Stats
            items={[
              { k: "Оплачено в этом месяце", v: <Money n={studentSum.paidThisMonth} />, sub: "все ученики" },
              { k: "Ожидается", v: <Money n={studentSum.outstanding} />, sub: "запланированные платежи" },
              { k: "В месяц", v: <Money n={studentSum.monthly} />, sub: "сумма тарифов активных" },
              { k: "Активных", v: studentSum.active, sub: `из ${students.length}` },
            ]}
          />
          <section className="mt-16">
            <SectionHead n="01" title="Ученики" meta={`${studentSum.active} активных`} />
            {students.length === 0 ? (
              <div className="mt-8 max-w-[360px]">
                <Empty title="Пока нет учеников" text="Добавьте ученика и ведите его помесячные оплаты." seed={9} />
              </div>
            ) : (
              <StudentTable rows={students} selectedId={open?.kind === "student" ? open.id : null} onOpen={(id) => setOpen({ kind: "student", id })} />
            )}
          </section>
        </>
      )}

      <ClientCase open={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Tables
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const CLIENT_COLS = "28px minmax(0,1fr) 112px 112px 112px 112px 88px 96px";

function ClientTable({
  rows,
  selectedId,
  onOpen,
  linkedCount,
  riskOf,
  today,
  onReset,
}: {
  rows: Client[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  linkedCount: (id: string) => number;
  riskOf: (c: Client) => "none" | "attention" | "risk";
  today: string;
  onReset: () => void;
}) {
  return (
    <div className="mt-6">
      <div className="grid h-9 items-center gap-4" style={{ gridTemplateColumns: CLIENT_COLS, borderBottom: `1px solid ${B.l10}` }}>
        <span />
        <span style={caps}>Клиент</span>
        <span style={caps}>Статус</span>
        <span className="text-right" style={caps}>Оплачено</span>
        <span className="text-right" style={caps}>Ждём</span>
        <span className="text-right" style={caps}>Просрочено</span>
        <span className="text-right" style={caps}>Тишина</span>
        <span className="text-right" style={caps}>Связаться</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-16 items-center gap-4" style={{ ...T.body, color: B.text3, borderBottom: `1px solid ${B.l7}` }}>
          Нет клиентов с таким статусом.
          <button type="button" onClick={onReset} className="underline-offset-4 hover:text-white hover:underline" style={{ color: B.text2 }}>
            Показать всех
          </button>
        </div>
      ) : (
        <ol>
          {rows.map((c, i) => {
            const m = clientMoney(c);
            const linked = linkedCount(c.id);
            const repeat = isRepeatClient(c, linked);
            const risk = riskOf(c);
            const quiet = daysSince(c.lastActivityAt);
            const sel = selectedId === c.id;
            const meta = [c.company, linked ? `${linked} ${plural(linked, "проект", "проекта", "проектов")}` : null, repeat ? "допродажа" : null, ...c.tags]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.id} className="relative">
                {sel && <span aria-hidden className="absolute inset-y-0 -left-10 w-[2px]" style={{ background: B.text }} />}
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="group grid min-h-[64px] w-full items-center gap-4 text-left outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
                  style={{ gridTemplateColumns: CLIENT_COLS, borderBottom: `1px solid ${B.l7}`, background: sel ? "rgba(255,255,255,0.03)" : undefined }}
                >
                  <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                  <span className="min-w-0">
                    <span className="block truncate" style={{ ...T.bodyL, fontWeight: 500, color: c.status === "archived" ? B.text3 : B.text }}>
                      {c.name}
                    </span>
                    {meta && (
                      <span className="mt-0.5 block truncate" style={{ ...T.meta, color: B.text3 }}>
                        {meta}
                      </span>
                    )}
                  </span>
                  <span style={{ ...T.meta, color: c.status === "active" ? B.text2 : B.text3 }}>{STATUS_LABEL[c.status]}</span>
                  <span className="text-right" style={{ ...T.body, color: B.text }}>
                    <Money n={m.paidTotal} size="s" />
                  </span>
                  <span className="text-right" style={{ ...T.body }}>
                    {m.pending ? <Money n={m.pending} size="s" color={B.text2} /> : <span style={{ color: B.off }}>—</span>}
                  </span>
                  <span className="text-right" style={{ ...T.body }}>
                    {m.overdue ? <Money n={m.overdue} size="s" color={B.danger} /> : <span style={{ color: B.off }}>—</span>}
                  </span>
                  <span className="text-right" style={{ ...T.meta, ...tab, color: risk === "risk" ? B.text : risk === "attention" ? B.text2 : B.text3 }}>
                    {quiet <= 0 ? "сегодня" : `${quiet} дн.`}
                  </span>
                  <span className="text-right" style={{ ...T.meta, ...tab, color: c.followUpAt ? (c.followUpAt < today ? B.danger : B.text2) : B.off }}>
                    {c.followUpAt ? dayLabel(c.followUpAt) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const STUDENT_COLOR: Record<StudentPayStatus, string> = {
  paid: B.text3,
  overdue: B.danger,
  soon: B.text,
  scheduled: B.text2,
  none: B.off,
};

const STUDENT_COLS = "28px minmax(0,1fr) 180px 112px 112px 112px";

function StudentTable({ rows, selectedId, onOpen }: { rows: Student[]; selectedId: string | null; onOpen: (id: string) => void }) {
  return (
    <div className="mt-6">
      <div className="grid h-9 items-center gap-4" style={{ gridTemplateColumns: STUDENT_COLS, borderBottom: `1px solid ${B.l10}` }}>
        <span />
        <span style={caps}>Ученик</span>
        <span style={caps}>Статус</span>
        <span className="text-right" style={caps}>Ждём</span>
        <span className="text-right" style={caps}>Следующая</span>
        <span className="text-right" style={caps}>За месяц</span>
      </div>
      <ol>
        {rows.map((s, i) => {
          const st = studentStatus(s);
          const t = studentTotals(s);
          const sel = selectedId === s.id;
          return (
            <li key={s.id} className="relative">
              {sel && <span aria-hidden className="absolute inset-y-0 -left-10 w-[2px]" style={{ background: B.text }} />}
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="group grid min-h-[64px] w-full items-center gap-4 text-left outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.04]"
                style={{ gridTemplateColumns: STUDENT_COLS, borderBottom: `1px solid ${B.l7}`, background: sel ? "rgba(255,255,255,0.03)" : undefined }}
              >
                <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                <span className="min-w-0">
                  <span className="block truncate" style={{ ...T.bodyL, fontWeight: 500, color: s.active ? B.text : B.text3 }}>
                    {s.name}
                  </span>
                  <span className="mt-0.5 block truncate" style={{ ...T.meta, color: B.text3 }}>
                    {formatMoney(s.monthlyFee)} в месяц · {s.paymentsPerMonth === 2 ? "2 платежа" : "1 платёж"}
                    {!s.active && " · неактивен"}
                  </span>
                </span>
                <span className="truncate" style={{ ...T.meta, color: STUDENT_COLOR[st] }}>
                  {STUDENT_STATUS_META[st].label}
                </span>
                <span className="text-right" style={T.body}>
                  {t.outstanding ? <Money n={t.outstanding} size="s" color={B.text2} /> : <span style={{ color: B.off }}>—</span>}
                </span>
                <span className="text-right" style={{ ...T.meta, ...tab, color: t.nextDue ? (st === "overdue" ? B.danger : B.text2) : B.off }}>
                  {t.nextDue ? dayLabel(t.nextDue) : "—"}
                </span>
                <span className="text-right" style={T.body}>
                  {t.paidThisMonth ? <Money n={t.paidThisMonth} size="s" /> : <span style={{ color: B.off }}>—</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Six months of paid revenue as dot columns — the dashboard's «Ритм» language. */
function RevenueDots({ data }: { data: { key: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const any = data.some((d) => d.value > 0);
  return (
    <div className="mt-6">
      <div className="flex h-[120px] items-end gap-3">
        {data.map((d, i) => {
          const dots = Math.round((d.value / max) * 12);
          const now = i === data.length - 1;
          return (
            <div key={d.key} className="flex flex-1" title={`${d.label}: ${formatMoney(d.value)}`}>
              <div className="flex w-7 flex-col-reverse gap-[3px]">
                {Array.from({ length: 12 }, (_, j) => (
                  <span key={j} className="h-[7px] w-full" style={{ background: j < dots ? (now ? B.text : B.text3) : B.l5 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-3">
        {data.map((d, i) => (
          <div key={d.key} className="min-w-0 flex-1">
            <div style={{ ...T.meta, color: i === data.length - 1 ? B.text : B.text3 }}>{d.label}</div>
            <div className="mt-0.5 truncate" style={{ ...T.meta, ...tab, color: B.text3 }}>
              {d.value ? `${Math.round(d.value / 1000)}к` : "—"}
            </div>
          </div>
        ))}
      </div>
      {!any && (
        <p className="mt-4" style={{ ...T.meta, color: B.text3 }}>
          Оплат за полгода пока нет.
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Case panel: client · student · new
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function ClientCase({ open, onClose, onOpen }: { open: Open; onClose: () => void; onOpen: (o: Open) => void }) {
  const data = useData();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [kind, setKind] = useState<"paid" | "pending">("paid");
  const [linkPick, setLinkPick] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");
  const [fee, setFee] = useState("");
  const [split, setSplit] = useState<"1" | "2">("1");
  const amountRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const key = open ? `${open.kind}:${"id" in open ? open.id : ""}` : "";
  useEffect(() => {
    setAmount("");
    setDate(todayStr());
    setKind("paid");
    setLinkPick("");
    setName("");
    setCompany("");
    setStatus("active");
    setFee("");
    setSplit("1");
  }, [key]);

  if (!open) return null;

  /* ── New client / new student ─────────────────────────────────────────────────────────── */
  if (open.kind === "newClient" || open.kind === "newStudent") {
    const isClient = open.kind === "newClient";
    const submit = () => {
      if (!name.trim()) {
        nameRef.current?.focus();
        return;
      }
      if (isClient)
        data.addClient({
          name: name.trim(),
          company: company.trim() || undefined,
          status,
          revenue: 0,
          expectedPayment: 0,
          payments: [],
          lastActivityAt: new Date().toISOString(),
        });
      else data.addStudent({ name: name.trim(), monthlyFee: Math.round(Number(fee)) || 0, paymentsPerMonth: split === "2" ? 2 : 1 });
      toast(isClient ? `Клиент добавлен: ${name.trim()}` : `Ученик добавлен: ${name.trim()}`);
      onClose();
    };
    return (
      <CasePanel
        open
        onClose={onClose}
        eyebrow={isClient ? "Клиенты · новый" : "Ученики · новый"}
        title={name.trim() || (isClient ? "Новый клиент" : "Новый ученик")}
        deck={isClient ? "Оплаты и проекты добавите в карточке клиента." : "Помесячные оплаты, деление на 1–2 платежа."}
        cta={isClient ? "Добавить клиента" : "Добавить ученика"}
        onCta={submit}
      >
        <PanelHead n="01" title="Карточка" />
        <Prop k="Имя">
          <FieldInput inputRef={nameRef} autoFocus value={name} onChange={setName} placeholder="Как зовут" onEnter={submit} />
        </Prop>
        {isClient ? (
          <>
            <Prop k="Компания">
              <FieldInput value={company} onChange={setCompany} placeholder="—" onEnter={submit} />
            </Prop>
            <Prop k="Статус" last>
              <Segment label="Статус" value={status} onChange={setStatus} items={STATUS_ITEMS} />
            </Prop>
          </>
        ) : (
          <>
            <Prop k="Оплата в месяц">
              <FieldInput type="number" value={fee} onChange={setFee} placeholder="0" onEnter={submit} />
            </Prop>
            <Prop k="Деление" last>
              <Segment label="Платежей в месяц" value={split} onChange={setSplit} items={[{ id: "1", label: "1 / мес" }, { id: "2", label: "2 / мес" }]} />
            </Prop>
          </>
        )}
      </CasePanel>
    );
  }

  /* ── Student ──────────────────────────────────────────────────────────────────────────── */
  if (open.kind === "student") {
    const s = data.students.find((x) => x.id === open.id);
    if (!s) return null;
    const st = studentStatus(s);
    const t = studentTotals(s);
    const perPart = s.paymentsPerMonth > 0 ? Math.round(s.monthlyFee / s.paymentsPerMonth) : s.monthlyFee;
    const n = Math.round(Number(amount)) || perPart;
    const submit = () => {
      if (n <= 0) {
        amountRef.current?.focus();
        return;
      }
      data.addStudentPayment(s.id, { amount: n, status: kind, date });
      setAmount("");
      setDate(todayStr());
    };
    const idx = data.students.findIndex((x) => x.id === s.id);
    return (
      <CasePanel
        open
        onClose={onClose}
        eyebrow={`Ученики · ${pad2(idx + 1)}`}
        title={s.name}
        deck={<span style={{ color: STUDENT_COLOR[st] === B.off ? B.text3 : STUDENT_COLOR[st] }}>{STUDENT_STATUS_META[st].label}</span>}
        cta={n > 0 ? `Записать · ${formatMoney(n)} · ${kind === "paid" ? "оплачено" : "по плану"}` : "Добавить оплату"}
        onCta={submit}
      >
        <PanelFigures
          items={[
            { k: "За месяц", v: t.paidThisMonth },
            { k: "Ждём", v: t.outstanding, hot: st === "overdue" },
            { k: "Всего", v: t.paidTotal },
          ]}
        />
        <PanelHead n="01" title="Условия" />
        <Prop k="Оплата в месяц">
          <FieldInput type="number" value={String(s.monthlyFee)} onChange={(v) => data.updateStudent(s.id, { monthlyFee: Math.round(Number(v)) || 0 })} width={140} />
        </Prop>
        <Prop k="Деление">
          <Segment
            label="Платежей в месяц"
            value={s.paymentsPerMonth === 2 ? "2" : "1"}
            onChange={(v) => data.updateStudent(s.id, { paymentsPerMonth: v === "2" ? 2 : 1 })}
            items={[{ id: "1", label: "1 / мес" }, { id: "2", label: "2 / мес" }]}
          />
        </Prop>
        <Prop k="Следующая" last>
          <span style={{ ...T.body, ...tab, color: t.nextDue ? B.text : B.text3 }}>{t.nextDue ? dayLabel(t.nextDue) : "не запланирована"}</span>
        </Prop>

        <PanelHead n="02" title="Оплаты" meta={s.payments.length || undefined} />
        <Ledger
          payments={s.payments}
          onToggle={(p) => data.updateStudentPayment(s.id, p.id, { status: p.status === "paid" ? "pending" : "paid" })}
          onDelete={(p) => data.deleteStudentPayment(s.id, p.id)}
        />
        <AddPaymentRow
          amount={amount}
          setAmount={setAmount}
          date={date}
          setDate={setDate}
          kind={kind}
          setKind={setKind}
          placeholder={`${perPart} — доля платежа`}
          inputRef={amountRef}
          onSubmit={submit}
          pendingLabel="По плану"
        />

        <div>
          <DangerLink
            onClick={() => {
              const snapshot = s;
              data.deleteStudent(s.id);
              onClose();
              toast("Ученик удалён", { actionLabel: "Вернуть", onAction: () => data.restoreStudent(snapshot) });
            }}
          >
            Удалить ученика
          </DangerLink>
        </div>
      </CasePanel>
    );
  }

  /* ── Client ───────────────────────────────────────────────────────────────────────────── */
  const c = data.clients.find((x) => x.id === open.id);
  if (!c) return null;
  const m = clientMoney(c);
  const linked = data.projects.filter((p) => p.clientId === c.id);
  const linkable = data.projects.filter((p) => !p.clientId);
  const n = Math.round(Number(amount));
  const valid = Number.isFinite(n) && n > 0;
  const submit = () => {
    if (!valid) {
      amountRef.current?.focus();
      return;
    }
    data.addPayment(c.id, { amount: n, status: kind, date });
    setAmount("");
    setDate(todayStr());
  };
  const idx = data.clients.findIndex((x) => x.id === c.id);
  const quiet = daysSince(c.lastActivityAt);

  return (
    <CasePanel
      open
      onClose={onClose}
      eyebrow={`Клиенты · ${pad2(idx + 1)}`}
      title={c.name}
      deck={[c.company, STATUS_LABEL[c.status]].filter(Boolean).join(" · ")}
      cta={valid ? `Записать · ${formatMoney(n)} · ${kind === "paid" ? "оплачено" : "ожидается"}` : "Добавить оплату"}
      onCta={submit}
    >
      <PanelFigures
        items={[
          { k: "Оплачено", v: m.paidTotal },
          { k: "Ждём", v: m.pending },
          { k: "Просрочено", v: m.overdue, hot: true },
        ]}
      />

      <PanelHead n="01" title="Карточка" />
      <Prop k="Компания">
        <FieldInput value={c.company ?? ""} onChange={(v) => data.updateClient(c.id, { company: v })} placeholder="—" />
      </Prop>
      <Prop k="Статус">
        <Segment label="Статус" value={c.status} onChange={(v) => data.updateClient(c.id, { status: v })} items={STATUS_ITEMS} />
      </Prop>
      <Prop k="Email">
        <FieldInput type="email" value={c.email ?? ""} onChange={(v) => data.updateClient(c.id, { email: v })} placeholder="—" />
      </Prop>
      <Prop k="Телефон">
        <FieldInput type="tel" value={c.phone ?? ""} onChange={(v) => data.updateClient(c.id, { phone: v })} placeholder="—" />
      </Prop>
      <Prop k="Связаться">
        <FieldInput type="date" value={c.followUpAt ?? ""} onChange={(v) => data.updateClient(c.id, { followUpAt: v || undefined })} width={150} />
      </Prop>
      <Prop k="Активность" last>
        <span style={{ ...T.body, ...tab, color: B.text2 }}>
          {dayLabel(c.lastActivityAt.slice(0, 10))} · {quiet <= 0 ? "сегодня" : `${quiet} дн. назад`}
        </span>
      </Prop>

      <PanelHead n="02" title="Оплаты" meta={c.payments.length || undefined} />
      <Ledger
        payments={c.payments}
        onToggle={(p) => data.updatePayment(c.id, p.id, { status: p.status === "paid" ? "pending" : "paid" })}
        onDelete={(p) => data.deletePayment(c.id, p.id)}
      />
      <AddPaymentRow
        amount={amount}
        setAmount={setAmount}
        date={date}
        setDate={setDate}
        kind={kind}
        setKind={setKind}
        inputRef={amountRef}
        onSubmit={submit}
      />

      <PanelHead n="03" title="Проекты" meta={linked.length || undefined} />
      {linked.length === 0 ? (
        <p className="py-4" style={{ ...T.body, color: B.text3, borderBottom: `1px solid ${B.l7}` }}>
          Нет привязанных проектов.
        </p>
      ) : (
        <ul>
          {linked.map((p) => (
            <li key={p.id} className="group flex h-12 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
              <Link to={`/projects/${p.id}`} onClick={onClose} className="min-w-0 flex-1 truncate transition-colors hover:text-white" style={{ ...T.body, color: B.text2 }}>
                {p.name} <span style={{ color: B.text3 }}>↳</span>
              </Link>
              <button
                type="button"
                onClick={() => data.updateProject(p.id, { clientId: undefined })}
                className="opacity-0 outline-none transition-opacity duration-200 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                style={{ ...T.meta, color: B.text3 }}
                aria-label={`Отвязать проект: ${p.name}`}
              >
                отвязать
              </button>
            </li>
          ))}
        </ul>
      )}
      {linkable.length > 0 && (
        <div className="flex h-12 items-center gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
          <select
            value={linkPick}
            onChange={(e) => setLinkPick(e.target.value)}
            aria-label="Привязать существующий проект"
            className="h-9 min-w-0 flex-1 cursor-pointer bg-transparent outline-none"
            style={{ ...T.body, color: linkPick ? B.text : B.text3, colorScheme: "dark" }}
          >
            <option value="">Привязать существующий проект…</option>
            {linkable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={!linkPick}
            onClick={() => {
              data.updateProject(linkPick, { clientId: c.id });
              setLinkPick("");
            }}
          >
            Привязать
          </Button>
        </div>
      )}

      <PanelHead n="04" title="Заметка" />
      <textarea
        value={c.notes ?? ""}
        onChange={(e) => data.updateClient(c.id, { notes: e.target.value })}
        rows={3}
        placeholder="Контекст, договорённости…"
        className="mt-1 w-full resize-none bg-transparent py-3 outline-none placeholder:text-[#454545]"
        style={{ ...T.body, color: B.text, borderBottom: `1px solid ${B.l7}` }}
      />

      <div>
        <DangerLink
          onClick={() => {
            const snapshot = c;
            data.deleteClient(c.id);
            onOpen(null);
            toast("Клиент удалён", { actionLabel: "Вернуть", onAction: () => data.restoreClient(snapshot) });
          }}
        >
          Удалить клиента
        </DangerLink>
      </div>
    </CasePanel>
  );
}
