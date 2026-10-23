// What the lecturer says when the AI cannot be reached (no connection, or the service is busy).
//
// Two sources, best first:
//   1. the narration the AI gave this same student for this slide earlier, saved on the device;
//   2. a spoken version built directly from the slide's own content (title, points, definition, worked
//      steps, code lines, takeaways). It is plainer than the AI's, but it is the lecturer's real material.
//
// Nothing here calls the network.

import { latexToPlain } from "../slideKit/latex.js";
import { slideKeyFor } from "../analytics.js";

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const plain = (s) => clean(latexToPlain ? latexToPlain(String(s || "")) : s);
const sentence = (s) => { const t = clean(s); return t ? (/[.!?:]$/.test(t) ? t : `${t}.`) : ""; };
const ORDINALS = ["First,", "Next,", "Then,", "After that,", "Also,", "And finally,"];

export function narrationKey(moduleId, slide, index) {
  return `narr:${moduleId || "local"}:${slideKeyFor(slide || {}, index || 0)}`;
}

// Cut at a sentence boundary near the word budget.
export function clipWords(text, maxWords) {
  const words = clean(text).split(" ");
  if (words.length <= maxWords) return clean(text);
  const cut = words.slice(0, maxWords).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > cut.length * 0.5 ? cut.slice(0, end + 1) : sentence(cut);
}

export function offlineNarration(slide, { maxWords = 170 } = {}) {
  if (!slide) return "Let's carry on.";
  const out = [sentence(slide.title)];
  if (slide.introSay) out.push(sentence(slide.introSay));
  if (slide.definition && (slide.definition.term || slide.definition.text)) {
    const d = slide.definition;
    out.push(sentence(`${d.term ? d.term + ": " : ""}${plain(d.text)}`));
    if (d.example) out.push(sentence(`For example, ${plain(d.example)}`));
  }
  const bullets = (slide.bullets || []).map(plain).filter(Boolean);
  if (bullets.length === 1) out.push(sentence(bullets[0]));
  else if (bullets.length > 1) {
    bullets.forEach((b, i) => {
      const lead = i === bullets.length - 1 && bullets.length > 2 ? "And finally," : ORDINALS[Math.min(i, ORDINALS.length - 2)];
      out.push(`${lead} ${sentence(b.charAt(0).toLowerCase() + b.slice(1))}`);
    });
  }
  if (slide.detail) out.push(sentence(plain(slide.detail)));
  if (slide.problemSay) out.push(sentence(slide.problemSay));
  else if (slide.problem && slide.problem.text) out.push(sentence(`The problem: ${plain(slide.problem.text)}`));
  for (const st of slide.steps || []) if (st.say) out.push(sentence(plain(st.say)));
  if (slide.finalSay) out.push(sentence(slide.finalSay));
  for (const cs of slide.codeSteps || []) if (cs.say) out.push(sentence(plain(cs.say)));
  if (slide.hasCode && !(slide.codeSteps || []).length && !slide.introSay) out.push(sentence(`Have a look at the code on screen${slide.filename ? `, ${slide.filename}` : ""}, and read through it line by line`));
  if (slide.diagram && slide.diagram.caption) out.push(sentence(`The diagram shows ${plain(slide.diagram.caption)}`));
  if ((slide.takeaways || []).length) {
    out.push("The main takeaways are:");
    for (const t of slide.takeaways) out.push(sentence(plain(t)));
  }
  if (out.filter(Boolean).length <= 1 && slide.notes) out.push(sentence(plain(slide.notes)));
  return clipWords(out.filter(Boolean).join(" "), maxWords) || "Let's carry on.";
}

// Saved AI narration first, then built-from-the-slide.
export async function narrationFallback(store, moduleId, slide, index) {
  try {
    const saved = store ? await store.get(narrationKey(moduleId, slide, index)) : undefined;
    if (saved && typeof saved.text === "string" && saved.text.trim()) return { text: saved.text, source: "saved" };
  } catch (e) { /* fall through */ }
  return { text: offlineNarration(slide), source: "slide" };
}

export async function saveNarration(store, moduleId, slide, index, text) {
  if (!store || !text || !String(text).trim()) return null;
  return store.set(narrationKey(moduleId, slide, index), { text: String(text), savedAt: Date.now() });
}
export async function hasNarration(store, moduleId, slide, index) {
  try { const v = await store.get(narrationKey(moduleId, slide, index)); return !!(v && v.text); } catch (e) { return false; }
}
