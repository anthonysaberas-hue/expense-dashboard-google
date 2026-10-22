import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorKey, buildVendorIndex, defaultCategoryFor, suggestVendors } from "../app/lib/vendors.js";

const e = (vendor, category, date, amount = 10) => ({ vendor, category, date, amount });

test("vendor names that differ only by store number, case or punctuation match", () => {
  assert.equal(vendorKey("PHARMAPRIX #1234"), "pharmaprix");
  assert.equal(vendorKey(" Pharmaprix "), "pharmaprix");
  assert.equal(vendorKey("Pharmaprix 04512"), "pharmaprix");
  assert.equal(vendorKey("UBER CANADA/UBEREATS"), "uber canada ubereats");
  assert.equal(vendorKey("Café Olimpico"), "café olimpico");
  assert.equal(vendorKey(""), "");
});

test("learns the most common category, ignoring Uncategorized", () => {
  const idx = buildVendorIndex([
    e("PHARMAPRIX #12", "Healthcare", "2026-08-01"),
    e("Pharmaprix", "Healthcare", "2026-09-01"),
    e("Pharmaprix", "Gift", "2026-10-01"),
    e("Pharmaprix", "Uncategorized", "2026-10-02"),
    e("Pharmaprix", "Uncategorized", "2026-10-03"),
  ]);
  assert.equal(idx.length, 1);
  assert.equal(idx[0].learned, "Healthcare");
  assert.equal(idx[0].count, 5);
  assert.equal(idx[0].name, "Pharmaprix");
});

test("a tie goes to the most recently used category", () => {
  const idx = buildVendorIndex([
    e("Costco", "Groceries", "2026-08-01"),
    e("Costco", "Shopping", "2026-10-01"),
  ]);
  assert.equal(idx[0].learned, "Shopping");
});

test("a pinned category beats the learned one", () => {
  const idx = buildVendorIndex([e("Pharmaprix", "Healthcare", "2026-08-01")], { pharmaprix: "Personal care" });
  assert.equal(idx[0].learned, "Healthcare");
  assert.equal(idx[0].category, "Personal care");
  assert.equal(defaultCategoryFor(idx, "PHARMAPRIX #9"), "Personal care");
});

test("vendors only ever seen as Uncategorized have no default", () => {
  const idx = buildVendorIndex([e("Mystery", "Uncategorized", "2026-08-01")]);
  assert.equal(defaultCategoryFor(idx, "mystery"), null);
  assert.equal(defaultCategoryFor(idx, "Unknown shop"), null);
});

test("totals use your cost and add up in cents", () => {
  const idx = buildVendorIndex([
    { vendor: "Bar", category: "Dining", date: "2026-10-01", amount: 40, netAmount: 20.1 },
    { vendor: "Bar", category: "Dining", date: "2026-10-02", amount: 0.2 },
  ]);
  assert.equal(idx[0].total, 20.3);
});

test("suggestions: prefix matches first, then most used", () => {
  const idx = buildVendorIndex([
    e("Pharmaprix", "Healthcare", "2026-08-01"),
    e("Pharmaprix", "Healthcare", "2026-08-02"),
    e("Pho Lien", "Dining", "2026-08-03"),
    e("Jean Coutu Pharmacie", "Healthcare", "2026-08-04"),
  ]);
  assert.deepEqual(suggestVendors(idx, "ph").map((v) => v.name), ["Pharmaprix", "Pho Lien", "Jean Coutu Pharmacie"]);
  assert.deepEqual(suggestVendors(idx, "pharm").map((v) => v.name), ["Pharmaprix", "Jean Coutu Pharmacie"]);
  assert.deepEqual(suggestVendors(idx, ""), []);
});
