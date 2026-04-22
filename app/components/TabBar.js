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
    label: "People",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
    label: "Insights",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    label: "Assets",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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
              {i === 3 && warningCount > 0 && (
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
              {i === 3 && warningCount > 0 && (
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
