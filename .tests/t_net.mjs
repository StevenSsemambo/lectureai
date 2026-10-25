// Tests for src/net.js (run: node .tests/t_net.mjs)
import { withTimeout } from "../src/net.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

// resolves normally and returns the value
ok((await withTimeout(async () => 42, 200)) === 42, "returns the value");
// passes an abort signal that fires on timeout, and rejects with a timeout error
{
  let aborted = false;
  const t0 = Date.now();
  try { await withTimeout((signal) => new Promise((_, rej) => signal.addEventListener("abort", () => { aborted = true; rej(new Error("aborted")); })), 60); ok(false, "should have thrown"); }
  catch (e) { ok(e.timeout === true && e.status === 0 && /too long/.test(e.message), "timeout error shape"); }
  ok(aborted, "signal aborted so the real fetch is cancelled");
  ok(Date.now() - t0 < 400, "returns promptly");
}
// a call that ignores the signal still cannot hold the caller past the deadline
{
  const t0 = Date.now();
  try { await withTimeout(() => new Promise(() => {}), 50); ok(false, "should have thrown"); } catch (e) { ok(e.timeout === true, "never-resolving call times out"); }
  ok(Date.now() - t0 < 400, "deadline respected even if the signal is ignored");
}
// errors from the call itself pass through untouched
try { await withTimeout(async () => { throw new TypeError("Failed to fetch"); }, 200); ok(false, "should throw"); } catch (e) { ok(e instanceof TypeError && !e.timeout, "network errors are not disguised as timeouts"); }
// no AbortController available: runs as before
ok((await withTimeout(async (s) => (s === undefined ? "plain" : "x"), 100, () => null)) === "plain", "works without AbortController");
console.log(`net: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
