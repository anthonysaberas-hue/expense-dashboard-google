import { safeGet, safeSet } from "./storage";

// Single source of truth for the category list shown in every picker:
// categories used by any expense + custom ones from the Category Manager.
export function getAllCategories(expenses = []) {
  const set = new Set(["Uncategorized"]);
  expenses.forEach((e) => { if (e.category) set.add(e.category); });
  Object.keys(safeGet("custom_categories", {})).forEach((c) => set.add(c));
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

// Same defaults the Category Manager uses for a new category
export function addCustomCategory(name) {
  const customs = safeGet("custom_categories", {});
  if (!customs[name]) {
    customs[name] = { emoji: "📦", color: "#888780" };
    safeSet("custom_categories", customs);
  }
}
