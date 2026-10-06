// The "Photos" tab: one row per photo attached to an expense's Notes. Modeled on
// app/lib/holdings.js — this app's existing idiom for a self-contained second tab —
// rather than the Sheets helpers workouts used, which don't exist here.
//
// Photos attach to the EXPENSE, because notes have no identity of their own: ExpenseID
// is the existing expense UUID from the Budget tab's ID column (sheets.js's
// ensureColumns() already guarantees every row has one).
//
// Soft-delete (stamp DeletedAt) rather than the hard deleteDimension this app uses
// elsewhere — it mirrors Drive's own 30-day bin and makes an accidental delete
// recoverable.
import { GoogleAuth } from "google-auth-library";
import { withRetry } from "./googleretry.js";

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

const call = (opts) => withRetry(async () => (await getClient()).request(opts));

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID not configured");
  return id;
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const PHOTOS_TAB = "Photos";
const PHOTOS_HEADERS = ["ID", "ExpenseID", "DriveFileID", "Mime", "DateAdded", "DeletedAt"];

// What may be RECORDED against an expense. The browser uploads straight to Drive, so
// this does not gate bytes — it gates the mime we store and later serve. It must stay
// in lockstep with driveupload.js's DISPLAYABLE set: that set decides what skips
// client-side conversion, this one decides what the server will accept, and a mime
// allowed by one but not the other means a file uploads to Drive successfully and then
// gets rejected here, orphaning it.
export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function colToLetter(idx) {
  let letter = "";
  while (idx >= 0) {
    letter = String.fromCharCode(65 + (idx % 26)) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

// Memoised for the life of the lambda, like drive.js's _folderId — once the tab is
// confirmed/created there is no need to re-read the spreadsheet's metadata on every
// readAllPhotos/appendPhoto call.
let _tabReady = false;

async function ensurePhotosTab(spreadsheetId) {
  if (_tabReady) return;
  const metaRes = await call({
    url: `${API}/${spreadsheetId}?fields=sheets.properties`,
  });
  const exists = metaRes.data.sheets.some(
    (s) => s.properties.title === PHOTOS_TAB
  );

  if (!exists) {
    await call({
      url: `${API}/${spreadsheetId}:batchUpdate`,
      method: "POST",
      data: { requests: [{ addSheet: { properties: { title: PHOTOS_TAB } } }] },
    });
    const endCol = colToLetter(PHOTOS_HEADERS.length - 1);
    await call({
      url: `${API}/${spreadsheetId}/values/${encodeURIComponent(PHOTOS_TAB)}!A1:${endCol}1?valueInputOption=RAW`,
      method: "PUT",
      data: { values: [PHOTOS_HEADERS] },
    });
  }
  _tabReady = true;
}

// `includeDeleted` exists only for the idempotency check on POST /api/photos — a
// replayed create with an id that was since soft-deleted must still be found, or it
// would mint a second row pointing at the same Drive file.
export async function readAllPhotos({ includeDeleted = false } = {}) {
  const spreadsheetId = getSheetId();
  await ensurePhotosTab(spreadsheetId);

  const res = await call({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(PHOTOS_TAB)}`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  const headers = rows[0];
  const all = rows.slice(1).map((row, idx) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || null; });
    obj._rowIndex = idx + 2;
    return obj;
  });
  return includeDeleted ? all : all.filter((r) => !r.DeletedAt);
}

export async function appendPhoto(fields) {
  const spreadsheetId = getSheetId();
  await ensurePhotosTab(spreadsheetId);

  const id = fields.ID || crypto.randomUUID();
  const row = PHOTOS_HEADERS.map((h) => {
    if (h === "ID") return id;
    return fields[h] ?? "";
  });

  await call({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(PHOTOS_TAB)}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: [row] },
  });

  return id;
}

export async function softDeletePhoto(id) {
  const spreadsheetId = getSheetId();

  const res = await call({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(PHOTOS_TAB)}`,
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) throw new Error(`Photo ${id} not found`);

  const headers = rows[0];
  const idIdx = headers.indexOf("ID");
  const deletedAtIdx = headers.indexOf("DeletedAt");
  let targetRowIndex = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIdx] === id) { targetRowIndex = i + 1; break; }
  }
  if (!targetRowIndex) throw new Error(`Photo ${id} not found`);

  await call({
    url: `${API}/${spreadsheetId}/values/${encodeURIComponent(PHOTOS_TAB)}!${colToLetter(deletedAtIdx)}${targetRowIndex}?valueInputOption=RAW`,
    method: "PUT",
    data: { values: [[new Date().toISOString()]] },
  });
}
