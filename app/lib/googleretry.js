// Retry/backoff for a Google API call, and the reason is a quota, not tidiness.
//
// Sheets allows ~60 reads and ~60 writes per minute per user. One PATCH of a workout
// costs up to 3 reads and a write, and a bulk rename PATCHes each affected workout in
// turn — so applying one term rule across 63 workouts is ~190 reads in a burst. On
// 2026-09-14 that happened for real: the Push ups rule stopped 58 of 63 workouts in
// with "Quota exceeded for quota metric 'Read requests'", because every call was a
// bare client.request that threw on the first 429.
//
// This lived inside sheets.js as a private `request()`. It moved out when Drive was
// added: Drive has its OWN quota, a copy of the loop would have drifted from this one,
// and the lesson in the paragraph above is "every call", not "every Sheets call".
// Pulling it out also made it testable, which it never was inline.
//
// Retrying is safe for every caller this has. A read is a read. A Sheets write is
// addressed by explicit row index and range (never "append at the end" for an update),
// so re-issuing one writes the same cells the same values; the one genuine append,
// appendRow, is only reached through routes that dedupe on a caller-supplied id. Drive
// uploads are the same shape — POST /api/photos dedupes on the client's photo id before
// it ever reaches Drive.
export const RETRYABLE = new Set([429, 500, 502, 503, 504]);
export const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// google-auth-library surfaces the HTTP status in different places depending on how the
// failure arrived, so check all of them rather than trusting one.
export function statusOf(e) {
  if (!e) return 0;
  return Number(e.status || (e.response && e.response.status) || e.code) || 0;
}

// Run `fn` until it succeeds, a non-retryable status comes back, or the attempts run
// out. `opts.sleepFn` exists only so tests do not spend 15 real seconds backing off.
export async function withRetry(fn, opts = {}) {
  const wait0 = opts.startMs || 600;
  const max = opts.maxAttempts || MAX_ATTEMPTS;
  const nap = opts.sleepFn || sleep;
  const jitter = opts.jitter || (() => Math.floor(Math.random() * 300));
  let wait = wait0;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= max || !RETRYABLE.has(statusOf(e))) throw e;
      // Jittered, so several requests backing off together do not resynchronise and
      // arrive as one burst again.
      await nap(wait + jitter());
      wait = Math.min(wait * 2, 8000);
    }
  }
}
