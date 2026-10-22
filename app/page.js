"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import TabBar from "./components/TabBar";
import OverviewTab from "./components/OverviewTab";
import TrendsTab from "./components/TrendsTab";
import InsightsTab from "./components/InsightsTab";
import PeopleTab from "./components/PeopleTab";
import { allocatePayment } from "./lib/allocatePayment";
import { withNetAmounts, buildInstallments, toCents } from "./lib/money";
import AssetsTab from "./components/AssetsTab";
import ErrorBoundary from "./components/ErrorBoundary";
import DateRangePicker from "./components/DateRangePicker";
import TopCategories from "./components/TopCategories";
import { runInsights } from "./lib/insights";
import { getBudgets, setBudget, deleteBudget } from "./lib/budgets";
import { getSetting, setSetting, syncSettings, subscribeSettings } from "./lib/settings";
import { applyTheme, getTheme } from "./lib/theme";
import { formatMonthLabel } from "./lib/constants";

function SkeletonLoader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-busy="true" aria-label="Loading">
      <div className="kpi-grid">
        {[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 88 }} />)}
      </div>
      <div className="charts-row">
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
      {[0,1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 56 }} />)}
    </div>
  );
}

export default function Dashboard() {
  const [rawExpenses, setRawExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [splits, setSplits] = useState([]);
  const [photoCounts, setPhotoCounts] = useState({});
  const [activeTab, setActiveTab] = useState(0);
  const [budgets, setBudgets] = useState(() => getBudgets());
  const [theme, setThemeState] = useState(() => getTheme());
  const [dismissedInsights, setDismissedInsights] = useState(() => getSetting("dismissed_insights"));
  const [settingsReady, setSettingsReady] = useState(false);
  const [, setSettingsVersion] = useState(0);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const transactionsSearchRef = useRef(null);

  // ── Fetch ────────────────────────────────────────────────────
  // First load shows the skeleton; later refreshes keep the page on screen
  const fetchExpenses = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/expenses");
      if (!resp.ok) throw new Error(`API returned ${resp.status}`);
      const data = await resp.json();
      setRawExpenses(data.expenses || []);
      setSplits(data.splits || []);
      setLastUpdated(data.lastUpdated);
      setWriteEnabled(!!data.writeEnabled);
      const months = [...new Set(
        (data.expenses || []).map((e) => e.date?.substring(0, 7)).filter(Boolean)
      )].sort();
      if (months.length > 0) setSelectedMonth((prev) => {
        if (prev) return prev;
        // Default to current calendar month if it has data, otherwise latest month with data
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        return months.includes(currentMonth) ? currentMonth : months[months.length - 1];
      });
    } catch (err) {
      if (silent) setSaveError(err.message); else setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // ── Settings (categories, budgets, …) synced via the sheet's Settings tab ──
  const loadSettings = useCallback(async () => {
    try {
      await syncSettings();
    } catch (err) {
      console.error(err); // keep working from the local copy
    }
    setBudgets(getBudgets());
    setDismissedInsights(getSetting("dismissed_insights"));
    setSettingsReady(true);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  // Components read settings during render; re-render when they change
  useEffect(() => subscribeSettings(() => setSettingsVersion((v) => v + 1)), []);

  // Warn before closing the tab while a save is still in flight
  useEffect(() => {
    if (pendingSaves === 0) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingSaves]);

  useEffect(() => {
    if (!saveError) return;
    const t = setTimeout(() => setSaveError(null), 8000);
    return () => clearTimeout(t);
  }, [saveError]);

  // Net amounts are recomputed on the client so local edits update totals instantly
  const expenses = useMemo(() => withNetAmounts(rawExpenses, splits), [rawExpenses, splits]);

  // ── Photo counts (one request, grouped by expense id) ──────────
  const fetchPhotoCounts = useCallback(async () => {
    try {
      const resp = await fetch("/api/photos");
      if (!resp.ok) {
        // Drive not configured yet (503) or any other failure — degrade to
        // an empty map rather than breaking the page.
        setPhotoCounts({});
        return;
      }
      const rows = await resp.json();
      const list = Array.isArray(rows) ? rows : [];
      const counts = {};
      for (const row of list) {
        const expId = row.ExpenseID ?? row.expenseId;
        if (!expId) continue;
        counts[expId] = (counts[expId] || 0) + 1;
      }
      setPhotoCounts(counts);
    } catch {
      setPhotoCounts({});
    }
  }, []);

  useEffect(() => { fetchPhotoCounts(); }, [fetchPhotoCounts]);

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

  // Filter by date range — cross-month ranges filter from ALL expenses
  const monthData = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return rawMonthData;
    const startStr = `${dateRange.start.getFullYear()}-${String(dateRange.start.getMonth() + 1).padStart(2, "0")}-${String(dateRange.start.getDate()).padStart(2, "0")}`;
    const endStr = `${dateRange.end.getFullYear()}-${String(dateRange.end.getMonth() + 1).padStart(2, "0")}-${String(dateRange.end.getDate()).padStart(2, "0")}`;
    const startMonth = startStr.substring(0, 7);
    const endMonth = endStr.substring(0, 7);
    // If range spans multiple months, filter from all expenses
    const source = startMonth !== endMonth ? expenses : rawMonthData;
    return source.filter((e) => e.date >= startStr && e.date <= endStr);
  }, [rawMonthData, expenses, dateRange]);

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
      if (e.key >= "1" && e.key <= "5") {
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
      setSetting("dismissed_insights", updated);
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
  // Every change is applied to the screen first, then saved in one request in
  // the background. If the save fails we show why and reload from the sheet,
  // which is the source of truth.
  const save = useCallback(async (url, method, body) => {
    setPendingSaves((n) => n + 1);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
      return await res.json().catch(() => ({}));
    } catch (err) {
      setSaveError(err.message || "Save failed");
      fetchExpenses({ silent: true });
      throw err;
    } finally {
      setPendingSaves((n) => n - 1);
    }
  }, [fetchExpenses]);

  const patchExpensesLocal = (patchById) =>
    setRawExpenses((prev) => prev.map((e) => (patchById[e.id] ? { ...e, ...patchById[e.id] } : e)));

  const patchSplitsLocal = (patchById) =>
    setSplits((prev) => prev.map((s) => (patchById[s.splitId] ? { ...s, ...patchById[s.splitId] } : s)));

  const handleUpdateExpense = useCallback(async (id, fields) => {
    patchExpensesLocal({ [id]: fields });
    await save("/api/expenses", "PATCH", { id, ...fields });
  }, [save]);

  // Accepts one expense or a list (installments); returns once it's on screen
  const handleAddExpense = useCallback(async (dataOrRows, archive) => {
    const rows = Array.isArray(dataOrRows) ? dataOrRows : [dataOrRows];
    const tempIds = rows.map(() => `tmp-${crypto.randomUUID()}`);
    setRawExpenses((prev) => {
      const maxOrder = prev.reduce((m, e) => Math.max(m, e._order || 0), 0);
      const added = rows.map((r, i) => ({
        id: tempIds[i],
        name: r.name || r.vendor || "",
        vendor: r.vendor || "",
        date: r.date,
        amount: Number(r.amount) || 0,
        category: r.category || "Uncategorized",
        repaid: Number(r.repaid) || 0,
        notes: r.notes || "",
        source: "Dashboard",
        _order: maxOrder + i + 1,
      }));
      const kept = archive ? prev.filter((e) => e.id !== archive.id) : prev;
      return [...kept, ...added];
    });
    save("/api/expenses", "POST", { rows, archive })
      .then(({ ids = [] }) => {
        const realId = Object.fromEntries(tempIds.map((t, i) => [t, ids[i]]));
        setRawExpenses((prev) => prev.map((e) => (realId[e.id] ? { ...e, id: realId[e.id] } : e)));
      })
      .catch(() => {});
  }, [save]);

  const handleBatchCategoryUpdate = useCallback(async (oldCategory, newCategory) => {
    const ids = rawExpenses.filter((e) => e.category === oldCategory && e.id).map((e) => e.id);
    if (ids.length === 0) return;
    patchExpensesLocal(Object.fromEntries(ids.map((id) => [id, { category: newCategory }])));
    await save("/api/expenses", "PATCH", { updates: ids.map((id) => ({ id, category: newCategory })) });
  }, [rawExpenses, save]);

  const handleDeleteExpense = useCallback(async (id) => {
    setRawExpenses((prev) => prev.filter((e) => e.id !== id));
    setSplits((prev) => prev.filter((s) => s.expenseId !== id));
    await save(`/api/expenses?id=${encodeURIComponent(id)}`, "DELETE");
  }, [save]);

  // ── Split operations ─────────────────────────────────────
  const handleSplitExpense = useCallback(async (expenseId, person, share) => {
    const tempId = `tmp-${crypto.randomUUID()}`;
    setSplits((prev) => [...prev, { splitId: tempId, expenseId, person, share: Number(share) || 0, repaid: 0, status: "pending" }]);
    const { splitId } = await save("/api/splits", "POST", { expenseId, person, share });
    setSplits((prev) => prev.map((s) => (s.splitId === tempId ? { ...s, splitId } : s)));
  }, [save]);

  const handleRecordPayment = useCallback(async (splitId, repaid, status) => {
    patchSplitsLocal({ [splitId]: { repaid, status } });
    await save("/api/splits", "PATCH", { splitId, repaid, status });
  }, [save]);

  const handleForgive = useCallback(async (splitId, forgiveAmount, person, expenseRef, currentRepaid) => {
    patchSplitsLocal({ [splitId]: { status: "forgiven", repaid: currentRepaid || 0 } });
    await save("/api/splits", "PATCH", { splitId, action: "forgive", forgiveAmount, person, expenseRef, currentRepaid });
  }, [save]);

  // Settle a set of splits (all / a month / by amount) in one request
  const applySplitUpdates = useCallback(async (updates) => {
    if (updates.length === 0) return;
    patchSplitsLocal(Object.fromEntries(updates.map((u) => [u.splitId, { repaid: u.repaid, status: u.status }])));
    await save("/api/splits", "PATCH", { updates });
  }, [save]);

  const isOutstanding = (sp) => sp.status !== "forgiven" && toCents(sp.repaid) < toCents(sp.share);

  const handleSettleAllForPerson = useCallback(async (person) => {
    await applySplitUpdates(
      splits.filter((sp) => sp.person === person && isOutstanding(sp))
        .map((sp) => ({ splitId: sp.splitId, repaid: sp.share, status: "settled" }))
    );
  }, [splits, applySplitUpdates]);

  const handleSettleMonthForPerson = useCallback(async (person, yyyymm) => {
    const expenseById = {};
    rawExpenses.forEach((e) => { if (e.id) expenseById[e.id] = e; });
    await applySplitUpdates(
      splits.filter((sp) => {
        if (sp.person !== person || !isOutstanding(sp)) return false;
        const date = expenseById[sp.expenseId]?.date;
        return (date ? date.slice(0, 7) : "unknown") === yyyymm;
      }).map((sp) => ({ splitId: sp.splitId, repaid: sp.share, status: "settled" }))
    );
  }, [splits, rawExpenses, applySplitUpdates]);

  const handleSettleAmountForPerson = useCallback(async (person, amount) => {
    const expenseById = {};
    rawExpenses.forEach((e) => { if (e.id) expenseById[e.id] = e; });
    const { updates } = allocatePayment(splits, expenseById, person, amount);
    await applySplitUpdates(updates.map((u) => ({ splitId: u.split.splitId, repaid: u.repaid, status: u.status })));
  }, [splits, rawExpenses, applySplitUpdates]);

  const handleSplitMonths = useCallback(async (expense, monthCount) => {
    const rows = buildInstallments(
      { date: expense.date, amount: expense.amount, notes: expense.notes, label: expense.vendor || expense.name },
      monthCount
    ).map((r) => ({
      ...r,
      vendor: expense.vendor || expense.name,
      name: expense.name || expense.vendor,
      category: expense.category,
    }));
    // Original is archived (amount 0 + note) rather than deleted, for traceability
    await handleAddExpense(rows, {
      id: expense.id,
      amount: 0,
      notes: `[Split into ${monthCount} months] ${expense.notes || ""}`.trim(),
    });
  }, [handleAddExpense]);

  const handleDeleteSplit = useCallback(async (splitId) => {
    setSplits((prev) => prev.filter((s) => s.splitId !== splitId));
    await save(`/api/splits?splitId=${encodeURIComponent(splitId)}`, "DELETE");
  }, [save]);

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
          splits={splits}
          photoCounts={photoCounts}
          onPhotosChanged={fetchPhotoCounts}
          onSplit={handleSplitExpense}
          onSplitMonths={handleSplitMonths}
          budgets={budgets}
        />
      );
      case 1: return (
        <PeopleTab
          expenses={expenses}
          splits={splits}
          onRecordPayment={handleRecordPayment}
          onForgive={handleForgive}
          onDeleteSplit={handleDeleteSplit}
          onSettleAll={handleSettleAllForPerson}
          onSettleMonth={handleSettleMonthForPerson}
          onSettleAmount={handleSettleAmountForPerson}
          writeEnabled={writeEnabled}
          onUpdateExpense={handleUpdateExpense}
          photoCounts={photoCounts}
          onPhotosChanged={fetchPhotoCounts}
        />
      );
      case 2: return <TrendsTab {...tabProps} />;
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
      case 4: return <AssetsTab />;
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
              {pendingSaves > 0 ? (
                <span className="saving-indicator" aria-live="polite">Saving to Google Sheets…</span>
              ) : (
                <>
                  Live from Google Sheets
                  {lastUpdated && ` · Updated ${new Date(lastUpdated).toLocaleString()}`}
                </>
              )}
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
              onClick={() => { fetchExpenses({ silent: true }); loadSettings(); }}
              className="btn-primary"
              disabled={loading || refreshing}
              aria-label="Refresh data from Google Sheets"
            >
              {loading ? "Loading…" : refreshing ? "Refreshing…" : "Refresh"}
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
      {!loading && !error && (
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} warningCount={warningCount} />
      )}

      {/* ── Main content ───────────────────────────────────── */}
      <main id="main-content" className="main-content" tabIndex={-1}>
        {loading || !settingsReady ? (
          <SkeletonLoader />
        ) : error ? (
          <div className="error-state" role="alert">
            <strong>Error loading data:</strong> {error}
            <br />
            <button
              onClick={() => fetchExpenses()}
              className="btn-primary"
              style={{ marginTop: 16 }}
            >
              Retry
            </button>
          </div>
        ) : expenses.length === 0 && activeTab !== 4 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-secondary)" }}>No expenses yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
              Add expenses to your Google Sheet to populate this dashboard.
            </div>
          </div>
        ) : (
          <>
            {activeTab === 0 && monthData.length > 0 && (
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

      {saveError && (
        <div className="save-toast" role="alert">
          <span>Couldn&apos;t save: {saveError}. Showing what&apos;s in your sheet.</span>
          <button onClick={() => setSaveError(null)} className="save-toast-close" aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );
}
