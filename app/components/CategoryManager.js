"use client";
import { useState, useMemo } from "react";
import { getCatColor, CATEGORY_COLORS } from "../lib/constants";
import { safeGet, safeSet } from "../lib/storage";

const DEFAULT_EMOJIS = {
  Groceries: "🛒", Dining: "🍽️", Transportation: "🚗", Entertainment: "🎬",
  Subscriptions: "📱", Shopping: "🛍️", Utilities: "🏠", Healthcare: "💊",
  Travel: "✈️", Education: "📚", Fitness: "💪", Uncategorized: "📦",
};

const COLOR_OPTIONS = [
  "#2D6A4F", "#E76F51", "#264653", "#E9C46A", "#7209B7",
  "#F4A261", "#457B9D", "#D62828", "#1D9E75", "#4361EE",
  "#06D6A0", "#888780", "#FF6B6B", "#4ECDC4", "#45B7D1",
];

const EMOJI_OPTIONS = [
  "🛒", "🍽️", "🚗", "🎬", "📱", "🛍️", "🏠", "💊", "✈️", "📚",
  "💪", "📦", "🎉", "🎁", "💰", "🏦", "🔧", "🎮", "🐾", "☕",
  "🍕", "👕", "💇", "🎵", "📸", "🏋️", "🧹", "💻", "📞", "🚌",
];

function getCustomCategories() {
  return safeGet("custom_categories", {});
}

function saveCustomCategories(cats) {
  safeSet("custom_categories", cats);
  return cats;
}

export function getCategoryEmoji(cat) {
  const custom = getCustomCategories();
  return custom[cat]?.emoji || DEFAULT_EMOJIS[cat] || "📦";
}

export function getCategoryColor(cat) {
  const custom = getCustomCategories();
  return custom[cat]?.color || getCatColor(cat);
}

export default function CategoryManager({ monthData = [], onBatchUpdate }) {
  const [customs, setCustoms] = useState(() => getCustomCategories());
  const [editingCat, setEditingCat] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTarget, setMergeTarget] = useState("");

  const categories = useMemo(() => {
    const cats = new Set(monthData.map((e) => e.category));
    return [...cats].sort();
  }, [monthData]);

  const updateCustom = (cat, updates) => {
    const next = { ...customs, [cat]: { ...(customs[cat] || {}), ...updates } };
    setCustoms(next);
    saveCustomCategories(next);
  };

  const handleRename = async (oldName) => {
    if (!renameValue || renameValue === oldName) {
      setEditingCat(null);
      return;
    }
    // Move custom settings to new name
    const next = { ...customs };
    if (next[oldName]) {
      next[renameValue] = next[oldName];
      delete next[oldName];
    }
    setCustoms(next);
    saveCustomCategories(next);

    // Batch update all rows in sheet
    if (onBatchUpdate) {
      await onBatchUpdate(oldName, renameValue);
    }
    setEditingCat(null);
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) {
      setMergeSource(null);
      return;
    }
    if (onBatchUpdate) {
      await onBatchUpdate(mergeSource, mergeTarget);
    }
    // Remove source custom settings
    const next = { ...customs };
    delete next[mergeSource];
    setCustoms(next);
    saveCustomCategories(next);
    setMergeSource(null);
    setMergeTarget("");
  };

  if (categories.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p className="section-label" style={{ margin: 0 }}>Category Manager</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {categories.map((cat) => {
          const color = getCategoryColor(cat);
          const emoji = getCategoryEmoji(cat);
          const isEditing = editingCat === cat;

          return (
            <div key={cat} className="catmgr-row">
              {/* Emoji */}
              <div style={{ position: "relative" }}>
                <button
                  className="catmgr-emoji-btn"
                  onClick={() => setShowEmojiPicker(showEmojiPicker === cat ? null : cat)}
                  title="Change emoji"
                >
                  {emoji}
                </button>
                {showEmojiPicker === cat && (
                  <div className="catmgr-picker catmgr-emoji-picker">
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e}
                        className="catmgr-emoji-option"
                        onClick={() => { updateCustom(cat, { emoji: e }); setShowEmojiPicker(null); }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Color dot */}
              <div style={{ position: "relative" }}>
                <button
                  className="catmgr-color-btn"
                  style={{ background: color }}
                  onClick={() => setShowColorPicker(showColorPicker === cat ? null : cat)}
                  title="Change color"
                />
                {showColorPicker === cat && (
                  <div className="catmgr-picker catmgr-color-picker">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        className="catmgr-color-option"
                        style={{ background: c }}
                        onClick={() => { updateCustom(cat, { color: c }); setShowColorPicker(null); }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Name */}
              {isEditing ? (
                <input
                  className="editable-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(cat)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(cat);
                    if (e.key === "Escape") setEditingCat(null);
                  }}
                  autoFocus
                  style={{ flex: 1 }}
                />
              ) : (
                <span
                  className="catmgr-name"
                  onClick={() => { setEditingCat(cat); setRenameValue(cat); }}
                  title="Click to rename"
                >
                  {cat}
                </span>
              )}

              {/* Count */}
              <span className="catmgr-count">
                {monthData.filter((e) => e.category === cat).length}
              </span>

              {/* Merge button */}
              <button
                className="catmgr-action-btn"
                onClick={() => { setMergeSource(mergeSource === cat ? null : cat); setMergeTarget(""); }}
                title="Merge into another category"
              >
                ↗
              </button>
            </div>
          );
        })}
      </div>

      {/* Merge dialog */}
      {mergeSource && (
        <div className="catmgr-merge">
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Merge <strong>{mergeSource}</strong> into:
          </span>
          <select
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            className="filter-select"
            style={{ fontSize: 12, minHeight: 36, padding: "4px 8px" }}
          >
            <option value="">Select category…</option>
            {categories.filter((c) => c !== mergeSource).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button onClick={handleMerge} className="btn-primary" style={{ padding: "4px 12px", fontSize: 12, minHeight: 36 }} disabled={!mergeTarget}>
            Merge
          </button>
          <button onClick={() => setMergeSource(null)} className="btn-ghost" style={{ padding: "4px 12px", fontSize: 12, minHeight: 36 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
