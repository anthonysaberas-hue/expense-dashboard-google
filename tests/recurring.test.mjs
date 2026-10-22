import { test } from "node:test";
import assert from "node:assert/strict";
import { occurrence, dueOccurrences, nextOccurrence, monthlyEquivalent, recurringKey } from "../app/lib/recurring.js";

test("monthly keeps the day, clamped to short months", () => {
  const dates = [0, 1, 2, 3].map((k) => occurrence("2026-01-31", "monthly", k));
  assert.deepEqual(dates, ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.equal(occurrence("2027-12-15", "monthly", 1), "2028-01-15");
  assert.equal(occurrence("2028-01-31", "monthly", 1), "2028-02-29"); // leap year
});

test("weekly and yearly", () => {
  assert.equal(occurrence("2026-12-29", "weekly", 1), "2027-01-05");
  assert.equal(occurrence("2028-02-29", "yearly", 1), "2029-02-28");
});

test("due: everything from the start up to today, once", () => {
  const apple = { startDate: "2026-08-22", frequency: "monthly" };
  assert.deepEqual(dueOccurrences(apple, "2026-10-22"), ["2026-08-22", "2026-09-22", "2026-10-22"]);
  assert.deepEqual(dueOccurrences(apple, "2026-10-21"), ["2026-08-22", "2026-09-22"]);
});

test("due: nothing already created comes back", () => {
  const apple = { startDate: "2026-08-22", frequency: "monthly", lastCreated: "2026-09-22" };
  assert.deepEqual(dueOccurrences(apple, "2026-10-22"), ["2026-10-22"]);
  assert.deepEqual(dueOccurrences({ ...apple, lastCreated: "2026-10-22" }, "2026-10-22"), []);
});

test("due: stops at the end date and before the start", () => {
  const gym = { startDate: "2026-01-10", frequency: "monthly", endDate: "2026-03-10" };
  assert.deepEqual(dueOccurrences(gym, "2026-12-01"), ["2026-01-10", "2026-02-10", "2026-03-10"]);
  assert.deepEqual(dueOccurrences({ startDate: "2026-11-01", frequency: "monthly" }, "2026-10-22"), []);
});

test("due: a start date years ago is capped", () => {
  assert.equal(dueOccurrences({ startDate: "2000-01-01", frequency: "weekly" }, "2026-10-22").length, 60);
});

test("due: unknown frequency or missing start creates nothing", () => {
  assert.deepEqual(dueOccurrences({ startDate: "2026-01-01", frequency: "daily" }, "2026-10-22"), []);
  assert.deepEqual(dueOccurrences({ frequency: "monthly" }, "2026-10-22"), []);
});

test("next charge", () => {
  assert.equal(nextOccurrence({ startDate: "2026-08-22", frequency: "monthly", lastCreated: "2026-10-22" }), "2026-11-22");
  assert.equal(nextOccurrence({ startDate: "2026-11-01", frequency: "monthly" }), "2026-11-01");
  assert.equal(nextOccurrence({ startDate: "2026-01-10", frequency: "monthly", endDate: "2026-02-10", lastCreated: "2026-02-10" }), null);
});

test("monthly equivalent for fixed costs", () => {
  assert.equal(monthlyEquivalent({ amount: 14.99, frequency: "monthly" }), 14.99);
  assert.equal(monthlyEquivalent({ amount: 120, frequency: "yearly" }), 10);
  assert.equal(monthlyEquivalent({ amount: 10, frequency: "weekly" }), 43.33);
});

test("dedupe key", () => {
  assert.equal(recurringKey("abc", "2026-10-22"), "recurring:abc:2026-10-22");
});
