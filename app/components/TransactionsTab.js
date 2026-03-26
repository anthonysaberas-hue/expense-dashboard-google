"use client";
import { useState, useEffect } from "react";
import { getCatColor, formatCurrency } from "../lib/constants";
import EmptyState from "./EmptyState";

export default function TransactionsTab({ monthData = [], searchRef }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");

  // Wire external ref for keyboard shortcut
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
      return !q || (e.vendor || "").toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = sortKey === "amount" ? (Number(a.amount) || 0) : sortKey === "vendor" ? (a.vendor || a.name || "") : (a.date || "");
      const bv = sortKey === "amount" ? (Number(b.amount) || 0) : sortKey === "vendor" ? (b.vendor || b.name || "") : (b.date || "");
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const cols = [
    { key: "date", label: "Date" },
    { key: "vendor", label: "Vendor" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount" },
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
    <div className="card">
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          id="tx-search"
          type="search"
          placeholder="Search vendor, name or category…"
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
          <button
            onClick={() => { setSearch(""); setFilterCat("All"); }}
            className="btn-ghost"
            aria-label="Clear filters"
          >
            Clear
          </button>
        )}
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
                  onClick={() => handleSort(key)}
                  className={sortKey === key ? "active-sort" : ""}
                  style={{ textAlign: key === "amount" ? "right" : "left" }}
                  aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No transactions match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-muted)" }}>{e.date}</td>
                  <td style={{ fontWeight: 500 }}>{e.vendor || e.name}</td>
                  <td>
                    <span
                      className="cat-badge"
                      style={{
                        background: getCatColor(e.category) + "18",
                        color: getCatColor(e.category),
                      }}
                    >
                      {e.category}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(e.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
