// Settings that follow you across devices. The Google Sheet's "Settings" tab
// is the source of truth; localStorage keeps a copy so every read is
// synchronous and instant. Writes update the copy immediately and are pushed
// to the sheet in the background (debounced). A write that fails to reach the
// sheet stays marked "dirty" and is retried on the next sync.
import { safeGet, safeSet } from "./storage.js";

export const SYNCED_DEFAULTS = {
  custom_categories: {},
  expense_budgets: {},
  dismissed_insights: {},
  known_people: [],
  vendor_categories: {},
};

const DIRTY_KEY = "settings_dirty";
const MIGRATED_KEY = "settings_migrated_v1";
const listeners = new Set();

export function getSetting(key) {
  return safeGet(key, SYNCED_DEFAULTS[key]);
}

export function setSetting(key, value) {
  safeSet(key, value);
  const dirty = new Set(safeGet(DIRTY_KEY, []));
  dirty.add(key);
  safeSet(DIRTY_KEY, [...dirty]);
  schedulePush();
  notify();
}

// Re-render hook-up for components that read settings during render
export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushDirty, 400);
}

async function putSettings(entries) {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entries),
  });
  if (!res.ok) throw new Error(`Settings save failed (${res.status})`);
}

async function pushDirty() {
  const dirty = safeGet(DIRTY_KEY, []);
  if (dirty.length === 0) return;
  const entries = Object.fromEntries(dirty.map((k) => [k, getSetting(k)]));
  try {
    await putSettings(entries);
    // Only clear what we sent; anything changed meanwhile stays dirty
    const stillDirty = safeGet(DIRTY_KEY, []).filter(
      (k) => !(k in entries) || JSON.stringify(getSetting(k)) !== JSON.stringify(entries[k])
    );
    safeSet(DIRTY_KEY, stillDirty);
  } catch (err) {
    console.error(err);
  }
}

// Objects: the sheet's entries win on conflicts. Arrays: union.
export function mergeSetting(remote, local) {
  if (remote === undefined) return local;
  if (local === undefined) return remote;
  if (Array.isArray(remote) && Array.isArray(local)) return [...new Set([...remote, ...local])];
  if (remote && local && typeof remote === "object" && typeof local === "object") return { ...local, ...remote };
  return remote;
}

// Pull from the sheet. The first time on a device, merge whatever it had
// stored locally into the sheet so nothing set before this change is lost.
export async function syncSettings() {
  const res = await fetch("/api/settings", { cache: "no-store" });
  if (!res.ok) throw new Error(`Settings load failed (${res.status})`);
  const { settings = {} } = await res.json();
  const migrated = safeGet(MIGRATED_KEY, false);
  const dirty = new Set(safeGet(DIRTY_KEY, []));
  const upload = {};

  for (const key of Object.keys(SYNCED_DEFAULTS)) {
    const local = safeGet(key, undefined);
    const remote = settings[key];
    if (dirty.has(key) && local !== undefined) {
      upload[key] = local; // changed here but never reached the sheet
    } else if (!migrated && local !== undefined) {
      const merged = mergeSetting(remote, local);
      safeSet(key, merged);
      if (JSON.stringify(merged) !== JSON.stringify(remote)) upload[key] = merged;
    } else if (remote !== undefined) {
      safeSet(key, remote);
    }
  }

  if (Object.keys(upload).length > 0) {
    await putSettings(upload);
    safeSet(DIRTY_KEY, [...dirty].filter((k) => !(k in upload)));
  }
  safeSet(MIGRATED_KEY, true);
  notify();
}
