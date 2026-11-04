// The student's own lip-sync timing adjustment (milliseconds), kept on this device.
// + moves the mouth later (use when the mouth moves before the voice: network voices, Bluetooth speakers),
// - moves it earlier (use when the voice is ahead of the mouth).
const KEY = "semai.lipsync.offset.v1";
export const OFFSET_MIN = -300;
export const OFFSET_MAX = 800;
const clampOff = (v) => Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(Number(v) || 0)));

export function getOffsetMs() {
  try { return clampOff(localStorage.getItem(KEY)); } catch (e) { return 0; }
}
export function setOffsetMs(v) {
  try { localStorage.setItem(KEY, String(clampOff(v))); } catch (e) { /* storage unavailable: it just won't be remembered */ }
}

// Diagnostics for tuning: add ?lipdebug to the address once to switch on, ?lipdebug=0 to switch off.
export function debugEnabled() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has("lipdebug")) { if (q.get("lipdebug") === "0") localStorage.removeItem("semai.lipdebug"); else localStorage.setItem("semai.lipdebug", "1"); }
    return localStorage.getItem("semai.lipdebug") === "1";
  } catch (e) { return false; }
}
