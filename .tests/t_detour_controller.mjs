// Tests for the detour controller's timing rules (run: node .tests/t_detour_controller.mjs)
import { createDetourController } from "../src/detour/detour.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

// A fake clock so timers are deterministic.
function fakeClock() {
  let t = 0, id = 0; const timers = new Map();
  return {
    setTimer: (fn, ms) => { const k = ++id; timers.set(k, { fn, at: t + ms }); return k; },
    clearTimer: (k) => timers.delete(k),
    advance(ms) { t += ms; for (const [k, v] of [...timers]) if (v.at <= t) { timers.delete(k); v.fn(); } },
    pending: () => timers.size,
  };
}
const flush = () => new Promise((r) => setImmediate(r));
const board = { kind: "diagram", slide: { title: "x" }, highlight: null };

// open -> hold -> auto-return after the delay
{
  const clock = fakeClock(); const seen = [];
  const ctl = createDetourController({ onChange: (b) => seen.push(b && b.id), ...clock });
  const id = ctl.open(board);
  let done = false; ctl.hold(id, 3000).then(() => { done = true; });
  clock.advance(2999); await flush(); ok(!done, "still held before the delay");
  clock.advance(1); await flush(); ok(done, "released after the delay");
  ok(ctl.closeIf(id) === true && ctl.current() === null, "closeIf closes the same board");
  ok(JSON.stringify(seen) === JSON.stringify([id, null]), "onChange saw open then close: " + JSON.stringify(seen));
}
// Back during the hold releases immediately and clears the timer
{
  const clock = fakeClock(); const ctl = createDetourController(clock);
  const id = ctl.open(board); let done = false; ctl.hold(id, 5000).then(() => { done = true; });
  ctl.close(); await flush();
  ok(done && ctl.current() === null && clock.pending() === 0, "Back releases the hold and leaves no timer behind");
}
// pinned: no auto-return; unpinning returns after a short delay
{
  const clock = fakeClock(); const ctl = createDetourController(clock);
  const id = ctl.open(board); ctl.togglePin();
  let done = false; ctl.hold(id, 1000).then(() => { done = true; });
  clock.advance(60000); await flush();
  ok(!done && ctl.current() && ctl.current().pinned, "pinned board stays open indefinitely");
  ctl.togglePin(); clock.advance(2499); await flush(); ok(!done, "unpinned: short grace period");
  clock.advance(1); await flush(); ok(done, "unpinned: returns after the grace period");
}
// pinning during the hold cancels the timer
{
  const clock = fakeClock(); const ctl = createDetourController(clock);
  const id = ctl.open(board); let done = false; ctl.hold(id, 3000).then(() => { done = true; });
  clock.advance(1000); ctl.togglePin(); clock.advance(10000); await flush();
  ok(!done, "pin during hold cancels the countdown");
}
// A NEW question: the older answer must not close the newer board
{
  const clock = fakeClock(); const ctl = createDetourController(clock);
  const old = ctl.open(board);
  let oldDone = false; ctl.hold(old, 3000).then(() => { oldDone = true; });
  ctl.close();                                  // new question starts: closes the old board
  const fresh = ctl.open({ ...board, kind: "slide" }); // ...and shows its own
  await flush(); ok(oldDone, "old hold is released when its board is replaced");
  ok(ctl.closeIf(old) === false && ctl.current() && ctl.current().id === fresh, "old answer cannot close the new board");
  ok(ctl.current().kind === "slide", "the new board is intact");
}
// opening a board while another is up ends the old hold (no leaked promise)
{
  const clock = fakeClock(); const ctl = createDetourController(clock);
  const a = ctl.open(board); let aDone = false; ctl.hold(a, 9000).then(() => { aDone = true; });
  ctl.open(board); await flush();
  ok(aDone, "open() releases a previous hold");
}
// hold on a board that is already gone resolves at once
{
  const clock = fakeClock(); const ctl = createDetourController(clock);
  const id = ctl.open(board); ctl.close();
  let done = false; ctl.hold(id, 5000).then(() => { done = true; }); await flush();
  ok(done && clock.pending() === 0, "hold on a closed board resolves immediately");
  ok(ctl.close() === false, "closing twice is harmless");
  ok(ctl.togglePin() === false, "pin with no board is harmless");
}
console.log(`detour controller: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
