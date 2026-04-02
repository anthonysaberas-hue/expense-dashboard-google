"use client";
import { useMemo } from "react";
import { formatCurrency, getNetAmount } from "../lib/constants";

export default function SummaryPanel({ monthData = [] }) {
  const stats = useMemo(() => {
    if (monthData.length === 0) return null;
    const grossTotal = monthData.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const netTotal = monthData.reduce((s, e) => s + getNetAmount(e), 0);
    const deductions = grossTotal - netTotal; // splits + repaid combined
    const netAmounts = monthData.map(getNetAmount);
    const largest = Math.max(...netAmounts);
    const avg = netTotal / netAmounts.length;
    return { netTotal, grossTotal, deductions, largest, avg, count: netAmounts.length };
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
      {stats.deductions > 0 && (
        <div className="summary-bar-item">
          <span className="summary-bar-label">Splits</span>
          <span className="summary-bar-value" style={{ color: "var(--green)" }}>-{formatCurrency(stats.deductions)}</span>
        </div>
      )}
      <div className="summary-bar-item summary-bar-highlight">
        <span className="summary-bar-label">Net Spending</span>
        <span className="summary-bar-value">{formatCurrency(stats.netTotal)}</span>
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
