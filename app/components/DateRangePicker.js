"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday-based
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDisplay(d) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function DateRangePicker({ startDate, endDate, onChange, minDate, maxDate }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => (startDate ? startDate.getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (startDate ? startDate.getMonth() : new Date().getMonth()));
  const [selecting, setSelecting] = useState(null); // null | { start: Date }
  const [hoverDate, setHoverDate] = useState(null);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const handleDayClick = (day) => {
    const clicked = new Date(viewYear, viewMonth, day);
    if (!selecting) {
      setSelecting({ start: clicked });
    } else {
      let s = selecting.start, e = clicked;
      if (e < s) [s, e] = [e, s];
      onChange(s, e);
      setSelecting(null);
      setOpen(false);
    }
  };

  const handleCancel = () => {
    setSelecting(null);
    setOpen(false);
  };

  const handleApply = () => {
    if (selecting) {
      const hover = hoverDate || selecting.start;
      let s = selecting.start, e = hover;
      if (e < s) [s, e] = [e, s];
      onChange(s, e);
      setSelecting(null);
    }
    setOpen(false);
  };

  // Determine effective range for highlighting
  let rangeStart = startDate, rangeEnd = endDate;
  if (selecting) {
    const hover = hoverDate || selecting.start;
    rangeStart = selecting.start < hover ? selecting.start : hover;
    rangeEnd = selecting.start < hover ? hover : selecting.start;
  }

  const isInRange = (day) => {
    if (!rangeStart || !rangeEnd) return false;
    const d = new Date(viewYear, viewMonth, day);
    return d >= rangeStart && d <= rangeEnd;
  };
  const isStart = (day) => rangeStart && fmt(new Date(viewYear, viewMonth, day)) === fmt(rangeStart);
  const isEnd = (day) => rangeEnd && fmt(new Date(viewYear, viewMonth, day)) === fmt(rangeEnd);

  const displayText = startDate && endDate
    ? `${fmtDisplay(startDate)} – ${fmtDisplay(endDate)}`
    : "Select date range";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open && startDate) {
            setViewYear(startDate.getFullYear());
            setViewMonth(startDate.getMonth());
          }
        }}
        className="date-range-btn"
        aria-label="Select date range"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{displayText}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}>
          <polyline points={open ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
        </svg>
      </button>

      {open && (
        <div className="date-range-dropdown">
          {/* Month nav */}
          <div className="date-range-month-nav">
            <button onClick={prevMonth} className="date-range-nav-btn" aria-label="Previous month">&lt;</button>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="date-range-nav-btn" aria-label="Next month">&gt;</button>
          </div>

          {/* Day headers */}
          <div className="date-range-grid">
            {DAYS.map((d) => (
              <div key={d} className="date-range-day-header">{d}</div>
            ))}

            {/* Empty cells for offset */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const inRange = isInRange(day);
              const start = isStart(day);
              const end = isEnd(day);
              return (
                <button
                  key={day}
                  className={`date-range-day${inRange ? " in-range" : ""}${start ? " range-start" : ""}${end ? " range-end" : ""}`}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => selecting && setHoverDate(new Date(viewYear, viewMonth, day))}
                  aria-label={`${MONTH_NAMES[viewMonth]} ${day}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="date-range-actions">
            <button onClick={handleCancel} className="btn-ghost" style={{ padding: "6px 16px", minHeight: 36 }}>Cancel</button>
            <button onClick={handleApply} className="btn-primary" style={{ padding: "6px 16px", minHeight: 36 }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
