// Pure lip-sync / gesture planning for the lecturer's face. No three.js, no DOM: everything here can be tested in Node.
// Ported from the standalone "3D AI Lecturer" prototype so the face moves exactly as it did there.
//
// Idea: turn the sentence into a timeline of mouth shapes (visemes) where every letter has a "weight" (how long it
// takes to say). The face then walks along that timeline at a speed (ms per weight unit) that is either measured from
// the voice (recorded audio: exact duration; browser voice: word-boundary events) or estimated and refined.

export const VISEME_MAP = {
  a: "aa", e: "E", i: "I", o: "O", u: "U", w: "U", y: "I",
  b: "PP", m: "PP", p: "PP", f: "FF", v: "FF",
  t: "DD", d: "DD", l: "DD", k: "kk", g: "kk", c: "kk", q: "kk",
  s: "SS", z: "SS", x: "SS", j: "CH", r: "RR", n: "nn",
};
export const JAW_OPEN = { aa: 0.3, O: 0.2, E: 0.14, I: 0.09, U: 0.08, PP: 0, FF: 0.02 };

// ms per weight unit at speaking rate 1.0 (the prototype measured ~62 at rate 0.98)
export const BASE_MS_PER_UNIT = 60;
export const MS_PER_UNIT_MIN = 35;
export const MS_PER_UNIT_MAX = 110;

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// text -> { u: [{ v, w, ci, t, vow, amp }], total }   (ci = character index in the text, t = start on the timeline)
export function buildTimeline(text) {
  const u = [];
  const words = []; // indexes (into u) of the first unit of each word
  const s = String(text || "").toLowerCase();
  let i = 0;
  let c = 0;
  let prevSpace = true;
  while (i < s.length) {
    const ch = s[i];
    const two = s.substr(i, 2);
    let v = null, w = 0.3, n = 1, vow = false;
    if (two === "th") { v = "TH"; w = 0.9; n = 2; }
    else if (two === "sh" || two === "ch") { v = "CH"; w = 0.9; n = 2; }
    else if (two === "ph") { v = "FF"; w = 0.9; n = 2; }
    else if (VISEME_MAP[ch]) { v = VISEME_MAP[ch]; vow = "aeiou".includes(ch); w = vow ? 1.4 : 0.8; }
    else if (",;:".includes(ch)) w = 3;
    else if (".!?".includes(ch)) w = 5;
    else if (ch === " ") w = 0.5;
    const space = /\s/.test(ch), pause = ",;:.!?".includes(ch);
    if (!space && prevSpace) words.push(u.length);
    prevSpace = space;
    // sw = how much real voice time this unit takes (spaces and punctuation are pauses: no voice time of their own)
    u.push({ v, w, ci: i, t: c, vow, amp: 0.82 + ((i * 7) % 5) * 0.05, sw: space || pause ? 0 : v ? w : 0.6 });
    c += w;
    i += n;
  }
  return { u, total: c, words };
}

// Timeline position where the word after unit k begins (or the end of the piece).
export function nextWordT(tl, k) {
  for (const j of tl.words || []) if (j > k) return tl.u[j].t;
  return tl.total;
}

// Maps "fraction of the voiced sound heard so far" (0..1) to a timeline position, so pauses in the recording
// (which carry no voice time) line up with spaces and punctuation in the text instead of shifting everything.
export function buildSpeechMap(tl) {
  const cum = new Float64Array(tl.u.length + 1);
  for (let k = 0; k < tl.u.length; k++) cum[k + 1] = cum[k] + tl.u[k].sw;
  return { cum, total: cum[tl.u.length] };
}
export function positionFromFraction(tl, map, f) {
  if (!(map.total > 0)) return -1;
  const target = clamp(f, 0, 1) * map.total;
  if (target >= map.total) return tl.total;
  let lo = 0, hi = tl.u.length - 1; // last unit k with cum[k] <= target (that unit then has voice time, since cum[k+1] > target)
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (map.cum[mid] <= target) lo = mid; else hi = mid - 1; }
  const un = tl.u[lo];
  return un.t + ((target - map.cum[lo]) / (un.sw || 1)) * un.w;
}

// Index of the timeline unit that covers position p (in weight units).
export function unitIndexAt(tl, p) {
  const U = tl.u;
  if (!U.length) return -1;
  let k = 0;
  while (k < U.length - 1 && U[k + 1].t <= p) k++;
  return k;
}

// Mouth targets at timeline position p: { viseme, weight, jaw, funnel, pucker, next:{viseme,weight}|null } or null when silent.
export function mouthAt(tl, p) {
  if (!tl || !tl.u.length || p < 0 || p >= tl.total) return null;
  const k = unitIndexAt(tl, p);
  const un = tl.u[k];
  if (!un || !un.v) return null;
  const frac = (p - un.t) / un.w;
  const out = {
    viseme: "viseme_" + un.v,
    weight: un.v === "PP" ? 1 : (un.vow ? 0.8 : 0.55) * un.amp,
    jaw: (JAW_OPEN[un.v] ?? 0.04) * un.amp,
    funnel: un.v === "O" ? 0.4 : un.v === "U" ? 0.25 : 0,
    pucker: un.v === "O" ? 0.15 : un.v === "U" ? 0.3 : 0,
    next: null,
  };
  const nx = tl.u[k + 1];
  if (nx && nx.v && frac > 0.55) out.next = { viseme: "viseme_" + nx.v, weight: (0.4 * (frac - 0.55)) / 0.45 };
  return out;
}

// ---------- emotion from the words ----------
export function autoEmotion(t) {
  t = String(t || "");
  return /\b(great|excellent|well done|congratulations|good job|wonderful|welcome)\b/i.test(t) ? "happy"
    : /\b(wow|amazing|incredible)\b/i.test(t) ? "excited"
    : /\b(careful|warning|mistake|error|wrong|never|must|remember|important)\b/i.test(t) ? "serious"
    : /\b(sorry|unfortunately|difficult|struggle)\b/i.test(t) ? "concerned"
    : /\b(interesting|surprising)\b/i.test(t) ? "surprised"
    : /\b(think|consider|imagine|why)\b/i.test(t) || /\?\s*$/.test(t) ? "thoughtful"
    : null;
}

// ---------- gestures tied to the sentence ----------
// arm poses: [upperArm x, y, z, forearm x, y, z] direction vectors (per side, mirrored by the engine)
export const GESTURE_POSES = {
  welcome: [0.65, -0.55, 0.25, 0.7, 0.55, 0.4],
  open: [0.5, -0.7, 0.3, 0.55, 0.4, 0.75],
  point: [0.2, -0.7, 0.6, -0.05, 0.15, 1],
  count: [0.25, -0.8, 0.5, 0.1, 0.9, 0.5],
  beat: [0.3, -0.75, 0.45, 0.15, 0.6, 0.8],
  ask: [0.35, -0.8, 0.4, 0.2, 0.35, 0.9],
  think: [0.15, -0.9, 0.35, -0.5, 0.15, 0.85],
};
const GESTURE_RULES = [
  [/\b(everyone|welcome|good day|hello)\b/i, "welcome", "both"],
  [/\b(you|your)\b/i, "point", "R"],
  [/\b(first|second|third|step)\b/i, "count", "R"],
  [/\b(remember|important|always|never|must|careful)\b/i, "beat", "R"],
  [/\b(for example|such as)\b/i, "open", "both"],
  [/\b(think|consider|imagine|wonder)\b/i, "think", "both"],
];

// -> [{ t (timeline position), g (gesture name), s ("R" | "both") }], at most 2 per piece, spaced apart
export function planGestures(text, tl) {
  const e = [];
  const str = String(text || "");
  for (const [re, g, s] of GESTURE_RULES) {
    const m = re.exec(str);
    if (m) {
      const k = tl.u.findIndex((x) => x.ci >= m.index);
      if (k >= 0) e.push({ t: tl.u[k].t, g, s });
    }
  }
  if (/\?\s*$/.test(str)) e.push({ t: tl.total * 0.6, g: "ask", s: "R" });
  if (!e.length && str.length > 70) e.push({ t: tl.total * 0.45, g: "open", s: "R" });
  e.sort((a, b) => a.t - b.t);
  const spaced = [];
  for (const x of e) if (!spaced.length || x.t - spaced[spaced.length - 1].t > 16) spaced.push(x);
  return spaced.slice(0, 2);
}


// ---------- actions tied to the words (gestures, expressions, head, gaze) ----------
// Each rule is [pattern, actions]. The action starts at the word that matched. Earlier rules win when two gestures compete.
//   g = arm gesture (names from body.js POSES), s = "R" (her right hand) or "both"; f = a quick facial expression (amount, ms);
//   h = head move (nod / shake / tilt); gaze = where the eyes go (slide / up / student).
const G = (g, s = "R") => ({ kind: "g", g, s });
const F = (f, amp, dur) => ({ kind: "f", f, amp, dur });
const H = (h) => ({ kind: "h", h });
const GZ = (to) => ({ kind: "gaze", to });
export const ACTION_RULES = [
  [/\b(look|see|notice|watch|slide|diagram|figure|table|chart|screen)\b/i, [G("point_slide"), GZ("slide")]],
  [/\b(first|firstly|step one|number one)\b/i, [G("c1")]],
  [/\b(second|secondly|step two|number two|two)\b/i, [G("c2")]],
  [/\b(third|thirdly|step three|number three|three)\b/i, [G("c3")]],
  [/\b(never|don'?t|do not|avoid|wrong|incorrect|mistake|error|bug|warning|careful|danger)\b/i, [G("stop"), F("furrow", 0.5, 1200), H("shake")]],
  [/\b(important|key|essential|crucial|remember|must|always|critical|make sure|note that)\b/i, [G("beat"), F("furrow", 0.4, 1100), H("nod")]],
  [/\b(hello|hi|welcome|good (?:morning|afternoon|evening|day))\b/i, [G("welcome", "both"), F("smile", 0.7, 1900), H("nod")]],
  [/\b(maybe|perhaps|might|probably|depends|not sure|sometimes)\b/i, [G("shrug", "both"), F("brow_up", 0.5, 1100), H("tilt")]],
  [/\b(big|large|huge|many|lots|wide|whole|entire)\b/i, [G("wide", "both")]],
  [/\b(small|little|tiny|few|short)\b/i, [G("small", "both")]],
  [/\b(but|however|although|whereas|instead|on the other hand)\b/i, [G("open", "both"), H("tilt")]],
  [/\b(think|imagine|consider|wonder|suppose|why)\b/i, [G("together", "both"), F("think", 0.6, 1400), GZ("up")]],
  [/\b(then|next|after that|afterwards|finally)\b/i, [G("next")]],
  [/\b(you|your|yours)\b/i, [G("offer"), GZ("student")]],
  [/\b(everyone|everybody|class|students)\b/i, [G("open", "both")]],
  [/\b(great|excellent|well done|correct|exactly|perfect|nice|congratulations)\b/i, [F("smile", 0.7, 1500), H("nod")]],
  [/\b(wow|amazing|incredible|surprising|surprisingly|interesting|actually)\b/i, [F("wide", 0.6, 1000)]],
  [/\b(sorry|unfortunately|difficult|hard|struggle|tricky|confusing|problem)\b/i, [F("concern", 0.6, 1600), H("tilt")]],
];

// -> events sorted by timeline position: [{ t, kind: "g" | "f" | "h" | "gaze", ... }]. At most 2 gestures per piece, spaced apart.
export function planActions(text, tl) {
  const str = String(text || "");
  if (!tl || !tl.u || !tl.u.length) return [];
  const gestures = [], others = [];
  ACTION_RULES.forEach(([re, acts], pri) => {
    const m = re.exec(str);
    if (!m) return;
    const k = tl.u.findIndex((x) => x.ci >= m.index);
    if (k < 0) return;
    for (const a of acts) (a.kind === "g" ? gestures : others).push({ ...a, t: tl.u[k].t, pri });
  });
  if (/\?\s*$/.test(str)) {
    gestures.push({ ...G("offer"), t: tl.total * 0.6, pri: 98 });
    others.push({ ...F("brow_up", 0.5, 1200), t: tl.total * 0.8 }, { ...H("tilt"), t: tl.total * 0.8 });
  }
  if (/!\s*$/.test(str)) others.push({ ...F("smile", 0.5, 1000), t: tl.total * 0.85 });
  if (!gestures.length && str.length > 80) gestures.push({ ...G("open"), t: tl.total * 0.45, pri: 99 });
  gestures.sort((a, b) => a.pri - b.pri);
  const chosen = [];
  for (const g of gestures) if (chosen.length < 2 && chosen.every((x) => Math.abs(x.t - g.t) > 16)) chosen.push(g);
  return [...chosen, ...others].sort((a, b) => a.t - b.t);
}

// After a piece ends naturally, learn the real speed (blend 40% old / 60% measured), kept in a sane range.
export function adaptMsPerUnit(current, elapsedMs, totalUnits, rate = 1) {
  if (!(totalUnits > 0) || !(elapsedMs > 0)) return current;
  const measuredAtRate1 = (elapsedMs / totalUnits) * (rate || 1);
  return clamp(current * 0.4 + measuredAtRate1 * 0.6, MS_PER_UNIT_MIN, MS_PER_UNIT_MAX);
}
