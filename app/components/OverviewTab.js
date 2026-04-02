"use client";
import { useMemo, useState, useCallback, useEffect } from "react";
import { getCatColor, formatCurrency, formatMonthLabel, MONTHS, getNetAmount } from "../lib/constants";
import EditableCell from "./EditableCell";
import AddExpenseModal from "./AddExpenseModal";
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

function BarChart({ data, labelKey, valueKey, colorFn }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {data.map((d, i) => (
        <div key={i} className="mom-bar-row">
          <span className="mom-bar-label">{d[labelKey]}</span>
          <div className="mom-bar-track">
            <div
              className="mom-bar-fill"
              style={{
                width: `${(d[valueKey] / max) * 100}%`,
                background: colorFn ? colorFn(d) : "var(--green)",
                minWidth: d[valueKey] > 0 ? 3 : 0,
              }}
            />
            <span className="mom-bar-val">{formatCurrency(d[valueKey])}</span>
          </div>
        </div>
      ))}
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
  const [undoAction, setUndoAction] = useState(null);

  useEffect(() => {
    if (searchRef && typeof searchRef === "object") {
      searchRef.current = document.getElementById("tx-search");
    }
  }, [searchRef]);

  const categories = ["All", ...Array.from(new Set(monthData.map((e) => e.category))).sort()];

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
    { key: "date", label: "Date" },
    { key: "vendor", label: "Vendor" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount" },
    { key: "repaid", label: "Repaid" },
    { key: "notes", label: "Notes" },
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
          <BarChart data={catTotals} labelKey="category" valueKey="amount" colorFn={(d) => getCatColor(d.category)} />
        </div>
      </div>

      {/* ── Full Transactions Table + Summary ── */}
      <div className="transactions-layout">
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
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
                      <td style={{ color: "var(--text-muted)" }}>
                        <EditableCell value={e.date} field="date" type="date" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        <EditableCell value={e.vendor || e.name} field="vendor" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                      <td>
                        <span className="cat-badge" style={{ background: getCatColor(e.category) + "18", color: getCatColor(e.category) }}>
                          <EditableCell value={e.category} field="category" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        <EditableCell value={e.amount} field="amount" type="number" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: e.repaid > 0 ? "var(--green)" : "var(--text-muted)" }}>
                        <EditableCell value={e.repaid || 0} field="repaid" type="number" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <EditableCell value={e.notes} field="notes" onSave={(f, v) => handleCellSave(e, f, v)} disabled={!writeEnabled} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <SummaryPanel monthData={monthData} />

        {showAddModal && (
          <AddExpenseModal
            categories={categories.filter((c) => c !== "All")}
            onAdd={(data) => onAdd?.(data)}
            onClose={() => setShowAddModal(false)}
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
