// Tests for src/avatar/lipsync.js and src/avatar/avatarBus.js (run: node .tests/t_avatar.mjs)
import { buildTimeline, mouthAt, autoEmotion, planGestures, adaptMsPerUnit, unitIndexAt, MS_PER_UNIT_MIN, MS_PER_UNIT_MAX } from "../src/avatar/lipsync.js";
import { avatarBus } from "../src/avatar/avatarBus.js";
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

console.log(`avatar: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
