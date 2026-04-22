"use client";
import { useState, useEffect, useCallback } from "react";
import AddHoldingModal from "./AddHoldingModal";
import CsvImportModal from "./CsvImportModal";

function fmt(value, currency = "CAD", decimals = 2) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function GainBadge({ value, pct }) {
  const isPositive = value >= 0;
  const color = isPositive ? "var(--green)" : "var(--red, #e53e3e)";
  const sign = isPositive ? "+" : "";
  return (
    <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
      {sign}{fmt(value)} ({sign}{pct.toFixed(2)}%)
    </span>
  );
}

export default function AssetsTab({ onAddHolding, onDeleteHolding }) {
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const fetchHoldings = useCallback(async () => {
    const res = await fetch("/api/holdings");
    const data = await res.json();
    return data.holdings || [];
  }, []);

  const fetchPrices = useCallback(async (tickers) => {
    if (tickers.length === 0) return {};
    const res = await fetch(`/api/prices?tickers=${tickers.join(",")}`);
    const data = await res.json();
    setWarnings(data.warnings || []);
    return data.prices || {};
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const h = await fetchHoldings();
      setHoldings(h);
      const tickers = [...new Set(h.map((x) => x.ticker).filter(Boolean))];
      const p = await fetchPrices(tickers);
      setPrices(p);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchHoldings, fetchPrices]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAddHolding = async (fields) => {
    const res = await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to add holding");
    }
    await loadAll();
    if (onAddHolding) onAddHolding();
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this holding?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
      await loadAll();
      if (onDeleteHolding) onDeleteHolding();
    } finally {
      setDeletingId(null);
    }
  };

  // Enrich holdings with live price data
  const enriched = holdings.map((h) => {
    const quote = prices[h.ticker];
    const currentPrice = quote?.price ?? null;
    const currency = quote?.currency ?? "CAD";
    const invested = h.shares * h.buyPrice;
    const currentValue = currentPrice !== null ? h.shares * currentPrice : null;
    const gainLoss = currentValue !== null ? currentValue - invested : null;
    const gainLossPct = gainLoss !== null && invested > 0 ? (gainLoss / invested) * 100 : null;
    return { ...h, currentPrice, currency, invested, currentValue, gainLoss, gainLossPct, quoteName: quote?.name };
  });

  const totalInvested = enriched.reduce((s, h) => s + h.invested, 0);
  const totalValue = enriched.reduce((s, h) => s + (h.currentValue ?? h.invested), 0);
  const totalGainLoss = totalValue - totalInvested;
  const totalGainLossPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
        Loading portfolio…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Summary cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Value</div>
          <div className="stat-value">{fmt(totalValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Invested</div>
          <div className="stat-value">{fmt(totalInvested)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Gain / Loss</div>
          <div className="stat-value">
            <GainBadge value={totalGainLoss} pct={totalGainLossPct} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Positions</div>
          <div className="stat-value">{holdings.length}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Prices as of {lastUpdated.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            className="btn-ghost"
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => loadAll(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={() => setShowCsvModal(true)}>
            ⬆ Import CSV
          </button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Add Holding
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface2, var(--card-bg))", borderRadius: 8, padding: "8px 12px" }}>
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* Holdings table */}
      {enriched.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No holdings yet</div>
          <div style={{ fontSize: 13 }}>Click "Add Holding" to log your first position.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Ticker</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Shares</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Buy Price</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Current Price</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Value</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Gain / Loss</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Buy Date</th>
                <th style={{ padding: "6px 10px" }}></th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((h) => (
                <tr
                  key={h.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "var(--text)", letterSpacing: "0.03em" }}>
                    {h.ticker}
                  </td>
                  <td style={{ padding: "10px 10px", color: "var(--text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.name || h.quoteName || "—"}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {h.shares}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(h.buyPrice, h.currency)}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {h.currentPrice !== null ? fmt(h.currentPrice, h.currency) : <span style={{ color: "var(--text-muted)" }}>N/A</span>}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {h.currentValue !== null ? fmt(h.currentValue, h.currency) : fmt(h.invested, h.currency)}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    {h.gainLoss !== null && h.gainLossPct !== null ? (
                      <GainBadge value={h.gainLoss} pct={h.gainLossPct} />
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {h.buyDate || "—"}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <button
                      onClick={() => handleDelete(h.id)}
                      disabled={deletingId === h.id}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: 16,
                        lineHeight: 1,
                        padding: "2px 4px",
                        borderRadius: 4,
                        opacity: deletingId === h.id ? 0.4 : 1,
                      }}
                      title="Remove holding"
                      aria-label={`Remove ${h.ticker}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddHoldingModal onAdd={handleAddHolding} onClose={() => setShowModal(false)} />
      )}
      {showCsvModal && (
        <CsvImportModal
          onImport={async (fields) => {
            const res = await fetch("/api/holdings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fields),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || "Import failed");
            }
          }}
          onClose={() => {
            setShowCsvModal(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}
