"use client";
import { useState, useMemo } from "react";
import { getCatColor, formatCurrency, formatMonthLabel, getPrevMonths } from "../lib/constants";
import Sparkline from "./Sparkline";
import EmptyState from "./EmptyState";

function CategoryCard({ cat, amount, total, prevAmount, sparkData, budgetLimit, transactions }) {
  const [expanded, setExpanded] = useState(false);
  const pct = total > 0 ? (amount / total) * 100 : 0;
  const delta = prevAmount > 0 ? ((amount - prevAmount) / prevAmount * 100).toFixed(1) : null;
  const isUp = amount > prevAmount;
  const budgetPct = budgetLimit ? Math.min((amount / budgetLimit) * 100, 100) : null;
  const budgetColor = budgetPct
    ? budgetPct > 100 ? "var(--red)"
    : budgetPct > 80 ? "var(--amber)"
    : "var(--green)"
    : "var(--green)";

  return (
    <div className="cat-card">
      <button
        className="cat-card-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`cat-detail-${cat}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 10, height: 10, borderRadius: 2,
              background: getCatColor(cat), flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cat}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Sparkline data={sparkData} color={getCatColor(cat)} height={24} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(amount)}
          </span>
          <span className={`chevron${expanded ? " open" : ""}`} aria-hidden="true">▼</span>
        </div>
      </button>

      {/* Summary row below header */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {pct.toFixed(1)}% of total
        </span>
        {delta !== null && (
          <span style={{ fontSize: 11, color: isUp ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
            {isUp ? "↑" : "↓"} {Math.abs(Number(delta))}% vs last month
          </span>
        )}
        {budgetLimit && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Budget: {formatCurrency(budgetLimit)}
          </span>
        )}
      </div>

      {/* Budget progress bar */}
      {budgetLimit && (
        <div style={{ padding: "0 16px 12px" }}>
          <div className="budget-bar-track">
            <div
              className="budget-bar-fill"
              style={{
                width: `${Math.min((amount / budgetLimit) * 100, 100)}%`,
                background: budgetColor,
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(amount)} / {formatCurrency(budgetLimit)}
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="cat-card-body" id={`cat-detail-${cat}`}>
          {transactions.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>No transactions.</p>
          ) : (
            <table className="tx-table" style={{ fontSize: 12 }} aria-label={`${cat} transactions`}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Date</th>
                  <th style={{ textAlign: "left" }}>Vendor</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((t, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--text-muted)" }}>{t.date}</td>
                    <td>{t.vendor || t.name}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function CategoriesTab({
  monthData = [],
  byMonth = {},
  monthKeys = [],
  selectedMonth,
  expenses = [],
  budgets = {},
}) {
  const total = monthData.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const currentIdx = monthKeys.indexOf(selectedMonth);
  const prevMonth = currentIdx > 0 ? monthKeys[currentIdx - 1] : null;
  const prevData = prevMonth ? (byMonth[prevMonth] || []) : [];

  const prevCatTotals = useMemo(() => {
    const ct = {};
    prevData.forEach((e) => {
      ct[e.category] = (ct[e.category] || 0) + (Number(e.amount) || 0);
    });
    return ct;
  }, [prevData]);

  const last6Months = useMemo(() => {
    const priorM = getPrevMonths(selectedMonth, 5);
    return [selectedMonth, ...priorM].reverse().filter((m) => byMonth[m]);
  }, [selectedMonth, byMonth]);

  const catData = useMemo(() => {
    const ct = {};
    monthData.forEach((e) => {
      ct[e.category] = (ct[e.category] || 0) + (Number(e.amount) || 0);
    });
    return Object.entries(ct)
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthData]);

  if (monthData.length === 0) {
    return (
      <EmptyState
        icon="🏷️"
        title="No categories this month"
        message="Select a month with expenses to see the category breakdown."
      />
    );
  }

  return (
    <div>
      <div className="category-grid">
        {catData.map(({ cat, amount }) => {
          const sparkData = last6Months.map((m) =>
            (byMonth[m] || []).filter((e) => e.category === cat).reduce((s, e) => s + (Number(e.amount) || 0), 0)
          );
          const transactions = monthData.filter((e) => e.category === cat);
          return (
            <CategoryCard
              key={cat}
              cat={cat}
              amount={amount}
              total={total}
              prevAmount={prevCatTotals[cat] || 0}
              sparkData={sparkData}
              budgetLimit={budgets[cat] || null}
              transactions={transactions}
            />
          );
        })}
      </div>
    </div>
  );
}
