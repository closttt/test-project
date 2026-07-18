import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, RotateCcw, Trash2, FolderKanban, Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { IconAction } from "@/components/ui/icon-action";
import { DatePicker } from "@/components/ui/date-picker";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatMoney, formatDate, todayStr } from "@/lib/format";
import { clientMoney } from "@/lib/clients";
import { paymentState, PAYMENT_STATE_META } from "@/lib/payments";
import type { ClientStatus } from "@/types";

const STATUS_LABEL: Record<ClientStatus, string> = {
  active: "Активный",
  negotiation: "Переговоры",
  archived: "Архив",
};

/** Compact stat cell used inside the money summary. */
function Money({ label, value, tone }: { label: string; value: number; tone?: "success" | "risk" | "muted" }) {
  const color = tone === "success" ? "text-success" : tone === "risk" ? "text-risk" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{formatMoney(value)}</div>
    </div>
  );
}

export function ClientDetailDialog({
  clientId,
  onOpenChange,
}: {
  clientId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { clients, projects, updateClient, updateProject, deleteClient, restoreClient, addPayment, updatePayment, deletePayment } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const NONE = "none";
  const [linkPick, setLinkPick] = useState<string>(NONE);

  const client = clientId ? clients.find((c) => c.id === clientId) : undefined;
  if (!client) return <Dialog open={false} onOpenChange={onOpenChange}><DialogContent /></Dialog>;

  const money = clientMoney(client);
  const linked = projects.filter((p) => p.clientId === client.id);
  // Only projects with no client yet are offered — reassigning a project already tied to
  // someone else belongs on the Project card, not here.
  const linkable = projects.filter((p) => !p.clientId);
  const payments = [...client.payments].sort((a, b) => b.date.localeCompare(a.date));

  function addOne(status: "paid" | "pending") {
    const n = Math.round(Number(amount));
    if (!client || !Number.isFinite(n) || n <= 0) return;
    addPayment(client.id, { amount: n, status, date });
    setAmount("");
    setDate(todayStr());
  }

  return (
    <Dialog open={!!client} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="c-company">Компания</Label>
              <Input id="c-company" value={client.company ?? ""} onChange={(e) => updateClient(client.id, { company: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Статус</Label>
              <Select value={client.status} onValueChange={(v) => updateClient(client.id, { status: v as ClientStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активный</SelectItem>
                  <SelectItem value="negotiation">Переговоры</SelectItem>
                  <SelectItem value="archived">Архив</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" value={client.email ?? ""} onChange={(e) => updateClient(client.id, { email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-phone">Телефон</Label>
              <Input id="c-phone" value={client.phone ?? ""} onChange={(e) => updateClient(client.id, { phone: e.target.value })} />
            </div>
          </div>

          {/* Money summary */}
          <div className="grid grid-cols-3 gap-2">
            <Money label="Оплачено" value={money.paidTotal} tone="success" />
            <Money label="Ожидается" value={money.pending} tone={money.pending > 0 ? "muted" : "muted"} />
            <Money label="Просрочено" value={money.overdue} tone={money.overdue > 0 ? "risk" : "muted"} />
          </div>

          {/* Payments */}
          <div className="grid gap-2">
            <Label>Оплаты</Label>
            {payments.length === 0 && <p className="text-sm text-muted-foreground">Пока нет оплат.</p>}
            <div className="grid gap-1.5">
              {payments.map((p) => {
                const st = paymentState(p);
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <span className="w-24 shrink-0 font-medium tabular-nums">{formatMoney(p.amount)}</span>
                    <span className="text-muted-foreground">{formatDate(p.date)}</span>
                    <Badge variant={PAYMENT_STATE_META[st].badge} className="ml-1">
                      {PAYMENT_STATE_META[st].label}
                    </Badge>
                    <span className="ml-auto flex items-center gap-1">
                      <IconAction
                        icon={p.status === "paid" ? RotateCcw : Check}
                        label={p.status === "paid" ? "Вернуть в ожидание" : "Отметить оплаченным"}
                        onClick={() => updatePayment(client.id, p.id, { status: p.status === "paid" ? "pending" : "paid" })}
                        className="h-7 w-7 p-0"
                      />
                      <IconAction
                        icon={Trash2}
                        label="Удалить оплату"
                        tone="danger"
                        onClick={() => deletePayment(client.id, p.id)}
                        className="h-7 w-7 p-0"
                      />
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Add payment — inline */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="c-amount" className="text-xs">Сумма</Label>
                <Input
                  id="c-amount"
                  type="number"
                  inputMode="numeric"
                  className="w-28"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Дата оплаты</Label>
                <DatePicker value={date} onChange={(d) => setDate(d ?? todayStr())} allowClear={false} className="w-44" />
              </div>
              <Button size="sm" variant="secondary" onClick={() => addOne("paid")}><Plus className="mr-1 h-3.5 w-3.5" /> Оплачено</Button>
              <Button size="sm" variant="outline" onClick={() => addOne("pending")}>Ожидается</Button>
            </div>
          </div>

          {/* Linked projects */}
          <div className="grid gap-2">
            <Label>Проекты</Label>
            {linked.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет привязанных проектов.</p>
            ) : (
              <div className="grid gap-1.5">
                {linked.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
                  >
                    <button
                      onClick={() => { onOpenChange(false); navigate(`/projects/${p.id}`); }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-brand"
                    >
                      <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{p.name}</span>
                    </button>
                    <IconAction
                      icon={X}
                      label={`Отвязать проект: ${p.name}`}
                      onClick={() => updateProject(p.id, { clientId: undefined })}
                      className="h-7 w-7 p-0"
                    />
                  </div>
                ))}
              </div>
            )}
            {linkable.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={linkPick} onValueChange={setLinkPick}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Привязать существующий проект…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Выберите проект</SelectItem>
                    {linkable.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={linkPick === NONE}
                  onClick={() => { updateProject(linkPick, { clientId: client.id }); setLinkPick(NONE); }}
                >
                  Привязать
                </Button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="c-notes">Заметка</Label>
            <Textarea id="c-notes" value={client.notes ?? ""} onChange={(e) => updateClient(client.id, { notes: e.target.value })} rows={2} placeholder="Контекст, договорённости…" />
          </div>

          {/* Danger */}
          <div className="flex justify-between border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-risk hover:text-risk"
              onClick={() => {
                const snapshot = client;
                deleteClient(client.id);
                onOpenChange(false);
                toast("Клиент удалён", { actionLabel: "Вернуть", onAction: () => restoreClient(snapshot) });
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Удалить клиента
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Закрыть</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
