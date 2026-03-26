"use client";
import { useMemo } from "react";
import { getCatColor, formatCurrency, formatMonthLabel, MONTHS, getPrevMonths } from "../lib/constants";
import Sparkline from "./Sparkline";
import EmptyState from "./EmptyState";

function YoYSection({ byMonth, selectedMonth }) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const priorYear = `${year - 1}-${String(month).padStart(2, "0")}`;
  const months = Object.keys(byMonth).sort();
  const hasYoY = months.length >= 12 && byMonth[priorYear];

  const currentData = byMonth[selectedMonth] || [];
  const priorData = byMonth[priorYear] || [];

  const currentTotal = currentData.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const priorTotal = priorData.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const delta = priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal * 100).toFixed(1) : null;
  const isUp = currentTotal > priorTotal;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="section-label">Year-over-year comparison</p>
      {!hasYoY ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          No data for prior year — need at least 12 months of history.
        </p>
      ) : (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              {formatMonthLabel(selectedMonth, false)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(currentTotal)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              {formatMonthLabel(priorYear, false)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
              {formatCurrency(priorTotal)}
            </div>
          </div>
          {delta !== null && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Change</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: isUp ? "var(--red)" : "var(--green)" }}>
                {isUp ? "+" : ""}{delta}%
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function YTDCumulativeLine({ byMonth, monthKeys, selectedYear }) {
  const yearMonths = monthKeys.filter((m) => m.startsWith(selectedYear)).sort();
  if (yearMonths.length < 2) return null;

  let cumulative = 0;
  const points = yearMonths.map((m) => {
    const total = (byMonth[m] || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    cumulative += total;
    return cumulative;
  });

  const maxVal = Math.max(...points, 1);
  const width = 400;
  const height = 60;
  const ptStr = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - (v / maxVal) * height * 0.9;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="section-label">YTD cumulative spend — {selectedYear}</p>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height + 20}`} style={{ width: "100%", minWidth: 280, height: 80 }} aria-label="YTD cumulative spending line chart">
          <polyline
            points={ptStr}
            fill="none"
            stroke="var(--green)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((v, i) => {
            const x = (i / (points.length - 1)) * width;
            const y = height - (v / maxVal) * height * 0.9;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={3} fill="var(--green)" />
                <text x={x} y={height + 16} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                  {yearMonths[i].split("-")[1]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
        <span>YTD total: <strong style={{ color: "var(--text)" }}>{formatCurrency(cumulative)}</strong></span>
        <span>Avg/month: <strong style={{ color: "var(--text)" }}>{formatCurrency(cumulative / yearMonths.length)}</strong></span>
      </div>
    </div>
  );
}

export default function TrendsTab({ monthData = [], byMonth = {}, monthKeys = [], selectedMonth, expenses = [] }) {
  const selectedYear = selectedMonth?.split("-")[0];

  const monthlyTotals = useMemo(() => monthKeys.map((m) => ({
    label: formatMonthLabel(m),
    month: m,
    total: (byMonth[m] || []).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  })), [byMonth, monthKeys]);

  // Category sparklines: last 6 months
  const last6Months = useMemo(() => {
    const priorM = getPrevMonths(selectedMonth, 5);
    return [selectedMonth, ...priorM].reverse().filter((m) => byMonth[m]);
  }, [selectedMonth, byMonth]);

  const categories = useMemo(() => {
    const cats = new Set(expenses.map((e) => e.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [expenses]);

  const catSparklineData = useMemo(() => {
    return categories.map((cat) => ({
      cat,
      data: last6Months.map((m) =>
        (byMonth[m] || []).filter((e) => e.category === cat).reduce((s, e) => s + (Number(e.amount) || 0), 0)
      ),
      currentTotal: (byMonth[selectedMonth] || [])
        .filter((e) => e.category === cat)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    })).filter((c) => c.data.some((v) => v > 0));
  }, [categories, last6Months, byMonth, selectedMonth]);

  const max = Math.max(...monthlyTotals.map((t) => t.total), 1);

  if (monthKeys.length < 2) {
    return (
      <EmptyState
        icon="📈"
        title="Not enough data for trends"
        message="Trends appear once you have 2+ months of expense data."
      />
    );
  }

  return (
    <div>
      {/* Month-over-month bar chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-label">Month over month</p>
        <div>
          {monthlyTotals.map((m, i) => (
            <div key={i} className="mom-bar-row">
              <span className="mom-bar-label" style={m.month === selectedMonth ? { color: "var(--green)", fontWeight: 700 } : {}}>
                {m.label}
              </span>
              <div className="mom-bar-track">
                <div
                  className="mom-bar-fill"
                  style={{
                    width: `${(m.total / max) * 100}%`,
                    background: m.month === selectedMonth ? "var(--green)" : "var(--border-focus)",
                    opacity: m.month === selectedMonth ? 1 : 0.45,
                    minWidth: m.total > 0 ? 3 : 0,
                  }}
                />
                <span className="mom-bar-val">{formatCurrency(m.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* YTD cumulative line */}
      {selectedYear && <YTDCumulativeLine byMonth={byMonth} monthKeys={monthKeys} selectedYear={selectedYear} />}

      {/* YoY comparison */}
      <YoYSection byMonth={byMonth} selectedMonth={selectedMonth} />

      {/* Category sparklines */}
      {catSparklineData.length > 0 && (
        <div className="card">
          <p className="section-label">Category trends (last 6 months)</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {catSparklineData.map(({ cat, data, currentTotal }) => {
              const prev = data[data.length - 2] || 0;
              const isAnomaly = prev > 0 && currentTotal > prev * 1.5;
              return (
                <div key={cat} style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                  <div style={{ width: 110, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: 2,
                          background: getCatColor(cat), display: "inline-block", flexShrink: 0
                        }}
                      />
                      {cat}
                      {isAnomaly && <span style={{ color: "var(--amber)", fontSize: 11 }}>⚠</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrency(currentTotal)}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Sparkline data={data} color={getCatColor(cat)} height={36} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
