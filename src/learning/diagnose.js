// When a student keeps missing a concept, the real gap is often an EARLIER idea it builds on.
// Instead of repeating the same explanation, SEMAI asks ONE short question about the weakest
// earlier idea. If that is also missed, it teaches that idea first; if it is answered well, the gap
// is in the concept itself and the lesson carries on as normal.
//
// Careful by design: it only starts after a wrong answer, never more than once per concept, never
// more than twice per lecture, never about something the student already knows well, and the student can
// switch personalisation off (then none of this happens).

import { conceptsMatch, findLearnerConcept } from "./adaptation.js";

// Earlier ideas this concept relies on, from the slides that teach it (the lecturer can edit them in the
// slide editor). Never includes the concept itself.
export function prerequisitesOf(concept, slides) {
  const out = [];
  for (const s of slides || []) {
    if (!(s.concepts || []).some((c) => conceptsMatch(c, concept))) continue;
    for (const p of s.prerequisites || []) {
      if (conceptsMatch(p, concept)) continue;
      if (!out.some((o) => conceptsMatch(o, p))) out.push(p);
    }
  }
  return out;
}

export const MAX_DIAGNOSTICS_PER_SESSION = 2;

// -> { name, why } | null
// mastery: estimates from estimateMastery; diagnosed: Set of concepts already investigated this session.
export function pickDiagnostic({ concept, slides, mastery, diagnosed = new Set(), max = MAX_DIAGNOSTICS_PER_SESSION }) {
  if (!concept) return null;
  if (diagnosed.size >= max) return null;
  if ([...diagnosed].some((d) => conceptsMatch(d, concept))) return null;
  let best = null;
  for (const name of prerequisitesOf(concept, slides)) {
    const e = findLearnerConcept(mastery, name);
    if (e && e.level === "strong" && e.n >= 3) continue; // known well: not the problem
    const score = e && e.n >= 2 ? e.mastery : 0.45; // nothing known yet: worth one question, after weaker ones
    const why = !e ? "no earlier answers on it" : e.n < 2 ? "too little evidence about it" : e.level === "weak" ? "it was hard for the student before" : "not solid yet";
    if (!best || score < best.score) best = { name, why, score };
  }
  return best ? { name: best.name, why: best.why } : null;
}

// What the lecturer says, given what the one question showed.
export function diagnosticLead(prerequisite) {
  return `Let me check one earlier idea this builds on: ${prerequisite}. Just one quick question.`;
}
export function diagnosticNoGap(prerequisite, concept) {
  return `Good, ${prerequisite} is solid, so it's really ${concept} itself that needs another look. Let's keep going and I'll be careful with it.`;
}
export function diagnosticGapPrompt(prerequisite, concept) {
  return `The student just missed a question on "${concept}" and then also got a question on "${prerequisite}" wrong. "${concept}" builds on "${prerequisite}". In 3 or 4 short spoken sentences, explain "${prerequisite}" simply: define it, give one everyday example, then say how it connects to "${concept}". Do not use LaTeX or lists.`;
}
export function diagnosticGapFallback(prerequisite, concept) {
  return `That's useful to know: ${prerequisite} is the part to firm up first, because ${concept} builds on it. Please ask me to explain ${prerequisite} again, and we'll go through it together.`;
}
