"use client";

import { useState, useEffect, useCallback } from "react";

const CATEGORY_COLORS = {
  Groceries: "#2D6A4F",
  Dining: "#E76F51",
  Transportation: "#264653",
  Entertainment: "#E9C46A",
  Subscriptions: "#7209B7",
  Shopping: "#F4A261",
  Utilities: "#457B9D",
  Healthcare: "#D62828",
  Travel: "#1D9E75",
  Education: "#4361EE",
  Fitness: "#06D6A0",
  Uncategorized: "#888780",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getCatColor(cat) {
  return CATEGORY_COLORS[cat] || "#888780";
}

function formatCurrency(n) {
  return (
    "$" +
    Number(n)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}

function Spinner() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "4rem 0",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "3px solid rgba(0,0,0,0.08)",
          borderTopColor: "#2D6A4F",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: 13, color: "#888" }}>
        Loading from Google Sheets...
      </span>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e8e6e0",
        borderRadius: 12,
        padding: "1.2rem 1.4rem",
        flex: 1,
        minWidth: 170,
      }}
    >
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: accent || "#2c2c2a",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function MonthCompare({ current, previous, previousLabel }) {
  const diff = current - previous;
  const pct =
    previous > 0 ? ((diff / previous) * 100).toFixed(1) : "N/A";
  const isUp = diff > 0;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e8e6e0",
        borderRadius: 12,
        padding: "1.2rem 1.4rem",
        flex: 1,
        minWidth: 170,
      }}
    >
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        vs {previousLabel}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: isUp ? "#D62828" : "#2D6A4F",
          letterSpacing: "-0.02em",
        }}
      >
        {pct !== "N/A" ? `${isUp ? "+" : ""}${pct}%` : "—"}
      </div>
      <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
        {pct !== "N/A"
          ? `${formatCurrency(Math.abs(diff))} ${isUp ? "more" : "less"}`
          : "No prior data"}
      </div>
    </div>
  );
}

function BarChart({ data, title, labelKey, valueKey, color }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 14,
          color: "#555",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <span
              style={{
                fontSize: 12,
                width: 100,
                textAlign: "right",
                color: "#666",
                flexShrink: 0,
                fontWeight: 500,
              }}
            >
              {d[labelKey]}
            </span>
            <div
              style={{
                flex: 1,
                background: "#f0f0ec",
                borderRadius: 6,
                height: 28,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(d[valueKey] / max) * 100}%`,
                  height: "100%",
                  background:
                    typeof color === "function" ? color(d) : color,
                  borderRadius: 6,
                  transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
                  minWidth: d[valueKey] > 0 ? 3 : 0,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#444",
                }}
              >
                {formatCurrency(d[valueKey])}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  if (total === 0) return null;
  let cumulative = 0;
  const size = 180;
  const cx = size / 2,
    cy = size / 2,
    r = 64,
    strokeW = 26;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data
          .filter((d) => d.amount > 0)
          .map((d, i) => {
            const pct = d.amount / total;
            const offset = circumference * (1 - cumulative);
            cumulative += pct;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={getCatColor(d.category)}
                strokeWidth={strokeW}
                strokeDasharray={`${circumference * pct - 2} ${circumference * (1 - pct) + 2}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: "all 0.6s ease" }}
              />
            );
          })}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={18}
          fontWeight={700}
          fill="#2c2c2a"
          fontFamily="DM Sans"
        >
          {formatCurrency(total)}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize={11}
          fill="#888"
          fontFamily="DM Sans"
        >
          total
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data
          .filter((d) => d.amount > 0)
          .map((d, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: getCatColor(d.category),
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "#555", minWidth: 90 }}>
                {d.category}
              </span>
              <span style={{ color: "#2c2c2a", fontWeight: 600 }}>
                {formatCurrency(d.amount)}
              </span>
              <span style={{ color: "#aaa", fontSize: 11 }}>
                {((d.amount / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function RecentTable({ expenses }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");

  const categories = ["All", ...Array.from(new Set(expenses.map((e) => e.category))).sort()];

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "amount" ? "desc" : "asc"); }
  };

  const filtered = expenses
    .filter((e) => filterCat === "All" || e.category === filterCat)
    .filter((e) => {
      const q = search.toLowerCase();
      return !q || (e.vendor || "").toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = sortKey === "amount" ? (a.amount || 0) : sortKey === "vendor" ? (a.vendor || a.name || "") : (a.date || "");
      const bv = sortKey === "amount" ? (b.amount || 0) : sortKey === "vendor" ? (b.vendor || b.name || "") : (b.date || "");
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const cols = [
    { key: "date", label: "Date" },
    { key: "vendor", label: "Vendor" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search by name, vendor, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180, padding: "7px 12px", fontSize: 13,
            border: "1px solid #e0e0d8", borderRadius: 8, outline: "none",
            background: "#FAFAF8", color: "#2c2c2a",
          }}
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          style={{
            padding: "7px 12px", fontSize: 13, border: "1px solid #e0e0d8",
            borderRadius: 8, background: "#FAFAF8", color: "#2c2c2a", outline: "none",
          }}
        >
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        {(search || filterCat !== "All") && (
          <button
            onClick={() => { setSearch(""); setFilterCat("All"); }}
            style={{
              padding: "7px 12px", fontSize: 12, border: "1px solid #e0e0d8",
              borderRadius: 8, background: "#fff", color: "#888", cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: "#aaa", marginLeft: "auto" }}>
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e8e6e0" }}>
              {cols.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  style={{
                    textAlign: key === "amount" ? "right" : "left",
                    padding: "10px 12px",
                    color: sortKey === key ? "#2D6A4F" : "#999",
                    fontWeight: 600,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "#aaa", fontSize: 13 }}>
                  No transactions match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((e, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid #f0f0ec", transition: "background 0.15s" }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 12px", color: "#888" }}>{e.date}</td>
                  <td style={{ padding: "10px 12px", color: "#2c2c2a", fontWeight: 500 }}>{e.vendor || e.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{
                      background: getCatColor(e.category) + "15",
                      color: getCatColor(e.category),
                      padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                    }}>
                      {e.category}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#2c2c2a", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(e.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/expenses");
      if (!resp.ok) throw new Error("API returned " + resp.status);
      const data = await resp.json();
      setExpenses(data.expenses || []);
      setLastUpdated(data.lastUpdated);

      // Default to most recent month
      const months = [
        ...new Set(
          (data.expenses || [])
            .map((e) => e.date?.substring(0, 7))
            .filter(Boolean)
        ),
      ].sort();
      if (months.length > 0) setSelectedMonth(months[months.length - 1]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // Group by month
  const byMonth = {};
  expenses.forEach((e) => {
    const m = e.date?.substring(0, 7);
    if (!m) return;
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(e);
  });

  const monthKeys = Object.keys(byMonth).sort();
  const currentMonthData = byMonth[selectedMonth] || [];
  const currentIdx = monthKeys.indexOf(selectedMonth);
  const prevMonth = currentIdx > 0 ? monthKeys[currentIdx - 1] : null;
  const prevMonthData = prevMonth ? byMonth[prevMonth] : [];

  const currentTotal = currentMonthData.reduce(
    (s, e) => s + (e.amount || 0),
    0
  );
  const prevTotal = prevMonthData.reduce((s, e) => s + (e.amount || 0), 0);

  // Category breakdown
  const catTotals = {};
  currentMonthData.forEach((e) => {
    catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
  });
  const catData = Object.entries(catTotals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Monthly totals for bar chart
  const monthlyTotals = monthKeys.map((m) => ({
    label:
      MONTHS[parseInt(m.split("-")[1]) - 1] + " " + m.split("-")[0],
    month: m,
    total: byMonth[m].reduce((s, e) => s + (e.amount || 0), 0),
  }));

  const selectedLabel = selectedMonth
    ? MONTHS[parseInt(selectedMonth.split("-")[1]) - 1] +
      " " +
      selectedMonth.split("-")[0]
    : "";
  const prevLabel = prevMonth
    ? MONTHS[parseInt(prevMonth.split("-")[1]) - 1] +
      " " +
      prevMonth.split("-")[0]
    : "";

  const uniqueDays = new Set(currentMonthData.map((e) => e.date)).size;

  // Top vendor
  const vendorTotals = {};
  currentMonthData.forEach((e) => {
    const v = e.vendor || e.name;
    vendorTotals[v] = (vendorTotals[v] || 0) + (e.amount || 0);
  });
  const topVendor = Object.entries(vendorTotals).sort(
    (a, b) => b[1] - a[1]
  )[0];

  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        maxWidth: 860,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        color: "#2c2c2a",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.03em",
            }}
          >
            Expense dashboard
          </h1>
          <p style={{ fontSize: 12, color: "#999", margin: "6px 0 0" }}>
            Live from Google Sheets
            {lastUpdated &&
              ` · Updated ${new Date(lastUpdated).toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={fetchExpenses}
          style={{
            background: "#2D6A4F",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 18px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.01em",
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: 12,
            padding: "1.5rem",
            color: "#991B1B",
            fontSize: 14,
          }}
        >
          <strong>Error:</strong> {error}
          <br />
          <button
            onClick={fetchExpenses}
            style={{
              marginTop: 12,
              background: "#D62828",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : expenses.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e6e0",
            borderRadius: 12,
            padding: "3rem",
            textAlign: "center",
            color: "#888",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            No expenses yet
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            Send yourself a receipt email and your Make.com automation will
            populate this dashboard.
          </div>
        </div>
      ) : (
        <>
          {/* Month selector */}
          {monthKeys.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: "1.5rem",
                flexWrap: "wrap",
              }}
            >
              {monthKeys.map((m) => {
                const label =
                  MONTHS[parseInt(m.split("-")[1]) - 1] +
                  " '" +
                  m.split("-")[0].slice(2);
                const isSelected = selectedMonth === m;
                return (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(m)}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      border: isSelected
                        ? "2px solid #2D6A4F"
                        : "1px solid #ddd",
                      background: isSelected ? "#2D6A4F" : "#fff",
                      color: isSelected ? "#fff" : "#666",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Stat cards */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            <StatCard
              label={`${selectedLabel} total`}
              value={formatCurrency(currentTotal)}
              sub={`${currentMonthData.length} transactions`}
            />
            {prevMonth && (
              <MonthCompare
                current={currentTotal}
                previous={prevTotal}
                currentLabel={selectedLabel}
                previousLabel={prevLabel}
              />
            )}
            <StatCard
              label="Daily average"
              value={formatCurrency(
                uniqueDays > 0 ? currentTotal / uniqueDays : 0
              )}
              sub={`across ${uniqueDays} days`}
            />
            {topVendor && (
              <StatCard
                label="Top vendor"
                value={topVendor[0]}
                sub={formatCurrency(topVendor[1])}
              />
            )}
          </div>

          {/* Charts row */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e6e0",
                borderRadius: 12,
                padding: "1.4rem",
                flex: "1 1 280px",
                minWidth: 280,
              }}
            >
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 16,
                  color: "#555",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                By category
              </h3>
              <DonutChart data={catData} />
            </div>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e6e0",
                borderRadius: 12,
                padding: "1.4rem",
                flex: "2 1 340px",
                minWidth: 300,
              }}
            >
              <BarChart
                data={catData}
                title="Category breakdown"
                labelKey="category"
                valueKey="amount"
                color={(d) => getCatColor(d.category)}
              />
            </div>
          </div>

          {/* Month over month */}
          {monthlyTotals.length > 1 && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e6e0",
                borderRadius: 12,
                padding: "1.4rem",
                marginBottom: "1.5rem",
              }}
            >
              <BarChart
                data={monthlyTotals}
                title="Month over month"
                labelKey="label"
                valueKey="total"
                color="#2D6A4F"
              />
            </div>
          )}

          {/* Transactions table */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e8e6e0",
              borderRadius: 12,
              padding: "1.4rem",
            }}
          >
            <h3
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 14,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Transactions — {selectedLabel}
            </h3>
            {currentMonthData.length === 0 ? (
              <p style={{ color: "#888", fontSize: 13, padding: "1rem 0" }}>
                No transactions this month.
              </p>
            ) : (
              <RecentTable
                expenses={currentMonthData.sort((a, b) =>
                  b.date.localeCompare(a.date)
                )}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
