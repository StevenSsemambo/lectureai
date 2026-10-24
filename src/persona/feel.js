// "How did this lecture feel?" One tap at the end of a lecture. It is the student's own word on whether the AI
// lecturer felt helpful or robotic, so the lecturer can improve the character, never a score for the student.
// Stored as a `signal` event: { value: "lecture_feel", choice }.

export const FEEL_CHOICES = [
  { id: "helpful", label: "Felt helpful" },
  { id: "ok", label: "It was okay" },
  { id: "robotic", label: "Felt robotic" },
];
export const FEEL_ids = FEEL_CHOICES.map((c) => c.id);

export function feelThanks(choice) {
  if (choice === "robotic") return "Thank you for being honest. Your lecturer will see how students found it.";
  if (choice === "helpful") return "Glad it helped. Thank you. Your lecturer will see how students found it.";
  return "Thanks. Your lecturer will see how students found it.";
}

const MIN_SHOW = 5; // fewest answers before percentages are shown

// rows: learning_events rows. One answer per student/session (the latest wins).
export function summarizeFeel(rows) {
  const latest = new Map();
  for (const r of rows || []) {
    if (!r || r.event_type !== "signal" || !r.payload || r.payload.value !== "lecture_feel" || !FEEL_ids.includes(r.payload.choice)) continue;
    const key = r.session_id || r.student_id || r.student_key;
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || Date.parse(r.created_at) >= Date.parse(prev.created_at)) latest.set(key, r);
  }
  const c = { helpful: 0, ok: 0, robotic: 0 };
  for (const r of latest.values()) c[r.payload.choice] += 1;
  const n = c.helpful + c.ok + c.robotic;
  const pct = (k) => (n ? Math.round((c[k] / n) * 100) : 0);
  const lines = [];
  if (!n) lines.push("No answers yet. Students are asked once, when a lecture ends.");
  else if (n < MIN_SHOW) lines.push(`${n} ${n === 1 ? "student has" : "students have"} answered so far, which is too few to read much into.`);
  else {
    lines.push(`${pct("helpful")}% said it felt helpful, ${pct("ok")}% said it was okay, ${pct("robotic")}% said it felt robotic (${n} answers).`);
    if (pct("robotic") >= 25) lines.push("A fair share found it robotic. Try a different personality or a style note in the course details, and compare the next batch.");
  }
  lines.push("This shows how it felt, not why. It shows totals only, never who answered what.");
  return { n, counts: c, shown: n >= MIN_SHOW, pct: { helpful: pct("helpful"), ok: pct("ok"), robotic: pct("robotic") }, lines };
}
