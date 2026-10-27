// A student's personal version of a lecture: the normal deck, plus one extra "another way to see it" slide after each
// slide that troubled them last time (at most MAX_PERSONAL). Nothing is removed or reordered, the extra slides are
// marked "Added for you", and they are made only for the student who needs them. Pure helpers; the AI call is injected.

export const MAX_PERSONAL = 3;

const plainOf = (slide) => [
  slide.title,
  ...(slide.bullets || []),
  slide.definition ? `${slide.definition.term}: ${slide.definition.text}` : "",
  slide.detail || "",
  slide.code ? `Code:\n${slide.code}` : "",
].filter(Boolean).join("\n");

// The brief for the extra slide: a different angle, simpler, one fresh example.
export function reinforcementBrief(slide, hard) {
  const why = hard.reasons && hard.reasons.length ? hard.reasons.join(" and ") : "found this part difficult";
  const wantCode = slide.type === "code_walkthrough" || slide.type === "worked_example" ? slide.type : "concept";
  return {
    title: `Another way to see it: ${slide.title}`.slice(0, 90),
    type: wantCode,
    focus: `Re-teach "${slide.title}" for a student who ${why} the first time. Use a DIFFERENT angle and a DIFFERENT example from the original slide: start from an everyday analogy, go one small step at a time, then connect back to the formal idea, then name the most common mistake.`,
    keyPoints: [
      `An everyday picture or analogy for "${slide.title}"`,
      "The same idea in the simplest possible words, one step at a time",
      "ONE fresh, tiny, complete example worked through fully",
      "The most common mistake and how to avoid it",
    ],
    sourceText: plainOf(slide),
  };
}

// Returns a new slide list: originals keep their place (and remember it in origIndex), personal slides follow their anchor.
// extras: Map(anchorIndex -> generated slide)
export function insertPersonalSlides(slides, extras) {
  const out = [];
  slides.forEach((s, i) => {
    out.push({ ...s, origIndex: i });
    const extra = extras && extras.get(i);
    if (extra) {
      const notes = `${extra.notes || ""} Begin by saying warmly, in one sentence, that this extra slide was added for this student because this part was tricky last time. Never mention scores.`.trim();
      out.push({ ...extra, notes, personal: true, origIndex: i });
    }
  });
  return out;
}

export function personalSignature(hard) {
  return (hard || []).slice(0, MAX_PERSONAL).map((h) => h.key).join("|");
}

const cacheKey = (studentId, moduleId) => `semai_pd:${studentId}:${moduleId}`;
export function readPersonalCache(studentId, moduleId, sig, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const raw = storage && storage.getItem(cacheKey(studentId, moduleId));
    const v = raw && JSON.parse(raw);
    return v && v.sig === sig && v.extras && typeof v.extras === "object" ? v.extras : null;
  } catch (e) { return null; }
}
export function writePersonalCache(studentId, moduleId, sig, extras, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try { storage && storage.setItem(cacheKey(studentId, moduleId), JSON.stringify({ sig, extras })); } catch (e) { /* storage full or blocked: just regenerate next time */ }
}
