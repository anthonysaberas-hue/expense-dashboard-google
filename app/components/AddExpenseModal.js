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
    installments: "1",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const installmentCount = Math.max(1, parseInt(form.installments) || 1);
  const totalAmount = parseFloat(form.amount) || 0;
  const perMonth = installmentCount > 1 ? (totalAmount / installmentCount) : totalAmount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date) return setError("Date is required");
    if (!form.amount || isNaN(Number(form.amount))) return setError("Valid amount is required");
    if (!form.vendor && !form.name) return setError("Vendor or name is required");

    setSaving(true);
    try {
      if (installmentCount <= 1) {
        // Single expense
        await onAdd({
          date: form.date,
          vendor: form.vendor || form.name,
          name: form.name || form.vendor,
          category: form.category,
          amount: totalAmount,
          repaid: parseFloat(form.repaid) || 0,
          notes: form.notes,
        });
      } else {
        // Create N installments across consecutive months
        const [startYear, startMonth] = form.date.split("-").map(Number);
        for (let i = 0; i < installmentCount; i++) {
          const totalMonths = startMonth - 1 + i; // 0-based cumulative
          const y = startYear + Math.floor(totalMonths / 12);
          const m = totalMonths % 12;
          const installDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
          await onAdd({
            date: installDate,
            vendor: form.vendor || form.name,
            name: form.name || form.vendor,
            category: form.category,
            amount: Math.round(perMonth * 100) / 100,
            repaid: 0,
            notes: form.notes ? `${form.notes} (${i + 1}/${installmentCount})` : `Installment ${i + 1}/${installmentCount}`,
          });
        }
      }
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
              <label className="modal-label">Total Amount *</label>
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
              <label className="modal-label">Split across months</label>
              <select
                value={form.installments}
                onChange={(e) => handleChange("installments", e.target.value)}
                className="filter-select"
                style={{ width: "100%" }}
              >
                <option value="1">No split</option>
                <option value="2">2 months</option>
                <option value="3">3 months</option>
                <option value="4">4 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
              </select>
            </div>
          </div>
          {installmentCount > 1 && totalAmount > 0 && (
            <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, marginBottom: 10, padding: "8px 12px", background: "var(--green-light)", borderRadius: 6 }}>
              ${perMonth.toFixed(2)}/month × {installmentCount} months = ${totalAmount.toFixed(2)} total
            </div>
          )}
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
              {saving ? "Adding…" : installmentCount > 1 ? `Add ${installmentCount} installments` : "Add Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
