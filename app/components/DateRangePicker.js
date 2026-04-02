"use client";
import { useState, useRef, useEffect } from "react";

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
  return d === 0 ? 6 : d - 1;
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtShort(d) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function getPresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    { label: "This month", start: new Date(y, m, 1), end: new Date(y, m + 1, 0) },
    { label: "Last month", start: new Date(y, m - 1, 1), end: new Date(y, m, 0) },
    { label: "Last 30 days", start: new Date(y, m, now.getDate() - 30), end: now },
    { label: "This quarter", start: new Date(y, Math.floor(m / 3) * 3, 1), end: new Date(y, Math.floor(m / 3) * 3 + 3, 0) },
    { label: "Last 6 months", start: new Date(y, m - 5, 1), end: new Date(y, m + 1, 0) },
    { label: "This year", start: new Date(y, 0, 1), end: new Date(y, 11, 31) },
    { label: "All time", start: new Date(2020, 0, 1), end: new Date(y + 1, 0, 0) },
  ];
}

export default function DateRangePicker({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => (startDate ? startDate.getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (startDate ? startDate.getMonth() : new Date().getMonth()));
  const [pickStart, setPickStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPickStart(null); }
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
    if (!pickStart) {
      setPickStart(clicked);
    } else {
      let s = pickStart, e = clicked;
      if (e < s) [s, e] = [e, s];
      onChange(s, e);
      setPickStart(null);
      setOpen(false);
    }
  };

  const handlePreset = (preset) => {
    onChange(preset.start, preset.end);
    setPickStart(null);
    setOpen(false);
  };

  // Range highlighting
  let rangeStart = startDate, rangeEnd = endDate;
  if (pickStart) {
    const hover = hoverDate || pickStart;
    rangeStart = pickStart < hover ? pickStart : hover;
    rangeEnd = pickStart < hover ? hover : pickStart;
  }

  const isInRange = (day) => {
    if (!rangeStart || !rangeEnd) return false;
    const d = new Date(viewYear, viewMonth, day);
    return d >= rangeStart && d <= rangeEnd;
  };
  const isStart = (day) => rangeStart && fmt(new Date(viewYear, viewMonth, day)) === fmt(rangeStart);
  const isEnd = (day) => rangeEnd && fmt(new Date(viewYear, viewMonth, day)) === fmt(rangeEnd);

  const displayText = startDate && endDate
    ? `${fmtShort(startDate)} – ${fmtShort(endDate)}, ${endDate.getFullYear()}`
    : "Select dates";

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
          <div className="date-range-layout">
            {/* Presets sidebar */}
            <div className="date-range-presets">
              {getPresets().map((p) => (
                <button
                  key={p.label}
                  className="date-range-preset-btn"
                  onClick={() => handlePreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendar */}
            <div className="date-range-calendar">
              <div className="date-range-month-nav">
                <button onClick={prevMonth} className="date-range-nav-btn" aria-label="Previous month">&lt;</button>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
                <button onClick={nextMonth} className="date-range-nav-btn" aria-label="Next month">&gt;</button>
              </div>

              <div className="date-range-grid">
                {DAYS.map((d) => (
                  <div key={d} className="date-range-day-header">{d}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
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
                      onMouseEnter={() => pickStart && setHoverDate(new Date(viewYear, viewMonth, day))}
                      aria-label={`${MONTH_NAMES[viewMonth]} ${day}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Status + actions */}
              <div className="date-range-footer">
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {pickStart ? `From ${fmtShort(pickStart)} → pick end date` : "Click a start date"}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setPickStart(null); setOpen(false); }} className="btn-ghost" style={{ padding: "4px 12px", minHeight: 32, fontSize: 12 }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
