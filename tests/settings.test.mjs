import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSetting } from "../app/lib/settings.js";

test("first sync keeps categories from both devices; the sheet wins on conflicts", () => {
  const sheet = { Coffee: { emoji: "☕", color: "#111" }, Gym: { emoji: "💪", color: "#222" } };
  const phone = { Coffee: { emoji: "📦", color: "#888" }, Pets: { emoji: "🐾", color: "#333" } };
  assert.deepEqual(mergeSetting(sheet, phone), {
    Coffee: { emoji: "☕", color: "#111" },
    Gym: { emoji: "💪", color: "#222" },
    Pets: { emoji: "🐾", color: "#333" },
  });
});

test("lists are unioned without duplicates", () => {
  assert.deepEqual(mergeSetting(["Sam", "Alex"], ["Alex", "Jo"]), ["Sam", "Alex", "Jo"]);
});

test("a side that has nothing yet takes the other", () => {
  assert.deepEqual(mergeSetting(undefined, { Dining: 300 }), { Dining: 300 });
  assert.deepEqual(mergeSetting({ Dining: 300 }, undefined), { Dining: 300 });
});
