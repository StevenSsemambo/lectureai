// Did the re-teaching work? Learns from what SEMAI already records.
//
// The question that matters is not "which explanation did students like" but:
//   after a student got a question on a concept WRONG, and SEMAI then helped in some way
//   (went step by step, reminded a prerequisite, gave another example, ...), did that student get the
//   NEXT question on the same concept RIGHT?
// That is "recovery after a miss". We count it per kind of help and next to the students who got no extra help.
//
// This is descriptive evidence, not proof: help is usually given to students who were struggling, and
// nobody was assigned a method at random. The summary says so, and says "too early to tell" until each
// group has enough cases. Input rows are learning_events rows as the database returns them.

import { conceptsMatch } from "./adaptation.js";

export const HELP_LABELS = {
  simplify: "Step-by-step re-explanation",
  reminder: "Reminder of an earlier topic",
  example: "Another example",
  steps: "Walked through step by step",
  deeper: "Went deeper",
  why: "Explained why it matters",
  lost_help: "Re-explained after \"I'm lost\"",
  diagnostic: "Checked an earlier topic first",
  none: "No extra help",
};

const MIN_CASES = 5;       // fewest cases before a rate is shown
const COMPARE_MIN = 8;     // fewest cases in BOTH groups before saying one looks better
const HELP_WINDOW_MS = 45 * 60 * 1000; // help counts if it arrives within 45 minutes of the miss

// Wilson 95% interval for a proportion
export function wilson(successes, n, z = 1.96) {
  if (!n) return { low: 0, high: 1 };
  const p = successes / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function helpFor(row) {
  const p = row.payload || {};
  if (row.event_type === "adapt_applied") {
    if (p.level === "simplify") return { method: "simplify", concept: p.concept || null };
    if (p.reminder) return { method: "reminder", concept: null };
    return null;
  }
  if (row.event_type === "adapt_request" && HELP_LABELS[p.kind] && p.kind !== "none") return { method: p.kind, concept: null };
  if (row.event_type === "signal" && p.value === "lost") return { method: "lost_help", concept: null };
  return null;
}

// -> one record per miss that has a following answer on the same concept
export function recoveryCases(rows) {
  const byStudent = new Map();
  for (const r of rows || []) {
    if (!r || !r.created_at) continue;
    const key = r.student_id || r.student_key || r.session_id;
    if (!key) continue;
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(r);
  }
  const cases = [];
  let unresolved = 0;
  for (const list of byStudent.values()) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let pending = []; // open misses: {concept, at, methods:Set}
    for (const r of list) {
      const at = Date.parse(r.created_at);
      if (r.event_type === "check_answer") {
        const p = r.payload || {};
        const concept = p.concept;
        if (!concept || typeof p.correct !== "boolean") continue;
        if (p.diagnostic) { // a question about an EARLIER idea: counts as help for the miss it was asked about
          for (const m of pending) if (at - m.at <= HELP_WINDOW_MS && p.for_concept && conceptsMatch(p.for_concept, m.concept)) m.methods.add("diagnostic");
          continue;
        }
        const still = [];
        for (const m of pending) {
          if (conceptsMatch(m.concept, concept)) cases.push({ concept: m.concept, recovered: p.correct, methods: [...m.methods] });
          else still.push(m);
        }
        pending = still;
        if (!p.correct) pending.push({ concept, at, methods: new Set() });
        continue;
      }
      const h = helpFor(r);
      if (!h) continue;
      for (const m of pending) {
        if (at - m.at > HELP_WINDOW_MS) continue;
        if (h.concept && !conceptsMatch(h.concept, m.concept)) continue;
        m.methods.add(h.method);
      }
    }
    unresolved += pending.length;
  }
  return { cases, unresolved };
}

// -> { groups: [{method, label, n, recovered, rate, low, high, enough}], overall, unresolved }
export function analyzeInterventions(rows) {
  const { cases, unresolved } = recoveryCases(rows);
  const tally = {};
  const add = (k, c) => {
    if (!tally[k]) tally[k] = { method: k, n: 0, recovered: 0 };
    tally[k].n += 1;
    if (c.recovered) tally[k].recovered += 1;
  };
  for (const c of cases) {
    if (!c.methods.length) add("none", c);
    else for (const m of c.methods) add(m, c); // a case helped two ways counts in both
  }
  const groups = Object.values(tally).map((g) => {
    const w = wilson(g.recovered, g.n);
    return { ...g, label: HELP_LABELS[g.method] || g.method, rate: g.n ? g.recovered / g.n : null, low: w.low, high: w.high, enough: g.n >= MIN_CASES };
  }).sort((a, b) => (a.method === "none") - (b.method === "none") || b.n - a.n);
  const rec = cases.filter((c) => c.recovered).length;
  return { groups, overall: { n: cases.length, recovered: rec, rate: cases.length ? rec / cases.length : null }, unresolved };
}

const pct = (v) => `${Math.round(v * 100)}%`;

// Plain-language findings for the lecturer. Never claims more than the data supports.
export function summarizeInterventions(result) {
  const out = [];
  if (!result || !result.overall.n) {
    return ["Not enough data yet. This fills in once students have answered a question wrong and then been asked about the same concept again."];
  }
  const none = result.groups.find((g) => g.method === "none");
  const helped = result.groups.filter((g) => g.method !== "none" && g.enough);
  out.push(`${result.overall.n} cases so far where a student missed a question and was later asked about the same concept; ${pct(result.overall.rate)} got it right the next time.`);
  for (const g of helped) {
    if (none && none.n >= COMPARE_MIN && g.n >= COMPARE_MIN) {
      if (g.low > none.high) out.push(`${g.label}: ${pct(g.rate)} got the next question right (${g.n} cases), clearly more than the ${pct(none.rate)} with no extra help (${none.n}).`);
      else if (g.high < none.low) out.push(`${g.label}: ${pct(g.rate)} got the next question right (${g.n} cases), lower than the ${pct(none.rate)} with no extra help (${none.n}). Worth reviewing how this is explained.`);
      else out.push(`${g.label}: ${pct(g.rate)} (${g.n} cases). Too early to tell if this differs from no extra help.`);
    } else {
      out.push(`${g.label}: ${pct(g.rate)} (${g.n} cases). Too early to compare.`);
    }
  }
  if (!helped.length) out.push("No kind of help has enough cases to show a rate yet.");
  out.push("This shows what happened, not proof of cause: extra help usually goes to students who were struggling most.");
  return out;
}
