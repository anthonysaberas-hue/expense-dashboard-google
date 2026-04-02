"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import TabBar from "./components/TabBar";
import OverviewTab from "./components/OverviewTab";
import TrendsTab from "./components/TrendsTab";
import CategoriesTab from "./components/CategoriesTab";
import InsightsTab from "./components/InsightsTab";
import ErrorBoundary from "./components/ErrorBoundary";
import DateRangePicker from "./components/DateRangePicker";
import TopCategories from "./components/TopCategories";
import { runInsights } from "./lib/insights";
import { getBudgets, setBudget, deleteBudget } from "./lib/budgets";
import { safeGet, safeSet } from "./lib/storage";
import { applyTheme, getTheme } from "./lib/theme";
import { formatMonthLabel } from "./lib/constants";

const TAB_LABELS = ["Overview", "Trends", "Categories", "Insights"];

function SkeletonLoader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 88 }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
      <div className="skeleton" style={{ height: 180 }} />
    </div>
  );
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [budgets, setBudgets] = useState(() => getBudgets());
  const [theme, setThemeState] = useState(() => getTheme());
  const [dismissedInsights, setDismissedInsights] = useState(() => safeGet("dismissed_insights", {}));
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const transactionsSearchRef = useRef(null);

  // ── Fetch ────────────────────────────────────────────────────
  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/expenses");
      if (!resp.ok) throw new Error(`API returned ${resp.status}`);
      const data = await resp.json();
      setExpenses(data.expenses || []);
      setLastUpdated(data.lastUpdated);
      setWriteEnabled(!!data.writeEnabled);
      const months = [...new Set(
        (data.expenses || []).map((e) => e.date?.substring(0, 7)).filter(Boolean)
      )].sort();
      if (months.length > 0) setSelectedMonth((prev) => prev || months[months.length - 1]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // ── Computed data ────────────────────────────────────────────
  const byMonth = useMemo(() => {
    const map = {};
    expenses.forEach((e) => {
      const m = e.date?.substring(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = [];
      map[m].push(e);
    });
    return map;
  }, [expenses]);

  const monthKeys = useMemo(() => Object.keys(byMonth).sort(), [byMonth]);
  const rawMonthData = byMonth[selectedMonth] || [];

  // Auto-set date range bounds when month changes
  useEffect(() => {
    if (selectedMonth) {
      const [y, m] = selectedMonth.split("-").map(Number);
      setDateRange({
        start: new Date(y, m - 1, 1),
        end: new Date(y, m, 0), // last day of month
      });
    }
  }, [selectedMonth]);

  // Filter by date range
  const monthData = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return rawMonthData;
    const startStr = `${dateRange.start.getFullYear()}-${String(dateRange.start.getMonth() + 1).padStart(2, "0")}-${String(dateRange.start.getDate()).padStart(2, "0")}`;
    const endStr = `${dateRange.end.getFullYear()}-${String(dateRange.end.getMonth() + 1).padStart(2, "0")}-${String(dateRange.end.getDate()).padStart(2, "0")}`;
    return rawMonthData.filter((e) => e.date >= startStr && e.date <= endStr);
  }, [rawMonthData, dateRange]);

  // Previous month data for TopCategories
  const prevMonthIdx = monthKeys.indexOf(selectedMonth);
  const prevMonthKey = prevMonthIdx > 0 ? monthKeys[prevMonthIdx - 1] : null;
  const prevMonthData = prevMonthKey ? (byMonth[prevMonthKey] || []) : [];

  const insights = useMemo(
    () => runInsights(expenses, budgets, selectedMonth),
    [expenses, budgets, selectedMonth]
  );

  const dismissedForMonth = useMemo(
    () => new Set(dismissedInsights[selectedMonth] || []),
    [dismissedInsights, selectedMonth]
  );

  const activeInsights = useMemo(
    () => insights.filter((i) => !dismissedForMonth.has(i.id)),
    [insights, dismissedForMonth]
  );

  const warningCount = useMemo(
    () => activeInsights.filter((i) => i.severity === "warning" || i.severity === "approaching").length,
    [activeInsights]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.matches("input, textarea, [contenteditable]")) return;
      if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        setActiveTab(Number(e.key) - 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const idx = monthKeys.indexOf(selectedMonth);
        if (idx > 0) setSelectedMonth(monthKeys[idx - 1]);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const idx = monthKeys.indexOf(selectedMonth);
        if (idx < monthKeys.length - 1) setSelectedMonth(monthKeys[idx + 1]);
      } else if (e.key === "/" && activeTab === 0) {
        e.preventDefault();
        transactionsSearchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeTab, monthKeys, selectedMonth]);

  // ── Actions ───────────────────────────────────────────────────
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "system" ? "dark" : prev === "dark" ? "light" : "system";
      applyTheme(next);
      return next;
    });
  }, []);

  const dismissInsight = useCallback((insightId) => {
    setDismissedInsights((prev) => {
      const updated = { ...prev, [selectedMonth]: [...(prev[selectedMonth] || []), insightId] };
      safeSet("dismissed_insights", updated);
      return updated;
    });
  }, [selectedMonth]);

  const handleSetBudget = useCallback((category, limit) => {
    setBudgets(setBudget(category, limit));
  }, []);

  const handleDeleteBudget = useCallback((category) => {
    setBudgets(deleteBudget(category));
  }, []);

  // ── Write operations ─────────────────────────────────────────
  const handleUpdateExpense = useCallback(async (id, fields) => {
    const res = await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }
    await fetchExpenses();
  }, [fetchExpenses]);

  const handleAddExpense = useCallback(async (data) => {
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Add failed");
    }
    await fetchExpenses();
  }, [fetchExpenses]);

  const handleBatchCategoryUpdate = useCallback(async (oldCategory, newCategory) => {
    // Find all expenses with the old category and update them
    const toUpdate = expenses.filter((e) => e.category === oldCategory && e.id);
    for (const expense of toUpdate) {
      await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: expense.id, category: newCategory }),
      });
    }
    await fetchExpenses();
  }, [expenses, fetchExpenses]);

  const handleDeleteExpense = useCallback(async (id) => {
    const res = await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Delete failed");
    }
    await fetchExpenses();
  }, [fetchExpenses]);

  // ── Tab rendering ─────────────────────────────────────────────
  const tabProps = { monthData, byMonth, monthKeys, selectedMonth, expenses };

  const renderTab = () => {
    switch (activeTab) {
      case 0: return (
        <OverviewTab
          {...tabProps}
          insights={activeInsights}
          onTabChange={setActiveTab}
          searchRef={transactionsSearchRef}
          writeEnabled={writeEnabled}
          onUpdate={handleUpdateExpense}
          onAdd={handleAddExpense}
          onDelete={handleDeleteExpense}
        />
      );
      case 1: return <TrendsTab {...tabProps} />;
      case 2: return <CategoriesTab {...tabProps} budgets={budgets} />;
      case 3: return (
        <InsightsTab
          insights={activeInsights}
          budgets={budgets}
          onSetBudget={handleSetBudget}
          onDeleteBudget={handleDeleteBudget}
          onDismiss={dismissInsight}
          monthData={monthData}
          onBatchCategoryUpdate={handleBatchCategoryUpdate}
        />
      );
      default: return null;
    }
  };

  const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="header" role="banner">
        <div className="header-inner">
          <div>
            <h1 className="header-title">Expense Dashboard</h1>
            <p className="header-sub">
              Live from Google Sheets
              {lastUpdated && ` · Updated ${new Date(lastUpdated).toLocaleString()}`}
            </p>
          </div>
          <div className="header-actions">
            <button
              onClick={toggleTheme}
              className="icon-btn"
              aria-label={`Toggle theme (currently ${theme})`}
              title="Toggle dark mode"
            >
              {isDark ? "☀" : "☾"}
            </button>
            <button
              onClick={fetchExpenses}
              className="btn-primary"
              disabled={loading}
              aria-label="Refresh data from Google Sheets"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Month selector + Date range picker */}
        {!loading && !error && monthKeys.length > 0 && (
          <div className="month-selector" role="group" aria-label="Select month">
            {monthKeys.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`month-pill${selectedMonth === m ? " active" : ""}`}
                aria-pressed={selectedMonth === m}
                aria-label={`View ${formatMonthLabel(m, false)}`}
              >
                {formatMonthLabel(m)}
              </button>
            ))}
            <DateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              onChange={(start, end) => setDateRange({ start, end })}
            />
          </div>
        )}
      </header>

      {/* ── Tab bar ────────────────────────────────────────── */}
      {!loading && !error && expenses.length > 0 && (
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} warningCount={warningCount} />
      )}

      {/* ── Main content ───────────────────────────────────── */}
      <main id="main-content" className="main-content" tabIndex={-1}>
        {loading ? (
          <SkeletonLoader />
        ) : error ? (
          <div className="error-state" role="alert">
            <strong>Error loading data:</strong> {error}
            <br />
            <button
              onClick={fetchExpenses}
              className="btn-primary"
              style={{ marginTop: 16 }}
            >
              Retry
            </button>
          </div>
        ) : expenses.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-secondary)" }}>No expenses yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
              Add expenses to your Google Sheet to populate this dashboard.
            </div>
          </div>
        ) : (
          <>
            {(activeTab === 0 || activeTab === 2) && monthData.length > 0 && (
              <TopCategories monthData={monthData} prevMonthData={prevMonthData} budgets={budgets} />
            )}
            <div
              key={`${activeTab}-${selectedMonth}`}
              className="tab-panel"
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              id={`tabpanel-${activeTab}`}
            >
              <ErrorBoundary key={activeTab}>
                {renderTab()}
              </ErrorBoundary>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
