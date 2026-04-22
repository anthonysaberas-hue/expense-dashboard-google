"use client";
import { useState } from "react";

export default function AddHoldingModal({ onAdd, onClose }) {
  const [form, setForm] = useState({
    ticker: "",
    shares: "",
    buyPrice: "",
    buyDate: new Date().toISOString().split("T")[0],
    name: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pricePreview, setPricePreview] = useState(null);
  const [tickerLoading, setTickerLoading] = useState(false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleTickerBlur = async () => {
    const ticker = form.ticker.trim().toUpperCase();
    if (!ticker) return;
    setTickerLoading(true);
    setPricePreview(null);
    try {
      const res = await fetch(`/api/prices?tickers=${ticker}`);
      const data = await res.json();
      const quote = data.prices?.[ticker];
      if (quote) {
        setPricePreview(quote);
        if (!form.buyPrice) {
          setForm((prev) => ({ ...prev, buyPrice: quote.price?.toFixed(2) ?? "" }));
        }
        if (!form.name && quote.name) {
          setForm((prev) => ({ ...prev, name: quote.name }));
        }
      } else {
        setPricePreview(null);
        setError(`Ticker "${ticker}" not found. Check the symbol (TSX stocks use .TO suffix, e.g. RY.TO)`);
      }
    } catch {
      // silently ignore preview failure
    } finally {
      setTickerLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ticker = form.ticker.trim().toUpperCase();
    if (!ticker) return setError("Ticker is required");
    if (!form.shares || isNaN(parseFloat(form.shares)) || parseFloat(form.shares) <= 0)
      return setError("Shares must be a positive number");
    if (!form.buyPrice || isNaN(parseFloat(form.buyPrice)) || parseFloat(form.buyPrice) <= 0)
      return setError("Buy price must be a positive number");
    if (!form.buyDate) return setError("Buy date is required");

    setSaving(true);
    try {
      await onAdd({
        ticker,
        shares: parseFloat(form.shares),
        buyPrice: parseFloat(form.buyPrice),
        buyDate: form.buyDate,
        name: form.name.trim(),
        notes: form.notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to add holding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Add holding">
        <div className="modal-header">
          <h2 className="modal-title">Add Holding</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Ticker Symbol *</label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => handleChange("ticker", e.target.value.toUpperCase())}
              onBlur={handleTickerBlur}
              className="search-input"
              placeholder="e.g. AAPL or RY.TO"
              autoFocus
              style={{ textTransform: "uppercase" }}
            />
            {tickerLoading && (
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, display: "block" }}>
                Looking up price…
              </span>
            )}
            {pricePreview && (
              <span style={{ fontSize: 12, color: "var(--green)", marginTop: 4, display: "block", fontWeight: 600 }}>
                {pricePreview.name} — {pricePreview.currency} {pricePreview.price?.toFixed(2)}
              </span>
            )}
          </div>

          <div className="modal-row">
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Shares *</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.shares}
                onChange={(e) => handleChange("shares", e.target.value)}
                className="search-input"
                placeholder="e.g. 10"
                required
              />
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Buy Price *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.buyPrice}
                onChange={(e) => handleChange("buyPrice", e.target.value)}
                className="search-input"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Buy Date *</label>
            <input
              type="date"
              value={form.buyDate}
              onChange={(e) => handleChange("buyDate", e.target.value)}
              className="search-input"
              required
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Name / Label</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="search-input"
              placeholder="Auto-filled from ticker"
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="search-input"
              placeholder="e.g. TFSA account"
            />
          </div>

          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Adding…" : "Add Holding"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
