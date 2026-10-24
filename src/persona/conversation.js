// Conversation memory for the question-and-answer part of a lecture, and a guard against repetitive wording.
//
// Why: without memory every question is treated as brand new, so "what about the second one?" or "why does
// that happen?" cannot be understood, and the lecturer sounds like it has no idea what was just said. And AI
// replies tend to start the same few ways ("Great question!"), which is the clearest robotic tell.
//
// Everything here lives in memory for the current lecture only. Nothing is stored or sent anywhere except as
// part of the prompt for the next answer.

export const MAX_RECENT = 5;     // exchanges kept word for word
export const MAX_EARLIER = 6;    // older exchanges kept as one-line topics
const CLIP_Q = 240, CLIP_A = 320, CLIP_TOPIC = 90;

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export function createConversation() {
  return { recent: [], earlier: [] };
}

// Returns the same object after adding one exchange.
export function recordExchange(mem, { question, answer, slideTitle = "" }) {
  const q = clip(question, CLIP_Q), a = clip(answer, CLIP_A);
  if (!q || !a) return mem;
  mem.recent.push({ q, a, slide: clip(slideTitle, 60) });
  while (mem.recent.length > MAX_RECENT) {
    const old = mem.recent.shift();
    mem.earlier.push(clip(old.q, CLIP_TOPIC));
    if (mem.earlier.length > MAX_EARLIER) mem.earlier.shift();
  }
  return mem;
}

// Text placed before the question in the prompt (empty when this is the first question).
export function conversationBlock(mem, { slideTitle = "" } = {}) {
  if (!mem || (!mem.recent.length && !mem.earlier.length)) return "";
  const lines = ["Earlier in this conversation with the student (most recent last):"];
  if (mem.earlier.length) lines.push(`Older questions, in brief: ${mem.earlier.map((t) => `"${t}"`).join("; ")}.`);
  for (const e of mem.recent) lines.push(`Student: "${e.q}"${e.slide && e.slide !== slideTitle ? ` (while on "${e.slide}")` : ""}\nYou answered: "${e.a}"`);
  lines.push('If the new question refers back to any of this ("that", "the second one", "why?", "again"), use it to understand what they mean. If it is a new topic, ignore the earlier exchange. Never repeat an earlier answer word for word.');
  return lines.join("\n");
}

// The first few words of a reply, lower-cased, without punctuation.
export function openingOf(text, words = 3) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, words).join(" ");
}

const STOCK = [/^(that'?s|what) an? (really |very )?(good|great|excellent|interesting|fantastic|nice) question/i, /^(great|good|excellent|interesting|fantastic) question/i, /^absolutely\b/i, /^certainly\b/i, /^of course\b/i, /^sure thing\b/i];

// A line for the system prompt telling the AI how not to start, based on how the last answers started.
export function avoidOpenings(mem) {
  if (!mem || !mem.recent.length) return "";
  const last = mem.recent.slice(-3).map((e) => e.a);
  const starts = [...new Set(last.map((a) => openingOf(a)).filter(Boolean))];
  const stock = last.some((a) => STOCK.some((re) => re.test(a.trim())));
  const parts = [];
  if (starts.length) parts.push(`Do not begin your answer with any of these openings you used recently: ${starts.map((s) => `"${s}"`).join(", ")}.`);
  if (stock) parts.push('Do not praise the question itself (no "great question"); just answer it.');
  return parts.length ? ` ${parts.join(" ")} Start differently each time, the way a person would.` : "";
}
