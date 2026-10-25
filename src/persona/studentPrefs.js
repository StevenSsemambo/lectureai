// How THIS student likes to be taught. Stored only on their device, applies to every course, and only ever
// changes tone and how often the lecturer offers things. It never changes what is taught or assessed.

import { safeLocalStorage } from "../safeStorage.js";

export const STYLE_KEY = "semai_style";
export const FEEDBACK_STYLES = {
  default: { label: "Course default", blurb: "The lecturer's own style for this course." },
  brief: { label: "Short and to the point", blurb: "Brief feedback, shorter explanations." },
  encouraging: { label: "Extra encouraging", blurb: "More warmth and encouragement along the way." },
};
export const DEFAULT_PREFS = { feedback: "default", useName: true, careOffers: true };

export function cleanPrefs(p) {
  const o = p && typeof p === "object" ? p : {};
  return {
    feedback: Object.prototype.hasOwnProperty.call(FEEDBACK_STYLES, o.feedback) ? o.feedback : "default",
    useName: o.useName !== false,
    careOffers: o.careOffers !== false,
  };
}

export function loadPrefs(storage = safeLocalStorage()) {
  try { return cleanPrefs(JSON.parse(storage.getItem(STYLE_KEY))); } catch (e) { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p, storage = safeLocalStorage()) {
  try { storage.setItem(STYLE_KEY, JSON.stringify(cleanPrefs(p))); } catch (e) { /* storage unavailable: the choice lasts for this visit */ }
}

// Which feedback character to use: the student's choice wins over the course's.
export function feedbackCharacter(prefs, coursePersonaId) {
  const f = cleanPrefs(prefs).feedback;
  return f === "brief" ? "direct" : f === "encouraging" ? "warm" : coursePersonaId;
}

// One sentence appended to the lecturer's identity so explanations follow the student's choice.
export function styleLine(prefs) {
  const f = cleanPrefs(prefs).feedback;
  if (f === "brief") return " This student prefers short answers: keep explanations tight and skip extra asides.";
  if (f === "encouraging") return " This student likes extra encouragement: be generous with warm, specific encouragement, without exaggerating.";
  return "";
}
