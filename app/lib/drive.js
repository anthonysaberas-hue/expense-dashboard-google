// Google Drive, as Anthony — not as the service account.
//
// The service account that owns every Sheets call CANNOT host these files, and the
// reason is not a missing scope. A service account has no Drive storage of its own:
// any file it creates it also owns, and owning costs quota it does not have, so the
// upload fails `storageQuotaExceeded` even inside a folder shared with it. The escape
// hatch is a Workspace Shared Drive, where the drive owns the file — and this Sheet is
// on a personal @gmail account, which cannot have one.
//
// So photos go through Anthony's own OAuth grant. The files are his, in his Drive,
// against his 15 GB, and he can open them outside the app — which was the ask.
//
// SCOPE IS `drive.file`, deliberately: the app can see only files it created itself,
// never the rest of his Drive. It is also a non-sensitive scope, which is what lets
// the consent screen be published without a Google verification review — and it MUST
// be published. Left in "Testing", Google expires the refresh token after 7 days and
// the photos break every week.
//
// A separate client from sheets.js on purpose. That one is a module singleton pinned
// to the spreadsheets scope; widening it would hand every Sheets call a Drive grant it
// has no use for.
import { OAuth2Client } from "google-auth-library";
import { withRetry } from "./googleretry.js";

const FILES = "https://www.googleapis.com/drive/v3/files";
export const FOLDER_NAME = "Expense Dashboard";

let _client = null;
let _folderId = null;

export function driveConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET
    && process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
}

// Built fresh from the refresh token; OAuth2Client mints and caches access tokens
// itself, so there is nothing to schedule or expire here.
function getClient() {
  if (_client) return _client;
  if (!driveConfigured()) {
    throw new Error("Google Drive is not connected — visit /api/drive/connect to connect it.");
  }
  _client = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  _client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return _client;
}

const call = (opts) => withRetry(async () => getClient().request(opts));

// Find-or-create the folder, memoised for the life of the lambda so it costs one
// extra call on a cold start and nothing after.
//
// `drive.file` can find this again because a folder the app CREATED is a file the app
// created. If Anthony renames or bins it, the next upload quietly makes a new one
// rather than failing — losing the tidy grouping is a much smaller harm than losing
// the upload.
export async function folderId() {
  if (_folderId) return _folderId;
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await call({ url: `${FILES}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1` });
  const hit = ((found.data && found.data.files) || [])[0];
  if (hit) { _folderId = hit.id; return _folderId; }
  const made = await call({
    url: `${FILES}?fields=id`,
    method: "POST",
    data: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
  });
  _folderId = made.data.id;
  return _folderId;
}

// A raw access token for the browser to upload with. See app/api/drive/token.
export async function accessToken() {
  const res = await getClient().getAccessToken();
  return typeof res === "string" ? res : (res && res.token) || null;
}

// → { bytes, mime }. `responseType: "arraybuffer"` matters for the same reason.
export async function getImage(fileId) {
  const res = await call({
    url: `${FILES}/${encodeURIComponent(fileId)}?alt=media`,
    responseType: "arraybuffer",
  });
  const type = (res.headers && (res.headers["content-type"] || res.headers.get?.("content-type"))) || "image/jpeg";
  return { bytes: Buffer.from(res.data), mime: String(type).split(";")[0].trim() };
}

// Trash rather than delete: it lands in his Drive bin, recoverable for 30 days, which
// matches how nothing in this app is ever really destroyed (soft-delete everywhere else).
export async function trashImage(fileId) {
  await call({
    url: `${FILES}/${encodeURIComponent(fileId)}`,
    method: "PATCH",
    data: { trashed: true },
  });
}

// Test seam only — the module memoises a client and a folder id for the lambda's life.
export function __resetDriveCache() {
  _client = null;
  _folderId = null;
}
