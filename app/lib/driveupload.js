// Browser → Google Drive, directly. No size ceiling.
//
// Google's `uploadType=multipart` caps the whole request at 5 MB, which a 48MP phone
// photo clears on its own, so this uses the RESUMABLE protocol instead:
//
//   1. POST the metadata, get a one-shot session URI back in the Location header.
//   2. PUT the bytes to that URI.
//
// Two round trips instead of one, and in exchange the file can be any size Drive
// accepts. It also means the bytes never touch this app's server, which is the whole
// reason for doing it — see app/api/drive/token.

const RESUMABLE = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id";

// Only what a browser can actually DISPLAY is uploaded untouched. An iPhone HEIC
// would go to Drive intact and then render nowhere except Safari, so it is the one
// case worth converting — and converting is also the only way to read it at all in
// Chrome, which cannot decode HEIC even to re-encode it.
//
// Kept in lockstep with app/lib/photos.js's ALLOWED_MIME — that set decides what the
// server will record, this one decides what skips conversion, and a mime allowed by
// one but not the other means a file uploads to Drive and then gets rejected on the
// POST /api/photos that follows, orphaning the file.
export const DISPLAYABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export function needsConverting(file) {
  return !DISPLAYABLE.has(String(file && file.type).toLowerCase());
}

// Transient on Google's side. A resumable PUT that comes back 5xx or 429 has not
// failed, it has merely not succeeded yet — retrying the whole session is correct and
// cheap, and without it a single blip surfaces to the user as a dead-end error with a
// photo they have to re-pick by hand.
const RETRYABLE_UPLOAD = new Set([429, 500, 502, 503, 504]);
const UPLOAD_ATTEMPTS = 3;
const napFor = (attempt) => 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);

// → { id } of the new Drive file. `onProgress` gets 0..1 when the browser reports it.
export async function uploadToDrive(blob, opts) {
  let lastErr = null;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      return await attemptUpload(blob, opts);
    } catch (e) {
      lastErr = e;
      if (attempt >= UPLOAD_ATTEMPTS || !RETRYABLE_UPLOAD.has(e.driveStatus)) throw e;
      // A fresh session each time: a 5xx can leave the old upload_id unusable.
      if (opts && opts.onProgress) opts.onProgress(0);
      await new Promise((r) => setTimeout(r, napFor(attempt)));
    }
  }
  throw lastErr;
}

async function attemptUpload(blob, { token, folder, name, onProgress }) {
  const start = await fetch(RESUMABLE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      // Lets Drive size-check before a byte of the photo is sent, so an oversized
      // file fails in a hundred milliseconds instead of after a two-minute upload.
      "X-Upload-Content-Type": blob.type || "image/jpeg",
      "X-Upload-Content-Length": String(blob.size),
    },
    body: JSON.stringify({ name, parents: folder ? [folder] : undefined }),
  });
  if (!start.ok) throw tagged(await driveError(start, "could not start the upload"), start.status);

  const session = start.headers.get("location");
  if (!session) throw new Error("Drive did not return an upload session.");

  // XHR rather than fetch: fetch still cannot report upload progress, and on a phone
  // a multi-megabyte photo over spotty wifi is long enough that a dead-looking button
  // is indistinguishable from a broken one.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", session, true);
    xhr.setRequestHeader("Content-Type", blob.type || "image/jpeg");
    if (onProgress) {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Drive accepted the photo but returned something unreadable."));
        }
        return;
      }
      // Carry Google's own message through. Reporting only the status code turns a
      // diagnosable failure into a guess.
      reject(tagged(bodyMessage(xhr.responseText) || `Drive rejected the upload (${xhr.status}).`, xhr.status));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted."));
    xhr.onabort = () => reject(new Error("The upload was cancelled."));
    xhr.send(blob);
  });
}

async function driveError(res, fallback) {
  try {
    const j = await res.json();
    return (j && j.error && j.error.message) || `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

// Marks an error with the HTTP status that caused it, so the retry loop can tell a
// transient 503 from a permanent 403 without parsing message text.
function tagged(message, status) {
  const e = new Error(message);
  e.driveStatus = status;
  return e;
}

function bodyMessage(text) {
  try {
    const j = JSON.parse(text);
    return (j && j.error && j.error.message) || null;
  } catch {
    return null;
  }
}
