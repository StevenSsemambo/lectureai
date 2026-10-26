// Browser-voice speaking that does not go quiet half way through.
//
// What goes wrong with a plain `speechSynthesis.speak(wholeParagraph)`:
//  - Chrome (and some Android voices) silently stop a long utterance after roughly 15 seconds, and never fire `end`;
//  - an utterance can be dropped right after `cancel()` + `speak()`, or the engine can sit in a "paused" state;
//  - when that happens nothing tells the app, so the lecture carries on (captions, code typing) with no sound.
// So the text is spoken in short pieces, each piece is watched, and a stuck piece is retried or skipped.

// Splits text into pieces of at most `max` characters, at sentence ends where possible, then at commas, then at spaces.
export function splitForSpeech(text, max = 140) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [clean];
  const parts = [];
  for (let s of sentences) {
    s = s.trim();
    while (s.length > max) {
      let cut = Math.max(s.lastIndexOf(", ", max), s.lastIndexOf("; ", max), s.lastIndexOf(": ", max));
      if (cut < max * 0.4) cut = s.lastIndexOf(" ", max);
      if (cut < 1) cut = max;
      parts.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) parts.push(s);
  }
  // pack neighbours together so delivery is not choppy, never beyond `max`
  const packed = [];
  for (const p of parts) {
    if (packed.length && packed[packed.length - 1].length + 1 + p.length <= max) packed[packed.length - 1] += " " + p;
    else packed.push(p);
  }
  return packed;
}

const DEFAULTS = { msPerChar: 75, graceMs: 2500, pollMs: 400, startTimeoutMs: 4000, retryDelayMs: 150 };

// Speaks `text` piece by piece. Resolves true when it finished (or gave up on a broken voice so the lecture can go on),
// false when `shouldStop()` became true (the student interrupted or moved on).
//   synth: window.speechSynthesis   Utter: SpeechSynthesisUtterance
//   o: { rate, voice, lang, onStart, onPiece(i,n), onTrouble(kind), shouldStop, isPaused, ...timing overrides }
export async function speakWithBrowserVoice(synth, Utter, text, o = {}) {
  const cfg = { ...DEFAULTS, ...o };
  const shouldStop = o.shouldStop || (() => false);
  const isPaused = o.isPaused || (() => false);
  const rate = o.rate || 1;
  const pieces = splitForSpeech(text, o.maxPiece || 140);
  if (!synth || !pieces.length) return true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const trouble = (kind) => { try { o.onTrouble && o.onTrouble(kind); } catch (e) { /* never let a callback break speech */ } };

  // A leftover utterance from before would delay or swallow the first piece.
  try { if (synth.speaking || synth.pending) { synth.cancel(); await sleep(80); } } catch (e) { /* ignore */ }

  let startedOnce = false;
  const speakPiece = (piece, attempt) => new Promise((resolve) => {
    let settled = false;
    let started = false;
    const t0 = Date.now();
    let timer = null;
    const finish = (result) => { if (settled) return; settled = true; clearInterval(timer); resolve({ result, started }); };
    const u = new Utter(piece);
    u.rate = rate;
    if (o.voice) { try { u.voice = o.voice; if (o.voice.lang) u.lang = o.voice.lang; } catch (e) { /* unusable voice: keep the default */ } }
    u.onstart = () => { started = true; if (!startedOnce) { startedOnce = true; try { o.onStart && o.onStart(); } catch (e) { /* ignore */ } } };
    // dropped by the engine: it "ended" without ever starting
    u.onend = () => finish(started || attempt > 0 ? "done" : "silent");
    u.onerror = (e) => finish(e && (e.error === "interrupted" || e.error === "canceled") ? (shouldStop() ? "stopped" : "silent") : "error");
    const expected = (piece.length * cfg.msPerChar) / rate + cfg.graceMs;
    timer = setInterval(() => {
      // Stopped by the app (it already cancelled the engine itself). Do NOT cancel here: by now the engine may be
      // speaking the next line, and cancelling would silence that one.
      if (shouldStop()) { finish("stopped"); return; }
      if (!isPaused()) { try { if (synth.paused) synth.resume(); } catch (e) { /* ignore */ } } // stuck in a paused state
      const elapsed = Date.now() - t0;
      if (elapsed > expected * 2) { try { synth.cancel(); } catch (e) { /* ignore */ } finish("stalled"); }
      else if (!started && elapsed > cfg.startTimeoutMs) { try { synth.cancel(); } catch (e) { /* ignore */ } finish("silent"); }
    }, cfg.pollMs);
    try { synth.speak(u); } catch (e) { finish("error"); }
  });

  let failures = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (shouldStop()) return false;
    o.onPiece && o.onPiece(i, pieces.length);
    let attempt = 0;
    for (;;) {
      const { result, started } = await speakPiece(pieces[i], attempt);
      if (result === "stopped" || shouldStop()) return false;
      if (result === "done") { failures = 0; break; }
      // The voice stopped part way through: carry on with the next piece rather than repeating words already heard.
      if (result === "stalled" && started) { trouble("stalled"); failures = 0; break; }
      trouble(result);
      if (attempt === 0) { attempt = 1; try { synth.cancel(); } catch (e) { /* ignore */ } await sleep(cfg.retryDelayMs); continue; }
      failures += 1; // retried once and still nothing: skip this piece
      break;
    }
    // The voice is clearly broken: stop wasting the student's time and let the lecture move on (text stays on screen).
    if (failures >= 2) { trouble("gave-up"); return true; }
  }
  return true;
}

// When a recording dies part way (audio stalled at `frac` of its length), the rest is spoken by the browser voice.
// Starts at the beginning of the sentence being read, so a little may repeat but nothing is skipped.
export function remainingFrom(text, frac) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || !(frac > 0.02)) return clean;
  if (frac >= 0.995) return "";
  const sentences = clean.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [clean];
  const cut = clean.length * frac;
  let acc = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (acc + sentences[i].length > cut) return sentences.slice(i).join("").trim();
    acc += sentences[i].length;
  }
  return sentences[sentences.length - 1].trim();
}
