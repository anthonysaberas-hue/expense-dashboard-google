"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import EditableCell from "./EditableCell";
import CategoryPicker from "./CategoryPicker";
import VendorInput from "./VendorInput";
import { formatCurrency } from "../lib/constants";
import { getSetting, setSetting } from "../lib/settings";
import { FREQUENCIES, nextOccurrence, monthlyEquivalent } from "../lib/recurring";
import { localDateString } from "../lib/money";

const prettyDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// ── Vendors: usual category per vendor ─────────────────────────
function VendorsSection({ vendorIndex, categories, writeEnabled }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(40);
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () => vendorIndex
      .filter((v) => !q || v.name.toLowerCase().includes(q) || v.key.includes(q))
      .sort((a, b) => b.count - a.count || b.total - a.total),
    [vendorIndex, q]
  );

  const setPin = (v, category) => {
    const pins = { ...getSetting("vendor_categories") };
    if (!category || category === v.learned) delete pins[v.key];
    else pins[v.key] = category;
    setSetting("vendor_categories", pins);
  };

  return (
    <div>
      <p className="settings-help">
        New expenses from a vendor start with its usual category. It&apos;s learned from your history; tap one to choose
        a different default. Changing a single transaction never changes these.
      </p>
      <input
        type="search"
        className="search-input"
        placeholder={`Search ${vendorIndex.length} vendors…`}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setLimit(40); }}
        style={{ width: "100%", marginBottom: 10 }}
        aria-label="Search vendors"
      />
      <ul className="settings-list">
        {list.slice(0, limit).map((v) => (
          <li key={v.key} className="settings-row">
            <div className="settings-row-main">
              <span className="settings-row-title">{v.name}</span>
              <span className="settings-row-sub">
                {v.count}× · {formatCurrency(v.total)}
                {v.pinned && v.learned && v.pinned !== v.learned && <> · usually {v.learned}</>}
              </span>
            </div>
            <div className="settings-row-side">
              <span className="cat-badge">
                <EditableCell
                  value={v.category || ""}
                  field="usual category"
                  type="category"
                  options={categories}
                  onSave={(f, c) => setPin(v, c)}
                  disabled={!writeEnabled}
                />
              </span>
              {v.pinned ? (
                <button className="settings-chip" onClick={() => setPin(v, null)} title={v.learned ? `Go back to ${v.learned}` : "Remove"}>
                  chosen ×
                </button>
              ) : v.learned ? (
                <span className="settings-chip muted">learned</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <button className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setLimit((n) => n + 80)}>
          Show more ({list.length - limit})
        </button>
      )}
      {list.length === 0 && <p className="settings-help">No vendors match.</p>}
    </div>
  );
}

// ── Recurring payments ─────────────────────────────────────────
const emptyForm = () => ({ vendor: "", amount: "", category: "Uncategorized", frequency: "monthly", startDate: localDateString(), endDate: "", notes: "" });

function RecurringForm({ initial, categories, vendorIndex, onSubmit, onCancel, submitLabel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(""); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.vendor.trim()) return setError("Who charges you?");
    if (!(parseFloat(form.amount) > 0)) return setError("Enter the amount");
    setBusy(true);
    try {
      await onSubmit({ ...form, vendor: form.vendor.trim(), amount: parseFloat(String(form.amount).replace(",", ".")) });
    } catch (err) {
      setError(err.message || "Couldn't save");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="recurring-form">
      <div className="modal-field">
        <label className="modal-label" htmlFor="rec-vendor">Vendor</label>
        <VendorInput
          id="rec-vendor"
          value={form.vendor}
          vendorIndex={vendorIndex}
          placeholder="e.g. Apple"
          onChange={(v) => set("vendor", v)}
          onPick={(v) => setForm((f) => ({ ...f, vendor: v.name, category: f.category === "Uncategorized" && v.category ? v.category : f.category }))}
        />
      </div>
      <div className="modal-row">
        <div className="modal-field" style={{ flex: 1 }}>
          <label className="modal-label" htmlFor="rec-amount">Amount</label>
          <input id="rec-amount" type="text" inputMode="decimal" className="search-input" style={{ width: "100%" }}
            placeholder="0.00" value={form.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))} />
        </div>
        <div className="modal-field" style={{ flex: 1 }}>
          <label className="modal-label" htmlFor="rec-frequency">Repeats</label>
          <select id="rec-frequency" className="filter-select" style={{ width: "100%" }} value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
            {Object.entries(FREQUENCIES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="modal-field">
        <span className="modal-label">Category</span>
        <CategoryPicker value={form.category} categories={categories} onSelect={(c) => set("category", c)} style={{ width: "100%" }} />
      </div>
      <div className="modal-row">
        <div className="modal-field" style={{ flex: 1 }}>
          <label className="modal-label" htmlFor="rec-start">{initial.lastCreated ? "Charges from" : "First charge"}</label>
          <input id="rec-start" type="date" className="search-input" style={{ width: "100%" }} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div className="modal-field" style={{ flex: 1 }}>
          <label className="modal-label" htmlFor="rec-end">Ends (optional)</label>
          <input id="rec-end" type="date" className="search-input" style={{ width: "100%" }} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
      </div>
      {!initial.lastCreated && form.startDate < localDateString() && (
        <p className="settings-help">Charges from {prettyDate(form.startDate)} up to today will be added too.</p>
      )}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}

function RecurringSection({ categories, vendorIndex, writeEnabled, save, onExpensesChanged }) {
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/recurring", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load");
      setItems(data.items);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Add any charge that's now due (e.g. a first charge of today)
  const runDue = async () => {
    const { created } = await save("/api/recurring/run", "POST", { today: localDateString() });
    if (created > 0) onExpensesChanged?.();
  };

  const create = async (form) => {
    await save("/api/recurring", "POST", form);
    setAdding(false);
    await load();
    await runDue();
    await load();
  };

  const update = async (id, fields) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...fields } : i)));
    await save("/api/recurring", "PATCH", { id, ...fields });
    if (fields.active || fields.startDate || fields.endDate !== undefined) { await runDue(); await load(); }
  };

  const remove = async (item) => {
    if (!confirm(`Stop ${item.vendor}? Charges already added stay in your expenses.`)) return;
    setItems((list) => list.filter((i) => i.id !== item.id));
    await save(`/api/recurring?id=${encodeURIComponent(item.id)}`, "DELETE");
  };

  const active = (items || []).filter((i) => i.active);
  const fixed = active.reduce((s, i) => s + Math.round(monthlyEquivalent(i) * 100), 0) / 100;

  if (loadError) return <p className="modal-error">Couldn&apos;t load recurring payments: {loadError}</p>;
  if (!items) return <div className="skeleton" style={{ height: 120 }} />;

  return (
    <div>
      <div className="recurring-summary">
        <div>
          <span className="settings-row-sub">Fixed costs</span>
          <strong>{formatCurrency(fixed)}<span className="settings-row-sub"> / month</span></strong>
        </div>
        {writeEnabled && !adding && (
          <button className="btn-primary" onClick={() => { setAdding(true); setEditingId(null); }}>+ Add</button>
        )}
      </div>
      <p className="settings-help">Added to your expenses automatically on the day they&apos;re due.</p>

      {adding && (
        <RecurringForm initial={emptyForm()} categories={categories} vendorIndex={vendorIndex}
          onSubmit={create} onCancel={() => setAdding(false)} submitLabel="Add recurring" />
      )}

      <ul className="settings-list">
        {items.map((item) => (
          <li key={item.id} className={`settings-row recurring-row${item.active ? "" : " paused"}`}>
            {editingId === item.id ? (
              <RecurringForm
                initial={{ ...item, amount: String(item.amount) }}
                categories={categories}
                vendorIndex={vendorIndex}
                submitLabel="Save"
                onCancel={() => setEditingId(null)}
                onSubmit={async (f) => {
                  setEditingId(null);
                  await update(item.id, { vendor: f.vendor, amount: f.amount, category: f.category, frequency: f.frequency, startDate: f.startDate, endDate: f.endDate });
                }}
              />
            ) : (
              <>
                <div className="settings-row-main">
                  <span className="settings-row-title">{item.vendor}</span>
                  <span className="settings-row-sub">
                    {FREQUENCIES[item.frequency] || item.frequency} · {item.category}
                    {item.active
                      ? (nextOccurrence(item) ? <> · next {prettyDate(nextOccurrence(item))}</> : <> · ended</>)
                      : <> · paused</>}
                  </span>
                </div>
                <div className="settings-row-side">
                  <strong className="recurring-amount">{formatCurrency(item.amount)}</strong>
                  {writeEnabled && (
                    <div className="split-actions">
                      <button
                        className="btn-ghost mobile-tap-target"
                        onClick={() => {
                          if (item.active) return update(item.id, { active: false });
                          // Resuming skips what was missed while paused; today's charge still counts
                          const yesterday = localDateString(new Date(Date.now() - 86400000));
                          update(item.id, { active: true, lastCreated: item.lastCreated > yesterday ? item.lastCreated : yesterday });
                        }}
                      >
                        {item.active ? "Pause" : "Resume"}
                      </button>
                      <button className="btn-ghost mobile-tap-target" onClick={() => { setEditingId(item.id); setAdding(false); }}>Edit</button>
                      <button className="btn-ghost mobile-tap-target" style={{ color: "var(--red)" }} onClick={() => remove(item)}>Delete</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && !adding && (
        <p className="settings-help">Nothing yet. Add your Apple subscription, rent, phone plan…</p>
      )}
    </div>
  );
}

export default function SettingsModal({ initialSection = "vendors", vendorIndex, categories, writeEnabled, save, onExpensesChanged, onClose }) {
  const [section, setSection] = useState(initialSection);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && !e.target.closest?.('[role="combobox"]') && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button ref={closeRef} onClick={onClose} className="modal-close" aria-label="Close">×</button>
        </div>
        <div className="settings-tabs" role="tablist">
          {[["vendors", "Vendors"], ["recurring", "Recurring"]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={section === k} className={`settings-tab${section === k ? " active" : ""}`} onClick={() => setSection(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {section === "vendors" ? (
            <VendorsSection vendorIndex={vendorIndex} categories={categories} writeEnabled={writeEnabled} />
          ) : (
            <RecurringSection categories={categories} vendorIndex={vendorIndex} writeEnabled={writeEnabled} save={save} onExpensesChanged={onExpensesChanged} />
          )}
        </div>
      </div>
    </div>
  );
}
