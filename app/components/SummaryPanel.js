"use client";
import { useMemo } from "react";
import { formatCurrency, getNetAmount } from "../lib/constants";

export default function SummaryPanel({ monthData = [] }) {
  const stats = useMemo(() => {
    if (monthData.length === 0) return null;
    const netAmounts = monthData.map(getNetAmount);
    const total = netAmounts.reduce((s, a) => s + a, 0);
    const largest = Math.max(...netAmounts);
    const avg = total / netAmounts.length;
    const totalRepaid = monthData.reduce((s, e) => s + (Number(e.repaid) || 0), 0);
    const grossTotal = monthData.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { total, largest, avg, count: netAmounts.length, totalRepaid, grossTotal };
  }, [monthData]);

  if (!stats) return null;

  return (
    <div className="summary-bar" style={{ marginBottom: 16 }}>
      <div className="summary-bar-item">
        <span className="summary-bar-label">Transactions</span>
        <span className="summary-bar-value">{stats.count}</span>
      </div>
      <div className="summary-bar-item">
        <span className="summary-bar-label">Gross</span>
        <span className="summary-bar-value">{formatCurrency(stats.grossTotal)}</span>
      </div>
      {stats.totalRepaid > 0 && (
        <div className="summary-bar-item">
          <span className="summary-bar-label">Repaid</span>
          <span className="summary-bar-value" style={{ color: "var(--green)" }}>-{formatCurrency(stats.totalRepaid)}</span>
        </div>
      )}
      <div className="summary-bar-item summary-bar-highlight">
        <span className="summary-bar-label">Net Spending</span>
        <span className="summary-bar-value">{formatCurrency(stats.total)}</span>
      </div>
      <div className="summary-bar-item">
        <span className="summary-bar-label">Largest</span>
        <span className="summary-bar-value">{formatCurrency(stats.largest)}</span>
      </div>
      <div className="summary-bar-item">
        <span className="summary-bar-label">Average</span>
        <span className="summary-bar-value">{formatCurrency(stats.avg)}</span>
      </div>
    </div>
  );
}
