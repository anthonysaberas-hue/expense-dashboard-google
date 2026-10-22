// Default category per vendor. Learned from history (the category a vendor
// was given most often; most recent wins a tie; "Uncategorized" never
// counts), unless you pinned one in Settings. A single transaction's own
// category always wins — these defaults only prefill new entries.

// "PHARMAPRIX #1234", "Pharmaprix", " pharmaprix " → "pharmaprix"
export function vendorKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/#\s*\d+/g, " ")        // store numbers: #1234
    .replace(/\b\d{3,}\b/g, " ")     // long digit runs: 04512
    .replace(/[^\p{L}\p{N}]+/gu, " ") // punctuation → space
    .trim()
    .replace(/\s+/g, " ");
}

// One entry per vendor key:
// { key, name, count, total, lastDate, categories, learned, pinned, category }
export function buildVendorIndex(expenses = [], pinned = {}) {
  const map = new Map();
  for (const e of expenses) {
    const raw = e.vendor || e.name;
    const key = vendorKey(raw);
    if (!key) continue;
    let v = map.get(key);
    if (!v) {
      v = { key, names: {}, count: 0, totalCents: 0, lastDate: "", categories: {}, lastSeen: {} };
      map.set(key, v);
    }
    v.count++;
    v.totalCents += Math.round((Number(e.netAmount ?? e.amount) || 0) * 100);
    v.names[raw.trim()] = (v.names[raw.trim()] || 0) + 1;
    if ((e.date || "") > v.lastDate) v.lastDate = e.date || "";
    const cat = e.category;
    if (cat && cat !== "Uncategorized") {
      v.categories[cat] = (v.categories[cat] || 0) + 1;
      if ((e.date || "") >= (v.lastSeen[cat] || "")) v.lastSeen[cat] = e.date || "";
    }
  }

  return [...map.values()].map((v) => {
    const learned = Object.keys(v.categories).sort((a, b) =>
      v.categories[b] - v.categories[a] || (v.lastSeen[b] || "").localeCompare(v.lastSeen[a] || "")
    )[0] || null;
    const name = Object.keys(v.names).sort((a, b) => v.names[b] - v.names[a])[0];
    const pin = pinned[v.key] || null;
    return {
      key: v.key,
      name,
      count: v.count,
      total: v.totalCents / 100,
      lastDate: v.lastDate,
      categories: v.categories,
      learned,
      pinned: pin,
      category: pin || learned,
    };
  });
}

// Default category for a vendor name, or null if we don't know it
export function defaultCategoryFor(index, name) {
  const key = vendorKey(name);
  if (!key) return null;
  return index.find((v) => v.key === key)?.category || null;
}

// Vendors matching what's been typed: prefix matches first, then
// "contains"; most-used first within each group
export function suggestVendors(index, query, limit = 6) {
  const q = vendorKey(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const v of index) {
    if (v.key.startsWith(q)) starts.push(v);
    else if (v.key.includes(q)) contains.push(v);
  }
  const byUse = (a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate);
  return [...starts.sort(byUse), ...contains.sort(byUse)].slice(0, limit);
}
