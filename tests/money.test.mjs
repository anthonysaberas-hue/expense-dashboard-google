import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeNetAmount,
  withNetAmounts,
  summarizeSplits,
  splitStatus,
  buildInstallments,
  localDateString,
} from "../app/lib/money.js";

const split = (share, repaid, status = "pending", expenseId = "e1") => ({ expenseId, share, repaid, status });

test("net amount: no splits uses the Repaid column", () => {
  assert.equal(computeNetAmount({ amount: 80, repaid: 30 }, []), 50);
  assert.equal(computeNetAmount({ amount: 80, repaid: 0 }, undefined), 80);
});

test("net amount: an unpaid split already counts as their part", () => {
  assert.equal(computeNetAmount({ amount: 100 }, [split(40, 0)]), 60);
  assert.equal(computeNetAmount({ amount: 100 }, [split(40, 15, "partial")]), 60);
  assert.equal(computeNetAmount({ amount: 100 }, [split(40, 40, "settled")]), 60);
});

test("net amount: overpaying lowers your cost by what they actually paid", () => {
  assert.equal(computeNetAmount({ amount: 100 }, [split(40, 55, "overpaid")]), 45);
});

test("net amount: forgiving means only what they repaid comes off", () => {
  assert.equal(computeNetAmount({ amount: 100 }, [split(40, 10, "forgiven")]), 90);
  assert.equal(computeNetAmount({ amount: 100 }, [split(40, 0, "forgiven")]), 100);
});

test("net amount: the legacy Repaid column is ignored once splits exist", () => {
  assert.equal(computeNetAmount({ amount: 100, repaid: 99 }, [split(25, 0)]), 75);
});

test("net amount: cents don't drift", () => {
  assert.equal(computeNetAmount({ amount: 0.3 }, [split(0.1, 0), split(0.1, 0)]), 0.1);
  assert.equal(computeNetAmount({ amount: 36.36 }, [split(12.12, 0), split(12.12, 0)]), 12.12);
});

test("withNetAmounts attaches each expense's own splits and doesn't mutate", () => {
  const expenses = [{ id: "e1", amount: 50 }, { id: "e2", amount: 20, repaid: 5 }];
  const out = withNetAmounts(expenses, [split(20, 0, "pending", "e1")]);
  assert.deepEqual(out.map((e) => e.netAmount), [30, 15]);
  assert.equal(expenses[0].netAmount, undefined);
});

test("person balance: forgiving after a partial payment leaves nothing owed", () => {
  const s = summarizeSplits([split(50, 10, "forgiven")]);
  assert.equal(s.balance, 0);
  assert.equal(s.totalForgiven, 40);
  assert.equal(s.totalRepaid, 10);
});

test("person balance: sums owed across splits, overpaid goes negative", () => {
  assert.equal(summarizeSplits([split(20.1, 0), split(15.33, 5.33, "partial")]).balance, 30.1);
  assert.equal(summarizeSplits([split(20, 25, "overpaid")]).balance, -5);
  assert.equal(summarizeSplits([]).balance, 0);
});

test("split status from share and repaid", () => {
  assert.equal(splitStatus(40, 0), "pending");
  assert.equal(splitStatus(40, 0.01), "partial");
  assert.equal(splitStatus(40, 40), "settled");
  assert.equal(splitStatus(0.3, 0.1 + 0.2), "settled");
  assert.equal(splitStatus(40, 41), "overpaid");
});

test("installments add back up to the exact total", () => {
  const rows = buildInstallments({ date: "2026-10-15", amount: 100 }, 3);
  assert.deepEqual(rows.map((r) => r.amount), [33.33, 33.33, 33.34]);
  for (const [amount, n] of [[100, 3], [999.99, 12], [10, 6], [0.05, 4], [1234.56, 7]]) {
    const sum = buildInstallments({ date: "2026-01-31", amount }, n).reduce((s, r) => s + Math.round(r.amount * 100), 0);
    assert.equal(sum, Math.round(amount * 100), `${amount} over ${n}`);
  }
});

test("installment dates roll over the year; first keeps its date", () => {
  const rows = buildInstallments({ date: "2026-11-15", amount: 90 }, 3);
  assert.deepEqual(rows.map((r) => r.date), ["2026-11-15", "2026-12-01", "2027-01-01"]);
});

test("installment notes are tagged n/N", () => {
  assert.deepEqual(
    buildInstallments({ date: "2026-01-01", amount: 20, notes: "Phone" }, 2).map((r) => r.notes),
    ["Phone (1/2)", "Phone (2/2)"],
  );
  assert.equal(buildInstallments({ date: "2026-01-01", amount: 20, label: "Apple" }, 2)[0].notes, "Apple (1/2)");
});

test("one installment is just the expense", () => {
  assert.deepEqual(buildInstallments({ date: "2026-03-09", amount: 12.5 }, 1).map((r) => [r.date, r.amount]), [["2026-03-09", 12.5]]);
});

test("local date string uses local, not UTC, fields", () => {
  assert.equal(localDateString(new Date(2026, 0, 5, 0, 30)), "2026-01-05");
  assert.equal(localDateString(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});
