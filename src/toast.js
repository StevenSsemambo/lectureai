// A small, framework-free store for "something didn't work" messages shown to the person.
// Used as a safety net: any failure nobody handled (a button click that threw, a request that failed
// in the background) is turned into ONE calm, plain message instead of silently doing nothing.

const listeners = new Set();
let nextId = 1;
const recent = []; // timestamps of shown toasts, for rate limiting
let lastKey = "";
let lastAt = 0;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Failures that are NOT worth interrupting a student for.
export function isBenign(err) {
  const name = err && err.name;
  const msg = String((err && err.message) || err || "");
  if (name === "AbortError" || name === "NotAllowedError" || name === "NotSupportedError") return true; // cancelled fetch, autoplay/speech blocked
  if (/ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|Load failed.*analytics|The play\(\) request was interrupted|signal is aborted/i.test(msg)) return true;
  if (/interrupted|cancel(l)?ed|canceled/i.test(msg) && /speech|synthesis|utterance|audio/i.test(msg)) return true;
  return false;
}

// A friendly sentence for the person. Never shows raw technical text.
export function describeFailure(err, online = typeof navigator === "undefined" ? true : navigator.onLine !== false) {
  const msg = String((err && err.message) || err || "");
  if (!online) return "You're offline right now. Try again when you're back online.";
  if (err && err.timeout) return "That took too long. Check your connection and try again.";
  if (/JWT expired|\b401\b|PGRST30/i.test(msg)) return "Your session expired. Please sign in again.";
  if (/\b403\b|row-level security|permission/i.test(msg)) return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return "Couldn't reach the server. Check your connection and try again.";
  if (/\b429\b|rate limit/i.test(msg)) return "The service is busy right now. Please try again in a moment.";
  return "Something didn't work. Please try again.";
}

// Show a message. Duplicates within 5 s are merged, and no more than 3 appear per minute, so a burst of related
// failures never turns into a wall of banners.
export function notify(message, { kind = "error", ttl = 7000, now = Date.now() } = {}) {
  const key = `${kind}:${message}`;
  if (key === lastKey && now - lastAt < 5000) return null;
  while (recent.length && now - recent[0] > 60000) recent.shift();
  if (recent.length >= 3) return null;
  lastKey = key;
  lastAt = now;
  recent.push(now);
  const toast = { id: nextId++, message, kind, ttl };
  listeners.forEach((fn) => {
    try { fn(toast); } catch (e) { /* a broken listener must not break the rest */ }
  });
  return toast;
}

// The one call used by the global handlers: decide, describe, show.
export function reportFailure(err, opts) {
  if (isBenign(err)) return null;
  return notify(describeFailure(err), opts);
}

// For tests.
export function _reset() {
  listeners.clear();
  recent.length = 0;
  lastKey = "";
  lastAt = 0;
}
