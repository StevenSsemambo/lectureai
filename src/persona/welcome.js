// A personal welcome that is true. The lecturer may only mention things SEMAI really has on record about this
// student: how long they have been away, a concept that used to be hard and now isn't, a concept that was
// tricky before and comes up today, something they already know well. Nothing is invented, and an anonymous
// student (no history) gets a plain welcome that does not pretend to remember them.
//
// The lecturer is handed these facts as the ONLY things it may say about the student's past.

import { estimateMastery } from "./../learning/mastery.js";
import { conceptsMatch } from "./../learning/adaptation.js";

const DAY = 86400000;

// events: the student's earlier quiz answers [{concept, correct, confidence?, ts}]
// moduleConcepts: concepts taught or needed in today's module
export function buildWelcomeFacts({ events = [], moduleConcepts = [], now = Date.now() }) {
  const evs = (events || []).filter((e) => e && e.concept && typeof e.correct === "boolean" && e.ts);
  if (!evs.length) return { mode: "unknown", facts: [] };
  const sorted = [...evs].sort((a, b) => a.ts - b.ts);
  const lastTs = sorted[sorted.length - 1].ts;
  const daysAway = Math.floor((now - lastTs) / DAY);
  const mastery = estimateMastery(sorted, now);
  const facts = [];

  if (daysAway >= 7) facts.push({ kind: "away", text: daysAway >= 30 ? "it has been over a month since the student's last lecture" : `it has been about ${daysAway} days since the student's last lecture` });

  // a concept that used to be weak and now is not
  for (const m of mastery) {
    if (m.n < 4) continue;
    const before = estimateMastery(sorted.filter((e) => e.concept === m.concept).slice(0, -2), sorted[sorted.length - 3] ? sorted[sorted.length - 3].ts : now).find((x) => x.concept === m.concept);
    if (before && before.level === "weak" && (m.level === "developing" || m.level === "strong") && m.trend !== "slipping") {
      facts.push({ kind: "improved", concept: m.concept, text: `"${m.concept}" used to be difficult for the student and they have improved on it` });
      break; // one is enough
    }
  }

  const relevant = (m) => (moduleConcepts || []).some((c) => conceptsMatch(c, m.concept));
  const tricky = mastery.find((m) => relevant(m) && m.n >= 2 && (m.level === "weak" || m.trend === "slipping"));
  if (tricky) facts.push({ kind: "tricky", concept: tricky.concept, text: `"${tricky.concept}" was tricky for the student before and comes up today` });
  const strong = mastery.find((m) => relevant(m) && m.level === "strong" && m.n >= 3);
  if (strong) facts.push({ kind: "strong", concept: strong.concept, text: `the student already knows "${strong.concept}" well, and it comes up today` });

  return { mode: "returning", facts, daysAway };
}

// Text added to the welcome prompt.
export function welcomeGuidance({ mode, facts }) {
  if (mode !== "returning" || !facts.length) {
    return " Do not say anything about the student's earlier lectures or progress: you have no record you can rely on here.";
  }
  const list = facts.slice(0, 3).map((f) => `- ${f.text}`).join("\n");
  return ` Welcome them back warmly. These are the ONLY things you may say about their past, and only one or two of them, woven into one natural sentence (do not read them out as a list, do not mention scores or percentages, and do not invent anything else about them):\n${list}`;
}
