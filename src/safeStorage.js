// Browsers can THROW just from touching `localStorage` or `indexedDB` (Safari with cookies blocked,
// some in-app browsers and sandboxed iframes, Firefox privacy modes). Even `typeof localStorage`
// throws there. These helpers turn that into "not available" (null) so callers can degrade quietly.

export function safeLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage ? localStorage : null;
  } catch (e) {
    return null;
  }
}

export function safeIndexedDB() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB ? indexedDB : null;
  } catch (e) {
    return null;
  }
}
