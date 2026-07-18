import { useMemo, useState } from "react";
import { GraduationCap, ChevronDown, ChevronRight, Check, RotateCcw, Trash2, Plus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { IconAction } from "@/components/ui/icon-action";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatMoney, formatDate, todayStr } from "@/lib/format";
import { studentStatus, studentTotals, STUDENT_STATUS_META } from "@/lib/students";
import { paymentState, PAYMENT_STATE_META } from "@/lib/payments";

/** Top stat cell shared with the clients tab look. */
function StatTile({ label, value, tone }: { label: string; value: string; tone?: "success" | "risk" | "default" }) {
  const color = tone === "success" ? "text-success" : tone === "risk" ? "text-risk" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}

export function StudentsSection() {
  const {
    students,
    addStudent,
    updateStudent,
    deleteStudent,
    restoreStudent,
    addStudentPayment,
    updateStudentPayment,
    deleteStudentPayment,
  } = useData();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [split, setSplit] = useState<1 | 2>(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Add-payment draft (shared — only one student card is expanded at a time).
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());

  const active = useMemo(() => students.filter((s) => s.active), [students]);
  const totals = useMemo(() => {
    let paidThisMonth = 0;
    let outstanding = 0;
    for (const s of students) {
      const t = studentTotals(s);
      paidThisMonth += t.paidThisMonth;
      outstanding += t.outstanding;
    }
    return { paidThisMonth, outstanding };
  }, [students]);

  function submit() {
    const monthlyFee = Math.round(Number(fee)) || 0;
    if (!name.trim()) return;
    addStudent({ name: name.trim(), monthlyFee, paymentsPerMonth: split });
    setName("");
    setFee("");
    setSplit(1);
    setOpen(false);
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatTile label="Оплачено в этом месяце" value={formatMoney(totals.paidThisMonth)} tone="success" />
        <StatTile label="Ожидается" value={formatMoney(totals.outstanding)} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{active.length} активных</span>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Добавить ученика
        </Button>
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Пока нет учеников"
          description="Добавьте ученика и ведите его помесячные оплаты — с делением на 1–2 платежа и статусом «скоро оплата»."
          actionLabel="Добавить ученика"
          onAction={() => setOpen(true)}
        />
      ) : (
        <div className="grid gap-2">
          {students.map((s) => {
            const status = studentStatus(s);
            const meta = STUDENT_STATUS_META[status];
            const t = studentTotals(s);
            const isOpen = expanded === s.id;
            const perPart = s.paymentsPerMonth > 0 ? Math.round(s.monthlyFee / s.paymentsPerMonth) : s.monthlyFee;
            const payments = [...s.payments].sort((a, b) => b.date.localeCompare(a.date));
            return (
              <Card key={s.id} className="overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-secondary/30"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatMoney(s.monthlyFee)} · {s.paymentsPerMonth === 2 ? "2 платежа/мес" : "1 платёж/мес"}
                    </div>
                  </div>
                  {t.outstanding > 0 && (
                    <span className="hidden text-sm text-muted-foreground tabular-nums sm:inline">
                      ждём {formatMoney(t.outstanding)}
                    </span>
                  )}
                  <Badge variant={meta.badge}>{meta.label}</Badge>
                </button>

                {isOpen && (
                  <div className="border-t border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">История оплат</Label>
                      <IconAction
                        icon={Trash2}
                        label={`Удалить ученика: ${s.name}`}
                        tone="danger"
                        onClick={() => {
                          const snapshot = s;
                          deleteStudent(s.id);
                          toast("Ученик удалён", { actionLabel: "Вернуть", onAction: () => restoreStudent(snapshot) });
                        }}
                        className="h-7 w-7 p-0"
                      />
                    </div>

                    {payments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Пока нет оплат.</p>
                    ) : (
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
                                  onClick={() => updateStudentPayment(s.id, p.id, { status: p.status === "paid" ? "pending" : "paid" })}
                                  className="h-7 w-7 p-0"
                                />
                                <IconAction
                                  icon={Trash2}
                                  label="Удалить оплату"
                                  tone="danger"
                                  onClick={() => deleteStudentPayment(s.id, p.id)}
                                  className="h-7 w-7 p-0"
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add / schedule a payment: pick amount (defaults to the per-part share) + date,
                        then mark it paid now or schedule it as expected (glows «скоро оплата» ≤3 дней). */}
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Сумма</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          className="w-28"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder={String(perPart)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Дата оплаты</Label>
                        <DatePicker value={payDate} onChange={(d) => setPayDate(d ?? todayStr())} allowClear={false} className="w-44" />
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { addStudentPayment(s.id, { amount: Math.round(Number(payAmount)) || perPart, status: "paid", date: payDate }); setPayAmount(""); setPayDate(todayStr()); }}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Оплачено
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { addStudentPayment(s.id, { amount: Math.round(Number(payAmount)) || perPart, status: "pending", date: payDate }); setPayAmount(""); setPayDate(todayStr()); }}
                      >
                        Запланировать
                      </Button>
                    </div>

                    {/* Editable inline detail: fee + split */}
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Оплата в месяц</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          className="w-32"
                          value={String(s.monthlyFee)}
                          onChange={(e) => updateStudent(s.id, { monthlyFee: Math.round(Number(e.target.value)) || 0 })}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Деление</Label>
                        <Segmented
                          ariaLabel="Платежей в месяц"
                          value={s.paymentsPerMonth === 2 ? "2" : "1"}
                          onChange={(v) => updateStudent(s.id, { paymentsPerMonth: v === "2" ? 2 : 1 })}
                          options={[
                            { value: "1", label: "1 / мес" },
                            { value: "2", label: "2 / мес" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add-student dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый ученик</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="s-name">Имя *</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="s-fee">Оплата в месяц</Label>
                <Input id="s-fee" type="number" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <Label>Деление</Label>
                <Segmented
                  ariaLabel="Платежей в месяц"
                  value={split === 2 ? "2" : "1"}
                  onChange={(v) => setSplit(v === "2" ? 2 : 1)}
                  options={[
                    { value: "1", label: "1 / мес" },
                    { value: "2", label: "2 / мес" },
                  ]}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={submit}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
