import { safeGet, safeSet } from "./storage";

const KEY = "expense_budgets";

export function getBudgets() {
  return safeGet(KEY, {});
}

export function setBudget(category, limit) {
  const budgets = getBudgets();
  const updated = { ...budgets, [category]: Number(limit) || 0 };
  safeSet(KEY, updated);
  return updated;
}

export function deleteBudget(category) {
  const budgets = getBudgets();
  const { [category]: _, ...rest } = budgets;
  safeSet(KEY, rest);
  return rest;
}
