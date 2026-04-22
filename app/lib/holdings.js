import { GoogleAuth } from "google-auth-library";

let _auth = null;

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function getAuth() {
  if (_auth) return _auth;
  const creds = getCredentials();
  if (!creds) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");
  _auth = new GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return _auth;
}

async function getClient() {
  return getAuth().getClient();
}

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID not configured");
  return id;
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const HOLDINGS_TAB = "Holdings";
const HOLDINGS_HEADERS = ["ID", "Ticker", "Shares", "BuyPrice", "BuyDate", "Name", "Notes"];

function colToLetter(idx) {
  let letter = "";
  while (idx >= 0) {
    letter = String.fromCharCode(65 + (idx % 26)) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

async function ensureHoldingsTab(client, spreadsheetId) {
  const metaRes = await client.request({
    url: `${API}/${spreadsheetId}?fields=sheets.properties`,
  });
  const exists = metaRes.data.sheets.some(
    (s) => s.properties.title === HOLDINGS_TAB
  );

  if (!exists) {
    await client.request({
      url: `${API}/${spreadsheetId}:batchUpdate`,
      method: "POST",
      data: { requests: [{ addSheet: { properties: { title: HOLDINGS_TAB } } }] },
    });
    const endCol = colToLetter(HOLDINGS_HEADERS.length - 1);
    await client.request({
      url: `${API}/${spreadsheetId}/values/${encodeURIComponent(HOLDINGS_TAB)}!A1:${endCol}1?valueInputOption=RAW`,
      method: "PUT",
      data: { values: [HOLDINGS_HEADERS] },
    });
  }
}

// Returns the numeric sheetId for the Holdings tab (needed for row deletion)
async function getHoldingsSheetId(client, spreadsheetId) {
  const metaRes = await client.request({
    url: `${API}/${spreadsheetId}?fields=sheets.properties`,
  });
  const sheet = metaRes.data.sheets.find(
    (s) => s.properties.title === HOLDINGS_TAB
  );
  return sheet ? sheet.properties.sheetId : null;
}

export async function readAllHoldings() {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  await ensureHoldingsTab(client, spreadsheetId);

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(HOLDINGS_TAB)}`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  const headers = rows[0];
  return rows.slice(1).map((row, idx) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || null; });
    obj._rowIndex = idx + 2;
    return obj;
  });
}

export async function appendHolding(fields) {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  await ensureHoldingsTab(client, spreadsheetId);

  const id = crypto.randomUUID();
  const row = HOLDINGS_HEADERS.map((h) => {
    if (h === "ID") return id;
    return fields[h] ?? "";
  });

  await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(HOLDINGS_TAB)}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: [row] },
  });

  return id;
}

export async function updateHolding(id, fields) {
  const client = await getClient();
  const spreadsheetId = getSheetId();

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(HOLDINGS_TAB)}`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) throw new Error("Holdings tab is empty");

  const headers = rows[0];
  const idIdx = headers.indexOf("ID");
  let targetRowIndex = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIdx] === id) { targetRowIndex = i + 1; break; }
  }
  if (!targetRowIndex) throw new Error(`Holding ${id} not found`);

  const updates = [];
  for (const [field, value] of Object.entries(fields)) {
    const colIdx = headers.indexOf(field);
    if (colIdx === -1) continue;
    updates.push({
      range: `${HOLDINGS_TAB}!${colToLetter(colIdx)}${targetRowIndex}`,
      values: [[value === null || value === undefined ? "" : value]],
    });
  }

  if (updates.length > 0) {
    await client.request({
      url: `${API}/${spreadsheetId}/values:batchUpdate`,
      method: "POST",
      data: { valueInputOption: "RAW", data: updates },
    });
  }
}

// Delete every data row in the Holdings tab, keeping the header row intact.
export async function deleteAllHoldings() {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  await ensureHoldingsTab(client, spreadsheetId);

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(HOLDINGS_TAB)}`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return 0; // header-only or empty

  const sheetId = await getHoldingsSheetId(client, spreadsheetId);
  await client.request({
    url: `${API}/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: 1, // keep header
            endIndex: rows.length,
          },
        },
      }],
    },
  });
  return rows.length - 1;
}

export async function deleteHolding(id) {
  const client = await getClient();
  const spreadsheetId = getSheetId();

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(HOLDINGS_TAB)}`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) throw new Error(`Holding ${id} not found`);

  const headers = rows[0];
  const idIdx = headers.indexOf("ID");
  let targetRowIdx = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIdx] === id) { targetRowIdx = i; break; }
  }
  if (targetRowIdx === null) throw new Error(`Holding ${id} not found`);

  const holdingsSheetId = await getHoldingsSheetId(client, spreadsheetId);

  await client.request({
    url: `${API}/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: holdingsSheetId,
            dimension: "ROWS",
            startIndex: targetRowIdx,
            endIndex: targetRowIdx + 1,
          },
        },
      }],
    },
  });
}
