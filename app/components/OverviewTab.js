"use client";
import { useMemo, useState, useCallback, useEffect } from "react";
import { getCatColor, formatCurrency, formatMonthLabel, MONTHS, getNetAmount, getPrevMonths } from "../lib/constants";
import EditableCell from "./EditableCell";
import AddExpenseModal from "./AddExpenseModal";
import SplitModal from "./SplitModal";
import UndoToast from "./UndoToast";
import SummaryPanel from "./SummaryPanel";
import EmptyState from "./EmptyState";

function StatCard({ label, value, sub, accentColor }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accentColor ? { color: accentColor } : {}}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  if (total === 0) return null;
  let cumulative = 0;
  const size = 160;
  const cx = size / 2, cy = size / 2, r = 56, strokeW = 22;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="donut-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {data.filter((d) => d.amount > 0).map((d, i) => {
          const pct = d.amount / total;
          const offset = circumference * (1 - cumulative);
          cumulative += pct;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={getCatColor(d.category)}
              strokeWidth={strokeW}
              strokeDasharray={`${circumference * pct - 1.5} ${circumference * (1 - pct) + 1.5}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: "all 0.5s ease" }}
            />
          );
        })}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--text)">
          {formatCurrency(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
          total
        </text>
      </svg>
      <div className="donut-legend">
        {data.filter((d) => d.amount > 0).map((d, i) => (
          <div key={i} className="donut-legend-item">
            <div className="donut-dot" style={{ background: getCatColor(d.category) }} />
            <span style={{ color: "var(--text-secondary)", minWidth: 86 }}>{d.category}</span>
            <span style={{ color: "var(--text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(d.amount)}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 2 }}>
              {((d.amount / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBreakdown({ catTotals, total, monthData, prevCatTotals, budgets, byMonth, selectedMonth, sparkMonths }) {
  const [expanded, setExpanded] = useState(null);
  const max = Math.max(...catTotals.map((d) => d.amount), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {catTotals.map((d) => {
        const isOpen = expanded === d.category;
        const pct = total > 0 ? ((d.amount / total) * 100).toFixed(1) : "0";
        const prev = prevCatTotals[d.category] || 0;
        const delta = prev > 0 ? ((d.amount - prev) / prev * 100).toFixed(1) : null;
        const isUp = d.amount > prev;
        const budget = budgets?.[d.category];
        const budgetPct = budget ? Math.min((d.amount / budget) * 100, 100) : null;
        const budgetColor = budgetPct ? (budgetPct > 100 ? "var(--red)" : budgetPct > 80 ? "var(--amber)" : "var(--green)") : null;
        const transactions = monthData.filter((e) => e.category === d.category).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const sparkData = sparkMonths.map((m) =>
          (byMonth[m] || []).filter((e) => e.category === d.category).reduce((s, e) => s + getNetAmount(e), 0)
        );

        return (
          <div key={d.category}>
            <div
              className={`cat-bar-row${isOpen ? " cat-bar-open" : ""}`}
              onClick={() => setExpanded(isOpen ? null : d.category)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setExpanded(isOpen ? null : d.category)}
              aria-expanded={isOpen}
            >
              <span className="mom-bar-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: getCatColor(d.category), flexShrink: 0 }} />
                {d.category}
              </span>
              <div className="mom-bar-track">
                <div
                  className="mom-bar-fill"
                  style={{
                    width: `${(d.amount / max) * 100}%`,
                    background: getCatColor(d.category),
                    minWidth: d.amount > 0 ? 3 : 0,
                  }}
                />
                <span className="mom-bar-val">{formatCurrency(d.amount)}</span>
              </div>
              <span className={`chevron${isOpen ? " open" : ""}`} style={{ marginLeft: 4, fontSize: 10 }} aria-hidden="true">▼</span>
            </div>

            {isOpen && (
              <div className="cat-bar-detail">
                {/* Stats row */}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, fontSize: 11 }}>
                  <span style={{ color: "var(--text-muted)" }}>{pct}% of total</span>
                  {delta !== null && (
                    <span style={{ color: isUp ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
                      {isUp ? "↑" : "↓"} {Math.abs(Number(delta))}% vs last month
                    </span>
                  )}
                  {sparkData.length > 1 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      {sparkData.map((v, i) => {
                        const sparkMax = Math.max(...sparkData, 1);
                        return <span key={i} style={{ display: "inline-block", width: 4, height: Math.max(2, (v / sparkMax) * 18), background: getCatColor(d.category), borderRadius: 1, opacity: 0.4 + (i / sparkData.length) * 0.6 }} />;
                      })}
                    </span>
                  )}
                </div>

                {/* Budget bar */}
                {budget && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="budget-bar-track">
                      <div className="budget-bar-fill" style={{ width: `${budgetPct}%`, background: budgetColor }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, display: "flex", justifyContent: "space-between" }}>
                      <span>{formatCurrency(d.amount)} / {formatCurrency(budget)}</span>
                      <span>{budgetPct.toFixed(0)}% used</span>
                    </div>
                  </div>
                )}

                {/* Transactions */}
                {transactions.length > 0 ? (
                  <table className="tx-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Date</th>
                        <th style={{ textAlign: "left" }}>Vendor</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t, i) => (
                        <tr key={i}>
                          <td style={{ color: "var(--text-muted)" }}>{t.date}</td>
                          <td>{t.vendor || t.name}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>No transactions.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function downloadCSV(data) {
  const headers = ["Date", "Vendor", "Category", "Amount", "Repaid", "Net", "Notes"];
  const rows = data.map((e) => [
    e.date || "",
    (e.vendor || e.name || "").replace(/"/g, '""'),
    (e.category || "").replace(/"/g, '""'),
    (Number(e.amount) || 0).toFixed(2),
    (Number(e.repaid) || 0).toFixed(2),
    getNetAmount(e).toFixed(2),
    (e.notes || "").replace(/"/g, '""'),
  ]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => r.map((c) => `"${c}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "transactions.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function OverviewTab({
  monthData = [],
  byMonth = {},
  monthKeys = [],
  selectedMonth,
  expenses = [],
  insights = [],
  onTabChange,
  writeEnabled = false,
  onUpdate,
  onAdd,
  onDelete,
  searchRef,
  splits = [],
  onSplit,
  budgets = {},
}) {
  const total = useMemo(() => monthData.reduce((s, e) => s + getNetAmount(e), 0), [monthData]);
  const currentIdx = monthKeys.indexOf(selectedMonth);
  const prevMonth = currentIdx > 0 ? monthKeys[currentIdx - 1] : null;
  const prevData = prevMonth ? (byMonth[prevMonth] || []) : [];
  const prevTotal = prevData.reduce((s, e) => s + getNetAmount(e), 0);

  const uniqueDays = useMemo(() => new Set(monthData.map((e) => e.date)).size, [monthData]);
  const dailyAvg = uniqueDays > 0 ? total / uniqueDays : 0;

  const catTotals = useMemo(() => {
    const ct = {};
    monthData.forEach((e) => {
      ct[e.category] = (ct[e.category] || 0) + getNetAmount(e);
    });
    return Object.entries(ct).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [monthData]);

  const prevCatTotals = useMemo(() => {
    const ct = {};
    prevData.forEach((e) => { ct[e.category] = (ct[e.category] || 0) + getNetAmount(e); });
    return ct;
  }, [prevData]);

  const sparkMonths = useMemo(() => {
    if (!selectedMonth) return [];
    const priorM = getPrevMonths(selectedMonth, 5);
    return [selectedMonth, ...priorM].reverse().filter((m) => byMonth[m]);
  }, [selectedMonth, byMonth]);

  const vendorTotals = useMemo(() => {
    const vt = {};
    monthData.forEach((e) => {
      const v = e.vendor || e.name;
      if (v) vt[v] = (vt[v] || 0) + getNetAmount(e);
    });
    return Object.entries(vt).sort((a, b) => b[1] - a[1]);
  }, [monthData]);

  const topVendor = vendorTotals[0];
  const topCat = catTotals[0];

  const diff = total - prevTotal;
  const pct = prevTotal > 0 ? ((diff / prevTotal) * 100).toFixed(1) : null;
  const isUp = diff > 0;

  const selectedLabel = formatMonthLabel(selectedMonth, false);
  const prevLabel = formatMonthLabel(prevMonth, false);

  const warnings = insights.filter((i) => i.severity === "warning" || i.severity === "approaching");
  const topWarning = warnings[0];

  // ── Transaction table state ──────────────────────────────
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [splitExpense, setSplitExpense] = useState(null);
  const [undoAction, setUndoAction] = useState(null);

  useEffect(() => {
    if (searchRef && typeof searchRef === "object") {
      searchRef.current = document.getElementById("tx-search");
    }
  }, [searchRef]);

  const categories = ["All", ...Array.from(new Set(monthData.map((e) => e.category))).sort()];
  const allCategories = useMemo(() => Array.from(new Set(expenses.map((e) => e.category).filter(Boolean))).sort(), [expenses]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "amount" ? "desc" : "asc"); }
  };

  const filtered = monthData
    .filter((e) => filterCat === "All" || e.category === filterCat)
    .filter((e) => {
      const q = search.toLowerCase();
      return !q || (e.vendor || "").toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || (e.notes || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = sortKey === "amount" ? getNetAmount(a) : sortKey === "vendor" ? (a.vendor || a.name || "") : (a.date || "");
      const bv = sortKey === "amount" ? getNetAmount(b) : sortKey === "vendor" ? (b.vendor || b.name || "") : (b.date || "");
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const handleCellSave = useCallback(async (expense, field, newValue) => {
    const oldValue = expense[field];
    await onUpdate?.(expense.id, { [field]: newValue });
    setUndoAction({ message: `Updated ${field}`, undo: () => onUpdate?.(expense.id, { [field]: oldValue }) });
  }, [onUpdate]);

  const handleDelete = useCallback(async (expense) => {
    if (!confirm(`Delete "${expense.vendor || expense.name}"?`)) return;
    await onDelete?.(expense.id);
    setUndoAction({
      message: "Expense deleted",
      undo: () => onAdd?.({ date: expense.date, vendor: expense.vendor, name: expense.name, category: expense.category, amount: expense.amount, repaid: expense.repaid, notes: expense.notes }),
    });
  }, [onDelete, onAdd]);

  const txCols = [
    ...(writeEnabled ? [{ key: "_delete", label: "" }] : []),
    { key: "vendor", label: "Vendor" },
    { key: "date", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "category", label: "Category" },
    { key: "repaid", label: "Settled" },
    { key: "notes", label: "Notes" },
    ...(writeEnabled ? [{ key: "_split", label: "" }] : []),
  ];

  if (monthData.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title="No expenses this month"
        message="Select a different month or add expenses to your Google Sheet."
      />
    );
  }

  return (
    <div>
      {/* Warning banner */}
      {topWarning && (
        <div className="warning-banner" role="alert">
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
          <div>
            <strong>{topWarning.title}</strong>
            <div style={{ fontSize: 13, marginTop: 2 }}>{topWarning.body}</div>
          </div>
          <button
            onClick={() => onTabChange(3)}
            style={{ marginLeft: "auto", flexShrink: 0, background: "none", border: "1px solid var(--red)", borderRadius: "var(--radius-sm)", color: "var(--red)", padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            aria-label="View all insights"
          >
            View all →
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <StatCard label={`${selectedLabel} total`} value={formatCurrency(total)} sub={`${monthData.length} transactions`} />
        <StatCard
          label={prevLabel ? `vs ${prevLabel}` : "Month change"}
          value={pct !== null ? `${isUp ? "+" : ""}${pct}%` : "—"}
          sub={pct !== null ? `${formatCurrency(Math.abs(diff))} ${isUp ? "more" : "less"}` : "No prior data"}
          accentColor={pct !== null ? (isUp ? "var(--red)" : "var(--green)") : undefined}
        />
        <StatCard label="Daily average" value={formatCurrency(dailyAvg)} sub={`across ${uniqueDays} day${uniqueDays !== 1 ? "s" : ""}`} />
        {topVendor ? (
          <StatCard label="Top vendor" value={topVendor[0]} sub={formatCurrency(topVendor[1])} />
        ) : topCat ? (
          <StatCard label="Top category" value={topCat.category} sub={formatCurrency(topCat.amount)} />
        ) : null}
      </div>

      {/* Charts row */}
      <div className="charts-row" style={{ marginBottom: 16 }}>
        <div className="card">
          <p className="section-label">By category</p>
          <DonutChart data={catTotals} />
        </div>
        <div className="card">
          <p className="section-label">Category breakdown</p>
          <CategoryBreakdown
            catTotals={catTotals}
            total={total}
            monthData={monthData}
            prevCatTotals={prevCatTotals}
            budgets={budgets}
            byMonth={byMonth}
            selectedMonth={selectedMonth}
            sparkMonths={sparkMonths}
          />
        </div>
      </div>

      {/* ── Summary ── */}
      <SummaryPanel monthData={monthData} />

      {/* ── Full Transactions Table ── */}
      <div>
        <div className="card">
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <input
              id="tx-search"
              type="search"
              placeholder="Search vendor, category, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
              style={{ flex: 1, minWidth: 160 }}
              aria-label="Search transactions"
            />
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="filter-select" aria-label="Filter by category">
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            {(search || filterCat !== "All") && (
              <button onClick={() => { setSearch(""); setFilterCat("All"); }} className="btn-ghost" aria-label="Clear filters">Clear</button>
            )}
            {writeEnabled && (
              <button onClick={() => setShowAddModal(true)} className="btn-primary" style={{ padding: "7px 14px", fontSize: 13 }}>+ Add Expense</button>
            )}
            <button onClick={() => downloadCSV(filtered)} className="csv-download-btn" aria-label="Download CSV">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              CSV
            </button>
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }} aria-live="polite">
              {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="tx-table" aria-label="Transactions">
              <thead>
                <tr>
                  {txCols.map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={key !== "_delete" ? () => handleSort(key) : undefined}
                      className={sortKey === key ? "active-sort" : ""}
                      style={{
                        textAlign: key === "amount" || key === "repaid" ? "right" : "left",
                        width: key === "_delete" ? 40 : key === "notes" ? "20%" : undefined,
                        cursor: key === "_delete" ? "default" : "pointer",
                      }}
                      aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      {label} {key !== "_delete" && (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={txCols.length} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No transactions match your filter.</td></tr>
                ) : (
                  filtered.map((e, i) => (
                    <tr key={e.id || i}>
                      {writeEnabled && (
                        <td style={{ width: 40, textAlign: "center" }}>
                          <button onClick={() => handleDelete(e)} className="delete-row-btn" aria-label={`Delete ${e.vendor || e.name}`} title="Delete">×</button>
                        </td>
                      )}
                      <td style={{ fontWeight: 500 }}>
                        <EditableCell value={e.vendor || e.name} field="vendor" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>
                        <EditableCell value={e.date} field="date" type="date" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {(() => {
                          const hasSplits = splits.some((s) => s.expenseId === e.id && s.status !== "forgiven");
                          if (hasSplits) {
                            return (
                              <>
                                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--green)", display: "block", textAlign: "right" }}>
                                  {formatCurrency(e.netAmount ?? e.amount)}
                                </span>
                                <span style={{ fontSize: 10, opacity: 0.5, display: "block", textAlign: "right" }}>
                                  <EditableCell value={e.amount} field="amount" type="number" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                                </span>
                              </>
                            );
                          }
                          return <EditableCell value={e.amount} field="amount" type="number" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />;
                        })()}
                      </td>
                      <td>
                        <span className="cat-badge" style={{ background: getCatColor(e.category) + "18", color: getCatColor(e.category) }}>
                          <EditableCell value={e.category} field="category" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {(() => {
                          const expSplits = splits.filter((s) => s.expenseId === e.id);
                          const totalRepaid = expSplits.reduce((s, sp) => s + sp.repaid, 0);
                          const totalForgiven = expSplits.filter((s) => s.status === "forgiven").reduce((s, sp) => s + (sp.share - sp.repaid), 0);
                          const total = totalRepaid + totalForgiven;
                          if (total > 0 || expSplits.length > 0) {
                            return (
                              <span style={{ color: "var(--green)", fontWeight: 600 }}>
                                {formatCurrency(total)}
                              </span>
                            );
                          }
                          return <span style={{ color: "var(--text-muted)" }}>—</span>;
                        })()}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <EditableCell value={e.notes} field="notes" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                      {writeEnabled && (
                        <td style={{ textAlign: "center", width: 50 }}>
                          {(() => {
                            const expSplits = splits.filter((s) => s.expenseId === e.id);
                            return (
                              <button
                                className="split-btn"
                                onClick={() => setSplitExpense(e)}
                                title={expSplits.length > 0 ? `${expSplits.length} splits` : "Split this expense"}
                              >
                                {expSplits.length > 0 ? `👥${expSplits.length}` : "✂️"}
                              </button>
                            );
                          })()}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showAddModal && (
          <AddExpenseModal
            categories={allCategories}
            onAdd={(data) => onAdd?.(data)}
            onClose={() => setShowAddModal(false)}
          />
        )}

        {splitExpense && (
          <SplitModal
            expense={splitExpense}
            existingSplits={splits.filter((s) => s.expenseId === splitExpense.id)}
            onSplit={onSplit}
            onClose={() => setSplitExpense(null)}
          />
        )}

        {undoAction && (
          <UndoToast
            key={Date.now()}
            message={undoAction.message}
            onUndo={() => { undoAction.undo(); setUndoAction(null); }}
            onExpire={() => setUndoAction(null)}
          />
        )}
      </div>
    </div>
  );
}
