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
  const [editingHolding, setEditingHolding] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [expanded, setExpanded] = useState({}); // ticker → bool

  const toggleExpand = (ticker) =>
    setExpanded((prev) => ({ ...prev, [ticker]: !prev[ticker] }));

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

  const handleUpdateHolding = async (id, fields) => {
    const res = await fetch("/api/holdings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update holding");
    }
    await loadAll();
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

  // Enrich each lot with live price data
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

  // Group lots by ticker → build one aggregated position per ticker
  const groupedMap = {};
  for (const lot of enriched) {
    if (!groupedMap[lot.ticker]) {
      groupedMap[lot.ticker] = {
        ticker: lot.ticker,
        currency: lot.currency,
        currentPrice: lot.currentPrice,
        quoteName: lot.quoteName,
        lots: [],
        totalShares: 0,
        totalInvested: 0,
        totalValue: 0,
        canPrice: lot.currentPrice !== null,
        name: lot.name || lot.quoteName || "",
        earliestBuyDate: lot.buyDate || null,
      };
    }
    const g = groupedMap[lot.ticker];
    g.lots.push(lot);
    g.totalShares += lot.shares;
    g.totalInvested += lot.invested;
    if (lot.currentValue !== null) g.totalValue += lot.currentValue;
    if (!g.name && lot.name) g.name = lot.name;
    if (lot.buyDate && (!g.earliestBuyDate || lot.buyDate < g.earliestBuyDate)) {
      g.earliestBuyDate = lot.buyDate;
    }
  }
  const grouped = Object.values(groupedMap)
    .map((g) => {
      const avgBuyPrice = g.totalShares > 0 ? g.totalInvested / g.totalShares : 0;
      const gainLoss = g.canPrice ? g.totalValue - g.totalInvested : null;
      const gainLossPct = gainLoss !== null && g.totalInvested > 0 ? (gainLoss / g.totalInvested) * 100 : null;
      // Sort lots chronologically, oldest first
      g.lots.sort((a, b) => (a.buyDate || "").localeCompare(b.buyDate || ""));
      return { ...g, avgBuyPrice, gainLoss, gainLossPct };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const pricedGroups = grouped.filter((g) => g.canPrice);
  const unpricedGroups = grouped.filter((g) => !g.canPrice);
  const totalInvested = pricedGroups.reduce((s, g) => s + g.totalInvested, 0);
  const totalValue = pricedGroups.reduce((s, g) => s + g.totalValue, 0);
  const totalGainLoss = totalValue - totalInvested;
  const totalGainLossPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
  const unpricedCost = unpricedGroups.reduce((s, g) => s + g.totalInvested, 0);

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
          <div className="stat-value">{grouped.length}</div>
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
            ⟳ Sync from CSV
          </button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + Add Holding
          </button>
        </div>
      </div>

      {unpricedGroups.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--surface2, var(--card-bg))", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            ⚠ {unpricedGroups.length} position{unpricedGroups.length === 1 ? "" : "s"} couldn't be priced ({fmt(unpricedCost)} cost basis excluded from totals)
          </div>
          <div style={{ color: "var(--text-muted)" }}>
            Unpriced: {unpricedGroups.map((g) => g.ticker).join(", ")}. Click the ✎ pencil to edit the ticker
            (e.g. Canadian ETFs may need a .TO suffix, or change &quot;GOLD&quot; to the actual symbol you hold like CGL.TO).
          </div>
        </div>
      )}

      {/* Holdings table — one row per ticker, click to expand into individual lots */}
      {grouped.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No holdings yet</div>
          <div style={{ fontSize: 13 }}>Click &quot;Add Holding&quot; to log your first position.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={{ width: 28, padding: "6px 4px" }}></th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Ticker</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Shares</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Avg Buy</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Current</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Value</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Gain / Loss</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>First Buy</th>
                <th style={{ padding: "6px 10px" }}></th>
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap((g) => {
                const isOpen = !!expanded[g.ticker];
                const hasMultipleLots = g.lots.length > 1;
                const rows = [
                  /* Summary row */
                  <tr
                      key={`sum-${g.ticker}`}
                      style={{
                        borderBottom: isOpen ? "none" : "1px solid var(--border)",
                        cursor: hasMultipleLots ? "pointer" : "default",
                        background: isOpen ? "var(--surface2, var(--card-bg))" : "transparent",
                      }}
                      onClick={() => hasMultipleLots && toggleExpand(g.ticker)}
                    >
                      <td style={{ padding: "10px 4px", textAlign: "center", color: "var(--text-muted)" }}>
                        {hasMultipleLots ? (isOpen ? "▾" : "▸") : ""}
                      </td>
                      <td style={{ padding: "10px 10px", fontWeight: 700, color: "var(--text)", letterSpacing: "0.03em" }}>
                        {g.ticker}
                        {hasMultipleLots && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-muted)", fontWeight: 500, letterSpacing: 0 }}>
                            {g.lots.length} lots
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 10px", color: "var(--text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name || "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(g.totalShares * 10000) / 10000}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(g.avgBuyPrice, g.currency)}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {g.currentPrice !== null ? fmt(g.currentPrice, g.currency) : <span style={{ color: "var(--text-muted)" }}>N/A</span>}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {g.canPrice ? fmt(g.totalValue, g.currency) : <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>N/A</span>}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right" }}>
                        {g.gainLoss !== null && g.gainLossPct !== null ? (
                          <GainBadge value={g.gainLoss} pct={g.gainLossPct} />
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {g.earliestBuyDate || "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        {/* When only one lot, edit/delete operate on that single lot directly */}
                        {!hasMultipleLots && (
                          <>
                            <button
                              onClick={() => setEditingHolding(g.lots[0])}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: "2px 6px", marginRight: 2, borderRadius: 4 }}
                              title="Edit holding"
                              aria-label={`Edit ${g.ticker}`}
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDelete(g.lots[0].id)}
                              disabled={deletingId === g.lots[0].id}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "2px 4px", borderRadius: 4, opacity: deletingId === g.lots[0].id ? 0.4 : 1 }}
                              title="Remove holding"
                              aria-label={`Remove ${g.ticker}`}
                            >
                              ×
                            </button>
                          </>
                        )}
                      </td>
                    </tr>,
                ];

                /* Expanded: one row per lot */
                if (isOpen) {
                  g.lots.forEach((lot, idx) => {
                    rows.push(
                      <tr
                        key={`lot-${lot.id}`}
                        style={{
                          borderBottom: idx === g.lots.length - 1 ? "1px solid var(--border)" : "1px dashed var(--border)",
                          fontSize: 12,
                          background: "var(--surface2, var(--card-bg))",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <td></td>
                        <td style={{ padding: "6px 10px", paddingLeft: 30, fontStyle: "italic", color: "var(--text-muted)" }}>
                          Lot {idx + 1}
                        </td>
                        <td style={{ padding: "6px 10px", color: "var(--text-muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lot.notes || lot.name || "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {lot.shares}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(lot.buyPrice, lot.currency)}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>
                          {lot.currentPrice !== null ? fmt(lot.currentPrice, lot.currency) : "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {lot.currentValue !== null ? fmt(lot.currentValue, lot.currency) : <span style={{ color: "var(--text-muted)" }}>N/A</span>}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>
                          {lot.gainLoss !== null && lot.gainLossPct !== null ? (
                            <GainBadge value={lot.gainLoss} pct={lot.gainLossPct} />
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "6px 10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {lot.buyDate || "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => setEditingHolding(lot)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, lineHeight: 1, padding: "2px 6px", marginRight: 2, borderRadius: 4 }}
                            title="Edit lot"
                            aria-label={`Edit lot ${idx + 1}`}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleDelete(lot.id)}
                            disabled={deletingId === lot.id}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "2px 4px", borderRadius: 4, opacity: deletingId === lot.id ? 0.4 : 1 }}
                            title="Remove lot"
                            aria-label={`Remove lot ${idx + 1}`}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  });
                }
                return rows;
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddHoldingModal onAdd={handleAddHolding} onClose={() => setShowModal(false)} />
      )}
      {editingHolding && (
        <AddHoldingModal
          holding={editingHolding}
          onUpdate={handleUpdateHolding}
          onClose={() => setEditingHolding(null)}
        />
      )}
      {showCsvModal && (
        <CsvImportModal
          onClose={() => setShowCsvModal(false)}
          onDone={() => loadAll()}
        />
      )}
    </div>
  );
}
