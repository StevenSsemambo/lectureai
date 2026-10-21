// Bayesian Knowledge Tracing (BKT) with forgetting: how likely is it that this student KNOWS a concept?
//
// Why this replaces "a few right answers = mastered":
//   - a student can answer right without knowing (guess) and wrong while knowing (slip), so one answer
//     moves the estimate only part of the way, and how far depends on how sure the student said they were;
//   - learning is allowed between answers (each attempt, and the feedback that follows, can teach);
//   - knowledge fades with time, so an old "got it" counts for less than yesterday's;
//   - every estimate comes with an honest range, so a concept with two answers is never presented as certain.
//
// Pure functions, no network. The output has the same fields the rest of SEMAI already uses
// ({concept, mastery, n, level, trend, confidentWrong, confident, lastAt}) plus {low, high}.

const DAY = 86400000;

export const BKT_DEFAULTS = {
  pInit: 0.25,        // chance a student already knows a concept before any answer
  pLearn: 0.12,       // chance of learning from one attempt plus its feedback
  forgetHalfLifeDays: 60, // knowledge drifts back toward pInit with this half-life
  // [guess, slip] by how sure the student said they were
  noise: {
    guess: [0.5, 0.15],  // "just guessing": a right answer says little, a wrong one says little too
    fairly: [0.25, 0.1], // "fairly sure" (the app's middle option)
    default: [0.2, 0.1],
    sure: [0.12, 0.05],  // "very sure": a right answer is convincing, a wrong one is a real misconception
  },
};

function noiseFor(confidence, p) {
  return p.noise[confidence] || p.noise.default;
}

// One answer: update P(known), then allow for learning from the attempt.
export function bktStep(pKnown, correct, confidence, params = BKT_DEFAULTS) {
  const [g, s] = noiseFor(confidence, params);
  const post = correct
    ? (pKnown * (1 - s)) / (pKnown * (1 - s) + (1 - pKnown) * g)
    : (pKnown * s) / (pKnown * s + (1 - pKnown) * (1 - g));
  return post + (1 - post) * params.pLearn;
}

// Time away: drift toward the prior.
export function bktForget(pKnown, gapDays, params = BKT_DEFAULTS) {
  if (!(gapDays > 0)) return pKnown;
  const keep = Math.pow(0.5, gapDays / params.forgetHalfLifeDays);
  return params.pInit + (pKnown - params.pInit) * keep;
}

const round2 = (n) => Math.round(n * 100) / 100;

export function levelFor(mastery, n) {
  if (n < 2) return "building";
  // "strong" needs real evidence: three answers, or two very convincing ones
  if (mastery >= 0.8 && (n >= 3 || mastery >= 0.9)) return "strong";
  if (mastery >= 0.5) return "developing";
  return "weak";
}

// events: [{concept, correct:boolean, confidence?:"guess"|"unsure"|"sure", ts?:ms}]
export function estimateMasteryBKT(events, now = Date.now(), params = BKT_DEFAULTS) {
  const by = new Map();
  for (const e of events || []) {
    if (!e || !e.concept || typeof e.correct !== "boolean") continue;
    if (!by.has(e.concept)) by.set(e.concept, []);
    by.get(e.concept).push(e);
  }
  const out = [];
  for (const [concept, list] of by) {
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    let p = params.pInit;
    let prevTs = null;
    let confidentWrong = 0, confident = 0;
    for (const e of list) {
      const ts = e.ts || now;
      if (prevTs !== null) p = bktForget(p, (ts - prevTs) / DAY, params);
      p = bktStep(p, e.correct, e.confidence, params);
      prevTs = ts;
      if (e.confidence === "sure") { confident += 1; if (!e.correct) confidentWrong += 1; }
    }
    // knowledge also fades between the last answer and now
    const lastAt = list[list.length - 1].ts || now;
    const pAtLast = p;
    p = bktForget(p, (now - lastAt) / DAY, params);
    const n = list.length;
    // honest range: wide with few answers, narrower with many
    const half = 1.64 * Math.sqrt((p * (1 - p)) / (n + 2));
    const low = Math.max(0, p - half), high = Math.min(1, p + half);
    // Forgetting is not failing: something known well but not seen for months is "developing, due for
    // review", never "weak". Only real wrong answers make a concept weak.
    let level = levelFor(round2(p), n);
    const stale = (now - lastAt) / DAY > 21;
    if (level === "weak" && levelFor(round2(pAtLast), n) !== "weak") level = "developing";
    let trend = "steady";
    if (n >= 4) {
      const recent = list.slice(-2).filter((e) => e.correct).length / 2;
      const earlier = list.slice(0, -2).filter((e) => e.correct).length / (n - 2);
      if (recent - earlier >= 0.4) trend = "improving";
      else if (recent - earlier <= -0.4) trend = "slipping";
    }
    out.push({ concept, mastery: round2(p), low: round2(low), high: round2(high), n, level, trend, stale, confidentWrong, confident, lastAt: list[list.length - 1].ts || null });
  }
  const order = { weak: 0, developing: 1, building: 2, strong: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level] || a.mastery - b.mastery || a.concept.localeCompare(b.concept));
}

// Is the model sure enough to say something to the student or lecturer?
export function isConfident(entry) {
  return !!entry && entry.n >= 3 && entry.high - entry.low <= 0.45;
}
