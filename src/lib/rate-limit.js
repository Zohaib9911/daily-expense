// Tiny in-memory login throttle: MAX_FAILURES failed attempts per key within WINDOW_MS.
// Fine for a single PM2 process. Resets on restart.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

const store = (globalThis._loginFailures ||= new Map());

function recent(key) {
  const now = Date.now();
  const list = (store.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) store.set(key, list);
  else store.delete(key);
  return list;
}

export function isBlocked(key) {
  return recent(key).length >= MAX_FAILURES;
}

export function recordFailure(key) {
  const list = recent(key);
  list.push(Date.now());
  store.set(key, list);
}

export function clearFailures(key) {
  store.delete(key);
}
