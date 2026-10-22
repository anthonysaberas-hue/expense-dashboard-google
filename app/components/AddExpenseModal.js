"use client";
import { useState, useRef, useEffect } from "react";
import CategoryPicker from "./CategoryPicker";
import VendorInput from "./VendorInput";
import { defaultCategoryFor } from "../lib/vendors";
import { buildInstallments, localDateString } from "../lib/money";
import { formatCurrency } from "../lib/constants";
import { FREQUENCIES } from "../lib/recurring";

// Quick add: amount (number keypad, focused) → vendor → category → Save.
// Date defaults to today; everything else is under "More options".
export default function AddExpenseModal({ categories = [], vendorIndex = [], onAdd, onAddRecurring, onClose }) {
  const today = localDateString();
  const yesterday = localDateString(new Date(Date.now() - 86400000));
  const [form, setForm] = useState({
    date: today,
    vendor: "",
    name: "",
    category: "Uncategorized",
    amount: "",
    repaid: "",
    notes: "",
    installments: "1",
    repeat: "",
  });
  const [showMore, setShowMore] = useState(false);
  // Once you pick a category yourself, the vendor's default stops overriding it
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [autoCategoryFrom, setAutoCategoryFrom] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const amountRef = useRef(null);
  const vendorRef = useRef(null);
  const categoryWrapRef = useRef(null);

  // Focus during the same task as the tap that opened us, so phones show the keypad
  useEffect(() => { amountRef.current?.focus(); }, []);

  useEffect(() => {
    // Escape inside the category picker just closes the picker
    const onKey = (e) => e.key === "Escape" && !e.target.closest?.('[role="combobox"]') && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const installmentCount = Math.max(1, parseInt(form.installments) || 1);
  const totalAmount = parseFloat(String(form.amount).replace(",", ".")) || 0;
  const installments = installmentCount > 1 && totalAmount > 0
    ? buildInstallments({ date: form.date, amount: totalAmount, notes: form.notes }, installmentCount)
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!(totalAmount > 0)) { setError("Enter an amount"); amountRef.current?.focus(); return; }
    if (!form.vendor.trim() && !form.name.trim()) { setError("Where did you spend it?"); vendorRef.current?.focus(); return; }
    if (!form.date) return setError("Pick a date");

    setSaving(true);
    try {
      const base = {
        vendor: (form.vendor || form.name).trim(),
        name: (form.name || form.vendor).trim(),
        category: form.category,
      };
      if (!installments) {
        await onAdd({ ...base, date: form.date, amount: totalAmount, repaid: parseFloat(form.repaid) || 0, notes: form.notes });
        if (form.repeat && onAddRecurring) {
          // This one is added now; the schedule picks up from the next charge
          await onAddRecurring({
            ...base,
            amount: totalAmount,
            frequency: form.repeat,
            startDate: form.date,
            lastCreated: form.date,
            notes: form.notes,
          });
        }
      } else {
        // N installments that add back up to the exact total, saved in one request
        await onAdd(installments.map((r) => ({ ...base, ...r, repaid: 0 })));
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to add expense");
    } finally {
      setSaving(false);
    }
  };

  const focusCategory = () => categoryWrapRef.current?.querySelector("input")?.focus();

  // Fill the category from the vendor's usual one (learned or pinned in Settings)
  const applyVendorDefault = (vendorName, category = defaultCategoryFor(vendorIndex, vendorName)) => {
    if (categoryTouched || !category) return;
    setForm((prev) => ({ ...prev, category }));
    setAutoCategoryFrom(vendorName);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card quick-add" role="dialog" aria-modal="true" aria-label="Add expense">
        <div className="modal-header">
          <h2 className="modal-title">Add expense</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label className="quick-add-amount">
            <span className="quick-add-currency" aria-hidden="true">$</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value.replace(/[^\d.,]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); vendorRef.current?.focus(); } }}
              aria-label="Amount"
            />
          </label>

          <div className="modal-field">
            <label className="modal-label" htmlFor="qa-vendor">Where</label>
            <VendorInput
              id="qa-vendor"
              ref={vendorRef}
              value={form.vendor}
              vendorIndex={vendorIndex}
              placeholder="e.g. Pharmaprix"
              onChange={(v) => {
                handleChange("vendor", v);
                if (categoryTouched) return;
                const cat = defaultCategoryFor(vendorIndex, v);
                if (cat) applyVendorDefault(v, cat);
                else if (autoCategoryFrom) { setForm((prev) => ({ ...prev, category: "Uncategorized" })); setAutoCategoryFrom(null); }
              }}
              onPick={(v) => { handleChange("vendor", v.name); applyVendorDefault(v.name, v.category); }}
              onEnter={() => { applyVendorDefault(form.vendor); focusCategory(); }}
            />
          </div>

          <div className="modal-field" ref={categoryWrapRef}>
            <span className="modal-label">Category</span>
            <CategoryPicker
              value={form.category}
              categories={categories}
              onSelect={(c) => { handleChange("category", c); setCategoryTouched(true); setAutoCategoryFrom(null); }}
              style={{ width: "100%" }}
            />
            {autoCategoryFrom && (
              <span className="quick-add-hint">Usual for {autoCategoryFrom} · tap to change</span>
            )}
          </div>

          <div className="modal-field">
            <span className="modal-label">When</span>
            <div className="quick-add-dates">
              {[[today, "Today"], [yesterday, "Yesterday"]].map(([d, label]) => (
                <button
                  key={label}
                  type="button"
                  className={`quick-add-chip${form.date === d ? " active" : ""}`}
                  onClick={() => handleChange("date", d)}
                  aria-pressed={form.date === d}
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                value={form.date}
                onChange={(e) => handleChange("date", e.target.value)}
                className="search-input quick-add-date-input"
                aria-label="Date"
              />
            </div>
          </div>

          <button type="button" className="quick-add-more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            {showMore ? "Fewer options ▴" : "More options ▾"}
          </button>

          {showMore && (
            <>
              <div className="modal-field">
                <label className="modal-label" htmlFor="qa-notes">Notes</label>
                <input
                  id="qa-notes"
                  type="text"
                  value={form.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  className="search-input"
                  placeholder="e.g. Birthday dinner for Sarah"
                />
              </div>
              <div className="modal-row">
                <div className="modal-field" style={{ flex: 1 }}>
                  <label className="modal-label" htmlFor="qa-repaid">Already paid back</label>
                  <input
                    id="qa-repaid"
                    type="text"
                    inputMode="decimal"
                    value={form.repaid}
                    onChange={(e) => handleChange("repaid", e.target.value.replace(/[^\d.,]/g, ""))}
                    className="search-input"
                    placeholder="0.00"
                    disabled={installmentCount > 1}
                  />
                </div>
                <div className="modal-field" style={{ flex: 1 }}>
                  <label className="modal-label" htmlFor="qa-installments">Split across months</label>
                  <select
                    id="qa-installments"
                    value={form.installments}
                    onChange={(e) => handleChange("installments", e.target.value)}
                    className="filter-select"
                    style={{ width: "100%" }}
                    disabled={!!form.repeat}
                  >
                    <option value="1">No split</option>
                    {[2, 3, 4, 6, 12].map((n) => <option key={n} value={n}>{n} months</option>)}
                  </select>
                </div>
              </div>
              {onAddRecurring && (
                <div className="modal-field">
                  <label className="modal-label" htmlFor="qa-repeat">Repeats</label>
                  <select
                    id="qa-repeat"
                    value={form.repeat}
                    onChange={(e) => { handleChange("repeat", e.target.value); if (e.target.value) handleChange("installments", "1"); }}
                    className="filter-select"
                    style={{ width: "100%" }}
                  >
                    <option value="">Doesn&apos;t repeat</option>
                    {Object.entries(FREQUENCIES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
              )}
              {installments && (
                <div className="quick-add-note">
                  {installments.length} × {formatCurrency(installments[0].amount)}
                  {installments.at(-1).amount !== installments[0].amount && ` (last ${formatCurrency(installments.at(-1).amount)})`}
                  {" "}= {formatCurrency(totalAmount)}
                </div>
              )}
              <div className="modal-field">
                <label className="modal-label" htmlFor="qa-name">Description (if different from where)</label>
                <input
                  id="qa-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  className="search-input"
                  placeholder="Optional"
                />
              </div>
            </>
          )}

          {error && <p className="modal-error" role="alert">{error}</p>}
          <button type="submit" className="btn-primary quick-add-save" disabled={saving}>
            {saving
              ? "Adding…"
              : installments
                ? `Add ${installments.length} installments`
                : totalAmount > 0
                  ? `Add ${formatCurrency(totalAmount)}${form.repeat ? ` · ${FREQUENCIES[form.repeat].toLowerCase()}` : ""}`
                  : "Add expense"}
          </button>
        </form>
      </div>
    </div>
  );
}
