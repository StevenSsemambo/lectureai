// speakWithBrowserVoice against a fake speech engine (run: node .tests/t_speech.mjs)
import { speakWithBrowserVoice, speakWithVoiceFallback, splitForSpeech } from "../src/voice/speech.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

const T = { msPerChar: 15, graceMs: 200, pollMs: 15, idleMs: 60, retryDelayMs: 5 }; // fast timings for the test
// mode: ok (speaks for `speed` x the expected time) | instant (start+end at once, no sound) | dropFirst | neverEnds
function makeSynth(mode, { speed = 0.6 } = {}) {
  const q = []; let speaking = false, nSpoken = 0;
  const synth = {
    get speaking() { return speaking; }, get pending() { return q.length > 0; }, paused: false,
    cancel() { q.length = 0; speaking = false; }, resume() {}, pause() {},
    speak(u) { q.push(u); if (!speaking) next(); },
  };
  function next() {
    const u = q.shift(); if (!u) { speaking = false; return; }
    speaking = true; nSpoken++;
    if (mode === "dropFirst" && nSpoken === 1) { setTimeout(() => { u.onend && u.onend(); next(); }, 1); return; }
    if (u.voice && u.voice.name === "Dead") { setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); next(); }, 2); return; }
    if (mode === "instant") { setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); next(); }, 2); return; }
    const dur = u.text.length * T.msPerChar * speed;
    setTimeout(() => { u.onstart && u.onstart();
      if (mode === "neverEnds") return;
      setTimeout(() => { u.onend && u.onend(); next(); }, dur); }, 4);
  }
  return synth;
}
class U { constructor(t) { this.text = t; } }
const run = async (mode, text, extra = {}, synthOpts) => {
  const trouble = []; const t0 = Date.now();
  const r = await speakWithBrowserVoice(makeSynth(mode, synthOpts), U, text, { rate: 1, voice: { localService: false }, ...T, onTrouble: (k) => trouble.push(k), ...extra });
  return { r, trouble, ms: Date.now() - t0 };
};
const LONG = "Hello everyone, welcome to class. Today we look at CPU scheduling and why it matters for every program you run.";

{ const o = await run("ok", LONG); ok(o.r === true && o.trouble.length === 0, "normal voice: finishes, no trouble"); }
{ const o = await run("ok", LONG, {}, { speed: 0.25 }); ok(o.r === true && o.trouble.length === 0, "a fast voice (a quarter of the expected time) is NOT mistaken for silence: " + o.trouble); }
{ const o = await run("dropFirst", LONG); ok(o.r === true && o.trouble.includes("dropped") && !o.trouble.includes("silent"), "a dropped piece is retried as before: " + o.trouble); }
{ const o = await run("neverEnds", "Short line that never ends."); ok(o.trouble.includes("stalled"), "a voice that never ends is reported as stalled: " + o.trouble); }

// the case that was silent before: started + ended at once, no sound
{ const o = await run("instant", LONG);
  ok(o.r === true && o.trouble.includes("instant") && o.trouble.at(-1) === "silent", "instant 'success' is detected and reported as silent: " + o.trouble);
  ok(o.ms < 3000, "…and the lecture still moves on promptly (" + o.ms + " ms)"); }
{ const o = await run("instant", "Hello there."); ok(o.r === true && o.trouble.length === 0, "a very short piece finishing quickly is normal (not flagged)"); }
{ const o = await run("instant", LONG + " " + LONG + " " + LONG); ok(o.trouble.includes("gave-up") && o.trouble.at(-1) === "silent", "several instant pieces: gives up AND says silent: " + o.trouble.join(",")); }

// stop requested by the app still wins
{ let stop = false; setTimeout(() => (stop = true), 100); const o = await run("ok", LONG, { shouldStop: () => stop }, { speed: 1 }); ok(o.r === false, "stop still returns false"); }
ok(splitForSpeech("A. B.").length >= 1, "splitting unchanged");

// ---- one dead saved voice must not silence the lecture ----
{
  const mk = (voice, mode = "ok", extra = {}) => { const trouble = []; let fell = 0; const spoken = []; const synth = makeSynth(mode); const sp = synth.speak; synth.speak = (u) => { spoken.push(u.voice ? u.voice.name : "default"); sp(u); };
    return speakWithVoiceFallback(synth, U, LONG, { rate: 1, voice, ...T, onTrouble: (k) => trouble.push(k), onVoiceFallback: () => fell++, ...extra }).then((r) => ({ r, trouble, fell, spoken })); };
  const dead = { name: "Dead", localService: false }, good = { name: "Good", localService: false };
  { const o = await mk(dead); ok(o.r === true && o.fell === 1 && o.spoken.includes("default"), "dead saved voice: the line is spoken again with the default voice (" + o.spoken.join(",") + ")"); ok(o.trouble.includes("silent"), "…the failure is still reported"); }
  { const o = await mk(good); ok(o.r === true && o.fell === 0 && !o.spoken.includes("default"), "a working chosen voice is used, no fallback"); }
  { const o = await mk(null); ok(o.r === true && o.fell === 0, "no voice chosen: nothing to fall back from"); }
  { const o = await mk(dead, "instant"); ok(o.r === true && o.fell === 1, "engine dead for every voice: one retry only, no loop (fell " + o.fell + ")"); }
  { const o = await mk(dead, "ok", { shouldStop: () => true }); ok(o.r === false && o.fell === 0, "stopped by the student: no fallback"); }
  { const o = await mk(good, "dropFirst"); ok(o.fell === 0, "an ordinary dropped piece (it did speak) is not treated as a dead voice"); }
}

console.log(`speech: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
