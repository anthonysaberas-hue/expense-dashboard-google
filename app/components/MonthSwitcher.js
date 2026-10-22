"use client";
import { useRef } from "react";
import { formatMonthLabel } from "../lib/constants";

// ‹ October 2026 › — fixed width no matter how many months there are. Tap the
// label to jump to any month; swipe handling lives on the page (useMonthSwipe).
export default function MonthSwitcher({ monthKeys = [], selectedMonth, onChange }) {
  const idx = monthKeys.indexOf(selectedMonth);
  const prev = idx > 0 ? monthKeys[idx - 1] : null;
  const next = idx >= 0 && idx < monthKeys.length - 1 ? monthKeys[idx + 1] : null;

  return (
    <div className="month-switcher" role="group" aria-label="Select month">
      <button
        className="month-switcher-arrow"
        onClick={() => prev && onChange(prev)}
        disabled={!prev}
        aria-label={prev ? `Previous month: ${formatMonthLabel(prev, false)}` : "No earlier month"}
      >
        ‹
      </button>
      <label className="month-switcher-label">
        <span aria-hidden="true">{formatMonthLabel(selectedMonth, false)}</span>
        <span className="month-switcher-caret" aria-hidden="true">▾</span>
        <select
          value={selectedMonth || ""}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Jump to month"
        >
          {[...monthKeys].reverse().map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m, false)}</option>
          ))}
        </select>
      </label>
      <button
        className="month-switcher-arrow"
        onClick={() => next && onChange(next)}
        disabled={!next}
        aria-label={next ? `Next month: ${formatMonthLabel(next, false)}` : "No later month"}
      >
        ›
      </button>
    </div>
  );
}

// Horizontal swipe on the page content moves between months. Ignores swipes
// that start on inputs, pickers, or anything that scrolls sideways itself.
export function useMonthSwipe({ monthKeys, selectedMonth, onChange, enabled }) {
  const start = useRef(null);

  const scrollsSideways = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 2) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
    }
    return false;
  };

  const onTouchStart = (e) => {
    start.current = null;
    if (!enabled || e.touches.length !== 1) return;
    const t = e.target;
    if (t.closest?.("input, textarea, select, button, [contenteditable], .modal-backdrop, .category-picker-list, .no-swipe")) return;
    if (scrollsSideways(t)) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
  };

  const onTouchEnd = (e) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - s.x;
    const dy = touch.clientY - s.y;
    if (Date.now() - s.at > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const idx = monthKeys.indexOf(selectedMonth);
    const target = dx < 0 ? monthKeys[idx + 1] : monthKeys[idx - 1]; // swipe left = later month
    if (target) onChange(target, dx < 0 ? "next" : "prev");
  };

  return { onTouchStart, onTouchEnd };
}
