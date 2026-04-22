"use client";
import { useState, useRef, useEffect } from "react";

// ── CSV parsing ─────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === "," && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = values[j] ?? ""; });
    return obj;
  });
}

function normalizeDate(str) {
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const parts = str.split("/");
  if (parts.length !== 3) return str;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ── Chronological ACB (Adjusted Cost Basis) aggregation ─
// Standard Canadian tax-lot method: every BUY adds to cost pool,
// every SELL reduces the cost pool at the current ACB-per-share
// (not at the sell price). Post-sell BUYs then accumulate from the
// reduced base. This is what you'd report for TFSA/non-registered.
function aggregatePositionsACB(rows) {
  const trades = rows
    .filter((r) => (r.activity_type || "").toLowerCase() === "trade")
    .filter((r) => {
      const s = (r.activity_sub_type || "").toUpperCase();
      return s === "BUY" || s === "SELL";
    })
    .map((r) => ({
      symbol: (r.symbol || "").trim().toUpperCase(),
      name: r.name || "",
      currency: r.currency || "",
      action: (r.activity_sub_type || "").toUpperCase(),
      quantity: Math.abs(parseFloat(r.quantity) || 0),
      unitPrice: parseFloat(r.unit_price) || 0,
      date: normalizeDate(r.transaction_date),
    }))
    .filter((t) => t.symbol && t.quantity > 0);

  trades.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const state = {};
  for (const t of trades) {
    if (!state[t.symbol]) {
      state[t.symbol] = {
        symbol: t.symbol,
        name: "",
        currency: t.currency || "",
        shares: 0,
        totalCost: 0,
        firstBuyDate: null,
        tradeCount: 0,
        buyTotalShares: 0,
        buyTotalCost: 0,
        sellTotalShares: 0,
        sellTotalProceeds: 0,
      };
    }
    const s = state[t.symbol];
    s.tradeCount++;
    if (!s.name && t.name) s.name = t.name;

    if (t.action === "BUY") {
      s.shares += t.quantity;
      s.totalCost += t.quantity * t.unitPrice;
      s.buyTotalShares += t.quantity;
      s.buyTotalCost += t.quantity * t.unitPrice;
      if (!s.firstBuyDate) s.firstBuyDate = t.date;
    } else {
      // SELL: reduce cost basis at ACB, not at sell price
      if (s.shares > 0) {
        const acbPerShare = s.totalCost / s.shares;
        const qty = Math.min(t.quantity, s.shares);
        s.totalCost -= qty * acbPerShare;
        s.shares -= qty;
      }
      s.sellTotalShares += t.quantity;
      s.sellTotalProceeds += t.quantity * t.unitPrice;
      // Float hygiene: snap to zero when the residue is dust
      if (Math.abs(s.shares) < 1e-6) { s.shares = 0; s.totalCost = 0; }
    }
  }

  return Object.values(state).map((s) => {
    const closed = Math.abs(s.shares) < 0.001;
    const shares = closed ? 0 : Math.round(s.shares * 10000) / 10000;
    const acbPerShare = shares > 0 ? s.totalCost / shares : 0;
    return {
      ticker: s.symbol,
      name: s.name,
      shares,
      buyPrice: Math.round(acbPerShare * 100) / 100,
      totalCost: Math.round((shares > 0 ? s.totalCost : 0) * 100) / 100,
      buyDate: s.firstBuyDate,
      currency: s.currency,
      tradeCount: s.tradeCount,
      closed,
      realizedGain: closed ? Math.round((s.sellTotalProceeds - s.buyTotalCost) * 100) / 100 : null,
    };
  }).sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1; // open first
    return a.ticker.localeCompare(b.ticker);
  });
}

// ── Component ──────────────────────────────────────────
function fmt(n, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function CsvImportModal({ onClose, onDone }) {
  const fileRef = useRef(null);
  const [positions, setPositions] = useState([]);
  const [rawCount, setRawCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: "" });
  const [selected, setSelected] = useState({});
  const [replaceMode, setReplaceMode] = useState(true); // idempotent sync by default
  const [existingCount, setExistingCount] = useState(null);

  // Fetch current Holdings count so we can show what will be deleted
  useEffect(() => {
    fetch("/api/holdings")
      .then((r) => r.json())
      .then((d) => setExistingCount(d.count ?? (d.holdings?.length || 0)))
      .catch(() => setExistingCount(null));
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setError("CSV appears to be empty"); return; }
      if (!("symbol" in rows[0]) || !("quantity" in rows[0])) {
        setError("CSV is missing required columns (symbol, quantity). Check headers.");
        return;
      }
      setRawCount(rows.length);
      const agg = aggregatePositionsACB(rows);
      setPositions(agg);
      // In replace mode: default all open positions checked (idempotent sync)
      // In add-only mode: default all unchecked (opt-in to avoid duplicates)
      const initSel = {};
      agg.forEach((p) => { initSel[p.ticker] = replaceMode && !p.closed; });
      setSelected(initSel);
    } catch (err) {
      setError(err.message || "Failed to parse CSV");
    }
  };

  const toggleOne = (ticker) => {
    const p = positions.find((x) => x.ticker === ticker);
    if (!p || p.closed) return;
    setSelected((prev) => ({ ...prev, [ticker]: !prev[ticker] }));
  };

  const openPositions = positions.filter((p) => !p.closed);
  const closedPositions = positions.filter((p) => p.closed);
  const selectedPositions = positions.filter((p) => selected[p.ticker] && !p.closed);

  const selectAll = () => {
    const next = { ...selected };
    openPositions.forEach((p) => { next[p.ticker] = true; });
    setSelected(next);
  };
  const deselectAll = () => {
    const next = { ...selected };
    openPositions.forEach((p) => { next[p.ticker] = false; });
    setSelected(next);
  };

  const totalCostBasis = selectedPositions.reduce((s, p) => s + p.totalCost, 0);

  const handleImport = async () => {
    if (selectedPositions.length === 0) return;
    setImporting(true);
    setError("");
    try {
      if (replaceMode) {
        setProgress({ done: 0, total: 1, phase: "Clearing existing holdings…" });
        const delRes = await fetch("/api/holdings?all=true", { method: "DELETE" });
        if (!delRes.ok) {
          const d = await delRes.json().catch(() => ({}));
          throw new Error(d.error || "Failed to clear existing holdings");
        }
      }
      let done = 0;
      setProgress({ done: 0, total: selectedPositions.length, phase: "Importing holdings…" });
      for (const p of selectedPositions) {
        const res = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: p.ticker,
            shares: p.shares,
            buyPrice: p.buyPrice,
            buyDate: p.buyDate,
            name: p.name,
            notes: `ACB from CSV (${p.tradeCount} trade${p.tradeCount === 1 ? "" : "s"})`,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed to import ${p.ticker}`);
        }
        done++;
        setProgress({ done, total: selectedPositions.length, phase: "Importing holdings…" });
      }
      if (onDone) onDone();
      onClose();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !importing && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Import CSV" style={{ maxWidth: 920, width: "96%" }}>
        <div className="modal-header">
          <h2 className="modal-title">Sync Holdings from CSV</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close" disabled={importing}>×</button>
        </div>
        <div className="modal-body">
          {positions.length === 0 && (
            <div style={{ padding: "8px 0" }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                Upload a Questrade-style trade export (CSV). Trades are processed chronologically
                using Adjusted Cost Basis (ACB): each SELL reduces cost at the current ACB/share,
                not at the sell price. Closed positions are automatically excluded.
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                Expected columns: <code>transaction_date, symbol, activity_type, activity_sub_type, quantity, unit_price, currency, name</code>.
                Non-trade rows (MoneyMovement, Dividend, etc.) are ignored.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0])}
                style={{ display: "none" }}
              />
              <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
                Choose CSV file
              </button>
            </div>
          )}

          {positions.length > 0 && (
            <>
              {/* Mode toggle */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px", marginBottom: 12,
                background: "var(--surface2, var(--card-bg))",
                border: "1px solid var(--border)", borderRadius: 8,
              }}>
                <input
                  type="checkbox"
                  id="replace-mode"
                  checked={replaceMode}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setReplaceMode(v);
                    // Re-default the selection when toggling mode
                    const next = {};
                    positions.forEach((p) => { next[p.ticker] = v && !p.closed; });
                    setSelected(next);
                  }}
                  disabled={importing}
                  style={{ marginTop: 2 }}
                />
                <label htmlFor="replace-mode" style={{ fontSize: 13, cursor: "pointer", flex: 1 }}>
                  <strong>Replace existing holdings</strong>{" "}
                  {existingCount !== null && existingCount > 0 && (
                    <span style={{ color: "var(--red, #e53e3e)", fontWeight: 600 }}>
                      (will delete all {existingCount} current holding{existingCount === 1 ? "" : "s"})
                    </span>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    Recommended for idempotent syncs: wipes the Holdings sheet and repopulates from this CSV.
                    Uncheck to add positions without deleting existing ones (may create duplicates).
                  </div>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {rawCount} rows →{" "}
                  <strong style={{ color: "var(--green)" }}>{openPositions.length} open</strong>
                  {closedPositions.length > 0 && <> · <span style={{ color: "var(--text-muted)" }}>{closedPositions.length} closed (excluded)</span></>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={selectAll} disabled={importing}>Select all open</button>
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={deselectAll} disabled={importing}>Deselect all</button>
                </div>
              </div>

              {/* Open positions */}
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                Will create ({selectedPositions.length} selected)
              </div>
              <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--card-bg)", zIndex: 1 }}>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase" }}>
                      <th style={{ padding: "8px 10px", width: 32 }}></th>
                      <th style={{ textAlign: "left", padding: "8px 10px" }}>Ticker</th>
                      <th style={{ textAlign: "left", padding: "8px 10px" }}>Name</th>
                      <th style={{ textAlign: "right", padding: "8px 10px" }}>Shares</th>
                      <th style={{ textAlign: "right", padding: "8px 10px" }}>ACB / share</th>
                      <th style={{ textAlign: "right", padding: "8px 10px" }}>Cost basis</th>
                      <th style={{ textAlign: "left", padding: "8px 10px" }}>First Buy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>No open positions found.</td></tr>
                    )}
                    {openPositions.map((p) => (
                      <tr key={p.ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px" }}>
                          <input
                            type="checkbox"
                            checked={!!selected[p.ticker]}
                            onChange={() => toggleOne(p.ticker)}
                            disabled={importing}
                          />
                        </td>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{p.ticker}</td>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.shares}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {p.currency} {p.buyPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmt(p.totalCost, p.currency)}
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-muted)" }}>{p.buyDate}</td>
                      </tr>
                    ))}
                  </tbody>
                  {selectedPositions.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2, var(--card-bg))" }}>
                        <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>
                          Total cost basis of selected:
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {fmt(totalCostBasis)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Closed positions */}
              {closedPositions.length > 0 && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                    Closed — excluded from import
                  </div>
                  <div style={{ overflowX: "auto", maxHeight: 140, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 10, opacity: 0.75 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <tbody>
                        {closedPositions.map((p) => (
                          <tr key={p.ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "6px 10px", fontWeight: 700, width: 100 }}>{p.ticker}</td>
                            <td style={{ padding: "6px 10px", color: "var(--text-secondary)" }}>{p.name || "—"}</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-muted)", fontSize: 11 }}>
                              {p.tradeCount} trades · fully sold
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.realizedGain >= 0 ? "var(--green)" : "var(--red, #e53e3e)" }}>
                              {p.realizedGain !== null ? `${p.realizedGain >= 0 ? "+" : ""}${fmt(p.realizedGain)} realized` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {importing && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
              {progress.phase} {progress.total > 0 && `${progress.done} / ${progress.total}`}
            </p>
          )}
          {error && <p className="modal-error">{error}</p>}

          {positions.length > 0 && (
            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn-ghost" disabled={importing}>Cancel</button>
              <button
                type="button"
                onClick={handleImport}
                className="btn-primary"
                disabled={importing || selectedPositions.length === 0}
              >
                {importing
                  ? "Syncing…"
                  : replaceMode
                    ? `Replace with ${selectedPositions.length} holding${selectedPositions.length === 1 ? "" : "s"}`
                    : `Add ${selectedPositions.length} holding${selectedPositions.length === 1 ? "" : "s"}`
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
