# Expense Dashboard v2

Personal expense dashboard built with Next.js 14, pulling data from Google Sheets.

## Architecture

- **Frontend:** React SPA with 5 tabs (Overview, Trends, Categories, Transactions, Insights)
- **Data source:** Google Sheets via Sheets API v4 (service account auth)
- **Write-back:** PATCH/POST/DELETE API routes write back to the same Sheet
- **Auth:** Password gate via Next.js middleware + httpOnly cookie (30-day expiry)
- **Budgets/categories:** localStorage (client-side persistence)
- **No external UI libraries** — pure React + CSS

## Google Sheet Structure

Sheet tab: "Budget" (GID: 1367308403)

| Column | Type | Notes |
|--------|------|-------|
| Name | string | Transaction name |
| Date | string | YYYY-MM-DD format |
| Amount | number | Gross amount paid |
| Category | string | e.g. Groceries, Dining |
| Vendor | string | Business name |
| Raw Email Subject | string | Read-only, from email pipeline |
| Source | string | Read-only |
| ID | string | UUID, auto-populated by dashboard |
| Repaid | number | Amount repaid by others |
| Notes | string | User notes (e.g. "Birthday dinner") |

## Environment Variables (.env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| GOOGLE_SHEET_ID | Yes | The spreadsheet ID from the Sheet URL |
| GOOGLE_SHEET_GID | No | Tab GID (defaults to 1367308403) |
| GOOGLE_SERVICE_ACCOUNT_KEY | Yes | Full JSON key for the service account |
| DASHBOARD_PASSWORD | No | If set, enables password gate |

## Key Files

- `app/lib/sheets.js` — Google Sheets API v4 client (read/write/delete)
- `app/lib/constants.js` — Colors, formatting, `getNetAmount()` helper
- `app/lib/insights.js` — 10-rule insight engine
- `app/api/expenses/route.js` — GET/PATCH/POST/DELETE endpoints
- `app/api/auth/route.js` — Password verification
- `middleware.js` — Cookie-based auth gate

## Net Amount Calculation

`getNetAmount(expense)` returns `amount - repaid`. All KPIs, charts, and insights
should use net amounts. The `repaid` field tracks money paid back by friends/others.

## Editable Fields

Date, Vendor, Category, Amount, Repaid, Notes are editable inline.
Source and Raw Email Subject are read-only.
