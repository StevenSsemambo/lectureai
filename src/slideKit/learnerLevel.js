// Who is the lecture for? The slide-writing AI is told, so a course for complete beginners is not written
// for students who have seen the subject before.

export const LEARNER_LEVELS = [
  { id: "beginner", label: "Complete beginner", blurb: "No prior knowledge assumed. Every term explained, small steps, analogies first." },
  { id: "some", label: "Some background", blurb: "Knows the basics of the subject; revisits them briefly." },
  { id: "advanced", label: "Advanced", blurb: "Comfortable with fundamentals; goes deeper and faster." },
];

export const DEFAULT_NEW_LEVEL = "beginner"; // new courses
export const DEFAULT_OLD_LEVEL = "some"; // courses saved before the setting existed keep roughly their old behaviour

export function normalizeLevel(v, fallback = DEFAULT_OLD_LEVEL) {
  return LEARNER_LEVELS.some((l) => l.id === v) ? v : fallback;
}

// Rules added to the outline prompt and to every slide prompt. "some" adds nothing new.
export function levelRules(level) {
  const l = normalizeLevel(level);
  if (l === "beginner") {
    return `AUDIENCE: complete beginners with NO prior knowledge of this subject, who are being taken from zero. Write for them:
- Never use a term, symbol, command or idea before it has been explained. Define every technical word the first time it appears, in plain everyday language, then give the formal name.
- Start each idea with a familiar everyday analogy or a concrete picture, THEN the precise definition, THEN an example.
- Move in small steps: one new idea per bullet. Do not skip steps that feel obvious to an expert.
- Code and worked examples must be tiny and complete, explained line by line or step by step, with what each part does and what the result is. Show a simple example before any realistic one.
- Do not assume tools, set-up, syntax, notation or maths beyond what earlier slides in this deck taught. If something is needed, teach it first or give a one-line reminder.
- Name the common beginner mistakes and say what the error or wrong result looks like.
- Keep the spoken explanation friendly and unhurried; reassure rather than impress. Avoid phrases like "obviously", "simply", "as you know", "just".`;
  }
  if (l === "advanced") {
    return `AUDIENCE: advanced students who already know the fundamentals. Do not re-teach basics; go straight to depth, edge cases, trade-offs, performance and realistic examples.`;
  }
  return "";
}

// Extra rule for the outline: the shape of a beginner module.
export function levelOutlineRules(level) {
  if (normalizeLevel(level) !== "beginner") return "";
  return `- BEGINNER STRUCTURE: the first slide is "What you need first and what we will build" (plain-language recap of any needed earlier idea, then the learning objectives). Order slides so nothing is used before it is taught: simple idea, then definition, then tiny example, then a fuller example, then common mistakes, then the summary. Prefer more, smaller slides over fewer dense ones.`;
}
