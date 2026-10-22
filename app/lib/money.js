// The one set of money rules for the whole app. Everything else (API,
// Overview, People, insights) should go through these helpers. All math is
// done in integer cents so totals never drift.
//
// For an expense you paid:
//   paid        = expense.amount (what left your account)
//   others' part = for each split: what that person owes or already paid
//                  (max(share, repaid)); for a forgiven split only what they
//                  actually repaid — the forgiven rest is your cost now
//   your cost   = paid − others' part      ← what every total/chart shows
// With no splits, the legacy Repaid column is the others' part.
//
// For a person:
//   owed to you = Σ (share − repaid) over their non-forgiven splits
//                 (negative means they overpaid)

export const toCents = (n) => Math.round((Number(n) || 0) * 100);
export const fromCents = (c) => c / 100;

function othersPartCents(expense, expenseSplits) {
  if (!expenseSplits || expenseSplits.length === 0) return toCents(expense.repaid);
  return expenseSplits.reduce((sum, sp) => {
    const share = toCents(sp.share);
    const repaid = toCents(sp.repaid);
    return sum + (sp.status === "forgiven" ? repaid : Math.max(share, repaid));
  }, 0);
}

export function computeNetAmount(expense, expenseSplits) {
  return fromCents(toCents(expense.amount) - othersPartCents(expense, expenseSplits));
}

// Returns new expense objects with netAmount set from the current splits
export function withNetAmounts(expenses, splits) {
  const byExpense = {};
  for (const sp of splits) (byExpense[sp.expenseId] ||= []).push(sp);
  return expenses.map((e) => ({ ...e, netAmount: computeNetAmount(e, byExpense[e.id]) }));
}

// Totals for a set of splits (one person, or one person's month)
export function summarizeSplits(splits) {
  let share = 0, repaid = 0, forgiven = 0, owed = 0;
  for (const sp of splits) {
    const s = toCents(sp.share);
    const r = toCents(sp.repaid);
    share += s;
    repaid += r;
    if (sp.status === "forgiven") forgiven += Math.max(s - r, 0);
    else owed += s - r;
  }
  return {
    totalShare: fromCents(share),
    totalRepaid: fromCents(repaid),
    totalForgiven: fromCents(forgiven),
    balance: fromCents(owed),
  };
}

// Status a split should have after recording `repaid` against `share`
export function splitStatus(share, repaid) {
  const s = toCents(share);
  const r = toCents(repaid);
  if (r > s) return "overpaid";
  if (r === s) return "settled";
  return r > 0 ? "partial" : "pending";
}

// YYYY-MM-DD in the user's local timezone (toISOString() is UTC, which is
// the wrong day for part of every evening/morning)
export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Split one amount into `count` monthly installments that add back up to
// exactly the original (the last one absorbs the rounding cent). The first
// keeps the original date; later ones land on the 1st of each month.
export function buildInstallments({ date, amount, notes = "", label = "" }, count) {
  const n = Math.max(1, Math.floor(count));
  const total = toCents(amount);
  const base = Math.trunc(total / n);
  const [startYear, startMonth] = date.split("-").map(Number);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const months = startMonth - 1 + i;
    const y = startYear + Math.floor(months / 12);
    const m = (months % 12) + 1;
    const cents = i === n - 1 ? total - base * (n - 1) : base;
    const tag = `(${i + 1}/${n})`;
    rows.push({
      date: i === 0 ? date : `${y}-${String(m).padStart(2, "0")}-01`,
      amount: fromCents(cents),
      notes: notes ? `${notes} ${tag}` : `${label || "Installment"} ${tag}`,
    });
  }
  return rows;
}
