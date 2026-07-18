import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Users, Plus } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/EmptyState";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { AreaChart } from "@/components/charts/AreaChart";
import { StudentsSection } from "@/components/StudentsSection";
import { ClientDetailDialog } from "@/components/ClientDetailDialog";
import { useData } from "@/store/DataProvider";
import { formatMoney } from "@/lib/format";
import { clientMoney, isRepeatClient } from "@/lib/clients";
import type { ClientStatus } from "@/types";

type Tab = "clients" | "students";
type StatusFilter = "all" | ClientStatus;

const STATUS_LABEL: Record<ClientStatus, string> = {
  active: "Активный",
  negotiation: "Переговоры",
  archived: "Архив",
};

/** Top-level money stat cell (matches the dashboard KPI look). */
function StatTile({ label, value, tone }: { label: string; value: string; tone?: "success" | "risk" | "default" }) {
  const color = tone === "success" ? "text-success" : tone === "risk" ? "text-risk" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}

export default function Clients() {
  const { clients, projects, addClient, clientRisk } = useData();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("clients");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  // Deep-link from the command palette («Клиенты» group) opens the client's card directly.
  useEffect(() => {
    const openId = (location.state as { openClientId?: string } | null)?.openClientId;
    if (openId) {
      setTab("clients");
      setDetailId(openId);
    }
  }, [location.state]);

  // Add-client dialog
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");

  const totals = useMemo(() => {
    let paidThisMonth = 0;
    let pending = 0;
    let overdue = 0;
    for (const c of clients) {
      const m = clientMoney(c);
      paidThisMonth += m.paidThisMonth;
      pending += m.pending;
      overdue += m.overdue;
    }
    return { paidThisMonth, pending, overdue };
  }, [clients]);

  const revenueByMonth = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("ru-RU", { month: "short" }),
        value: 0,
      };
    });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const c of clients) {
      for (const p of c.payments) {
        if (p.status !== "paid") continue;
        const i = idx.get(p.date.slice(0, 7));
        if (i !== undefined) buckets[i].value += p.amount;
      }
    }
    return buckets;
  }, [clients]);

  const hasRevenue = revenueByMonth.some((b) => b.value > 0);

  const visible = useMemo(
    () => (filter === "all" ? clients : clients.filter((c) => c.status === filter)),
    [clients, filter]
  );

  function submit() {
    if (!name.trim()) return;
    addClient({
      name: name.trim(),
      company: company.trim() || undefined,
      status,
      revenue: 0,
      expectedPayment: 0,
      payments: [],
      lastActivityAt: new Date().toISOString(),
    });
    setName("");
    setCompany("");
    setStatus("active");
    setOpen(false);
  }

  return (
    <AppShell
      title="Клиенты"
      description="Клиенты, ученики и деньги по ним"
      actions={
        tab === "clients" ? (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Добавить клиента
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4">
        <Segmented
          ariaLabel="Раздел"
          value={tab}
          onChange={setTab}
          options={[
            { value: "clients", label: "Клиенты" },
            { value: "students", label: "Ученики" },
          ]}
        />
      </div>

      {tab === "students" ? (
        <StudentsSection />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Пока нет клиентов"
          description="Добавьте клиента и ведите деньги по нему: ожидаемые и полученные оплаты, допродажи, связанные проекты."
          actionLabel="Добавить клиента"
          onAction={() => setOpen(true)}
        />
      ) : (
        <div className="grid gap-4">
          {/* Money strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Оплачено в этом месяце" value={formatMoney(totals.paidThisMonth)} tone="success" />
            <StatTile label="Ожидается" value={formatMoney(totals.pending)} />
            <StatTile label="Просрочено" value={formatMoney(totals.overdue)} tone={totals.overdue > 0 ? "risk" : "default"} />
          </div>

          {/* Revenue chart */}
          {hasRevenue && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <CardTitle className="text-sm">Динамика выручки</CardTitle>
                <span className="text-xs text-muted-foreground">оплачено за 6 месяцев</span>
              </div>
              <AreaChart data={revenueByMonth} color="hsl(var(--brand))" formatValue={formatMoney} height={140} />
            </Card>
          )}

          {/* Status filter — inline, right-aligned */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Segmented
              ariaLabel="Фильтр по статусу"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Все" },
                { value: "active", label: "Активные" },
                { value: "negotiation", label: "Переговоры" },
                { value: "archived", label: "Архив" },
              ]}
            />
          </div>

          {/* Client list */}
          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Нет клиентов с таким статусом.
              <Button variant="outline" size="sm" onClick={() => setFilter("all")}>Показать всех</Button>
            </div>
          ) : (
            <StaggerList className="grid gap-2">
              {visible.map((c) => {
                const money = clientMoney(c);
                const linkedCount = projects.filter((p) => p.clientId === c.id).length;
                const repeat = isRepeatClient(c, linkedCount);
                const risk = clientRisk(c);
                return (
                  <StaggerItem key={c.id}>
                    <button
                      onClick={() => setDetailId(c.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-muted-foreground/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{c.name}</span>
                          <Badge variant="outline">{STATUS_LABEL[c.status]}</Badge>
                          {repeat && <Badge variant="success">Допродажа</Badge>}
                          {risk === "risk" && <Badge variant="risk">риск</Badge>}
                          {risk === "attention" && <Badge variant="warning">внимание</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {c.company && <span className="truncate">{c.company}</span>}
                          {linkedCount > 0 && <span>· {linkedCount} проект(ов)</span>}
                          {c.tags.map((t) => (
                            <span key={t} className="rounded bg-secondary px-1.5 py-0.5">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        <div className="font-medium tabular-nums text-success">{formatMoney(money.paidTotal)}</div>
                        {money.pending > 0 && (
                          <div className="text-xs text-muted-foreground tabular-nums">ждём {formatMoney(money.pending)}</div>
                        )}
                        {money.overdue > 0 && (
                          <div className="text-xs font-medium text-risk tabular-nums">просрочено {formatMoney(money.overdue)}</div>
                        )}
                      </div>
                    </button>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}
        </div>
      )}

      {/* Add-client dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый клиент</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cl-name">Имя *</Label>
              <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="cl-company">Компания</Label>
                <Input id="cl-company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Статус</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Активный</SelectItem>
                    <SelectItem value="negotiation">Переговоры</SelectItem>
                    <SelectItem value="archived">Архив</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Оплаты и проекты добавите на карточке клиента.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={submit}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientDetailDialog clientId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />
    </AppShell>
  );
}
