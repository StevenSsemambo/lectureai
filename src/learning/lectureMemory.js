// What does SEMAI remember about THIS student in THIS lecture (module)?
//
// Built only from the student's own earlier events in this module: wrong check answers, "I'm lost" / "unsure" taps and
// questions asked. For each slide it works out whether the latest visits that touched it went badly, so the lecturer can
// spend more time there on the next visit. It only ever changes HOW things are explained, never what is covered, and it
// holds no names or scores for the AI: only plain reasons. A slide the student later got right without trouble is let go.

const TRUE = (v) => v === true || v === "true";

// events: [{ session_id, event_type, slide_index, slide_key, payload, ts }]
// slides: the module's current slides; keyFor(slide, index) -> the same fingerprint analytics stored.
export function summarizeLectureMemory(events, slides, { keyFor, currentSessionId = null } = {}) {
  const list = (events || []).filter((e) => e && e.session_id && e.session_id !== currentSessionId && e.ts);
  const sessions = new Map(); // session_id -> { ts, perSlide: Map(key -> {wrong, right, lost, unsure, q}) }
  for (const e of list) {
    let s = sessions.get(e.session_id);
    if (!s) { s = { ts: 0, perSlide: new Map() }; sessions.set(e.session_id, s); }
    s.ts = Math.max(s.ts, e.ts);
    if (!e.slide_key) continue;
    let p = s.perSlide.get(e.slide_key);
    if (!p) { p = { wrong: 0, right: 0, lost: 0, unsure: 0, q: 0 }; s.perSlide.set(e.slide_key, p); }
    const pl = e.payload || {};
    if (e.event_type === "check_answer") { if (TRUE(pl.correct)) p.right++; else if (pl.correct === false || pl.correct === "false") p.wrong++; }
    else if (e.event_type === "signal") { if (pl.value === "lost") p.lost++; else if (pl.value === "unsure") p.unsure++; }
    else if (e.event_type === "question") p.q++;
  }
  const ordered = [...sessions.values()].sort((a, b) => b.ts - a.ts); // newest first
  const out = { visits: ordered.length, lastTs: ordered.length ? ordered[0].ts : 0, hard: [] };
  if (!ordered.length || typeof keyFor !== "function") return out;

  const trouble = (p) => p.wrong * 2 + p.lost * 3 + p.unsure + (p.q >= 2 ? 1 : 0);
  (slides || []).forEach((slide, index) => {
    const key = keyFor(slide, index);
    const seen = ordered.map((s) => s.perSlide.get(key)).filter(Boolean); // newest first, only visits that touched this slide
    if (!seen.length) return;
    const latest = seen[0];
    const troubled = seen.filter((p) => trouble(p) >= 2).length;
    const latestScore = trouble(latest);
    const recovered = latestScore === 0 && latest.right > 0 && seen.length > 1; // answered it right with no trouble since
    if (recovered) return;
    if (latestScore >= 2 || (troubled >= 2 && latestScore >= 1)) {
      const sum = seen.slice(0, 3).reduce((a, p) => ({ wrong: a.wrong + p.wrong, lost: a.lost + p.lost, unsure: a.unsure + p.unsure, q: a.q + p.q }), { wrong: 0, lost: 0, unsure: 0, q: 0 });
      const reasons = [];
      if (sum.wrong) reasons.push("you missed a question");
      if (sum.lost) reasons.push("you said you were lost");
      else if (sum.unsure) reasons.push("you felt unsure");
      if (sum.q >= 2) reasons.push("you had questions");
      out.hard.push({ index, key, title: String((slide && slide.title) || `Slide ${index + 1}`), reasons, visitsTroubled: Math.max(1, troubled), score: latestScore + troubled });
    }
  });
  out.hard.sort((a, b) => b.score - a.score);
  out.hard = out.hard.slice(0, 5);
  return out;
}

export const memoryByIndex = (mem) => {
  const m = new Map();
  for (const h of (mem && mem.hard) || []) m.set(h.index, h);
  return m;
};

// Plain-language reason shown to the student beside the slide.
export function memoryReason(h) {
  if (!h) return null;
  const why = h.reasons.length ? ` (${h.reasons.slice(0, 2).join(" and ")})` : "";
  return `Last time this part was tricky for you${why}, so I'll go through it more slowly, with a fresh example.`;
}

// One sentence of fact for the welcome. Only titles of slides that really troubled the student.
export function memoryWelcomeFact(mem) {
  const hard = (mem && mem.hard) || [];
  if (!hard.length) return null;
  const titles = hard.slice(0, 3).map((h) => `"${h.title}"`).join(", ");
  return `in this same lecture last time, these parts were tricky for the student: ${titles}`;
}
