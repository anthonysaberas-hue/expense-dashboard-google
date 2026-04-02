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
    <div className="card summary-panel">
      <p className="section-label" style={{ margin: "0 0 14px" }}>Summary</p>
      <div className="summary-row">
        <span className="summary-label">Total transactions</span>
        <span className="summary-value">{stats.count}</span>
      </div>
      <div className="summary-row">
        <span className="summary-label">Total amount</span>
        <span className="summary-value">{formatCurrency(stats.total)}</span>
      </div>
      <div className="summary-row">
        <span className="summary-label">Largest transaction</span>
        <span className="summary-value">{formatCurrency(stats.largest)}</span>
      </div>
      <div className="summary-row">
        <span className="summary-label">Average transaction</span>
        <span className="summary-value">{formatCurrency(stats.avg)}</span>
      </div>
      <div className="summary-divider" />
      <div className="summary-row">
        <span className="summary-label">Gross spending</span>
        <span className="summary-value">{formatCurrency(stats.grossTotal)}</span>
      </div>
      {stats.totalRepaid > 0 && (
        <div className="summary-row">
          <span className="summary-label">Repaid by others</span>
          <span className="summary-value" style={{ color: "var(--green)" }}>-{formatCurrency(stats.totalRepaid)}</span>
        </div>
      )}
      <div className="summary-row">
        <span className="summary-label">Net spending</span>
        <span className="summary-value-big">{formatCurrency(stats.total)}</span>
      </div>
    </div>
  );
}
