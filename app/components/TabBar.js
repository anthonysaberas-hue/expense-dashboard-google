"use client";

const TABS = [
  {
    label: "Overview",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Trends",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    label: "Categories",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    label: "Transactions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    label: "Insights",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
];

export default function TabBar({ activeTab, onTabChange, warningCount }) {
  return (
    <>
      {/* Desktop horizontal tab bar */}
      <nav className="tabbar-desktop" role="tablist" aria-label="Dashboard tabs">
        <div className="tabbar-desktop-inner">
          {TABS.map((tab, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={activeTab === i}
              aria-controls={`tabpanel-${i}`}
              id={`tab-${i}`}
              className={`tab-btn${activeTab === i ? " active" : ""}`}
              onClick={() => onTabChange(i)}
            >
              {tab.label}
              {i === 4 && warningCount > 0 && (
                <span className="tab-badge" aria-label={`${warningCount} warnings`}>
                  {warningCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="tabbar-mobile" role="tablist" aria-label="Dashboard tabs">
        <div className="tabbar-mobile-inner">
          {TABS.map((tab, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={activeTab === i}
              aria-controls={`tabpanel-${i}`}
              id={`tab-mobile-${i}`}
              className={`tab-btn-mobile${activeTab === i ? " active" : ""}`}
              onClick={() => onTabChange(i)}
              aria-label={tab.label}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {i === 4 && warningCount > 0 && (
                <span className="tab-badge-mobile" aria-label={`${warningCount} warnings`}>
                  {warningCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
