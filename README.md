# Expense Dashboard v2 — Google Sheets

Personal expense tracker dashboard that reads live from your Google Sheet.

## Setup

### 1. Clone and install
```bash
git clone <your-repo-url>
cd expense-dashboard
npm install
```

### 2. Configure environment variables
The Google Sheet ID is already set. If you change sheets, update `GOOGLE_SHEET_ID` in `.env.local`.

**Important:** Your Google Sheet must be shared as "Anyone with the link" (Viewer).

### 3. Run locally
```bash
npm run dev
```
Open http://localhost:3000

### 4. Deploy to Vercel
```bash
npx vercel
```
Or connect your GitHub repo to Vercel and it auto-deploys.

Add environment variable in Vercel:
- `GOOGLE_SHEET_ID` = `1J2fRLD_lk_MaB77VesONXbHKFjMtEMPSNyb8tGTXvok`

### 5. Embed in Notion
Copy your Vercel URL → in Notion type `/embed` → paste URL.

## Google Sheet format
The sheet must have these column headers in row 1:
Name | Date | Amount | Category | Vendor | Raw Email Subject | Source
