import { getSetting, setSetting } from "./settings";

const KEY = "expense_budgets";

export function getBudgets() {
  return getSetting(KEY);
}

export function setBudget(category, limit) {
  const updated = { ...getBudgets(), [category]: Number(limit) || 0 };
  setSetting(KEY, updated);
  return updated;
}

export function deleteBudget(category) {
  const { [category]: _, ...rest } = getBudgets();
  setSetting(KEY, rest);
  return rest;
}
