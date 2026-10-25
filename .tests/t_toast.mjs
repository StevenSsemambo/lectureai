// Tests for src/toast.js (run: node .tests/t_toast.mjs)
import { notify, subscribe, isBenign, describeFailure, reportFailure, _reset } from "../src/toast.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

// ---- what counts as worth showing ----
ok(isBenign({ name: "AbortError" }) && isBenign({ name: "NotAllowedError" }) && isBenign(new Error("ResizeObserver loop completed with undelivered notifications.")), "cancelled fetches, blocked autoplay and ResizeObserver noise are benign");
ok(isBenign("Script error.") && isBenign(new Error("The play() request was interrupted by a call to pause()")), "cross-origin and interrupted-play noise are benign");
ok(!isBenign(new Error("Cannot read properties of undefined (reading 'x')")) && !isBenign(new TypeError("Failed to fetch")), "real failures are not benign");

// ---- plain-language messages, never raw text ----
const E = (m, extra = {}) => Object.assign(new Error(m), extra);
ok(describeFailure(E("anything"), false).includes("offline"), "offline wins");
ok(describeFailure(E("x", { timeout: true }), true).includes("took too long"), "timeouts");
ok(describeFailure(E('Supabase request failed (401): {"code":"PGRST303","message":"JWT expired"}'), true).includes("session expired"), "expired session");
ok(describeFailure(E("Supabase request failed (403): new row violates row-level security policy"), true).includes("permission"), "permission error");
ok(describeFailure(new TypeError("Failed to fetch"), true).includes("reach the server"), "network error");
ok(describeFailure(E("Supabase request failed (429): slow down"), true).includes("busy"), "rate limit");
const generic = describeFailure(E("Cannot read properties of undefined (reading 'join')"), true);
ok(generic === "Something didn't work. Please try again." && !/undefined|join|Cannot/.test(generic), "unknown errors give a generic sentence with no technical text");
ok(!/PGRST|Supabase|row-level|JWT/.test(describeFailure(E("Supabase request failed (401): JWT expired PGRST303"), true)), "no technical terms leak into messages");

// ---- delivery, de-duplication, rate limit ----
_reset();
const got = []; const off = subscribe((t) => got.push(t));
const t0 = 1_000_000;
ok(notify("A", { now: t0 }) && got.length === 1, "first message is delivered");
ok(notify("A", { now: t0 + 1000 }) === null && got.length === 1, "same message within 5s is merged");
ok(notify("B", { now: t0 + 1500 }) && got.length === 2, "a different message is delivered");
ok(notify("C", { now: t0 + 2000 }) && got.length === 3, "third message delivered");
ok(notify("D", { now: t0 + 2500 }) === null && got.length === 3, "no more than 3 per minute");
ok(notify("E", { now: t0 + 61000 }) && got.length === 4, "allowed again after a minute");
ok(notify("E", { now: t0 + 61000 + 6000 }) && got.length === 5, "same message allowed again after 5 seconds");
off();
ok(notify("F", { now: t0 + 200000 }) && got.length === 5, "unsubscribed listeners get nothing");

// ---- safety ----
_reset();
subscribe(() => { throw new Error("broken listener"); });
const seen = []; subscribe((t) => seen.push(t));
let threw = false; try { notify("X", { now: 5 }); } catch (e) { threw = true; }
ok(!threw && seen.length === 1, "a broken listener cannot break delivery");
_reset();
ok(reportFailure({ name: "AbortError" }) === null, "benign failures are never shown");
const shown = []; subscribe((t) => shown.push(t.message)); reportFailure(new Error("boom"));
ok(shown.length === 1 && shown[0].includes("Something didn't work"), "reportFailure shows a friendly message");
console.log(`toast: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
