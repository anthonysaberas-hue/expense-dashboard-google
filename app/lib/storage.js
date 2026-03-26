/**
 * Safe localStorage wrappers — handles private browsing,
 * quota errors, and corrupted JSON without throwing.
 */

export function safeGet(key, defaultVal) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultVal;
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

export function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
