import { formatCurrency, getPrevMonths } from "./constants";

/**
 * Pure insight engine — no localStorage access.
 * Dismissal filtering is handled in page.js.
 *
 * runInsights(allExpenses, budgets, selectedMonth) → insight[]
 *
 * Each insight: { id, severity, title, body, category? }
 * Severity: 'warning' | 'approaching' | 'info' | 'pattern' | 'nice'
 */

function groupByMonthAndCategory(expenses) {
  // { "2025-03": { Dining: 240, Groceries: 180 } }
  const result = {};
  expenses.forEach((e) => {
    const m = e.date?.substring(0, 7);
    if (!m) return;
    if (!result[m]) result[m] = {};
    result[m][e.category] = (result[m][e.category] || 0) + (Number(e.amount) || 0);
  });
  return result;
}

function groupByMonth(expenses) {
  const result = {};
  expenses.forEach((e) => {
    const m = e.date?.substring(0, 7);
    if (!m) return;
    if (!result[m]) result[m] = [];
    result[m].push(e);
  });
  return result;
}

function monthTotal(expenses) {
  return expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

const rules = [
  // ── Rule 1: Category spike ─────────────────────────────────────
  {
    id: "CATEGORY_SPIKE",
    run(allExpenses, budgets, selectedMonth) {
      const byMonthCat = groupByMonthAndCategory(allExpenses);
      const currentCats = byMonthCat[selectedMonth] || {};
      const priorMonths = getPrevMonths(selectedMonth, 3);
      const results = [];

      for (const [cat, currentAmt] of Object.entries(currentCats)) {
        const priorAmts = priorMonths.map((m) => (byMonthCat[m] || {})[cat] || 0);
        const monthsWithData = priorAmts.filter((v) => v > 0);
        if (monthsWithData.length === 0) continue;
        const avg = monthsWithData.reduce((s, v) => s + v, 0) / monthsWithData.length;
        if (avg > 0 && currentAmt > avg * 2) {
          results.push({
            id: `CATEGORY_SPIKE_${cat}_${selectedMonth}`,
            severity: "warning",
            title: `${cat} spending spike`,
            body: `You spent ${formatCurrency(currentAmt)} on ${cat} — ${(currentAmt / avg).toFixed(1)}× your ${monthsWithData.length}-month average of ${formatCurrency(avg)}.`,
            category: cat,
          });
        }
      }
      return results;
    },
  },

  // ── Rule 2: Budget overshoot ───────────────────────────────────
  {
    id: "BUDGET_OVER",
    run(allExpenses, budgets, selectedMonth) {
      const byMonthCat = groupByMonthAndCategory(allExpenses);
      const currentCats = byMonthCat[selectedMonth] || {};
      const results = [];

      for (const [cat, limit] of Object.entries(budgets)) {
        if (!limit) continue;
        const spent = currentCats[cat] || 0;
        if (spent > limit) {
          results.push({
            id: `BUDGET_OVER_${cat}_${selectedMonth}`,
            severity: "warning",
            title: `${cat} over budget`,
            body: `You've spent ${formatCurrency(spent)} of your ${formatCurrency(limit)} limit — ${Math.round((spent / limit) * 100)}% used.`,
            category: cat,
          });
        }
      }
      return results;
    },
  },

  // ── Rule 3: Budget approaching (>80%) ──────────────────────────
  {
    id: "BUDGET_APPROACHING",
    run(allExpenses, budgets, selectedMonth) {
      const byMonthCat = groupByMonthAndCategory(allExpenses);
      const currentCats = byMonthCat[selectedMonth] || {};
      const results = [];

      for (const [cat, limit] of Object.entries(budgets)) {
        if (!limit) continue;
        const spent = currentCats[cat] || 0;
        const pct = spent / limit;
        if (pct > 0.8 && pct <= 1) {
          results.push({
            id: `BUDGET_APPROACHING_${cat}_${selectedMonth}`,
            severity: "approaching",
            title: `${cat} approaching limit`,
            body: `${Math.round(pct * 100)}% of your ${formatCurrency(limit)} budget used (${formatCurrency(spent)} spent). ${formatCurrency(limit - spent)} remaining.`,
            category: cat,
          });
        }
      }
      return results;
    },
  },

  // ── Rule 4: Subscription creep ─────────────────────────────────
  {
    id: "SUBSCRIPTION_CREEP",
    run(allExpenses, budgets, selectedMonth) {
      const byMonthVendor = {};
      allExpenses.forEach((e) => {
        const m = e.date?.substring(0, 7);
        const v = e.vendor || e.name;
        if (!m || !v) return;
        if (!byMonthVendor[v]) byMonthVendor[v] = {};
        byMonthVendor[v][m] = (byMonthVendor[v][m] || 0) + (Number(e.amount) || 0);
      });

      const subCat = ["Subscriptions"];
      const subExpenses = allExpenses.filter((e) => subCat.includes(e.category));
      const subVendors = new Set(subExpenses.map((e) => e.vendor || e.name));

      const priorMonths = getPrevMonths(selectedMonth, 5);
      const results = [];

      for (const [vendor, monthAmts] of Object.entries(byMonthVendor)) {
        if (!subVendors.has(vendor) && !vendor) continue;
        const recentMonths = [selectedMonth, ...priorMonths.slice(0, 2)];
        const vals = recentMonths.map((m) => monthAmts[m] || 0).filter((v) => v > 0);
        if (vals.length < 3) continue;
        const isGrowing = vals[0] > vals[1] && vals[1] > vals[2];
        if (isGrowing && vals[0] > vals[2] * 1.3) {
          results.push({
            id: `SUBSCRIPTION_CREEP_${vendor}_${selectedMonth}`,
            severity: "warning",
            title: "Subscription creep detected",
            body: `${vendor} charges have grown: ${formatCurrency(vals[2])} → ${formatCurrency(vals[1])} → ${formatCurrency(vals[0])} over 3 months.`,
          });
        }
      }
      return results;
    },
  },

  // ── Rule 5: Recurring charge detection ─────────────────────────
  {
    id: "RECURRING_CHARGE",
    run(allExpenses, budgets, selectedMonth) {
      const byVendor = {};
      allExpenses.forEach((e) => {
        const v = e.vendor || e.name;
        if (!v || !e.date) return;
        if (!byVendor[v]) byVendor[v] = [];
        byVendor[v].push(e);
      });

      const results = [];
      for (const [vendor, exps] of Object.entries(byVendor)) {
        // Group by month, get the day of month for each appearance
        const byM = {};
        exps.forEach((e) => {
          const m = e.date.substring(0, 7);
          const day = parseInt(e.date.split("-")[2]) || 0;
          if (!byM[m]) byM[m] = [];
          byM[m].push(day);
        });

        const months = Object.keys(byM).sort();
        if (months.length < 3) continue;

        // Check last 3+ consecutive months with consistent day (±2)
        let streak = 1;
        for (let i = 1; i < months.length; i++) {
          const [py, pm] = months[i - 1].split("-").map(Number);
          const [cy, cm] = months[i].split("-").map(Number);
          const isConsecutive = (cy * 12 + cm) - (py * 12 + pm) === 1;
          if (!isConsecutive) { streak = 1; continue; }
          const prevDays = byM[months[i - 1]];
          const currDays = byM[months[i]];
          const close = prevDays.some((pd) => currDays.some((cd) => Math.abs(pd - cd) <= 2));
          if (close) streak++;
          else streak = 1;
          if (streak >= 3 && months[i] === selectedMonth) {
            const avg = exps
              .filter((e) => e.date.startsWith(selectedMonth))
              .reduce((s, e) => s + (Number(e.amount) || 0), 0);
            results.push({
              id: `RECURRING_CHARGE_${vendor}_${selectedMonth}`,
              severity: "info",
              title: "Recurring charge detected",
              body: `${vendor} has appeared for ${streak}+ consecutive months around the same date. This month: ${formatCurrency(avg)}.`,
            });
            break;
          }
        }
      }
      return results;
    },
  },

  // ── Rule 6: Weekend vs weekday spend ──────────────────────────
  {
    id: "WEEKEND_PATTERN",
    run(allExpenses, budgets, selectedMonth) {
      const monthExp = allExpenses.filter((e) => e.date?.startsWith(selectedMonth));
      if (monthExp.length < 5) return [];

      let wkendTotal = 0, wkendDays = new Set();
      let wkdayTotal = 0, wkdayDays = new Set();

      monthExp.forEach((e) => {
        if (!e.date) return;
        const day = new Date(e.date + "T12:00:00").getDay();
        const amt = Number(e.amount) || 0;
        if (day === 0 || day === 6) {
          wkendTotal += amt;
          wkendDays.add(e.date);
        } else {
          wkdayTotal += amt;
          wkdayDays.add(e.date);
        }
      });

      if (wkdayDays.size === 0 || wkendDays.size === 0) return [];
      const wkendAvg = wkendTotal / wkendDays.size;
      const wkdayAvg = wkdayTotal / wkdayDays.size;
      if (wkendAvg > wkdayAvg * 1.3) {
        return [{
          id: `WEEKEND_PATTERN_${selectedMonth}`,
          severity: "pattern",
          title: "Weekend spending pattern",
          body: `You spend ${formatCurrency(wkendAvg)}/day on weekends vs ${formatCurrency(wkdayAvg)}/day on weekdays — ${(wkendAvg / wkdayAvg).toFixed(1)}× more on weekends.`,
        }];
      }
      return [];
    },
  },

  // ── Rule 7: Highest-ever month ────────────────────────────────
  {
    id: "HIGHEST_MONTH",
    run(allExpenses, budgets, selectedMonth) {
      const byM = groupByMonth(allExpenses);
      const months = Object.keys(byM).sort();
      if (months.length < 2) return [];

      const totals = months.map((m) => ({ m, total: monthTotal(byM[m]) }));
      const currentTotal = (totals.find((t) => t.m === selectedMonth) || {}).total || 0;
      const maxTotal = Math.max(...totals.map((t) => t.total));

      if (currentTotal === maxTotal && currentTotal > 0) {
        return [{
          id: `HIGHEST_MONTH_${selectedMonth}`,
          severity: "info",
          title: "Highest spending month on record",
          body: `${formatCurrency(currentTotal)} — your highest month across all ${months.length} months tracked.`,
        }];
      }
      return [];
    },
  },

  // ── Rule 8: Best (lowest) month ──────────────────────────────
  {
    id: "BEST_MONTH",
    run(allExpenses, budgets, selectedMonth) {
      const byM = groupByMonth(allExpenses);
      const months = Object.keys(byM).sort();
      if (months.length < 2) return [];

      const totals = months.map((m) => ({ m, total: monthTotal(byM[m]) }));
      const currentTotal = (totals.find((t) => t.m === selectedMonth) || {}).total || 0;
      if (currentTotal === 0) return [];
      const minTotal = Math.min(...totals.filter((t) => t.total > 0).map((t) => t.total));

      if (currentTotal === minTotal) {
        return [{
          id: `BEST_MONTH_${selectedMonth}`,
          severity: "nice",
          title: "Your lowest spending month!",
          body: `${formatCurrency(currentTotal)} — the lowest recorded across ${months.length} months. Nice work keeping costs down.`,
        }];
      }
      return [];
    },
  },

  // ── Rule 9: Month streak (3+ under average) ───────────────────
  {
    id: "MONTH_STREAK",
    run(allExpenses, budgets, selectedMonth) {
      const byM = groupByMonth(allExpenses);
      const months = Object.keys(byM).sort();
      if (months.length < 4) return [];

      const totals = months.map((m) => monthTotal(byM[m]));
      const avg = totals.reduce((s, v) => s + v, 0) / totals.length;

      const recentThree = [
        selectedMonth,
        ...getPrevMonths(selectedMonth, 2),
      ].filter((m) => byM[m]);

      if (recentThree.length < 3) return [];
      const allUnder = recentThree.every((m) => monthTotal(byM[m]) < avg);
      if (allUnder) {
        return [{
          id: `MONTH_STREAK_${selectedMonth}`,
          severity: "nice",
          title: "3-month spending streak!",
          body: `You've spent under your ${formatCurrency(avg)} monthly average for 3 consecutive months. Keep it up!`,
        }];
      }
      return [];
    },
  },

  // ── Rule 10: Single-day spike ─────────────────────────────────
  {
    id: "SINGLE_DAY_SPIKE",
    run(allExpenses, budgets, selectedMonth) {
      const monthExp = allExpenses.filter((e) => e.date?.startsWith(selectedMonth));
      if (monthExp.length === 0) return [];

      const byDay = {};
      monthExp.forEach((e) => {
        if (!e.date) return;
        byDay[e.date] = (byDay[e.date] || 0) + (Number(e.amount) || 0);
      });

      const days = Object.keys(byDay);
      if (days.length < 3) return [];
      const dailyAvg = monthExp.reduce((s, e) => s + (Number(e.amount) || 0), 0) / days.length;

      const spikeDay = days.find((d) => byDay[d] > dailyAvg * 2);
      if (spikeDay) {
        return [{
          id: `SINGLE_DAY_SPIKE_${spikeDay}_${selectedMonth}`,
          severity: "info",
          title: "Single-day spending spike",
          body: `${spikeDay}: ${formatCurrency(byDay[spikeDay])} spent — ${(byDay[spikeDay] / dailyAvg).toFixed(1)}× your daily average of ${formatCurrency(dailyAvg)}.`,
        }];
      }
      return [];
    },
  },
];

const SEVERITY_RANK = { warning: 4, approaching: 3, info: 2, pattern: 2, nice: 1 };

/**
 * Run all insight rules and return sorted insights array.
 * Returns [] if selectedMonth is null/empty.
 */
export function runInsights(allExpenses, budgets, selectedMonth) {
  if (!selectedMonth || !allExpenses.length) return [];
  return rules
    .flatMap((rule) => {
      try {
        return rule.run(allExpenses, budgets, selectedMonth) || [];
      } catch {
        return [];
      }
    })
    .filter(Boolean)
    .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
}
