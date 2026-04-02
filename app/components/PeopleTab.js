"use client";
import { useState, useMemo, useCallback } from "react";
import { formatCurrency } from "../lib/constants";
import EmptyState from "./EmptyState";

export default function PeopleTab({
  expenses = [],
  splits = [],
  onRecordPayment,
  onForgive,
  writeEnabled = false,
}) {
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [paymentInputs, setPaymentInputs] = useState({});

  // Aggregate balances per person
  const people = useMemo(() => {
    const map = {};
    for (const sp of splits) {
      if (!sp.person) continue;
      if (!map[sp.person]) map[sp.person] = { person: sp.person, splits: [], totalShare: 0, totalRepaid: 0, totalForgiven: 0 };
      map[sp.person].splits.push(sp);
      map[sp.person].totalShare += sp.share;
      if (sp.status === "forgiven") {
        map[sp.person].totalForgiven += sp.share - sp.repaid;
      } else {
        map[sp.person].totalRepaid += sp.repaid;
      }
    }

    return Object.values(map)
      .map((p) => ({
        ...p,
        balance: p.totalShare - p.totalRepaid - p.totalForgiven,
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [splits]);

  // Map expense IDs to expense data for context
  const expenseMap = useMemo(() => {
    const m = {};
    expenses.forEach((e) => { if (e.id) m[e.id] = e; });
    return m;
  }, [expenses]);

  const totalOwed = people.reduce((s, p) => s + Math.max(0, p.balance), 0);

  const handleRecordPayment = useCallback(async (person, splitId, amount) => {
    await onRecordPayment?.(splitId, amount);
    setPaymentInputs((prev) => ({ ...prev, [splitId]: "" }));
  }, [onRecordPayment]);

  const handleForgive = useCallback(async (split) => {
    const remaining = split.share - split.repaid;
    if (remaining <= 0) return;
    const expense = expenseMap[split.expenseId];
    const expenseRef = expense ? `${expense.vendor || expense.name} (${expense.date})` : split.expenseId;
    if (!confirm(`Forgive ${formatCurrency(remaining)} for ${split.person}? This will create a "Relationship" expense.`)) return;
    await onForgive?.(split.splitId, remaining, split.person, expenseRef, split.repaid);
  }, [onForgive, expenseMap]);

  if (splits.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="No splits yet"
        message='Split an expense from the Overview tab to start tracking who owes you what.'
      />
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="kpi-grid" style={{ marginBottom: 16, gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="stat-card">
          <div className="stat-label">Total owed to you</div>
          <div className="stat-value" style={{ color: totalOwed > 0 ? "var(--red)" : "var(--green)" }}>
            {formatCurrency(totalOwed)}
          </div>
          <div className="stat-sub">across {people.filter((p) => p.balance > 0).length} people</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">People tracked</div>
          <div className="stat-value">{people.length}</div>
          <div className="stat-sub">{people.filter((p) => p.balance <= 0).length} settled</div>
        </div>
      </div>

      {/* Person cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {people.map((p) => {
          const isExpanded = expandedPerson === p.person;
          const isSettled = p.balance <= 0;

          return (
            <div key={p.person} className="card" style={{ padding: 0 }}>
              {/* Header */}
              <button
                className="people-card-header"
                onClick={() => setExpandedPerson(isExpanded ? null : p.person)}
                aria-expanded={isExpanded}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="people-avatar">{p.person.charAt(0).toUpperCase()}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{p.person}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isSettled ? (
                    <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>settled ✓</span>
                  ) : (
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--red)", fontVariantNumeric: "tabular-nums" }}>
                      owes {formatCurrency(p.balance)}
                    </span>
                  )}
                  <span className={`chevron${isExpanded ? " open" : ""}`} aria-hidden="true">▼</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px" }}>
                  {/* Split history table */}
                  <div style={{ overflowX: "auto" }}>
                  <table className="tx-table" style={{ fontSize: 12, marginBottom: 12, minWidth: 500 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Date</th>
                        <th style={{ textAlign: "left" }}>Expense</th>
                        <th style={{ textAlign: "right" }}>Share</th>
                        <th style={{ textAlign: "right" }}>Repaid</th>
                        <th style={{ textAlign: "left" }}>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.splits.map((sp) => {
                        const exp = expenseMap[sp.expenseId];
                        const remaining = sp.share - sp.repaid;
                        return (
                          <tr key={sp.splitId}>
                            <td style={{ color: "var(--text-muted)" }}>{exp?.date || "—"}</td>
                            <td style={{ fontWeight: 500 }}>{exp?.vendor || exp?.name || sp.expenseId}</td>
                            <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(sp.share)}</td>
                            <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: sp.repaid > 0 ? "var(--green)" : "var(--text-muted)" }}>
                              {writeEnabled && sp.status !== "forgiven" ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={sp.share}
                                  value={paymentInputs[sp.splitId] ?? sp.repaid}
                                  onChange={(e) => setPaymentInputs((prev) => ({ ...prev, [sp.splitId]: e.target.value }))}
                                  onBlur={() => {
                                    const val = parseFloat(paymentInputs[sp.splitId]);
                                    if (!isNaN(val) && val !== sp.repaid) {
                                      const capped = Math.min(Math.max(val, 0), sp.share);
                                      const newStatus = capped >= sp.share ? "settled" : capped > 0 ? "partial" : "pending";
                                      onRecordPayment?.(sp.splitId, capped, newStatus);
                                    }
                                    setPaymentInputs((prev) => { const n = { ...prev }; delete n[sp.splitId]; return n; });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.target.blur();
                                    if (e.key === "Escape") {
                                      setPaymentInputs((prev) => { const n = { ...prev }; delete n[sp.splitId]; return n; });
                                    }
                                  }}
                                  className="search-input"
                                  style={{ width: 70, minHeight: 28, padding: "2px 6px", fontSize: 11, textAlign: "right" }}
                                />
                              ) : (
                                formatCurrency(sp.repaid)
                              )}
                            </td>
                            <td>
                              <span className={`people-status people-status-${sp.status}`}>
                                {sp.status}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {writeEnabled && (
                                <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                                  {sp.status !== "forgiven" && remaining > 0 && (
                                    <>
                                      <button
                                        className="btn-ghost"
                                        style={{ fontSize: 10, padding: "3px 8px", minHeight: 28 }}
                                        onClick={() => onRecordPayment?.(sp.splitId, sp.share, "settled")}
                                        title="Mark fully paid"
                                      >
                                        Settle
                                      </button>
                                      <button
                                        className="btn-ghost"
                                        style={{ fontSize: 10, padding: "3px 8px", minHeight: 28, color: "var(--amber)" }}
                                        onClick={() => handleForgive(sp)}
                                        title="Forgive remaining"
                                      >
                                        Forgive
                                      </button>
                                    </>
                                  )}
                                  {(sp.status === "settled" || sp.status === "partial") && (
                                    <button
                                      className="btn-ghost"
                                      style={{ fontSize: 10, padding: "3px 8px", minHeight: 28, color: "var(--red)" }}
                                      onClick={() => onRecordPayment?.(sp.splitId, 0, "pending")}
                                      title="Reset to unpaid"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>

                  {/* Summary */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 8, flexWrap: "wrap", gap: 4 }}>
                    <span>Total shared: {formatCurrency(p.totalShare)}</span>
                    <span>Repaid: {formatCurrency(p.totalRepaid)}</span>
                    {p.totalForgiven > 0 && <span>Forgiven: {formatCurrency(p.totalForgiven)}</span>}
                    <span style={{ fontWeight: 600, color: p.balance > 0 ? "var(--red)" : "var(--green)" }}>
                      Balance: {formatCurrency(p.balance)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
