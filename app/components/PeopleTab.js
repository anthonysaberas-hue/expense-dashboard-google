"use client";
import { useState, useMemo, useCallback } from "react";
import { formatCurrency, formatMonthLabel } from "../lib/constants";
import EmptyState from "./EmptyState";
import NotesModal from "./NotesModal";
import { allocatePayment } from "../lib/allocatePayment";
import { summarizeSplits, splitStatus, toCents, fromCents } from "../lib/money";

export default function PeopleTab({
  expenses = [],
  splits = [],
  onRecordPayment,
  onForgive,
  onDeleteSplit,
  onSettleAll,
  onSettleMonth,
  onSettleAmount,
  writeEnabled = false,
  onUpdateExpense,
  photoCounts = {},
  onPhotosChanged,
}) {
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [paymentInputs, setPaymentInputs] = useState({});
  const [monthOverrides, setMonthOverrides] = useState({});
  const [notesExpenseId, setNotesExpenseId] = useState(null);
  const [lumpInputs, setLumpInputs] = useState({});
  const [lumpBusy, setLumpBusy] = useState(null);

  // Aggregate balances per person (rules live in lib/money.js)
  const people = useMemo(() => {
    const map = {};
    for (const sp of splits) {
      if (!sp.person) continue;
      (map[sp.person] ||= []).push(sp);
    }
    return Object.entries(map)
      .map(([person, personSplits]) => ({ person, splits: personSplits, ...summarizeSplits(personSplits) }))
      .sort((a, b) => b.balance - a.balance);
  }, [splits]);

  // Map expense IDs to expense data for context
  const expenseMap = useMemo(() => {
    const m = {};
    expenses.forEach((e) => { if (e.id) m[e.id] = e; });
    return m;
  }, [expenses]);

  // Group each person's splits by the expense's month (YYYY-MM), most recent first
  const peopleWithMonths = useMemo(() => {
    return people.map((p) => {
      const monthMap = {};
      for (const sp of p.splits) {
        const exp = expenseMap[sp.expenseId];
        const month = exp?.date ? exp.date.slice(0, 7) : "unknown";
        (monthMap[month] ||= { month, splits: [] }).splits.push(sp);
      }
      const months = Object.values(monthMap)
        .map((m) => ({ ...m, ...summarizeSplits(m.splits) }))
        .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
      return { ...p, months };
    });
  }, [people, expenseMap]);

  const totalOwed = people.reduce((s, p) => s + Math.max(0, p.balance), 0);

  // A month is expanded by default when it still has a balance owed; settled
  // months default to collapsed. Either can be toggled by clicking its header.
  const isMonthExpanded = useCallback((person, month, defaultBalance) => {
    const key = `${person}::${month}`;
    if (key in monthOverrides) return monthOverrides[key];
    return defaultBalance > 0;
  }, [monthOverrides]);

  const toggleMonth = useCallback((person, month, defaultBalance) => {
    const key = `${person}::${month}`;
    setMonthOverrides((prev) => ({
      ...prev,
      [key]: !isMonthExpanded(person, month, defaultBalance),
    }));
  }, [isMonthExpanded]);

  const handleRecordPayment = useCallback(async (person, splitId, amount) => {
    await onRecordPayment?.(splitId, amount);
    setPaymentInputs((prev) => ({ ...prev, [splitId]: "" }));
  }, [onRecordPayment]);

  const handleSettleAmount = useCallback(async (person, amount, plan) => {
    const settledCount = plan.updates.filter((u) => u.status === "settled").length;
    const partial = plan.updates.find((u) => u.status === "partial");
    let msg = `Apply ${formatCurrency(amount)} from ${person}, oldest first?

Fully settles ${settledCount} transaction${settledCount === 1 ? "" : "s"}.`;
    if (partial) {
      const exp = expenseMap[partial.split.expenseId];
      msg += `
Partially pays ${exp ? exp.vendor || exp.name : "a transaction"} (${formatCurrency(partial.repaid)} of ${formatCurrency(partial.split.share)}).`;
    }
    if (!confirm(msg)) return;
    setLumpBusy(person);
    try {
      await onSettleAmount?.(person, amount);
      setLumpInputs((prev) => ({ ...prev, [person]: "" }));
    } catch (err) {
      alert(err.message);
    } finally {
      setLumpBusy(null);
    }
  }, [onSettleAmount, expenseMap]);

  const handleForgive = useCallback(async (split) => {
    const remaining = fromCents(toCents(split.share) - toCents(split.repaid));
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
        {peopleWithMonths.map((p) => {
          const isExpanded = expandedPerson === p.person;
          const isSettled = p.balance <= 0;

          return (
            <div key={p.person} className="card" style={{ padding: 0 }}>
              {/* Header */}
              <div
                className="people-card-header"
                role="button"
                tabIndex={0}
                onClick={() => setExpandedPerson(isExpanded ? null : p.person)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedPerson(isExpanded ? null : p.person);
                  }
                }}
                aria-expanded={isExpanded}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="people-avatar">{p.person.charAt(0).toUpperCase()}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{p.person}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {writeEnabled && p.balance > 0 && (
                    <button
                      className="btn-ghost mobile-tap-target"
                      style={{ fontSize: 11, padding: "4px 10px", minHeight: 28 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Mark all of ${p.person}'s splits as settled (${formatCurrency(p.balance)})?`)) {
                          onSettleAll?.(p.person);
                        }
                      }}
                      title="Mark every outstanding split as fully paid"
                    >
                      Settle all
                    </button>
                  )}
                  {p.balance > 0 ? (
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--red)", fontVariantNumeric: "tabular-nums" }}>
                      owes {formatCurrency(p.balance)}
                    </span>
                  ) : p.balance < 0 ? (
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--green)", fontVariantNumeric: "tabular-nums" }}>
                      overpaid {formatCurrency(Math.abs(p.balance))}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>settled ✓</span>
                  )}
                  <span className={`chevron${isExpanded ? " open" : ""}`} aria-hidden="true">▼</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px" }}>
                  {/* Settle by amount received */}
                  {writeEnabled && p.balance > 0 && (() => {
                    const raw = lumpInputs[p.person] ?? "";
                    const amount = parseFloat(raw);
                    const valid = !isNaN(amount) && amount > 0;
                    const tooMuch = valid && Math.round(amount * 100) > Math.round(p.balance * 100);
                    const plan = valid && !tooMuch ? allocatePayment(splits, expenseMap, p.person, amount) : null;
                    const settledCount = plan ? plan.updates.filter((u) => u.status === "settled").length : 0;
                    const partial = plan?.updates.find((u) => u.status === "partial");
                    const partialExp = partial ? expenseMap[partial.split.expenseId] : null;
                    const busy = lumpBusy === p.person;
                    return (
                      <div style={{ marginBottom: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <label htmlFor={`lump-${p.person}`} style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                            Received
                          </label>
                          <input
                            id={`lump-${p.person}`}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={raw}
                            disabled={busy}
                            onChange={(e) => setLumpInputs((prev) => ({ ...prev, [p.person]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && plan && !busy) handleSettleAmount(p.person, amount, plan);
                            }}
                            className="search-input mobile-tap-target"
                            style={{ width: 110, minHeight: 28, padding: "2px 8px", fontSize: 12, textAlign: "right" }}
                          />
                          <button
                            className="btn-ghost mobile-tap-target"
                            style={{ fontSize: 11, padding: "4px 10px", minHeight: 28 }}
                            disabled={!plan || busy}
                            onClick={() => handleSettleAmount(p.person, amount, plan)}
                            title="Settle transactions oldest first up to this amount"
                          >
                            {busy ? "Applying…" : "Apply"}
                          </button>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            of {formatCurrency(p.balance)} owed · oldest first
                          </span>
                        </div>
                        {tooMuch && (
                          <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>
                            More than the {formatCurrency(p.balance)} owed.
                          </div>
                        )}
                        {plan && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                            Settles {settledCount} transaction{settledCount === 1 ? "" : "s"}
                            {partial && (
                              <> and partially pays <strong>{partialExp ? partialExp.vendor || partialExp.name : "one"}</strong> ({formatCurrency(partial.repaid)} of {formatCurrency(partial.split.share)}, {formatCurrency(partial.split.share - partial.repaid)} still owed)</>
                            )}
                            .
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Month groups */}
                  {p.months.map((mg) => {
                    const monthExpanded = isMonthExpanded(p.person, mg.month, mg.balance);
                    return (
                      <div key={mg.month} style={{ marginBottom: 10, border: "1px solid var(--border)", borderRadius: 8 }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleMonth(p.person, mg.month, mg.balance)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleMonth(p.person, mg.month, mg.balance);
                            }
                          }}
                          aria-expanded={monthExpanded}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 12px", cursor: "pointer", font: "inherit",
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>
                            {mg.month === "unknown" ? "No date" : formatMonthLabel(mg.month, false)}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {writeEnabled && mg.balance > 0 && (
                              <button
                                className="btn-ghost mobile-tap-target"
                                style={{ fontSize: 10, padding: "3px 8px", minHeight: 26 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Mark ${p.person}'s ${formatMonthLabel(mg.month, false)} splits as settled (${formatCurrency(mg.balance)})?`)) {
                                    onSettleMonth?.(p.person, mg.month);
                                  }
                                }}
                                title="Mark this month's outstanding splits as fully paid"
                              >
                                Settle this month
                              </button>
                            )}
                            <span style={{
                              fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                              color: mg.balance > 0 ? "var(--red)" : mg.balance < 0 ? "var(--green)" : "var(--text-muted)",
                            }}>
                              {mg.balance > 0 ? `owes ${formatCurrency(mg.balance)}` : mg.balance < 0 ? `overpaid ${formatCurrency(Math.abs(mg.balance))}` : "settled ✓"}
                            </span>
                            <span className={`chevron${monthExpanded ? " open" : ""}`} aria-hidden="true">▼</span>
                          </div>
                        </div>

                        {monthExpanded && (
                          <div style={{ overflowX: "auto", borderTop: "1px solid var(--border)" }}>
                          <table className="tx-table" style={{ fontSize: 12, minWidth: 500 }}>
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
                              {mg.splits.map((sp) => {
                                const exp = expenseMap[sp.expenseId];
                                const remaining = fromCents(toCents(sp.share) - toCents(sp.repaid));
                                return (
                                  <tr key={sp.splitId}>
                                    <td style={{ color: "var(--text-muted)" }}>{exp?.date || "—"}</td>
                                    <td style={{ fontWeight: 500, maxWidth: 160 }}>
                                      {exp ? (
                                        <span
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => setNotesExpenseId(sp.expenseId)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              setNotesExpenseId(sp.expenseId);
                                            }
                                          }}
                                          style={{ cursor: "pointer", display: "block" }}
                                          aria-label={`Open notes for ${exp.vendor || exp.name}`}
                                        >
                                          <span style={{ display: "block" }}>{exp.vendor || exp.name}</span>
                                          {(exp.notes || (photoCounts[sp.expenseId] || 0) > 0) && (
                                            <span style={{
                                              display: "flex", alignItems: "center", gap: 4, fontWeight: 400,
                                              fontSize: 10.5, color: "var(--text-muted)", marginTop: 1,
                                            }}>
                                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>
                                                {exp.notes}
                                              </span>
                                              {(photoCounts[sp.expenseId] || 0) > 0 && (
                                                <span style={{ flexShrink: 0 }}>📎{photoCounts[sp.expenseId]}</span>
                                              )}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        sp.expenseId
                                      )}
                                    </td>
                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(sp.share)}</td>
                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: sp.repaid > 0 ? "var(--green)" : "var(--text-muted)" }}>
                                      {writeEnabled ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={paymentInputs[sp.splitId] ?? sp.repaid}
                                          onChange={(e) => setPaymentInputs((prev) => ({ ...prev, [sp.splitId]: e.target.value }))}
                                          onBlur={() => {
                                            const val = parseFloat(paymentInputs[sp.splitId]);
                                            if (!isNaN(val) && val !== sp.repaid) {
                                              const amount = Math.max(val, 0);
                                              onRecordPayment?.(sp.splitId, amount, splitStatus(sp.share, amount));
                                            }
                                            setPaymentInputs((prev) => { const n = { ...prev }; delete n[sp.splitId]; return n; });
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") e.target.blur();
                                            if (e.key === "Escape") {
                                              setPaymentInputs((prev) => { const n = { ...prev }; delete n[sp.splitId]; return n; });
                                            }
                                          }}
                                          className="search-input mobile-tap-target"
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
                                          {/* Settle + Forgive: show when there's unpaid balance and not already forgiven */}
                                          {remaining > 0 && sp.status !== "forgiven" && (
                                            <>
                                              <button
                                                className="btn-ghost mobile-tap-target"
                                                style={{ fontSize: 10, padding: "3px 8px", minHeight: 28 }}
                                                onClick={() => onRecordPayment?.(sp.splitId, sp.share, "settled")}
                                                title="Mark fully paid"
                                              >
                                                Settle
                                              </button>
                                              <button
                                                className="btn-ghost mobile-tap-target"
                                                style={{ fontSize: 10, padding: "3px 8px", minHeight: 28, color: "var(--amber)" }}
                                                onClick={() => handleForgive(sp)}
                                                title="Forgive remaining"
                                              >
                                                Forgive
                                              </button>
                                            </>
                                          )}
                                          {/* Reset: show on ANY non-pending status (settled, partial, forgiven, overpaid) */}
                                          {sp.status !== "pending" && (
                                            <button
                                              className="btn-ghost mobile-tap-target"
                                              style={{ fontSize: 10, padding: "3px 8px", minHeight: 28, color: "var(--red)" }}
                                              onClick={() => onRecordPayment?.(sp.splitId, 0, "pending")}
                                              title="Reset to unpaid"
                                            >
                                              Reset
                                            </button>
                                          )}
                                          <button
                                            className="btn-ghost mobile-tap-target"
                                            style={{ fontSize: 10, padding: "3px 8px", minHeight: 28, color: "var(--red)", opacity: 0.6 }}
                                            onClick={() => {
                                              if (confirm(`Remove this split for ${sp.person}?`)) onDeleteSplit?.(sp.splitId);
                                            }}
                                            title="Delete this split entirely"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          </div>
                        )}
                      </div>
                    );
                  })}

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

      {notesExpenseId && expenseMap[notesExpenseId] && (
        <NotesModal
          expense={expenseMap[notesExpenseId]}
          writeEnabled={writeEnabled}
          onSave={onUpdateExpense}
          onClose={() => { setNotesExpenseId(null); onPhotosChanged?.(); }}
        />
      )}
    </div>
  );
}
