// "Detours": when a student's question is best answered by SHOWING something, the AI lecturer puts a
// temporary board on screen (a diagram, a small explanation slide, or code), talks the student through
// it, then returns to exactly where the lecture was.
//
// Design rules that keep this safe:
//  - The lecture itself is never changed. A detour is an overlay held in separate state, so the slide
//    index, typed code, reveal progress, quiz checks, analytics and session records are untouched.
//  - Everything here is pure (no React, no network), so it can be tested in node.
//  - Any problem (bad JSON, invalid diagram, odd shape) means "no board": the lecturer simply answers
//    out loud, exactly as before this feature existed.

import { normalizeSlide } from "../slideKit/schema.js";
import { validateSlide } from "../slideKit/validate.js";

export const DETOUR_KINDS = ["diagram", "slide", "code", "highlight"];

const MAX_MERMAID_CHARS = 2500;
const MAX_CODE_CHARS = 3000;
const MAX_CODE_LINES = 60;
const MAX_BULLETS = 6;

// Added to the question-answering system prompt. "answer" comes BEFORE "visual" on purpose: if the
// model's reply is cut off, the spoken answer is still intact.
export const VISUAL_PROMPT = `

OPTIONAL ON-SCREEN VISUAL. Most questions need only a spoken answer, so leave "visual" out (or null) for those. Add it ONLY when the student asks to see, draw, show or demonstrate something, or when a picture or a short piece of code is clearly much clearer than words. When you add one, your spoken "answer" must walk the student through it ("look at the diagram: first..."), yet still make sense on its own in case the picture cannot be shown.
The full reply shape is then: {"confidence": "high" | "low", "answer": "...", "visual": <one of the shapes below>}
- Diagram: {"kind":"diagram","title":"short title","mermaid":"flowchart TD\\n  A[\\"Start\\"] --> B[\\"Next step\\"]","caption":"one line"}  (Mermaid syntax; at most 12 nodes; put every label in double quotes; no HTML, no click handlers.)
- Mini slide: {"kind":"slide","title":"short title","bullets":["point","point"]}  (at most 5 short bullets.)
- Code the student wants to see (not on the slide): {"kind":"code","title":"short title","language":"java","code":"...","expectedOutput":"optional"}  (at most 25 lines; complete and correct.)
- Point at part of the code ALREADY on the slide: {"kind":"highlight","lines":[3,5]}  (1-based line numbers; only when the slide has code.)`;

const stripFences = (s) => String(s || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

// Same contract as the app's parseAnswerJSON, plus a `visual` field. Tolerant of truncated or
// malformed output: it never speaks raw JSON aloud.
export function parseAnswerWithVisual(raw, fallbackAnswer) {
  if (!raw) return { confidence: "high", answer: fallbackAnswer, visual: null };
  const cleaned = stripFences(raw);
  try {
    const data = JSON.parse(cleaned);
    if (data && typeof data.answer === "string" && data.answer.trim()) {
      const v = data.visual && typeof data.visual === "object" && DETOUR_KINDS.includes(data.visual.kind) ? data.visual : null;
      return { confidence: data.confidence === "low" ? "low" : "high", answer: data.answer.trim(), visual: v };
    }
  } catch (e) {
    /* fall through to salvage */
  }
  if (cleaned.startsWith("{")) {
    // Looks like JSON but did not parse (usually cut off). Rescue the spoken answer if it is there.
    const m = /"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(cleaned);
    if (m) {
      try {
        const answer = JSON.parse(`"${m[1]}"`).trim();
        if (answer) return { confidence: /"confidence"\s*:\s*"low"/.test(cleaned) ? "low" : "high", answer, visual: null };
      } catch (e) {
        /* fall through */
      }
    }
    return { confidence: "high", answer: fallbackAnswer, visual: null };
  }
  return { confidence: "high", answer: cleaned || fallbackAnswer, visual: null };
}

const cap = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

export function cleanMermaid(code) {
  let c = String(code || "").replace(/\r/g, "").trim();
  c = c.replace(/^```(?:mermaid)?/i, "").replace(/```$/, "").trim();
  // Interactive directives and raw HTML have no place in a teaching board.
  c = c.split("\n").filter((line) => !/^\s*(click|callback|link)\b/i.test(line)).join("\n");
  c = c.replace(/<\s*\/?\s*(script|iframe|object|embed|style)[^>]*>/gi, "");
  return c.trim();
}

// Turn the model's `visual` into a ready-to-render board, or null when it is unusable.
// currentSlide is the authored slide on screen (needed for "highlight").
export function buildDetourBoard(visual, currentSlide) {
  if (!visual || typeof visual !== "object") return null;
  try {
    if (visual.kind === "diagram") {
      const code = cleanMermaid(visual.mermaid || visual.code);
      if (!code || code.length > MAX_MERMAID_CHARS || code.split("\n").length < 2) return null;
      const slide = normalizeSlide({ type: "diagram", title: cap(visual.title, 80) || "Diagram", diagram: { code, caption: cap(visual.caption, 160) } }, 0);
      return slide.diagram ? { kind: "diagram", slide, highlight: null } : null;
    }
    if (visual.kind === "slide") {
      const bullets = (Array.isArray(visual.bullets) ? visual.bullets : []).map((b) => cap(b, 220)).filter(Boolean).slice(0, MAX_BULLETS);
      if (!bullets.length) return null;
      const slide = normalizeSlide({ type: "concept", title: cap(visual.title, 80) || "Let me show you", bullets, detail: cap(visual.detail, 400) }, 0);
      return { kind: "slide", slide, highlight: null };
    }
    if (visual.kind === "code") {
      const code = String(visual.code || "").replace(/\r/g, "").replace(/\s+$/, "");
      if (!code.trim() || code.length > MAX_CODE_CHARS || code.split("\n").length > MAX_CODE_LINES) return null;
      const slide = normalizeSlide({ type: "code_walkthrough", title: cap(visual.title, 80) || "Example", hasCode: true, code, language: visual.language, expectedOutput: cap(visual.expectedOutput, 600) }, 0);
      return slide.hasCode ? { kind: "code", slide, highlight: null } : null;
    }
    if (visual.kind === "highlight") {
      if (!currentSlide || !currentSlide.hasCode || !currentSlide.code) return null;
      const n = currentSlide.code.split("\n").length;
      const a = parseInt(Array.isArray(visual.lines) ? visual.lines[0] : visual.lines, 10);
      const b = parseInt(Array.isArray(visual.lines) ? (visual.lines[1] ?? visual.lines[0]) : visual.lines, 10);
      if (!Number.isFinite(a) || a < 1 || a > n) return null;
      const lo = Math.max(1, a);
      const hi = Math.max(lo, Math.min(n, Number.isFinite(b) ? b : lo));
      // The board shows the authored code verbatim, never a model-rewritten copy of it.
      const slide = { ...currentSlide, title: currentSlide.title };
      return { kind: "highlight", slide, highlight: [lo, hi] };
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Last safety net before a student sees it. Diagrams get their syntax checked (and, if it fails,
// the caller may ask the AI to fix it once). `deps.checkMermaid` lets tests run without a browser.
export async function checkBoard(board, deps = {}) {
  if (!board) return { ok: false, issues: ["no board"], board: null };
  if (board.kind === "highlight" || board.kind === "code") return { ok: true, issues: [], board };
  try {
    const { slide, issues } = await validateSlide(board.slide, deps);
    return { ok: issues.length === 0, issues, board: { ...board, slide } };
  } catch (e) {
    return { ok: false, issues: ["The check could not run"], board: null };
  }
}

export function mermaidRepairPrompt(code, issue) {
  return `This Mermaid diagram failed to parse.\n\nProblem: ${cap(issue, 200)}\n\nDiagram:\n${cap(code, MAX_MERMAID_CHARS)}\n\nReturn ONLY the corrected Mermaid code. No explanation, no markdown fences. Put every node label in double quotes and keep it to at most 12 nodes.`;
}

// How long the board stays up after the lecturer finishes talking, before returning to the lecture.
export function holdMs(kind) {
  return kind === "code" || kind === "highlight" ? 4500 : 3500;
}

// Kill switch: localStorage.setItem("semai_detours", "off") turns the feature off in this browser.
export function detoursEnabled(storage) {
  try {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    return !(s && s.getItem("semai_detours") === "off");
  } catch (e) {
    return true;
  }
}

// What the lecturer is told about the board while the student is still looking at it (for follow-ups).
export function boardContext(board) {
  if (!board) return "";
  if (board.kind === "diagram") return `A board is on screen showing this diagram (${board.slide.title}):\n${board.slide.diagram.code}`;
  if (board.kind === "slide") return `A board is on screen titled "${board.slide.title}" with these points: ${(board.slide.bullets || []).join("; ")}`;
  if (board.kind === "code") return `A code board is on screen (${board.slide.language}):\n${board.slide.code}`;
  if (board.kind === "highlight") return `Lines ${board.highlight[0]}-${board.highlight[1]} of the slide's code are highlighted.`;
  return "";
}

// Holds the "which board is up, and when does it go away" state, kept free of React so the tricky
// timing (a new question arriving mid-board, pinning, Back) can be tested. `onChange(board|null)` is
// called whenever the visible board changes.
export function createDetourController({ onChange = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null;
  let hold = null; // { resolve, timer } while the answer has finished but the board is still up
  let seq = 0;

  const endHold = () => {
    const h = hold;
    hold = null;
    if (h) { clearTimer(h.timer); h.resolve(); }
  };
  const close = () => {
    endHold();
    if (!current) return false;
    current = null;
    onChange(null);
    return true;
  };
  return {
    current: () => current,
    open(board) {
      endHold();
      const id = ++seq;
      current = { ...board, id, pinned: false };
      onChange(current);
      return id;
    },
    close,
    // Close only if board `id` is still the one showing (an older answer must not close a newer board).
    closeIf(id) {
      return current && current.id === id ? close() : false;
    },
    // Resolves after `ms` (unless pinned), or the moment the board closes.
    hold(id, ms) {
      return new Promise((resolve) => {
        if (!current || current.id !== id) { resolve(); return; }
        endHold();
        const h = { resolve, timer: null };
        hold = h;
        if (!current.pinned) h.timer = setTimer(() => { if (hold === h) hold = null; resolve(); }, ms);
      });
    },
    togglePin() {
      if (!current) return false;
      current = { ...current, pinned: !current.pinned };
      onChange(current);
      if (hold) {
        clearTimer(hold.timer);
        if (!current.pinned) {
          const h = hold;
          h.timer = setTimer(() => { if (hold === h) hold = null; h.resolve(); }, 2500);
        }
      }
      return current.pinned;
    },
  };
}
