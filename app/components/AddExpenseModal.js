"use client";
import { useState } from "react";

export default function AddExpenseModal({ categories = [], onAdd, onClose }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    vendor: "",
    name: "",
    category: categories[0] || "Uncategorized",
    amount: "",
    repaid: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date) return setError("Date is required");
    if (!form.amount || isNaN(Number(form.amount))) return setError("Valid amount is required");
    if (!form.vendor && !form.name) return setError("Vendor or name is required");

    setSaving(true);
    try {
      await onAdd({
        date: form.date,
        vendor: form.vendor || form.name,
        name: form.name || form.vendor,
        category: form.category,
        amount: parseFloat(form.amount),
        repaid: parseFloat(form.repaid) || 0,
        notes: form.notes,
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to add expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Add expense">
        <div className="modal-header">
          <h2 className="modal-title">Add Expense</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
              className="search-input"
              required
            />
          </div>
          <div className="modal-field">
            <label className="modal-label">Vendor *</label>
            <input
              type="text"
              value={form.vendor}
              onChange={(e) => handleChange("vendor", e.target.value)}
              className="search-input"
              placeholder="e.g. Uber, Trader Joe's"
              autoFocus
            />
          </div>
          <div className="modal-row">
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Amount *</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => handleChange("amount", e.target.value)}
                className="search-input"
                placeholder="0.00"
                required
              />
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Repaid</label>
              <input
                type="number"
                step="0.01"
                value={form.repaid}
                onChange={(e) => handleChange("repaid", e.target.value)}
                className="search-input"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="modal-field">
            <label className="modal-label">Category</label>
            <select
              value={form.category}
              onChange={(e) => handleChange("category", e.target.value)}
              className="filter-select"
              style={{ width: "100%" }}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option>Uncategorized</option>
            </select>
          </div>
          <div className="modal-field">
            <label className="modal-label">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="search-input"
              placeholder="e.g. Birthday dinner for Sarah"
            />
          </div>
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Adding…" : "Add Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
