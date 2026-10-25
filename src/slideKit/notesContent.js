// Content side of the lecture-notes study guide: prompts, normalising what the AI
// returns, and building useful notes from the slide itself when the AI can't answer.
// Pure functions (no browser / no network) so they can be tested.
import { latexToPlain } from "./latex.js";
import { parseJsonLoose } from "./json.js";

const clean = (s) => latexToPlain(String(s == null ? "" : s).replace(/\$/g, "")).replace(/\s+/g, " ").trim();
const list = (a, max, maxLen = 280) =>
  (Array.isArray(a) ? a : []).map((x) => clean(typeof x === "string" ? x : x && (x.text || x.q || x.question) || "")).filter(Boolean).slice(0, max).map((x) => x.slice(0, maxLen));

export const SECTION_SYSTEM = (curriculum) => `You write study notes for students: the organised notes a good student would hand in after attending a lecture on "${curriculum.code} — ${curriculum.title}" (unit: ${curriculum.unit}). They are NOT a transcript and must never sound spoken: no "today", "as I said", "let's", "we will see", no greetings, no references to a lecturer or a session.

Return ONLY one JSON object (no markdown fences) with exactly these keys:
{
 "summary": "one sentence (max 30 words) stating what this topic is and why it matters",
 "keyPoints": ["3 to 6 short, self-contained facts a student must remember, each under 25 words"],
 "explanation": ["2 or 3 short paragraphs of clear written prose: the idea, how it works, and one concrete example. Each paragraph under 90 words"],
 "terms": [{"term": "...", "meaning": "plain definition under 25 words"}],
 "pitfalls": ["0 to 3 common mistakes or misconceptions, each under 30 words"],
 "review": ["2 or 3 short self-test questions answerable from these notes"]
}
Rules: plain text only inside strings (no markdown, no LaTeX, no code symbols - write maths in words, e.g. "x squared"). Formulas, tables, worked steps, code and diagrams are typeset separately next to your text, so refer to them ("see the worked example") but do not copy them. Be accurate and specific; invent a good example only if the material has none.`;

export const sectionPrompt = (slide, plainContext) =>
  `Topic: "${slide.title}". Material shown for this topic:\n${plainContext}\n\nWrite the structured notes for this topic as the JSON object described.`;

export const MODULE_SYSTEM = (curriculum) => `You write the front and back matter of a study guide for "${curriculum.code} — ${curriculum.title}", unit "${curriculum.unit}". Return ONLY one JSON object:
{
 "overview": "2-3 sentences describing what the module covers and how the topics connect (max 70 words)",
 "objectives": ["3 to 6 learning objectives starting with a verb, e.g. 'Explain how...'"],
 "summary": ["4 to 8 bullet sentences capturing the most important ideas of the whole module"],
 "review": ["4 to 8 revision questions spanning the whole module"]
}
Plain text only, written notes style (never spoken style: no "today" or "we").`;

export const modulePrompt = (curriculum, sections) =>
  `Topics covered, in order:\n${sections.map((s, i) => `${i + 1}. ${s.title}${s.notes && s.notes.summary ? " — " + s.notes.summary : ""}`).join("\n")}`;

// Turn whatever the model returned into a safe, bounded shape; null if unusable.
export function normalizeSectionNotes(raw) {
  let d = raw;
  try { if (typeof raw === "string") d = parseJsonLoose(raw); } catch (e) { return null; }
  if (!d || typeof d !== "object") return null;
  const explanationSrc = Array.isArray(d.explanation) ? d.explanation : String(d.explanation || "").split(/\n{1,}/);
  const explanation = explanationSrc.map((p) => clean(p)).filter((p) => p.length > 20).slice(0, 4);
  const terms = (Array.isArray(d.terms) ? d.terms : [])
    .map((t) => ({ term: clean(t && t.term).slice(0, 60), meaning: clean(t && (t.meaning || t.definition)).slice(0, 220) }))
    .filter((t) => t.term && t.meaning).slice(0, 6);
  const out = {
    summary: clean(d.summary).slice(0, 260),
    keyPoints: list(d.keyPoints, 6),
    explanation,
    terms,
    pitfalls: list(d.pitfalls, 3),
    review: list(d.review, 3),
  };
  if (!out.explanation.length && !out.keyPoints.length) return null;
  return out;
}

export function normalizeModuleNotes(raw) {
  let d = raw;
  try { if (typeof raw === "string") d = parseJsonLoose(raw); } catch (e) { return null; }
  if (!d || typeof d !== "object") return null;
  const out = { overview: clean(d.overview).slice(0, 500), objectives: list(d.objectives, 6), summary: list(d.summary, 8), review: list(d.review, 8) };
  return out.overview || out.summary.length ? out : null;
}

// Notes built only from what the slide itself holds. Used when the AI call fails, so the
// student still gets organised content and never an apology paragraph.
export function fallbackSectionNotes(slide) {
  const points = [];
  if (slide.definition) points.push(`${clean(slide.definition.term)}: ${clean(slide.definition.text)}`);
  (slide.bullets || []).forEach((b) => points.push(clean(b)));
  (slide.takeaways || []).forEach((b) => points.push(clean(b)));
  const keyPoints = points.filter(Boolean).slice(0, 6);
  const detail = slide.detail ? [clean(slide.detail)] : [];
  const terms = slide.definition ? [{ term: clean(slide.definition.term), meaning: clean(slide.definition.text).slice(0, 220) }] : [];
  return { summary: keyPoints[0] ? keyPoints[0].slice(0, 200) : "", keyPoints, explanation: detail, terms, pitfalls: [], review: [], fallback: true };
}

export function fallbackModuleNotes(curriculum, sections) {
  return {
    overview: `This module, ${curriculum.unit}, covers ${sections.length} topic${sections.length === 1 ? "" : "s"}: ${sections.map((s) => s.title).join("; ")}.`,
    objectives: [],
    summary: sections.map((s) => (s.notes && (s.notes.summary || s.notes.keyPoints[0])) || "").filter(Boolean).slice(0, 8),
    review: [],
  };
}

// Combined glossary across sections, alphabetical, duplicates removed.
export function buildGlossary(sections) {
  const seen = new Map();
  sections.forEach((s) => ((s.notes && s.notes.terms) || []).forEach((t) => { const k = t.term.toLowerCase(); if (!seen.has(k)) seen.set(k, t); }));
  return [...seen.values()].sort((a, b) => a.term.localeCompare(b.term));
}
