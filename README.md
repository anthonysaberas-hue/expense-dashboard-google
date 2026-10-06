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

**Important:** The app reads/writes via a Google service account (`GOOGLE_SERVICE_ACCOUNT_KEY`), so share
your Sheet with that service account's email as an Editor — it is no longer a public "Anyone with the
link" Sheet.

To enable photo attachments on notes, also set:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`

The first two come from a Google Cloud OAuth client (Desktop or Web type, with
`http://localhost:3000/api/drive/callback` and your deployed `/api/drive/callback` URL registered as
authorised redirect URIs). The refresh token is obtained with a one-time step, done once per Google
account: visit `/api/drive/connect`, approve access, and it redirects to `/api/drive/callback`, which
shows `GOOGLE_DRIVE_REFRESH_TOKEN=...` exactly once for you to copy into `.env.local` and Vercel.

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

Add environment variables in Vercel:
- `GOOGLE_SHEET_ID` = `1J2fRLD_lk_MaB77VesONXbHKFjMtEMPSNyb8tGTXvok`
- `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `GOOGLE_DRIVE_REFRESH_TOKEN` as described above (mark the last one Sensitive)

### 5. Embed in Notion
Copy your Vercel URL → in Notion type `/embed` → paste URL.

## Google Sheet format
The sheet must have these column headers in row 1:
Name | Date | Amount | Category | Vendor | Raw Email Subject | Source
