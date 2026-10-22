import { GoogleAuth } from "google-auth-library";

let _auth = null;

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

function getGid() {
  return process.env.GOOGLE_SHEET_GID || "1367308403";
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";

// Get the sheet tab name from GID
async function getSheetName(client, spreadsheetId) {
  const gid = getGid();
  const res = await client.request({
    url: `${API}/${spreadsheetId}?fields=sheets.properties`,
  });
  const sheet = res.data.sheets.find(
    (s) => String(s.properties.sheetId) === gid
  );
  return sheet ? sheet.properties.title : "Sheet1";
}

// Read all rows from the sheet
export async function readAllRows() {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const sheetName = await getSheetName(client, spreadsheetId);

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
  });

  const rows = res.data.values || [];
  if (rows.length === 0) return { headers: [], data: [], sheetName };

  const headers = rows[0];
  const data = rows.slice(1).map((row, idx) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || null;
    });
    obj._rowIndex = idx + 2; // 1-based, +1 for header
    return obj;
  });

  return { headers, data, sheetName };
}

// Ensure ID, Repaid, Notes columns exist; populate missing IDs
export async function ensureColumns() {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const sheetName = await getSheetName(client, spreadsheetId);

  // Read headers
  const headerRes = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`,
  });
  const headers = headerRes.data.values ? headerRes.data.values[0] : [];

  const needed = ["ID", "Repaid", "Notes"];
  const missing = needed.filter((h) => !headers.includes(h));

  if (missing.length > 0) {
    const startCol = String.fromCharCode(65 + headers.length); // next column letter
    const endCol = String.fromCharCode(65 + headers.length + missing.length - 1);
    await client.request({
      url: `${API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${startCol}1:${endCol}1?valueInputOption=RAW`,
      method: "PUT",
      data: { values: [missing] },
    });
  }

  // Read all rows to populate missing IDs
  const { data, headers: currentHeaders } = await readAllRows();
  const idCol = currentHeaders.indexOf("ID");
  if (idCol === -1) return; // shouldn't happen after above

  const updates = [];
  for (const row of data) {
    if (!row.ID) {
      const id = crypto.randomUUID();
      const colLetter = String.fromCharCode(65 + idCol);
      updates.push({
        range: `${sheetName}!${colLetter}${row._rowIndex}`,
        values: [[id]],
      });
    }
  }

  if (updates.length > 0) {
    await client.request({
      url: `${API}/${spreadsheetId}/values:batchUpdate`,
      method: "POST",
      data: {
        valueInputOption: "RAW",
        data: updates,
      },
    });
  }
}

// Update many rows in one request. Every ID is checked before anything is
// written, so a bad ID can't leave the sheet half-updated.
export async function updateRows(updates) {
  if (updates.length === 0) return;
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const { headers, data, sheetName } = await readAllRows();
  const byId = new Map(data.map((r) => [r.ID, r]));

  const ranges = [];
  for (const { id, fields } of updates) {
    const row = byId.get(id);
    if (!row) throw new Error(`Row with ID ${id} not found`);
    for (const [field, value] of Object.entries(fields)) {
      const colIdx = headers.indexOf(field);
      if (colIdx === -1) continue;
      ranges.push({
        range: `${sheetName}!${colToLetter(colIdx)}${row._rowIndex}`,
        values: [[value === null || value === undefined ? "" : value]],
      });
    }
  }
  if (ranges.length === 0) return;

  await client.request({
    url: `${API}/${spreadsheetId}/values:batchUpdate`,
    method: "POST",
    data: { valueInputOption: "RAW", data: ranges },
  });
}

export async function updateRow(id, fields) {
  return updateRows([{ id, fields }]);
}

// Append many rows in one request; returns their new IDs in order
export async function appendRows(list) {
  if (list.length === 0) return [];
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const { headers, sheetName } = await readAllRows();

  const ids = list.map(() => crypto.randomUUID());
  const values = list.map((fields, i) => headers.map((h) => (h === "ID" ? ids[i] : fields[h] ?? "")));

  await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values },
  });

  return ids;
}

export async function appendRow(fields) {
  return (await appendRows([fields]))[0];
}

// Delete a row by ID
export async function deleteRow(id) {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const { data, sheetName } = await readAllRows();
  const gid = getGid();

  const row = data.find((r) => r.ID === id);
  if (!row) throw new Error(`Row with ID ${id} not found`);

  // Use batchUpdate to delete the row
  await client.request({
    url: `${API}/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: parseInt(gid),
              dimension: "ROWS",
              startIndex: row._rowIndex - 1, // 0-based
              endIndex: row._rowIndex,
            },
          },
        },
      ],
    },
  });
}

// Column index to letter (0=A, 25=Z, 26=AA)
function colToLetter(idx) {
  let letter = "";
  while (idx >= 0) {
    letter = String.fromCharCode(65 + (idx % 26)) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

// ── SPLITS TAB ──────────────────────────────────────────

const SPLITS_TAB = "Splits";
const SPLITS_HEADERS = ["SplitID", "ExpenseID", "Person", "Share", "Repaid", "Status"];

// Ensure the Splits tab exists with correct headers
async function ensureSplitsTab(client, spreadsheetId) {
  const metaRes = await client.request({
    url: `${API}/${spreadsheetId}?fields=sheets.properties`,
  });
  const exists = metaRes.data.sheets.some(
    (s) => s.properties.title === SPLITS_TAB
  );

  if (!exists) {
    await client.request({
      url: `${API}/${spreadsheetId}:batchUpdate`,
      method: "POST",
      data: {
        requests: [{ addSheet: { properties: { title: SPLITS_TAB } } }],
      },
    });
    // Write headers
    await client.request({
      url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SPLITS_TAB)}!A1:F1?valueInputOption=RAW`,
      method: "PUT",
      data: { values: [SPLITS_HEADERS] },
    });
  }
}

// Read all splits
export async function readAllSplits() {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  await ensureSplitsTab(client, spreadsheetId);

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SPLITS_TAB)}`,
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

// Add a split
export async function addSplit(expenseId, person, share) {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  await ensureSplitsTab(client, spreadsheetId);

  const splitId = crypto.randomUUID();
  const row = [splitId, expenseId, person, share, 0, "pending"];

  await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SPLITS_TAB)}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: [row] },
  });

  return splitId;
}

async function readSplitRows(client, spreadsheetId) {
  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SPLITS_TAB)}`,
  });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const sidIdx = headers.indexOf("SplitID");
  const rowById = new Map();
  for (let i = 1; i < rows.length; i++) rowById.set(rows[i][sidIdx], i); // 0-based row index
  return { headers, rowById };
}

// Update many splits (Repaid / Status) in one request; all IDs checked first
export async function updateSplits(updates) {
  if (updates.length === 0) return;
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const { headers, rowById } = await readSplitRows(client, spreadsheetId);

  const ranges = [];
  for (const { splitId, fields } of updates) {
    const idx = rowById.get(splitId);
    if (idx === undefined) throw new Error(`Split ${splitId} not found`);
    for (const [field, value] of Object.entries(fields)) {
      const colIdx = headers.indexOf(field);
      if (colIdx === -1) continue;
      ranges.push({
        range: `${SPLITS_TAB}!${colToLetter(colIdx)}${idx + 1}`,
        values: [[value === null || value === undefined ? "" : value]],
      });
    }
  }
  if (ranges.length === 0) return;

  await client.request({
    url: `${API}/${spreadsheetId}/values:batchUpdate`,
    method: "POST",
    data: { valueInputOption: "RAW", data: ranges },
  });
}

export async function updateSplit(splitId, fields) {
  return updateSplits([{ splitId, fields }]);
}

// Delete many splits in one request
export async function deleteSplits(splitIds) {
  if (splitIds.length === 0) return;
  const client = await getClient();
  const spreadsheetId = getSheetId();

  const metaRes = await client.request({
    url: `${API}/${spreadsheetId}?fields=sheets.properties`,
  });
  const splitsSheet = metaRes.data.sheets.find(
    (s) => s.properties.title === SPLITS_TAB
  );
  if (!splitsSheet) throw new Error("Splits tab not found");
  const splitsGid = splitsSheet.properties.sheetId;

  const { rowById } = await readSplitRows(client, spreadsheetId);
  const indexes = splitIds.map((id) => {
    const idx = rowById.get(id);
    if (idx === undefined) throw new Error(`Split ${id} not found`);
    return idx;
  });

  // Bottom-up so earlier deletions don't shift the rows still to delete
  await client.request({
    url: `${API}/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: {
      requests: [...new Set(indexes)].sort((a, b) => b - a).map((idx) => ({
        deleteDimension: {
          range: { sheetId: splitsGid, dimension: "ROWS", startIndex: idx, endIndex: idx + 1 },
        },
      })),
    },
  });
}

export async function deleteSplit(splitId) {
  return deleteSplits([splitId]);
}

// ── SETTINGS TAB ────────────────────────────────────────
// Key | Value (JSON) | Updated — settings that should follow you across devices

const SETTINGS_TAB = "Settings";
const SETTINGS_HEADERS = ["Key", "Value", "Updated"];

async function ensureSettingsTab(client, spreadsheetId) {
  const metaRes = await client.request({
    url: `${API}/${spreadsheetId}?fields=sheets.properties`,
  });
  if (metaRes.data.sheets.some((s) => s.properties.title === SETTINGS_TAB)) return;
  await client.request({
    url: `${API}/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: { requests: [{ addSheet: { properties: { title: SETTINGS_TAB } } }] },
  });
  await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SETTINGS_TAB)}!A1:C1?valueInputOption=RAW`,
    method: "PUT",
    data: { values: [SETTINGS_HEADERS] },
  });
}

async function readSettingRows(client, spreadsheetId) {
  await ensureSettingsTab(client, spreadsheetId);
  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SETTINGS_TAB)}!A:B`,
  });
  return (res.data.values || []).slice(1);
}

// { key: parsed value } — a cell that isn't valid JSON is skipped
export async function readSettings() {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const settings = {};
  for (const [key, value] of await readSettingRows(client, spreadsheetId)) {
    if (!key) continue;
    try { settings[key] = JSON.parse(value); } catch { /* ignore hand-edited junk */ }
  }
  return settings;
}

// Upsert { key: value } pairs: existing keys updated in one batchUpdate,
// new keys appended in one append
export async function writeSettings(entries) {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const rows = await readSettingRows(client, spreadsheetId);
  const rowByKey = new Map(rows.map(([key], i) => [key, i + 2])); // sheet row number
  const now = new Date().toISOString();

  const updates = [];
  const appends = [];
  for (const key of keys) {
    const row = [key, JSON.stringify(entries[key]), now];
    if (rowByKey.has(key)) updates.push({ range: `${SETTINGS_TAB}!A${rowByKey.get(key)}:C${rowByKey.get(key)}`, values: [row] });
    else appends.push(row);
  }

  if (updates.length > 0) {
    await client.request({
      url: `${API}/${spreadsheetId}/values:batchUpdate`,
      method: "POST",
      data: { valueInputOption: "RAW", data: updates },
    });
  }
  if (appends.length > 0) {
    await client.request({
      url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SETTINGS_TAB)}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      method: "POST",
      data: { values: appends },
    });
  }
}

// Check if write is configured
export function isWriteConfigured() {
  return !!getCredentials();
}
