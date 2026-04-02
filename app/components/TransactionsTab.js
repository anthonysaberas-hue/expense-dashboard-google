"use client";
import { useState, useEffect, useCallback } from "react";
import { getCatColor, formatCurrency, getNetAmount } from "../lib/constants";
import EditableCell from "./EditableCell";
import AddExpenseModal from "./AddExpenseModal";
import UndoToast from "./UndoToast";
import SummaryPanel from "./SummaryPanel";
import EmptyState from "./EmptyState";

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

export default function TransactionsTab({
  monthData = [],
  searchRef,
  writeEnabled = false,
  onUpdate,
  onAdd,
  onDelete,
}) {
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
    setUndoAction({
      message: `Updated ${field}`,
      undo: () => onUpdate?.(expense.id, { [field]: oldValue }),
    });
  }, [onUpdate]);

  const handleDelete = useCallback(async (expense) => {
    if (!confirm(`Delete "${expense.vendor || expense.name}"?`)) return;
    await onDelete?.(expense.id);
    setUndoAction({
      message: "Expense deleted",
      undo: () => onAdd?.({
        date: expense.date,
        vendor: expense.vendor,
        name: expense.name,
        category: expense.category,
        amount: expense.amount,
        repaid: expense.repaid,
        notes: expense.notes,
      }),
    });
  }, [onDelete, onAdd]);

  const handleAdd = useCallback(async (data) => {
    await onAdd?.(data);
  }, [onAdd]);

  const cols = [
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
        icon="📋"
        title="No transactions this month"
        message="Select a month with expenses to view transactions."
      />
    );
  }

  return (
    <div className="transactions-layout">
      <div className="card" style={{ flex: 1, minWidth: 0 }}>
        {/* Controls */}
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
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="filter-select"
            aria-label="Filter by category"
          >
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          {(search || filterCat !== "All") && (
            <button onClick={() => { setSearch(""); setFilterCat("All"); }} className="btn-ghost" aria-label="Clear filters">Clear</button>
          )}
          {writeEnabled && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
              style={{ padding: "7px 14px", fontSize: 13 }}
            >
              + Add Expense
            </button>
          )}
          <button onClick={() => downloadCSV(filtered)} className="csv-download-btn" aria-label="Download CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }} aria-live="polite">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table className="tx-table" aria-label="Transactions">
            <thead>
              <tr>
                {cols.map(({ key, label }) => (
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
                <tr>
                  <td colSpan={cols.length} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    No transactions match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((e, i) => (
                  <tr key={e.id || i}>
                    {writeEnabled && (
                      <td style={{ width: 40, textAlign: "center" }}>
                        <button
                          onClick={() => handleDelete(e)}
                          className="delete-row-btn"
                          aria-label={`Delete ${e.vendor || e.name}`}
                          title="Delete"
                        >
                          ×
                        </button>
                      </td>
                    )}
                    <td style={{ color: "var(--text-muted)" }}>
                      <EditableCell
                        value={e.date}
                        field="date"
                        type="date"
                        onSave={(f, v) => handleCellSave(e, f, v)}
                        disabled={!writeEnabled}
                      />
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      <EditableCell
                        value={e.vendor || e.name}
                        field="vendor"
                        onSave={(f, v) => handleCellSave(e, f, v)}
                        disabled={!writeEnabled}
                      />
                    </td>
                    <td>
                      <span className="cat-badge" style={{ background: getCatColor(e.category) + "18", color: getCatColor(e.category) }}>
                        <EditableCell
                          value={e.category}
                          field="category"
                          onSave={(f, v) => handleCellSave(e, f, v)}
                          disabled={!writeEnabled}
                        />
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      <EditableCell
                        value={e.amount}
                        field="amount"
                        type="number"
                        onSave={(f, v) => handleCellSave(e, f, v)}
                        disabled={!writeEnabled}
                      />
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: e.repaid > 0 ? "var(--green)" : "var(--text-muted)" }}>
                      <EditableCell
                        value={e.repaid || 0}
                        field="repaid"
                        type="number"
                        onSave={(f, v) => handleCellSave(e, f, v)}
                        disabled={!writeEnabled}
                      />
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <EditableCell
                        value={e.notes}
                        field="notes"
                        onSave={(f, v) => handleCellSave(e, f, v)}
                        disabled={!writeEnabled}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SummaryPanel monthData={monthData} />

      {/* Add Expense Modal */}
      {showAddModal && (
        <AddExpenseModal
          categories={categories.filter((c) => c !== "All")}
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Undo Toast */}
      {undoAction && (
        <UndoToast
          key={Date.now()}
          message={undoAction.message}
          onUndo={() => { undoAction.undo(); setUndoAction(null); }}
          onExpire={() => setUndoAction(null)}
        />
      )}
    </div>
  );
}
