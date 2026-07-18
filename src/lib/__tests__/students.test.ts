import { describe, it, expect } from "vitest";

import { studentStatus, studentTotals } from "@/lib/students";
import { clientMoney, isRepeatClient } from "@/lib/clients";
import type { Student, Client, Payment } from "@/types";

const TODAY = "2026-07-17";

function student(payments: Payment[]): Student {
  return {
    id: "s1",
    name: "Ученик",
    monthlyFee: 10000,
    paymentsPerMonth: 1,
    active: true,
    payments,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function pay(amount: number, status: "paid" | "pending", date: string): Payment {
  return { id: Math.random().toString(36), amount, status, date };
}

describe("studentStatus", () => {
  it("is 'soon' when the earliest pending payment is today or in the future", () => {
    expect(studentStatus(student([pay(5000, "pending", "2026-07-20")]), TODAY)).toBe("soon");
    expect(studentStatus(student([pay(5000, "pending", TODAY)]), TODAY)).toBe("soon");
  });

  it("is 'overdue' when a pending payment date is in the past", () => {
    expect(studentStatus(student([pay(5000, "pending", "2026-07-10")]), TODAY)).toBe("overdue");
  });

  it("prefers the earliest pending payment when deciding overdue vs soon", () => {
    const s = student([pay(5000, "pending", "2026-07-25"), pay(5000, "pending", "2026-07-01")]);
    expect(studentStatus(s, TODAY)).toBe("overdue");
  });

  it("is 'paid' when nothing pending and something was paid this month", () => {
    expect(studentStatus(student([pay(10000, "paid", "2026-07-05")]), TODAY)).toBe("paid");
  });

  it("is 'none' when nothing pending and only earlier months were paid", () => {
    expect(studentStatus(student([pay(10000, "paid", "2026-06-05")]), TODAY)).toBe("none");
    expect(studentStatus(student([]), TODAY)).toBe("none");
  });
});

describe("studentTotals", () => {
  it("sums paid/outstanding and finds the earliest pending date", () => {
    const s = student([
      pay(5000, "paid", "2026-07-05"),
      pay(5000, "paid", "2026-06-05"),
      pay(5000, "pending", "2026-07-25"),
      pay(5000, "pending", "2026-07-20"),
    ]);
    const t = studentTotals(s, TODAY);
    expect(t.paidTotal).toBe(10000);
    expect(t.paidThisMonth).toBe(5000);
    expect(t.outstanding).toBe(10000);
    expect(t.nextDue).toBe("2026-07-20");
  });
});

describe("clientMoney", () => {
  function client(payments: Payment[]): Client {
    return {
      id: "c1",
      name: "Клиент",
      status: "active",
      revenue: 0,
      expectedPayment: 0,
      payments,
      tags: [],
      contacts: [],
      customFields: [],
      touches: [],
      lastActivityAt: "2026-07-15T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("splits paid / this-month / pending / overdue correctly", () => {
    const m = clientMoney(
      client([
        pay(90000, "paid", "2026-07-01"),
        pay(90000, "paid", "2026-05-01"),
        pay(60000, "pending", "2026-07-30"),
        pay(30000, "pending", "2026-07-10"),
      ]),
      TODAY
    );
    expect(m.paidTotal).toBe(180000);
    expect(m.paidThisMonth).toBe(90000);
    expect(m.pending).toBe(90000);
    expect(m.overdue).toBe(30000);
  });

  it("treats a client with >1 paid payment or >1 project as a repeat (допродажа)", () => {
    const repeatByPayments = client([pay(1, "paid", "2026-07-01"), pay(1, "paid", "2026-06-01")]);
    expect(isRepeatClient(repeatByPayments, 0)).toBe(true);
    const single = client([pay(1, "paid", "2026-07-01")]);
    expect(isRepeatClient(single, 1)).toBe(false);
    expect(isRepeatClient(single, 2)).toBe(true);
  });
});
