// When to offer help or a rest. Built ONLY on things the student did or said: tapping "I'm lost", answering
// questions wrongly, or simply having been at it for a long time. SEMAI does not guess feelings from a face,
// a voice or typing speed. The lecturer never says "you seem frustrated"; it names the material ("that was a
// tricky stretch"), offers choices, and accepts "no thanks" without asking again soon.

const MIN = 60000;
export const OFFER_GAP_MS = 10 * MIN;   // never twice within ten minutes
export const MAX_OFFERS = 2;            // and at most twice a lecture

// signals: [{slide, value}] in order; answers: [{correct, ts}] this lecture, in order (diagnostic ones excluded by the caller)
export function struggleReason({ signals = [], answers = [], slideIndex = 0 }) {
  const lostRecent = signals.filter((s) => s.value === "lost" && slideIndex - s.slide <= 3 && slideIndex - s.slide >= 0).length;
  const lastFour = answers.slice(-4);
  const missesRecent = lastFour.filter((a) => !a.correct).length;
  if (lostRecent >= 2) return "lost";
  if (lastFour.length >= 3 && missesRecent >= 3) return "misses";
  if (lostRecent >= 1 && missesRecent >= 2) return "both";
  return null;
}

// -> null | { kind: "struggling", reason }
export function careDue({ signals, answers, slideIndex, prefs, now, lastOfferMs = 0, offersMade = 0 }) {
  if (prefs && prefs.careOffers === false) return null;
  if (offersMade >= MAX_OFFERS) return null;
  if (lastOfferMs && now - lastOfferMs < OFFER_GAP_MS) return null;
  const reason = struggleReason({ signals, answers, slideIndex });
  return reason ? { kind: "struggling", reason } : null;
}

const LINES = {
  warm: "That was a tricky stretch, and that's completely normal with this material. We can slow down, take a short break, or keep going. What would help?",
  upbeat: "That last bit was a tough one! Let's make it easier on ourselves. I can slow right down, we can take a quick breather, or we can push on. Your call.",
  calm: "That was a difficult section. There's no rush. I can go through it more slowly, we can pause for a few minutes, or we can continue as we are.",
  direct: "The last few were hard going. Options: I slow down and go step by step, you take a break, or we continue.",
};
export function careLine(personaId, name = "") {
  const base = LINES[personaId] || LINES.warm;
  return name ? `${name}, ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;
}

export const CARE_CHOICES = [
  { id: "slower", label: "Go slower" },
  { id: "break", label: "Take a break" },
  { id: "carry_on", label: "Keep going" },
];

// What the lecturer says back to each choice (short; it then acts on it).
export function careReply(choice, personaId) {
  if (choice === "slower") return personaId === "direct" ? "Slowing down. Step by step." : "Okay, we'll take this slowly, one step at a time.";
  if (choice === "break") return personaId === "direct" ? "Paused. Resume when ready." : "Good idea. I'll pause here, and I'll be ready when you are.";
  return personaId === "direct" ? "Continuing." : "Alright, let's carry on. Tell me any time you want me to slow down.";
}
