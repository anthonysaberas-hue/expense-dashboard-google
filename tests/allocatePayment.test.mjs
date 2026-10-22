import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePayment } from "../app/lib/allocatePayment.js";

const expenses = {
  sep: { date: "2026-09-10" },
  aug: { date: "2026-08-01" },
  oct: { date: "2026-10-05" },
  aug2: { date: "2026-08-01" },
  none: {},
};
const sp = (splitId, expenseId, share, repaid = 0, status = "pending", person = "Sam") =>
  ({ splitId, expenseId, share, repaid, status, person });

const splits = [
  sp(1, "sep", 200.1),
  sp(2, "aug", 150.33, 50, "partial"),
  sp(3, "oct", 285.9),
  sp(4, "aug2", 200),
  sp(5, "aug2", 40, 0, "forgiven"),
  sp(6, "aug", 99, 0, "pending", "Alex"),
];
const plan = (amount) =>
  allocatePayment(splits, expenses, "Sam", amount).updates.map((u) => [u.split.splitId, u.applied, u.repaid, u.status]);

test("pays oldest first and splits the last one to the cent", () => {
  assert.deepEqual(plan(500), [
    [2, 100.33, 150.33, "settled"],
    [4, 200, 200, "settled"],
    [1, 199.67, 199.67, "partial"],
  ]);
});

test("applied amounts add up to exactly what was received", () => {
  for (const amount of [0.01, 100.33, 300.33, 500, 786.33]) {
    const { updates, leftover } = allocatePayment(splits, expenses, "Sam", amount);
    const cents = updates.reduce((s, u) => s + Math.round(u.applied * 100), 0) + Math.round(leftover * 100);
    assert.equal(cents, Math.round(amount * 100), String(amount));
  }
});

test("an exact amount settles everything with nothing partial", () => {
  const { updates, leftover } = allocatePayment(splits, expenses, "Sam", 786.33);
  assert.equal(leftover, 0);
  assert.ok(updates.every((u) => u.status === "settled"));
  assert.equal(updates.length, 4);
});

test("more than owed reports the leftover instead of overpaying", () => {
  const { updates, leftover } = allocatePayment(splits, expenses, "Sam", 800);
  assert.equal(leftover, 13.67);
  assert.ok(updates.every((u) => u.repaid <= u.split.share));
});

test("skips forgiven splits, other people, and already-settled ones", () => {
  const ids = plan(10000).map((u) => u[0]);
  assert.ok(!ids.includes(5));
  assert.ok(!ids.includes(6));
  const settled = [sp(7, "aug", 10, 10, "settled"), sp(8, "sep", 10)];
  assert.deepEqual(allocatePayment(settled, expenses, "Sam", 5).updates.map((u) => u.split.splitId), [8]);
});

test("undated expenses go last; same-date ties keep sheet order", () => {
  const list = [sp(1, "none", 10), sp(2, "aug2", 10), sp(3, "aug", 10)];
  assert.deepEqual(allocatePayment(list, expenses, "Sam", 30).updates.map((u) => u.split.splitId), [2, 3, 1]);
});

test("zero or invalid amounts change nothing", () => {
  assert.deepEqual(plan(0), []);
  assert.deepEqual(plan("abc"), []);
});
