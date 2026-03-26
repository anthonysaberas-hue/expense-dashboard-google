export const CATEGORY_COLORS = {
  Groceries: "#2D6A4F",
  Dining: "#E76F51",
  Transportation: "#264653",
  Entertainment: "#E9C46A",
  Subscriptions: "#7209B7",
  Shopping: "#F4A261",
  Utilities: "#457B9D",
  Healthcare: "#D62828",
  Travel: "#1D9E75",
  Education: "#4361EE",
  Fitness: "#06D6A0",
  Uncategorized: "#888780",
};

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function getCatColor(cat) {
  return CATEGORY_COLORS[cat] || "#888780";
}

export function formatCurrency(n) {
  const num = Number(n) || 0;
  return "$" + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMonthLabel(yyyymm, short = true) {
  if (!yyyymm) return "";
  const [year, month] = yyyymm.split("-");
  const m = MONTHS[parseInt(month) - 1] || "";
  return short ? `${m} '${year.slice(2)}` : `${m} ${year}`;
}

export function getPrevMonths(yyyymm, count) {
  const [y, m] = yyyymm.split("-").map(Number);
  const result = [];
  for (let i = 1; i <= count; i++) {
    let pm = m - i;
    let py = y;
    while (pm <= 0) { pm += 12; py--; }
    result.push(`${py}-${String(pm).padStart(2, "0")}`);
  }
  return result;
}
