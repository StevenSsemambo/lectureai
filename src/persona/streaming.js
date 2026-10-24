// Streaming answers: start speaking while the AI is still writing.
//
// The AI sends its reply in pieces. The lecture's question answers are JSON like
//   {"confidence":"high","answer":"...","visual":{...}}
// so this module (pure, no network) does three things:
//   1. extractAnswer: pull the text of the "answer" field out of the half-finished JSON, as far as it has arrived;
//   2. createChunker: cut that growing text into sentences that are safe to speak now;
//   3. parseSSE: read the server's event stream.
// Anything unexpected means "don't speak early": the caller then waits for the full reply and speaks it as before.

// ---- 1. the "answer" text from partial JSON -------------------------------------------------
const ESC = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

export function extractAnswer(partial) {
  let s = String(partial || "").replace(/^\s*```(?:json)?\s*/i, "");
  if (!s.trimStart().startsWith("{")) return null; // not JSON: nothing to speak early
  const m = /"answer"\s*:\s*"/.exec(s);
  if (!m) return { text: "", complete: false };
  let i = m.index + m[0].length;
  let out = "";
  while (i < s.length) {
    const c = s[i];
    if (c === '"') return { text: out, complete: true };
    if (c === "\\") {
      if (i + 1 >= s.length) break; // half an escape: wait for the rest
      const n = s[i + 1];
      if (n === "u") {
        if (i + 5 >= s.length + 0 && s.length - i < 6) break;
        const hex = s.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += ESC[n] !== undefined ? ESC[n] : n;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return { text: out, complete: false };
}

// ---- 2. sentences that are safe to speak ---------------------------------------------------
const ABBREV = /(?:\b(?:e\.g|i\.e|vs|etc|dr|mr|mrs|ms|prof|fig|eq|no|approx)|\b[A-Z])\.$/i;

// index just after the end of the first complete sentence in text (>= from), or -1
function sentenceEnd(text, from) {
  const re = /[.!?]+["')\]]*(\s+)/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length - m[1].length; // right after the punctuation
    const upTo = text.slice(0, end);
    if (/[.]$/.test(upTo) && ABBREV.test(upTo.slice(-8))) continue; // "e.g." or "Dr." is not the end of a sentence
    return m.index + m[0].length; // include the whitespace so the next chunk starts clean
  }
  return -1;
}

// mode "sentences": speak each sentence as it completes (browser voices start instantly).
// mode "two": first sentence now, the rest in one piece when the answer is complete (voices that need a
//             network request per chunk would otherwise pause between sentences).
export function createChunker({ mode = "sentences", minChars = 30 } = {}) {
  let emitted = 0;
  let firstDone = false;
  return {
    push(text, done = false) {
      const out = [];
      const t = String(text || "");
      if (t.length < emitted) return out; // text shrank: ignore
      if (mode === "two" && firstDone && !done) return out;
      for (;;) {
        if (mode === "two" && firstDone) break;
        let end = sentenceEnd(t, emitted);
        if (end === -1) break;
        // too short on its own ("Yes." "Well."): join with the next sentence
        while (t.slice(emitted, end).trim().length < minChars) {
          const next = sentenceEnd(t, end);
          if (next === -1) { end = -1; break; }
          end = next;
        }
        if (end === -1) break;
        const piece = t.slice(emitted, end).trim();
        emitted = end;
        if (piece) out.push(piece);
        firstDone = true;
      }
      if (done) {
        const rest = t.slice(emitted).trim();
        emitted = t.length;
        if (rest) out.push(rest);
      }
      return out;
    },
    get spoken() { return emitted; },
  };
}

// ---- 3. the server's event stream ------------------------------------------------------------
// Feed it text as it arrives; it returns the events completed so far (objects parsed from "data:" lines).
export function createSSEParser() {
  let buf = "";
  return {
    push(chunk) {
      buf += chunk;
      const events = [];
      let idx;
      while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
        const data = raw.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
        if (!data) continue;
        try { events.push(JSON.parse(data)); } catch (e) { /* skip a damaged event */ }
      }
      return events;
    },
  };
}

// A reply that was cut off mid-sentence: keep it up to the last finished sentence (or "" if there is none).
export function trimToSentence(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (/[.!?]["')\]]*$/.test(t)) return t;
  const m = /^[\s\S]*[.!?]["')\]]*(?=\s)/.exec(t);
  return m ? m[0].trim() : "";
}

// True when `full` continues from what has already been spoken (so the remainder can be appended safely).
export function continuesFrom(full, alreadySpoken) {
  const a = String(alreadySpoken || "").trim();
  return !a || String(full || "").trim().startsWith(a);
}
