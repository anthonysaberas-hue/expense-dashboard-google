// Allocate a lump-sum payment from a person across their outstanding splits,
// oldest expense first. Each split is fully settled until the money runs out;
// the split where it runs out is paid partially (its remainder stays owed).
// All math is done in integer cents to avoid floating-point drift.

const toCents = (n) => Math.round((Number(n) || 0) * 100);

export function allocatePayment(splits, expenseMap, person, amount) {
  let remainingCents = toCents(amount);

  const outstanding = splits
    .map((sp, index) => ({ sp, index }))
    .filter(({ sp }) => sp.person === person && sp.status !== "forgiven" && toCents(sp.share) > toCents(sp.repaid))
    .sort((a, b) => {
      // Undated splits go last; ties keep their sheet order
      const da = expenseMap[a.sp.expenseId]?.date || "9999-99-99";
      const db = expenseMap[b.sp.expenseId]?.date || "9999-99-99";
      if (da !== db) return da < db ? -1 : 1;
      return a.index - b.index;
    });

  const updates = [];
  for (const { sp } of outstanding) {
    if (remainingCents <= 0) break;
    const shareCents = toCents(sp.share);
    const repaidCents = toCents(sp.repaid);
    const applyCents = Math.min(shareCents - repaidCents, remainingCents);
    const newRepaidCents = repaidCents + applyCents;
    remainingCents -= applyCents;
    updates.push({
      split: sp,
      applied: applyCents / 100,
      repaid: newRepaidCents / 100,
      status: newRepaidCents >= shareCents ? "settled" : "partial",
    });
  }

  return { updates, leftover: Math.max(remainingCents, 0) / 100 };
}
