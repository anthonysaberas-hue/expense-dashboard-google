"use client";
import { useState, useMemo, useRef } from "react";
import { formatCurrency } from "../lib/constants";
import { safeGet, safeSet } from "../lib/storage";

function getKnownPeople() {
  return safeGet("known_people", []);
}

function addKnownPerson(name) {
  const people = getKnownPeople();
  if (!people.includes(name)) {
    safeSet("known_people", [...people, name]);
  }
}

export default function SplitModal({ expense, existingSplits = [], onSplit, onSplitMonths, onClose }) {
  const [tab, setTab] = useState("people"); // "months" | "people"
  // People split state
  const [rows, setRows] = useState([{ person: "", share: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [focusedRow, setFocusedRow] = useState(-1);
  const inputRefs = useRef([]);
  // Month split state
  const [monthCount, setMonthCount] = useState("2");

  const knownPeople = useMemo(() => getKnownPeople(), []);
  const alreadySplit = existingSplits.reduce((s, sp) => s + sp.share, 0);
  const remaining = expense.amount - alreadySplit;

  const addRow = () => setRows((r) => [...r, { person: "", share: "" }]);
  const removeRow = (idx) => setRows((r) => r.filter((_, i) => i !== idx));
  const updateRow = (idx, field, value) => {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
    setError("");
    if (field === "person" && value.length > 0) {
      setSuggestions(knownPeople.filter((p) => p.toLowerCase().startsWith(value.toLowerCase())));
      setFocusedRow(idx);
    } else {
      setSuggestions([]);
      setFocusedRow(-1);
    }
  };

  const selectSuggestion = (idx, name) => {
    updateRow(idx, "person", name);
    setSuggestions([]);
    setFocusedRow(-1);
  };

  const totalShare = rows.reduce((s, r) => s + (parseFloat(r.share) || 0), 0);

  // People split submit
  const handlePeopleSubmit = async (e) => {
    e.preventDefault();
    const valid = rows.filter((r) => r.person && r.share);
    if (valid.length === 0) return setError("Add at least one person and amount");
    if (totalShare + alreadySplit > expense.amount) return setError("Total splits exceed expense amount");

    setSaving(true);
    try {
      for (const row of valid) {
        addKnownPerson(row.person.trim());
        await onSplit(expense.id, row.person.trim(), parseFloat(row.share));
      }
      onClose();
    } catch (err) {
      setError(err.message || "Split failed");
    } finally {
      setSaving(false);
    }
  };

  // Month split submit
  const mc = Math.max(2, parseInt(monthCount) || 2);
  const perMonth = Math.round((expense.amount / mc) * 100) / 100;

  const handleMonthSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSplitMonths(expense, mc);
      onClose();
    } catch (err) {
      setError(err.message || "Month split failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Split expense">
        <div className="modal-header">
          <h2 className="modal-title">Split Expense</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {/* Expense context */}
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "10px 14px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{expense.vendor || expense.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {expense.date} · {formatCurrency(expense.amount)}
              {alreadySplit > 0 && <span> · Already split with people: {formatCurrency(alreadySplit)}</span>}
            </div>
          </div>

          {/* Tab toggle */}
          <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: "2px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setTab("months")}
              style={{
                flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "none", border: "none", fontFamily: "inherit",
                color: tab === "months" ? "var(--green)" : "var(--text-muted)",
                borderBottom: tab === "months" ? "2px solid var(--green)" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              Split across months
            </button>
            <button
              type="button"
              onClick={() => setTab("people")}
              style={{
                flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "none", border: "none", fontFamily: "inherit",
                color: tab === "people" ? "var(--green)" : "var(--text-muted)",
                borderBottom: tab === "people" ? "2px solid var(--green)" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              Split with people
            </button>
          </div>

          {/* Month split tab */}
          {tab === "months" && (
            <form onSubmit={handleMonthSubmit}>
              <div className="modal-field">
                <label className="modal-label">Number of months</label>
                <select
                  value={monthCount}
                  onChange={(e) => setMonthCount(e.target.value)}
                  className="filter-select"
                  style={{ width: "100%" }}
                >
                  <option value="2">2 months</option>
                  <option value="3">3 months</option>
                  <option value="4">4 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </select>
              </div>
              <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, marginBottom: 12, padding: "8px 12px", background: "var(--green-light)", borderRadius: 6 }}>
                {formatCurrency(expense.amount)} ÷ {mc} = {formatCurrency(perMonth)}/month
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                This will replace the original {formatCurrency(expense.amount)} expense with {mc} separate {formatCurrency(perMonth)} expenses starting from {expense.date?.substring(0, 7)}.
              </div>
              {error && <p className="modal-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Splitting…" : `Split into ${mc} months`}
                </button>
              </div>
            </form>
          )}

          {/* People split tab */}
          {tab === "people" && (
            <form onSubmit={handlePeopleSubmit}>
              <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, marginBottom: 10 }}>
                Available to split: {formatCurrency(remaining)}
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="split-row">
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      placeholder="Person name"
                      value={row.person}
                      onChange={(e) => updateRow(idx, "person", e.target.value)}
                      onFocus={() => {
                        if (knownPeople.length > 0 && row.person === "") {
                          setSuggestions(knownPeople);
                          setFocusedRow(idx);
                        }
                      }}
                      onBlur={() => setTimeout(() => { setSuggestions([]); setFocusedRow(-1); }, 150)}
                      className="search-input"
                      style={{ width: "100%" }}
                      autoFocus={idx === 0}
                    />
                    {focusedRow === idx && suggestions.length > 0 && (
                      <div className="split-suggestions">
                        {suggestions.map((s) => (
                          <button key={s} type="button" className="split-suggestion-item" onMouseDown={() => selectSuggestion(idx, s)}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={row.share}
                    onChange={(e) => updateRow(idx, "share", e.target.value)}
                    className="search-input"
                    style={{ width: 100 }}
                  />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(idx)} className="delete-row-btn" aria-label="Remove">×</button>
                  )}
                </div>
              ))}

              <button type="button" onClick={addRow} className="btn-ghost" style={{ fontSize: 12, marginTop: 8, width: "100%" }}>
                + Add another person
              </button>

              {totalShare > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, textAlign: "right" }}>
                  Your share: {formatCurrency(expense.amount - alreadySplit - totalShare)}
                </div>
              )}

              {error && <p className="modal-error" style={{ marginTop: 8 }}>{error}</p>}

              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Splitting…" : "Split"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
