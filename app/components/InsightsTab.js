"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { formatCurrency, getCatColor, getNetAmount } from "../lib/constants";
import CategoryManager from "./CategoryManager";
import EmptyState from "./EmptyState";

const SEVERITY_LABEL = {
  warning: "Warning",
  approaching: "Approaching",
  info: "Info",
  pattern: "Pattern",
  nice: "Nice work",
};

function InsightCard({ insight, onDismiss }) {
  return (
    <div className="insight-card" role="article" aria-label={insight.title}>
      <div className={`insight-severity-bar severity-${insight.severity}`} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className={`insight-badge badge-${insight.severity}`}>
            {SEVERITY_LABEL[insight.severity] || insight.severity}
          </span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 3 }}>
          {insight.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {insight.body}
        </div>
      </div>
      <button
        className="insight-dismiss"
        onClick={() => onDismiss(insight.id)}
        aria-label={`Dismiss: ${insight.title}`}
        title="Dismiss this insight"
      >
        ×
      </button>
    </div>
  );
}

function BudgetRow({ cat, amount, limit, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(limit || ""));
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Focus trap: keep focus in input during edit
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter") {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) { onEdit(cat, num); }
      setEditing(false);
    } else if (e.key === "Escape") {
      setVal(String(limit || ""));
      setEditing(false);
    }
  }, [val, limit, cat, onEdit]);

  const pct = limit ? Math.min((amount / limit) * 100, 100) : 0;
  const barColor = pct > 100 ? "var(--red)" : pct > 80 ? "var(--amber)" : "var(--green)";

  return (
    <div className="budget-row">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: getCatColor(cat), display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{cat}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(amount)} /
          </span>
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="10"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                const num = parseFloat(val);
                if (!isNaN(num) && num > 0) onEdit(cat, num);
                setEditing(false);
              }}
              className="budget-inline-input"
              aria-label={`Budget limit for ${cat}`}
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              style={{
                background: "none", border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)", padding: "2px 8px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                color: limit ? "var(--text)" : "var(--text-muted)",
                fontFamily: "inherit", fontVariantNumeric: "tabular-nums",
                minHeight: 28,
              }}
              aria-label={`Edit budget for ${cat}. Current: ${limit ? formatCurrency(limit) : "not set"}`}
            >
              {limit ? formatCurrency(limit) : "Set limit"}
            </button>
          )}
          {limit && !editing && (
            <button
              onClick={() => onDelete(cat)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, padding: "2px 4px" }}
              aria-label={`Remove budget for ${cat}`}
              title="Remove budget"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {limit && (
        <>
          <div className="budget-bar-track">
            <div className="budget-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
            <span>{pct.toFixed(0)}% used</span>
            {amount <= limit && <span>{formatCurrency(limit - amount)} remaining</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function InsightsTab({
  insights = [],
  budgets = {},
  onSetBudget,
  onDeleteBudget,
  onDismiss,
  monthData = [],
  onBatchCategoryUpdate,
}) {
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newLimit, setNewLimit] = useState("");

  const catTotals = {};
  monthData.forEach((e) => {
    catTotals[e.category] = (catTotals[e.category] || 0) + getNetAmount(e);
  });

  const allCats = Array.from(new Set([...Object.keys(budgets), ...Object.keys(catTotals)])).sort();
  const warnings = insights.filter((i) => i.severity === "warning" || i.severity === "approaching");
  const otherInsights = insights.filter((i) => i.severity !== "warning" && i.severity !== "approaching");

  const handleAddBudget = () => {
    const limit = parseFloat(newLimit);
    if (newCat && !isNaN(limit) && limit > 0) {
      onSetBudget(newCat, limit);
      setNewCat("");
      setNewLimit("");
      setShowAddBudget(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Warning panel (when warnings exist) */}
      {warnings.length > 0 && (
        <section aria-label="Warnings">
          <p className="section-label">Warnings</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {warnings.map((ins) => (
              <InsightCard key={ins.id} insight={ins} onDismiss={onDismiss} />
            ))}
          </div>
        </section>
      )}

      {/* 2. Budget goals */}
      <section aria-label="Budget goals">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p className="section-label" style={{ margin: 0 }}>Budget goals</p>
          <button
            className="btn-ghost"
            onClick={() => setShowAddBudget((v) => !v)}
            aria-expanded={showAddBudget}
            style={{ fontSize: 12 }}
          >
            + Add budget
          </button>
        </div>

        {showAddBudget && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center", padding: "12px 14px", background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <select
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              className="filter-select"
              style={{ flex: 1, minWidth: 120 }}
              aria-label="Select category for budget"
            >
              <option value="">Category…</option>
              {Array.from(new Set(monthData.map((e) => e.category))).sort().map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="10"
              placeholder="Monthly limit ($)"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              className="search-input"
              style={{ width: 140 }}
              aria-label="Monthly budget limit"
              onKeyDown={(e) => e.key === "Enter" && handleAddBudget()}
            />
            <button className="btn-primary" onClick={handleAddBudget} style={{ padding: "8px 14px", fontSize: 13 }}>
              Save
            </button>
            <button className="btn-ghost" onClick={() => setShowAddBudget(false)}>Cancel</button>
          </div>
        )}

        {allCats.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="🎯"
              title="No budgets set yet"
              message='Click "Add budget" to set a monthly limit for any category.'
            />
          </div>
        ) : (
          <div className="card">
            {allCats.map((cat) => (
              <BudgetRow
                key={cat}
                cat={cat}
                amount={catTotals[cat] || 0}
                limit={budgets[cat] || null}
                onEdit={onSetBudget}
                onDelete={onDeleteBudget}
              />
            ))}
          </div>
        )}
      </section>

      {/* 2.5 Category Manager */}
      <CategoryManager monthData={monthData} onBatchUpdate={onBatchCategoryUpdate} />

      {/* 3. Smart observations (non-warnings) */}
      {otherInsights.length > 0 && (
        <section aria-label="Smart observations">
          <p className="section-label">Smart observations</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {otherInsights.map((ins) => (
              <InsightCard key={ins.id} insight={ins} onDismiss={onDismiss} />
            ))}
          </div>
        </section>
      )}

      {insights.length === 0 && allCats.length > 0 && (
        <div className="card">
          <EmptyState
            icon="✓"
            title="All clear"
            message="No unusual patterns detected this month. Keep it up!"
          />
        </div>
      )}
    </div>
  );
}
