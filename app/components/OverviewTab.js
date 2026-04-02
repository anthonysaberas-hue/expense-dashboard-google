"use client";
import { useMemo } from "react";
import { getCatColor, formatCurrency, formatMonthLabel, MONTHS, getNetAmount } from "../lib/constants";
import EmptyState from "./EmptyState";

function StatCard({ label, value, sub, accentColor }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accentColor ? { color: accentColor } : {}}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  if (total === 0) return null;
  let cumulative = 0;
  const size = 160;
  const cx = size / 2, cy = size / 2, r = 56, strokeW = 22;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="donut-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {data.filter((d) => d.amount > 0).map((d, i) => {
          const pct = d.amount / total;
          const offset = circumference * (1 - cumulative);
          cumulative += pct;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={getCatColor(d.category)}
              strokeWidth={strokeW}
              strokeDasharray={`${circumference * pct - 1.5} ${circumference * (1 - pct) + 1.5}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: "all 0.5s ease" }}
            />
          );
        })}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--text)">
          {formatCurrency(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
          total
        </text>
      </svg>
      <div className="donut-legend">
        {data.filter((d) => d.amount > 0).map((d, i) => (
          <div key={i} className="donut-legend-item">
            <div className="donut-dot" style={{ background: getCatColor(d.category) }} />
            <span style={{ color: "var(--text-secondary)", minWidth: 86 }}>{d.category}</span>
            <span style={{ color: "var(--text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(d.amount)}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 2 }}>
              {((d.amount / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, colorFn }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {data.map((d, i) => (
        <div key={i} className="mom-bar-row">
          <span className="mom-bar-label">{d[labelKey]}</span>
          <div className="mom-bar-track">
            <div
              className="mom-bar-fill"
              style={{
                width: `${(d[valueKey] / max) * 100}%`,
                background: colorFn ? colorFn(d) : "var(--green)",
                minWidth: d[valueKey] > 0 ? 3 : 0,
              }}
            />
            <span className="mom-bar-val">{formatCurrency(d[valueKey])}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OverviewTab({
  monthData = [],
  byMonth = {},
  monthKeys = [],
  selectedMonth,
  expenses = [],
  insights = [],
  onTabChange,
}) {
  const total = useMemo(() => monthData.reduce((s, e) => s + getNetAmount(e), 0), [monthData]);
  const currentIdx = monthKeys.indexOf(selectedMonth);
  const prevMonth = currentIdx > 0 ? monthKeys[currentIdx - 1] : null;
  const prevData = prevMonth ? (byMonth[prevMonth] || []) : [];
  const prevTotal = prevData.reduce((s, e) => s + getNetAmount(e), 0);

  const uniqueDays = useMemo(() => new Set(monthData.map((e) => e.date)).size, [monthData]);
  const dailyAvg = uniqueDays > 0 ? total / uniqueDays : 0;

  const catTotals = useMemo(() => {
    const ct = {};
    monthData.forEach((e) => {
      ct[e.category] = (ct[e.category] || 0) + getNetAmount(e);
    });
    return Object.entries(ct).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [monthData]);

  const vendorTotals = useMemo(() => {
    const vt = {};
    monthData.forEach((e) => {
      const v = e.vendor || e.name;
      if (v) vt[v] = (vt[v] || 0) + getNetAmount(e);
    });
    return Object.entries(vt).sort((a, b) => b[1] - a[1]);
  }, [monthData]);

  const topVendor = vendorTotals[0];
  const topCat = catTotals[0];

  const diff = total - prevTotal;
  const pct = prevTotal > 0 ? ((diff / prevTotal) * 100).toFixed(1) : null;
  const isUp = diff > 0;

  const selectedLabel = formatMonthLabel(selectedMonth, false);
  const prevLabel = formatMonthLabel(prevMonth, false);

  const warnings = insights.filter((i) => i.severity === "warning" || i.severity === "approaching");
  const topWarning = warnings[0];

  const recent5 = useMemo(() =>
    [...monthData].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5),
    [monthData]
  );

  if (monthData.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title="No expenses this month"
        message="Select a different month or add expenses to your Google Sheet."
      />
    );
  }

  return (
    <div>
      {/* Warning banner */}
      {topWarning && (
        <div className="warning-banner" role="alert">
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
          <div>
            <strong>{topWarning.title}</strong>
            <div style={{ fontSize: 13, marginTop: 2 }}>{topWarning.body}</div>
          </div>
          <button
            onClick={() => onTabChange(4)}
            style={{
              marginLeft: "auto",
              flexShrink: 0,
              background: "none",
              border: "1px solid var(--red)",
              borderRadius: "var(--radius-sm)",
              color: "var(--red)",
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
            aria-label="View all insights"
          >
            View all →
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <StatCard
          label={`${selectedLabel} total`}
          value={formatCurrency(total)}
          sub={`${monthData.length} transactions`}
        />
        <StatCard
          label={prevLabel ? `vs ${prevLabel}` : "Month change"}
          value={pct !== null ? `${isUp ? "+" : ""}${pct}%` : "—"}
          sub={pct !== null ? `${formatCurrency(Math.abs(diff))} ${isUp ? "more" : "less"}` : "No prior data"}
          accentColor={pct !== null ? (isUp ? "var(--red)" : "var(--green)") : undefined}
        />
        <StatCard
          label="Daily average"
          value={formatCurrency(dailyAvg)}
          sub={`across ${uniqueDays} day${uniqueDays !== 1 ? "s" : ""}`}
        />
        {topVendor ? (
          <StatCard label="Top vendor" value={topVendor[0]} sub={formatCurrency(topVendor[1])} />
        ) : topCat ? (
          <StatCard label="Top category" value={topCat.category} sub={formatCurrency(topCat.amount)} />
        ) : null}
      </div>

      {/* Charts row */}
      <div className="charts-row">
        <div className="card">
          <p className="section-label">By category</p>
          <DonutChart data={catTotals} />
        </div>
        <div className="card">
          <p className="section-label">Category breakdown</p>
          <BarChart data={catTotals} labelKey="category" valueKey="amount" colorFn={(d) => getCatColor(d.category)} />
        </div>
      </div>

      {/* Recent 5 transactions */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p className="section-label" style={{ margin: 0 }}>Recent transactions</p>
          <button
            className="btn-ghost"
            onClick={() => onTabChange(3)}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            View all →
          </button>
        </div>
        <table className="tx-table" aria-label="Recent transactions">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Date</th>
              <th style={{ textAlign: "left" }}>Vendor</th>
              <th style={{ textAlign: "left" }}>Category</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {recent5.map((e, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-muted)" }}>{e.date}</td>
                <td style={{ fontWeight: 500 }}>{e.vendor || e.name}</td>
                <td>
                  <span
                    className="cat-badge"
                    style={{
                      background: getCatColor(e.category) + "18",
                      color: getCatColor(e.category),
                    }}
                  >
                    {e.category}
                  </span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrency(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
