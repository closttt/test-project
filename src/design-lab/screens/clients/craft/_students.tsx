/**
 * Клиенты · Craft Dark — the «Ученики» tab: the students model over the real store
 * (AppData.students + addStudent / updateStudent / deleteStudent / restoreStudent and the
 * student payment actions, same as src/components/StudentsSection.tsx), the student editor and
 * the «Новый ученик» dialog in the same language as the client ones.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Btn, C, IconBtn, T, TONE, plural } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { todayStr } from "@/lib/format";
import type { Student } from "@/types";
import { Dialog, Field, Initials, MoneyTriplet, PaymentLog, Pills, SubHead, field, fieldLabel, moneyOf, num } from "./_parts";

type Split = "1" | "2";
const SPLIT_ITEMS: { id: Split; label: string }[] = [
  { id: "1", label: "1 платёж в месяц" },
  { id: "2", label: "2 платежа в месяц" },
];
type Activity = "on" | "off";
const ACTIVE_ITEMS: { id: Activity; label: string }[] = [
  { id: "on", label: "Занимается" },
  { id: "off", label: "Не занимается" },
];

/** One payment's share of the monthly fee (the default amount when adding a payment). */
export const perPart = (s: Pick<Student, "monthlyFee" | "paymentsPerMonth">) =>
  s.paymentsPerMonth > 0 ? Math.round(s.monthlyFee / s.paymentsPerMonth) : s.monthlyFee;

/** «15 000 ₽ в месяц · 2 платежа» — the student's quiet second line. */
export const feeLine = (s: Pick<Student, "monthlyFee" | "paymentsPerMonth">) =>
  s.monthlyFee > 0 ? `${num(s.monthlyFee)} ₽ в месяц${s.paymentsPerMonth === 2 ? " · 2 платежа" : ""}` : undefined;

const parseFee = (v: string) => {
  const n = Math.round(Number(v.replace(/\s/g, "")));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function useStudentsModel(query = "") {
  const { students } = useData();
  return useMemo(() => {
    const today = todayStr();
    const q = query.trim().toLowerCase();
    const all = students.map((s) => ({ s, money: moneyOf(s.payments, today) }));
    const rows = all.filter((r) => !q || [r.s.name, r.s.note, ...r.s.tags].some((x) => (x ?? "").toLowerCase().includes(q)));
    return { all, rows };
  }, [students, query]);
}

/** addStudent() returns nothing — remember the ids before and report the new student's id. */
function useCreateStudent(onCreated?: (id: string) => void) {
  const { students, addStudent } = useData();
  const before = useRef<Set<string> | null>(null);
  const cb = useRef(onCreated);
  cb.current = onCreated;
  useEffect(() => {
    if (!before.current) return;
    const fresh = students.find((s) => !before.current!.has(s.id));
    if (fresh) {
      before.current = null;
      cb.current?.(fresh.id);
    }
  }, [students]);
  return (input: { name: string; monthlyFee: number; paymentsPerMonth: 1 | 2 }) => {
    if (!input.name.trim()) return;
    before.current = new Set(students.map((s) => s.id));
    addStudent({ name: input.name.trim(), monthlyFee: input.monthlyFee, paymentsPerMonth: input.paymentsPerMonth });
  };
}

const ICON = { size: 18, strokeWidth: 1.75 } as const;

// ── Student editor (dialog) ───────────────────────────────────────────────────────────────────

function StudentEditor({ student, onClose, onDelete }: { student: Student; onClose: () => void; onDelete: () => void }) {
  const { updateStudent, addStudentPayment, updateStudentPayment, deleteStudentPayment } = useData();
  const [name, setName] = useState(student.name);
  const [fee, setFee] = useState(student.monthlyFee ? String(student.monthlyFee) : "");
  const [split, setSplit] = useState<Split>(student.paymentsPerMonth === 2 ? "2" : "1");
  const [active, setActive] = useState<Activity>(student.active ? "on" : "off");
  const [note, setNote] = useState(student.note ?? "");
  const money = moneyOf(student.payments);
  const save = () => {
    if (!name.trim()) return;
    updateStudent(student.id, {
      name: name.trim(),
      monthlyFee: parseFee(fee),
      paymentsPerMonth: split === "2" ? 2 : 1,
      active: active === "on",
      note: note.trim() || undefined,
    });
    onClose();
  };
  const sub = feeLine(student);
  return (
    <Dialog label="Ученик" width={980} onClose={onClose}>
      <div className="flex items-center justify-between gap-4 px-6 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <Initials name={student.name} size={44} tint />
          <div className="min-w-0">
            <div className="truncate" style={T.h2}>
              {student.name}
            </div>
            {sub && (
              <div className="mt-0.5 truncate" style={{ ...T.body, color: C.text3 }}>
                {sub}
              </div>
            )}
          </div>
        </div>
        <IconBtn title="Закрыть" onClick={onClose}>
          <X {...ICON} />
        </IconBtn>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-2 pt-5" style={{ gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.1fr)" }}>
        <div className="flex flex-col gap-4">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Имя ученика" className="outline-none placeholder:text-[#5E6068]" style={{ ...field(), height: 52, fontSize: 16 }} />
          <Field label="Оплата в месяц, ₽">
            <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d\s]/g, ""))} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="0" className="outline-none placeholder:text-[#5E6068]" style={field()} />
          </Field>
          <div className="flex flex-col">
            <span style={fieldLabel}>Деление</span>
            <Pills label="Платежей в месяц" items={SPLIT_ITEMS} value={split} onChange={setSplit} />
          </div>
          <div className="flex flex-col">
            <span style={fieldLabel}>Статус</span>
            <Pills label="Статус ученика" items={ACTIVE_ITEMS} value={active} onChange={setActive} />
          </div>
          <Field label="Заметка">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Расписание, договорённости…" className="resize-none outline-none placeholder:text-[#5E6068]" style={{ ...field(), height: "auto", padding: "12px 14px", lineHeight: 1.45 }} />
          </Field>
        </div>

        <div className="flex flex-col gap-5">
          <MoneyTriplet m={money} />
          <div>
            <SubHead right={<span style={{ ...T.foot, color: C.text3 }}>{student.payments.length} {plural(student.payments.length, "запись", "записи", "записей")}</span>}>Оплаты</SubHead>
            <PaymentLog
              payments={student.payments}
              defaultAmount={perPart(student) || undefined}
              onAdd={(p) => addStudentPayment(student.id, p)}
              onUpdate={(id, patch) => updateStudentPayment(student.id, id, patch)}
              onDelete={(id) => deleteStudentPayment(student.id, id)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 pb-6 pt-4">
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 px-4 transition-colors hover:bg-[#2A1A1A]" style={{ height: 44, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}>
          <Trash2 size={16} strokeWidth={1.75} />
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

// ── New student dialog ────────────────────────────────────────────────────────────────────────

function NewStudentDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (x: { name: string; monthlyFee: number; paymentsPerMonth: 1 | 2 }) => void }) {
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [split, setSplit] = useState<Split>("1");
  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name, monthlyFee: parseFee(fee), paymentsPerMonth: split === "2" ? 2 : 1 });
    onClose();
  };
  return (
    <Dialog label="Новый ученик" onClose={onClose}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <span style={T.h2}>Новый ученик</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Имя ученика" className="outline-none placeholder:text-[#5E6068]" style={{ ...field(), height: 52, fontSize: 16 }} />
        <Field label="Оплата в месяц, ₽">
          <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d\s]/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="0" className="outline-none placeholder:text-[#5E6068]" style={field()} />
        </Field>
        <div className="flex flex-col">
          <span style={fieldLabel}>Деление</span>
          <Pills label="Платежей в месяц" items={SPLIT_ITEMS} value={split} onChange={setSplit} />
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

/** Editor + new-student wiring. A freshly added student opens straight into the editor for payments. */
export function useStudentDialogs() {
  const { students, deleteStudent, restoreStudent } = useData();
  const { toast } = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const create = useCreateStudent((id) => setEditId(id));
  const editing = editId ? students.find((s) => s.id === editId) : undefined;
  const remove = (s: Student) => {
    deleteStudent(s.id);
    toast("Ученик удалён", { actionLabel: "Вернуть", onAction: () => restoreStudent(s) });
  };
  const dialogs = (
    <>
      {editing && (
        <StudentEditor
          key={editing.id}
          student={editing}
          onClose={() => setEditId(null)}
          onDelete={() => {
            setEditId(null);
            remove(editing);
          }}
        />
      )}
      {adding && <NewStudentDialog onClose={() => setAdding(false)} onCreate={create} />}
    </>
  );
  return { open: setEditId, startNew: () => setAdding(true), dialogs };
}
