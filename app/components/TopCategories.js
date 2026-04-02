"use client";
import { useRef, useMemo } from "react";
import { getCatColor, formatCurrency, getNetAmount } from "../lib/constants";

const CAT_EMOJI = {
  Groceries: "🛒",
  Dining: "🍽️",
  Transportation: "🚗",
  Entertainment: "🎬",
  Subscriptions: "📱",
  Shopping: "🛍️",
  Utilities: "🏠",
  Healthcare: "💊",
  Travel: "✈️",
  Education: "📚",
  Fitness: "💪",
};

function getEmoji(cat) {
  return CAT_EMOJI[cat] || "📦";
}

export default function TopCategories({ monthData = [], prevMonthData = [], budgets = {} }) {
  const scrollRef = useRef(null);

  const catTotals = useMemo(() => {
    const ct = {};
    monthData.forEach((e) => {
      ct[e.category] = (ct[e.category] || 0) + getNetAmount(e);
    });
    return Object.entries(ct)
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [monthData]);

  const prevCatTotals = useMemo(() => {
    const ct = {};
    prevMonthData.forEach((e) => {
      ct[e.category] = (ct[e.category] || 0) + getNetAmount(e);
    });
    return ct;
  }, [prevMonthData]);

  const totalSpent = monthData.reduce((s, e) => s + getNetAmount(e), 0);
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0) || totalSpent;
  const remaining = totalBudget - totalSpent;

  const scroll = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 160, behavior: "smooth" });
    }
  };

  if (catTotals.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p className="section-label" style={{ margin: 0 }}>Categories with Biggest Expense</p>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => scroll(-1)} className="top-cat-nav-btn" aria-label="Scroll left">&larr;</button>
          <button onClick={() => scroll(1)} className="top-cat-nav-btn" aria-label="Scroll right">&rarr;</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Budget summary */}
        <div className="top-cat-budget-summary">
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total budget:</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(totalBudget)}
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Spent: </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>{formatCurrency(totalSpent)}</span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Remaining: </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: remaining >= 0 ? "var(--green)" : "var(--red)" }}>
              {formatCurrency(Math.abs(remaining))}
            </span>
          </div>
        </div>

        {/* Scrollable category cards */}
        <div className="top-cat-scroll" ref={scrollRef}>
          {catTotals.map(({ cat, amount }) => {
            const prev = prevCatTotals[cat] || 0;
            const delta = prev > 0 ? ((amount - prev) / prev * 100).toFixed(1) : null;
            const isUp = amount >= prev;
            return (
              <div key={cat} className="top-cat-card">
                <div style={{ fontSize: 28, marginBottom: 4 }}>{getEmoji(cat)}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                  {cat}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
                  {formatCurrency(amount)}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>
                  vs last period
                </div>
                {delta !== null ? (
                  <span className={`top-cat-badge ${isUp ? "top-cat-badge-up" : "top-cat-badge-down"}`}>
                    {isUp ? "↗" : "↘"} {Math.abs(Number(delta))}%
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
