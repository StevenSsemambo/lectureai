// Tests for src/avatar/lipsync.js and src/avatar/avatarBus.js (run: node .tests/t_avatar.mjs)
import { buildTimeline, mouthAt, autoEmotion, planGestures, adaptMsPerUnit, unitIndexAt, planActions, MS_PER_UNIT_MIN, MS_PER_UNIT_MAX } from "../src/avatar/lipsync.js";
import { avatarBus } from "../src/avatar/avatarBus.js";
import { buildSpeechMap, positionFromFraction, nextWordT } from "../src/avatar/lipsync.js";
import { analyseSamples } from "../src/avatar/envelope.js";
import { getOffsetMs, setOffsetMs, OFFSET_MIN, OFFSET_MAX } from "../src/avatar/lipTuning.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

// ---- timeline ----
const tl = buildTimeline("Hello, world.");
ok(tl.u.length > 0 && tl.total > 0, "a sentence produces a timeline");
ok(tl.u.every((x, i) => i === 0 || x.t >= tl.u[i - 1].t), "timeline positions never go backwards");
ok(Math.abs(tl.total - tl.u.reduce((s, x) => s + x.w, 0)) < 1e-9, "total is the sum of the weights");
ok(buildTimeline("").total === 0 && buildTimeline(null).u.length === 0, "empty or missing text gives an empty timeline");
ok(buildTimeline("the").u[0].v === "TH" && buildTimeline("ship").u[0].v === "CH" && buildTimeline("phone").u[0].v === "FF", "th / sh / ph are single mouth shapes");
ok(buildTimeline("a").u[0].vow === true && buildTimeline("b").u[0].vow === false, "vowels are flagged");
ok(buildTimeline("a.").u[1].w > buildTimeline("a,").u[1].w && buildTimeline("a,").u[1].w > buildTimeline("a ").u[1].w, "full stops pause longer than commas, commas longer than spaces");

// ---- mouth shape at a position ----
const t2 = buildTimeline("mama");
const m0 = mouthAt(t2, 0);
ok(m0 && m0.viseme === "viseme_PP" && m0.weight === 1 && m0.jaw === 0, "m closes the lips (PP, jaw shut)");
const m1 = mouthAt(t2, t2.u[1].t + 0.1);
ok(m1 && m1.viseme === "viseme_aa" && m1.jaw > 0.2, "a opens the jaw");
ok(mouthAt(t2, -1) === null && mouthAt(t2, t2.total) === null && mouthAt(t2, t2.total + 50) === null, "silent before the start and after the end");
ok(mouthAt(null, 1) === null && mouthAt({ u: [], total: 0 }, 0) === null, "no timeline: no mouth");
ok(mouthAt(buildTimeline("a b"), buildTimeline("a b").u[1].t + 0.1) === null, "spaces leave the mouth still");
const t3 = buildTimeline("oo");
ok(mouthAt(t3, 0.1).funnel > 0 && mouthAt(buildTimeline("uu"), 0.1).pucker > 0, "o funnels, u puckers");
const blend = mouthAt(buildTimeline("ab"), 1.3); // late in "a": starts blending towards "b"
ok(blend && blend.next && blend.next.viseme === "viseme_PP" && blend.next.weight > 0, "late in a sound the next shape starts to blend in");
ok(unitIndexAt(t2, 0) === 0 && unitIndexAt(t2, t2.total) === t2.u.length - 1 && unitIndexAt({ u: [], total: 0 }, 1) === -1, "unit lookup edges");

// ---- emotion ----
ok(autoEmotion("Welcome, everyone!") === "happy", "welcome is happy");
ok(autoEmotion("Wow, that is amazing") === "excited", "wow is excited");
ok(autoEmotion("Remember to initialise it.") === "serious", "remember is serious");
ok(autoEmotion("Unfortunately that is wrong") === "serious" || autoEmotion("Unfortunately that is wrong") === "concerned", "bad news is serious or concerned");
ok(autoEmotion("Sorry about that") === "concerned", "sorry is concerned");
ok(autoEmotion("Is this clear?") === "thoughtful", "a question is thoughtful");
ok(autoEmotion("A variable stores a value.") === null && autoEmotion("") === null && autoEmotion(undefined) === null, "plain statements have no emotion");

// ---- gestures ----
const g1 = planGestures("Hello everyone, welcome to class.", buildTimeline("Hello everyone, welcome to class."));
ok(g1.length >= 1 && g1[0].g === "welcome" && g1[0].s === "both", "a greeting gets a welcome gesture with both hands");
const longText = "A loop repeats a block of code until its condition becomes false and then it stops running for good";
ok(planGestures(longText, buildTimeline(longText)).length === 1 && planGestures(longText, buildTimeline(longText))[0].g === "open", "a long sentence with no cue still gets one open gesture");
ok(planGestures("Yes.", buildTimeline("Yes.")).length === 0, "a short plain sentence gets none");
const many = "First, you must remember, for example, to think about it. Why?";
const gm = planGestures(many, buildTimeline(many));
ok(gm.length <= 2, "never more than two gestures per piece");
ok(gm.every((x, i) => i === 0 || x.t - gm[i - 1].t > 16), "gestures are spaced apart");
ok(planGestures("What do you think?", buildTimeline("What do you think?")).some((x) => x.t > 0), "a question gets a gesture later in the sentence");

// ---- learning the voice's speed ----
const a = adaptMsPerUnit(60, 6000, 100, 1); // measured 60 ms/unit -> stays put
ok(Math.abs(a - 60) < 1e-9, "a voice exactly as expected changes nothing");
const b = adaptMsPerUnit(60, 10000, 100, 1); // a slower voice: moves towards 100, not all the way
ok(b > 60 && b < 100, "a slower voice moves the estimate part of the way");
ok(adaptMsPerUnit(60, 1e7, 100, 1) === MS_PER_UNIT_MAX && adaptMsPerUnit(60, 1, 100, 1) === MS_PER_UNIT_MIN, "the estimate is kept in a sane range");
ok(adaptMsPerUnit(60, 0, 100, 1) === 60 && adaptMsPerUnit(60, 5000, 0, 1) === 60, "nothing measured, nothing learned");
ok(Math.abs(adaptMsPerUnit(60, 3000, 100, 2) - 60) < 1e-9, "a fast speaking rate is taken into account");

// ---- bus: harmless with no listener; delivers; one bad listener can't break the voice ----
ok((avatarBus.piece("x", 1), avatarBus.pieceStart("x", 1), avatarBus.boundary(0), avatarBus.recording("x", {}), avatarBus.end(), avatarBus.stop(), true), "calls with nobody listening do nothing and do not throw");
ok(!avatarBus.hasListeners(), "no listeners to begin with");
const seen = [];
const off1 = avatarBus.subscribe((t, d) => seen.push([t, d]));
const off2 = avatarBus.subscribe(() => { throw new Error("broken listener"); });
avatarBus.pieceStart("Hi there.", 1.2); avatarBus.boundary(3); avatarBus.end(); avatarBus.stop();
ok(seen.length === 4 && seen[0][0] === "pieceStart" && seen[0][1].text === "Hi there." && seen[0][1].rate === 1.2, "events arrive with their data");
ok(seen[1][1].charIndex === 3 && seen[2][0] === "end" && seen[3][0] === "stop", "boundary, end and stop arrive");
const audio = { currentTime: 0 };
avatarBus.recording("Hello", { durationMs: 2000, audio, rate: 1 });
ok(seen[4][0] === "recording" && seen[4][1].audio === audio && seen[4][1].durationMs === 2000, "recording passes the audio element and its length");
off1(); off2();
ok(!avatarBus.hasListeners(), "unsubscribing removes the listeners");
avatarBus.end();
ok(seen.length === 5, "nothing is delivered after unsubscribing");


// ---- words, speech map ----
const tw = buildTimeline("Hi there, you");
ok(tw.words.length === 3 && tw.u[tw.words[1]].ci === 3 && tw.u[tw.words[2]].ci === 10, "word starts are found");
ok(nextWordT(tw, tw.words[0]) === tw.u[tw.words[1]].t && nextWordT(tw, tw.words[2]) === tw.total, "next word start, or the end for the last word");
const tp = buildTimeline("ab. cd");
const mp = buildSpeechMap(tp);
ok(Math.abs(mp.total - (tp.u[0].w + tp.u[1].w + tp.u[4].w + tp.u[5].w)) < 1e-9, "pauses (space, full stop) carry no voice time");
ok(positionFromFraction(tp, mp, 0) === 0 && positionFromFraction(tp, mp, 1) === tp.total, "fraction 0 is the start, 1 the end");
const fSecond = (tp.u[0].w + tp.u[1].w) / mp.total; // all of "ab" heard
ok(Math.abs(positionFromFraction(tp, mp, fSecond) - tp.u[4].t) < 1e-9, "once all of the first sentence has been heard, the position is the start of the second (the pause is skipped)");
const pm = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => positionFromFraction(tp, mp, f));
ok(pm.every((x, i) => i === 0 || x >= pm[i - 1]), "position never goes backwards as more voice is heard");
ok(positionFromFraction(tp, { cum: [0], total: 0 }, 0.5) === -1, "no voice time, no position");

// ---- audio envelope: a synthetic 'recording' with a pause in the middle and silence at both ends ----
const sr = 8000, sec = (t) => Math.round(t * sr);
const sig = new Float32Array(sec(3));
const burst = (a, b) => { for (let i = sec(a); i < sec(b); i++) sig[i] = 0.5 * Math.sin(2 * Math.PI * 200 * i / sr) * (0.6 + 0.4 * Math.sin(i / 300)); };
burst(0.3, 1.1); burst(1.7, 2.5); // voice 0.3-1.1, pause, voice 1.7-2.5, silence to 3.0
const an = analyseSamples(sig, sr);
ok(an && Math.abs(an.hop - 0.02) < 1e-9 && an.n === 150, "analysis returns 20 ms frames");
ok(an.voiced[Math.floor(0.7 / an.hop)] === 1 && an.voiced[Math.floor(1.4 / an.hop)] === 0 && an.voiced[Math.floor(2.8 / an.hop)] === 0 && an.voiced[Math.floor(0.1 / an.hop)] === 0, "voiced where sound is, silent in the pause and at both ends");
ok(Math.abs(an.total * an.hop - 1.6) < 0.15, "about 1.6 s of voice found (" + (an.total * an.hop).toFixed(2) + ")");
ok(an.cum[an.n] === an.total && an.cum[Math.floor(1.4 / an.hop)] === an.cum[Math.floor(1.6 / an.hop)], "voice heard stays flat during the pause");
// a tiny 40 ms dip inside a word is bridged (stop consonant), a 300 ms pause is not
const sig2 = Float32Array.from(sig); for (let i = sec(0.60); i < sec(0.64); i++) sig2[i] = 0;
const an2 = analyseSamples(sig2, sr);
ok(an2.voiced[Math.floor(0.62 / an2.hop)] === 1, "a 40 ms dip inside a word is not a pause");
ok(analyseSamples(new Float32Array(sec(2)), sr) === null && analyseSamples(new Float32Array(10), sr) === null, "silence or a too-short clip: nothing to measure");
// with the map: first sentence of 'Hello. World' lands in the first burst, second in the second burst
const t4 = buildTimeline("Hello. World"), m4 = buildSpeechMap(t4);
const at = (sec_) => positionFromFraction(t4, m4, (an.cum[Math.floor(sec_ / an.hop)] + 0.5) / an.total);
ok(at(0.5) < t4.u[6].t && at(2.0) >= t4.u[6].t, "first burst = 'Hello', second burst = 'World' (not the even stretch)");
const stretched = (2.0 / 3.0) * t4.total; // what the old even stretch would have said at 2.0 s
ok(stretched < t4.u[6].t + 0.01 || true, "(old method for comparison: " + stretched.toFixed(1) + " of " + t4.total.toFixed(1) + ")");

// ---- the student's timing offset ----
const store = new Map(); globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
ok(getOffsetMs() === 0, "offset defaults to 0");
setOffsetMs(250); ok(getOffsetMs() === 250, "offset is saved and read back");
setOffsetMs(99999); ok(getOffsetMs() === OFFSET_MAX, "offset is capped at the top");
setOffsetMs(-99999); ok(getOffsetMs() === OFFSET_MIN, "offset is capped at the bottom");
store.set("semai.lipsync.offset.v1", "junk"); ok(getOffsetMs() === 0, "a junk stored value reads as 0");
globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
ok(getOffsetMs() === 0 && (setOffsetMs(100), true), "storage blocked (private mode): no error, offset 0");
delete globalThis.localStorage;

const s3 = []; const o3 = avatarBus.subscribe((t) => s3.push(t)); avatarBus.pieceEnd(); o3();
ok(s3[0] === "pieceEnd", "the real end of a piece reaches the face");

// ---- actions that follow the words ----
const act = (txt) => planActions(txt, buildTimeline(txt));
const kinds = (ev, k) => ev.filter((e) => e.kind === k);
let ev = act("Hello everyone, welcome to the class.");
ok(kinds(ev, "g").some((e) => e.g === "welcome" && e.s === "both") && kinds(ev, "f").some((e) => e.f === "smile"), "a greeting opens both hands and smiles");
ev = act("Look at the diagram on the screen.");
ok(kinds(ev, "g")[0].g === "point_slide" && kinds(ev, "gaze").some((e) => e.to === "slide"), "'look at the diagram' points at the slide and looks at it");
ev = act("First, we declare the variable.");
ok(kinds(ev, "g")[0].g === "c1", "'first' shows one finger");
ev = act("Never forget the semicolon, it is a common mistake.");
ok(kinds(ev, "g")[0].g === "stop" && kinds(ev, "h").some((e) => e.h === "shake") && kinds(ev, "f").some((e) => e.f === "furrow"), "'never' stops with a frown and a head shake");
ev = act("Remember this key idea.");
ok(kinds(ev, "g")[0].g === "beat" && kinds(ev, "h").some((e) => e.h === "nod"), "'remember' is a firm beat with a nod");
ev = act("Why do we declare the type first?");
ok(kinds(ev, "f").some((e) => e.f === "brow_up" || e.f === "think"), "a question lifts the brows or looks thoughtful");
ev = act("Maybe, but it depends on the compiler and the system you use today.");
ok(kinds(ev, "g").length <= 2 && ev.every((e, i) => i === 0 || e.t >= ev[i - 1].t), "at most two gestures, events in time order");
ok(act("ok").length === 0 && planActions("hello", null).length === 0 && planActions("", buildTimeline("")).length === 0, "nothing to do when there is nothing to react to");
{ const g = kinds(act("Look, then maybe think about big small things, and you will see."), "g"); ok(g.every((x, i) => i === 0 || Math.abs(x.t - g[i - 1].t) > 16), "gestures are spaced apart"); }

console.log(`avatar: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
