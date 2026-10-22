"use client";
import { useState, useMemo, useRef } from "react";
import { formatCurrency } from "../lib/constants";
import { getSetting, setSetting } from "../lib/settings";
import { toCents, fromCents, evenShare, shareFromPercent, percentOf, buildInstallments } from "../lib/money";

function getKnownPeople() {
  return getSetting("known_people");
}

function addKnownPerson(name) {
  const people = getKnownPeople();
  if (!people.includes(name)) {
    setSetting("known_people", [...people, name]);
  }
}

const emptyRow = () => ({ person: "", share: "", pct: "" });

export default function SplitModal({ expense, existingSplits = [], onSplit, onSplitMonths, onClose }) {
  const [tab, setTab] = useState("people"); // "months" | "people"
  // People split state — each row keeps both $ and %, whichever was typed drives the other
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [focusedRow, setFocusedRow] = useState(-1);
  const inputRefs = useRef([]);
  // Month split state
  const [monthCount, setMonthCount] = useState("2");

  const knownPeople = useMemo(() => getKnownPeople(), []);
  const total = expense.amount;
  const alreadySplitCents = existingSplits.reduce((s, sp) => s + toCents(sp.share), 0);
  const alreadySplit = fromCents(alreadySplitCents);
  const remaining = fromCents(toCents(total) - alreadySplitCents);

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (idx) => setRows((r) => r.filter((_, i) => i !== idx));

  const updateRow = (idx, field, value) => {
    setRows((r) => r.map((row, i) => {
      if (i !== idx) return row;
      if (field === "share") return { ...row, share: value, pct: value ? String(percentOf(total, parseFloat(value))) : "" };
      if (field === "pct") return { ...row, pct: value, share: value ? shareFromPercent(total, parseFloat(value)).toFixed(2) : "" };
      return { ...row, [field]: value };
    }));
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

  const totalShareCents = rows.reduce((s, r) => s + toCents(parseFloat(r.share) || 0), 0);
  const yourShare = fromCents(toCents(total) - alreadySplitCents - totalShareCents);

  // Tapping an empty % box fills 50% (or whatever is left, if less)
  const fillDefaultPercent = (idx, target) => {
    if (rows[idx].pct !== "") return;
    const othersCents = rows.reduce((s, r, i) => (i === idx ? s : s + toCents(parseFloat(r.share) || 0)), 0);
    const leftPct = percentOf(total, fromCents(toCents(total) - alreadySplitCents - othersCents));
    updateRow(idx, "pct", String(Math.max(0, Math.min(50, leftPct))));
    // Select it so typing replaces the 50
    requestAnimationFrame(() => { try { target.select(); } catch { /* not supported on this input */ } });
  };

  // Everyone listed (plus anyone already split, plus you) pays the same
  const evenPeople = rows.length + existingSplits.length;
  const splitEvenly = () => {
    const each = evenShare(total, evenPeople);
    setRows((r) => r.map((row) => ({ ...row, share: each.toFixed(2), pct: String(percentOf(total, each)) })));
    setError("");
  };

  // People split submit
  const handlePeopleSubmit = async (e) => {
    e.preventDefault();
    const valid = rows.filter((r) => r.person.trim() && parseFloat(r.share) > 0);
    if (valid.length === 0) return setError("Add at least one person and amount");
    if (alreadySplitCents + totalShareCents > toCents(total)) return setError("Total splits exceed expense amount");

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
  const installments = buildInstallments({ date: expense.date || "2000-01-01", amount: total }, mc);
  const perMonth = installments[0].amount;
  const lastMonth = installments.at(-1).amount;

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
              {expense.date} · {formatCurrency(total)}
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
                <input
                  type="number"
                  inputMode="numeric"
                  min="2"
                  max="24"
                  value={monthCount}
                  onChange={(e) => setMonthCount(e.target.value)}
                  className="search-input"
                  style={{ width: "100%" }}
                  autoFocus
                />
              </div>
              <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, marginBottom: 12, padding: "8px 12px", background: "var(--green-light)", borderRadius: 6 }}>
                {formatCurrency(total)} ÷ {mc} = {formatCurrency(perMonth)}/month
                {lastMonth !== perMonth && ` (last month ${formatCurrency(lastMonth)})`}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                This will replace the original {formatCurrency(total)} expense with {mc} separate monthly expenses starting from {expense.date?.substring(0, 7)}.
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
              <div className="split-quick">
                <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>
                  Available to split: {formatCurrency(remaining)}
                </span>
                <button type="button" onClick={splitEvenly} className="btn-ghost split-quick-btn">
                  {evenPeople === 1 ? "½ Split in half" : `Split evenly ÷${evenPeople + 1}`}
                </button>
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="split-row">
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      placeholder="Person name"
                      autoCapitalize="words"
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
                  <div className="split-row-amounts">
                    <label className="split-amount-field">
                      <span aria-hidden="true">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={row.share}
                        onChange={(e) => updateRow(idx, "share", e.target.value)}
                        aria-label={`Amount for ${row.person || `person ${idx + 1}`}`}
                      />
                    </label>
                    <label className="split-amount-field split-pct-field">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder="%"
                        value={row.pct}
                        onFocus={(e) => fillDefaultPercent(idx, e.target)}
                        onChange={(e) => updateRow(idx, "pct", e.target.value)}
                        aria-label={`Percent for ${row.person || `person ${idx + 1}`}`}
                      />
                      <span aria-hidden="true">%</span>
                    </label>
                    {rows.length > 1 && (
                      <button type="button" onClick={() => removeRow(idx)} className="delete-row-btn" aria-label="Remove">×</button>
                    )}
                  </div>
                </div>
              ))}

              <button type="button" onClick={addRow} className="btn-ghost" style={{ fontSize: 12, marginTop: 8, width: "100%" }}>
                + Add another person
              </button>

              {totalShareCents > 0 && (
                <div style={{ fontSize: 12, color: yourShare < 0 ? "var(--red)" : "var(--text-muted)", marginTop: 10, textAlign: "right" }}>
                  Your share: {formatCurrency(yourShare)} ({percentOf(total, yourShare)}%)
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
