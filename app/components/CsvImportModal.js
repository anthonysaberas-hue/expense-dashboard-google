"use client";
import { useState, useRef } from "react";

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

// M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD; passes through if already ISO
function normalizeDate(str) {
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const parts = str.split("/");
  if (parts.length !== 3) return str;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ── Aggregate trades into net positions per symbol ─────
function aggregatePositions(rows) {
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
      quantity: parseFloat(r.quantity) || 0,
      unitPrice: parseFloat(r.unit_price) || 0,
      date: normalizeDate(r.transaction_date),
    }))
    .filter((t) => t.symbol && t.quantity > 0);

  // Sort chronologically so earliestDate is correct
  trades.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const bySymbol = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) {
      bySymbol[t.symbol] = {
        symbol: t.symbol,
        name: t.name,
        currency: t.currency,
        buyShares: 0,
        buyCost: 0,
        sellShares: 0,
        earliestDate: t.date,
        tradeCount: 0,
      };
    }
    const e = bySymbol[t.symbol];
    e.tradeCount++;
    if (t.action === "BUY") {
      e.buyShares += t.quantity;
      e.buyCost += t.quantity * t.unitPrice;
      if (!e.name && t.name) e.name = t.name;
    } else if (t.action === "SELL") {
      e.sellShares += t.quantity;
    }
  }

  return Object.values(bySymbol)
    .map((e) => {
      const rawNet = e.buyShares - e.sellShares;
      // Treat any residue smaller than 0.001 share as exactly zero (float dust from fractional trades)
      const closed = Math.abs(rawNet) < 0.001;
      const netShares = closed ? 0 : Math.round(rawNet * 10000) / 10000;
      const avgBuyPrice = e.buyShares > 0 ? e.buyCost / e.buyShares : 0;
      return {
        ticker: e.symbol,
        name: e.name,
        shares: netShares,
        buyPrice: Math.round(avgBuyPrice * 100) / 100,
        buyDate: e.earliestDate,
        currency: e.currency,
        tradeCount: e.tradeCount,
        closed,
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export default function CsvImportModal({ onImport, onClose }) {
  const fileRef = useRef(null);
  const [positions, setPositions] = useState([]);
  const [rawCount, setRawCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [selected, setSelected] = useState({}); // ticker → bool

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
      const agg = aggregatePositions(rows);
      setPositions(agg);
      const initSel = {};
      agg.forEach((p) => { initSel[p.ticker] = false; }); // user must opt in to avoid accidents
      setSelected(initSel);
    } catch (err) {
      setError(err.message || "Failed to parse CSV");
    }
  };

  const toggleOne = (ticker) => {
    const p = positions.find((x) => x.ticker === ticker);
    if (!p || p.closed) return; // closed positions can never be imported
    setSelected((prev) => ({ ...prev, [ticker]: !prev[ticker] }));
  };

  const openPositions = positions.filter((p) => !p.closed);
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

  // Defensive: never allow closed positions through even if state is stale
  const selectedPositions = positions.filter((p) => selected[p.ticker] && !p.closed);

  const handleImport = async () => {
    if (selectedPositions.length === 0) return;
    setImporting(true);
    setProgress({ done: 0, total: selectedPositions.length });
    try {
      let done = 0;
      for (const p of selectedPositions) {
        await onImport({
          ticker: p.ticker,
          shares: p.shares,
          buyPrice: p.buyPrice,
          buyDate: p.buyDate,
          name: p.name,
          notes: `Imported from CSV (${p.tradeCount} trade${p.tradeCount === 1 ? "" : "s"})`,
        });
        done++;
        setProgress({ done, total: selectedPositions.length });
      }
      onClose();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !importing && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Import CSV" style={{ maxWidth: 860, width: "95%" }}>
        <div className="modal-header">
          <h2 className="modal-title">Import Holdings from CSV</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close" disabled={importing}>×</button>
        </div>
        <div className="modal-body">
          {positions.length === 0 && (
            <div style={{ padding: "8px 0" }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                Upload a Questrade-style trade export (CSV). We'll aggregate all BUY and SELL trades per symbol,
                compute the weighted-average buy price, and create one holding per net position.
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                Expected columns: <code>transaction_date, symbol, activity_type, activity_sub_type, quantity, unit_price, currency, name</code>.
                Non-trade rows (MoneyMovement, dividends, etc.) are ignored.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0])}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => fileRef.current?.click()}
              >
                Choose CSV file
              </button>
            </div>
          )}

          {positions.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--text)" }}>{fileName}</strong> — parsed {rawCount} rows →{" "}
                  {openPositions.length} open + {positions.filter((p) => p.closed).length} closed (excluded)
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={selectAll} disabled={importing}>Select all</button>
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={deselectAll} disabled={importing}>Deselect all</button>
                </div>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--card-bg)", zIndex: 1 }}>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      <th style={{ padding: "8px 10px", width: 32 }}></th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Ticker</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Name</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Net Shares</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Avg Buy Price</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>First Buy</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.ticker} style={{ borderBottom: "1px solid var(--border)", opacity: p.closed ? 0.5 : 1 }}>
                        <td style={{ padding: "8px 10px" }}>
                          <input
                            type="checkbox"
                            checked={!!selected[p.ticker] && !p.closed}
                            onChange={() => toggleOne(p.ticker)}
                            disabled={importing || p.closed}
                            title={p.closed ? "Closed position — cannot import" : ""}
                          />
                        </td>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{p.ticker}</td>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {p.closed ? <span style={{ color: "var(--text-muted)" }}>closed</span> : p.shares}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {p.currency} {p.buyPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-muted)" }}>{p.buyDate}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{p.tradeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
                Closed positions (net zero shares) are disabled and can't be imported. Each selected row becomes a new holding —
                this is additive, so re-importing creates duplicates. Delete existing holdings first via the × button if re-importing.
              </p>
            </>
          )}

          {importing && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
              Importing {progress.done} / {progress.total}…
            </p>
          )}
          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-ghost" disabled={importing}>
              Cancel
            </button>
            {positions.length > 0 && (
              <button
                type="button"
                onClick={handleImport}
                className="btn-primary"
                disabled={importing || selectedPositions.length === 0}
              >
                {importing ? "Importing…" : `Import ${selectedPositions.length} holding${selectedPositions.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
