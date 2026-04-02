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

// Update a row by ID
export async function updateRow(id, fields) {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const { headers, data, sheetName } = await readAllRows();

  const row = data.find((r) => r.ID === id);
  if (!row) throw new Error(`Row with ID ${id} not found`);

  const updates = [];
  for (const [field, value] of Object.entries(fields)) {
    const colIdx = headers.indexOf(field);
    if (colIdx === -1) continue;
    const colLetter = colToLetter(colIdx);
    updates.push({
      range: `${sheetName}!${colLetter}${row._rowIndex}`,
      values: [[value === null || value === undefined ? "" : value]],
    });
  }

  if (updates.length === 0) return;

  await client.request({
    url: `${API}/${spreadsheetId}/values:batchUpdate`,
    method: "POST",
    data: {
      valueInputOption: "RAW",
      data: updates,
    },
  });
}

// Append a new row
export async function appendRow(fields) {
  const client = await getClient();
  const spreadsheetId = getSheetId();
  const { headers, sheetName } = await readAllRows();

  const id = crypto.randomUUID();
  const row = headers.map((h) => {
    if (h === "ID") return id;
    return fields[h] ?? "";
  });

  await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: [row] },
  });

  return id;
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

// Update a split (Repaid amount or Status)
export async function updateSplit(splitId, fields) {
  const client = await getClient();
  const spreadsheetId = getSheetId();

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SPLITS_TAB)}`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) throw new Error("Split not found");

  const headers = rows[0];
  let targetRow = null;
  for (let i = 1; i < rows.length; i++) {
    const sidIdx = headers.indexOf("SplitID");
    if (rows[i][sidIdx] === splitId) {
      targetRow = i + 1; // 1-based sheet row
      break;
    }
  }
  if (!targetRow) throw new Error(`Split ${splitId} not found`);

  const updates = [];
  for (const [field, value] of Object.entries(fields)) {
    const colIdx = headers.indexOf(field);
    if (colIdx === -1) continue;
    updates.push({
      range: `${SPLITS_TAB}!${colToLetter(colIdx)}${targetRow}`,
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

// Delete a split
export async function deleteSplit(splitId) {
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

  const res = await client.request({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(SPLITS_TAB)}`,
  });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const sidIdx = headers.indexOf("SplitID");

  let targetRowIdx = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][sidIdx] === splitId) {
      targetRowIdx = i;
      break;
    }
  }
  if (targetRowIdx === null) throw new Error(`Split ${splitId} not found`);

  await client.request({
    url: `${API}/${spreadsheetId}:batchUpdate`,
    method: "POST",
    data: {
      requests: [{
        deleteDimension: {
          range: { sheetId: splitsGid, dimension: "ROWS", startIndex: targetRowIdx, endIndex: targetRowIdx + 1 },
        },
      }],
    },
  });
}

// Check if write is configured
export function isWriteConfigured() {
  return !!getCredentials();
}
