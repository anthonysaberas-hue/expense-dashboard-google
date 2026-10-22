// Recurring payments (e.g. Apple, monthly). Pure date math — the API turns
// due occurrences into expense rows. Dates are YYYY-MM-DD strings.

export const FREQUENCIES = {
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

const pad = (n) => String(n).padStart(2, "0");
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based

// The k-th charge (k = 0 is the start date). Monthly/yearly keep the start's
// day of month, clamped: a 31st start charges Feb 28/29, Apr 30, …
export function occurrence(startDate, frequency, k) {
  const [y, m, d] = startDate.split("-").map(Number);
  if (frequency === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + 7 * k));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const months = frequency === "yearly" ? 12 * k : k;
  const total = m - 1 + months;
  const yy = y + Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, daysInMonth(yy, mm)))}`;
}

// Charges after `lastCreated` (or from the start) up to and including
// `today`, stopping at the end date. Capped so a bad start date can't flood.
export function dueOccurrences(item, today, cap = 60) {
  if (!item.startDate || !FREQUENCIES[item.frequency]) return [];
  const until = item.endDate && item.endDate < today ? item.endDate : today;
  const dates = [];
  for (let k = 0; dates.length < cap; k++) {
    const date = occurrence(item.startDate, item.frequency, k);
    if (date > until) break;
    if (!item.lastCreated || date > item.lastCreated) dates.push(date);
  }
  return dates;
}

// Next charge still to come (after lastCreated), or null if it has ended
export function nextOccurrence(item) {
  if (!item.startDate || !FREQUENCIES[item.frequency]) return null;
  for (let k = 0; k < 10000; k++) {
    const date = occurrence(item.startDate, item.frequency, k);
    if (item.endDate && date > item.endDate) return null;
    if (!item.lastCreated || date > item.lastCreated) return date;
  }
  return null;
}

// Monthly cost of a recurring item, for a "fixed costs" total
export function monthlyEquivalent(item) {
  const a = Number(item.amount) || 0;
  if (item.frequency === "weekly") return Math.round(((a * 52) / 12) * 100) / 100;
  if (item.frequency === "yearly") return Math.round((a / 12) * 100) / 100;
  return a;
}

// Marks a created expense so a re-run never creates the same charge twice
export const recurringKey = (id, date) => `recurring:${id}:${date}`;

// Sheet row (Recurring tab) → app object
export function normalizeRecurring(r) {
  return {
    id: r.ID,
    vendor: r.Vendor || "",
    name: r.Name || "",
    amount: parseFloat(r.Amount) || 0,
    category: r.Category || "Uncategorized",
    frequency: r.Frequency || "monthly",
    startDate: r.StartDate || "",
    endDate: r.EndDate || "",
    lastCreated: r.LastCreated || "",
    active: String(r.Active).toUpperCase() !== "FALSE",
    notes: r.Notes || "",
  };
}
