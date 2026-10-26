// Browser-voice speaking that does not go quiet half way through, and does not add pauses of its own.
//
// What goes wrong with a plain `speechSynthesis.speak(wholeParagraph)`:
//  - Chrome (and some Android network voices) silently stop a long utterance after roughly 15 seconds, and never fire `end`;
//  - an utterance can be dropped right after `cancel()` + `speak()`, or the engine can sit in a "paused" state;
//  - when that happens nothing tells the app, so the lecture carries on (captions, code typing) with no sound.
//
// So long text is split into short pieces that are all QUEUED AT ONCE (the engine plays queued pieces back to back,
// so there is no gap between them), and a watchdog steps in only when the engine itself is idle or has made no
// progress for far longer than the piece should take. It never trusts `start` events alone: some voices report
// them late or not at all while speaking perfectly well.

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

const DEFAULTS = { msPerChar: 75, graceMs: 3000, pollMs: 400, idleMs: 1500, retryDelayMs: 150 };

// Speaks `text`. Resolves true when it finished (or gave up on a broken voice so the lecture can go on),
// false when `shouldStop()` became true (the student interrupted or moved on).
//   synth: window.speechSynthesis   Utter: SpeechSynthesisUtterance
//   o: { rate, voice, onStart, onPiece(i,n), onTrouble(kind), shouldStop, isPaused, maxPiece, ...timing overrides }
export async function speakWithBrowserVoice(synth, Utter, text, o = {}) {
  const cfg = { ...DEFAULTS, ...o };
  const shouldStop = o.shouldStop || (() => false);
  const isPaused = o.isPaused || (() => false);
  const rate = o.rate || 1;
  // Voices installed on the device have no 15-second limit: speak those in one go. Others get short pieces
  // (shorter when the speaking rate is slow, since a slow piece takes longer).
  const local = !!(o.voice && o.voice.localService === true);
  const maxPiece = o.maxPiece || (local ? 600 : Math.max(80, Math.round(150 * Math.min(1, rate))));
  const pieces = splitForSpeech(text, maxPiece);
  if (!synth || !pieces.length) return true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const trouble = (kind) => { try { o.onTrouble && o.onTrouble(kind); } catch (e) { /* never let a callback break speech */ } };
  const cancel = () => { try { synth.cancel(); } catch (e) { /* ignore */ } };
  const expectedMs = (piece) => (piece.length * cfg.msPerChar) / rate;

  // A leftover utterance from before would delay or swallow the first piece.
  try { if (synth.speaking || synth.pending) { cancel(); await sleep(80); } } catch (e) { /* ignore */ }

  let startedOnce = false;
  const retried = new Set();
  let stuckInARow = 0;

  // Queues pieces[from..] and waits for them. Returns { status: "done" | "stopped" | "stuck", at, started }.
  const runQueue = (from) => new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let current = from;               // the piece that should be speaking now
    let lastProgress = Date.now();
    let pieceT0 = Date.now();         // when the current piece began waiting to be spoken
    const startedPiece = new Set();
    const finish = (r) => { if (settled) return; settled = true; clearInterval(timer); resolve(r); };
    const progress = () => { lastProgress = Date.now(); };
    const advance = () => { current += 1; progress(); pieceT0 = Date.now(); if (current >= pieces.length) finish({ status: "done" }); else try { o.onPiece && o.onPiece(current, pieces.length); } catch (e) { /* ignore */ } };

    for (let k = from; k < pieces.length; k++) {
      const u = new Utter(pieces[k]);
      u.rate = rate;
      if (o.voice) { try { u.voice = o.voice; if (o.voice.lang) u.lang = o.voice.lang; } catch (e) { /* unusable voice: keep the default */ } }
      u.onstart = () => {
        startedPiece.add(k); progress();
        if (!startedOnce) { startedOnce = true; try { o.onStart && o.onStart(); } catch (e) { /* ignore */ } }
      };
      u.onboundary = () => progress();
      u.onend = () => {
        // "Ended" almost at once, without ever starting, for a piece that needs a while to say: the engine dropped it.
        if (k === current && !startedPiece.has(k) && expectedMs(pieces[k]) > 250 && Date.now() - pieceT0 < expectedMs(pieces[k]) * 0.25) {
          finish({ status: "stuck", at: k, started: false, why: "dropped" });
          return;
        }
        if (k >= current) { startedPiece.add(k); while (current <= k && !settled) advance(); }
      };
      u.onerror = (e) => {
        if (e && (e.error === "interrupted" || e.error === "canceled")) return; // our own cancel, or the app's stop: handled by the poll
        if (k === current) finish({ status: "stuck", at: k, started: startedPiece.has(k), why: "error" });
      };
      try { synth.speak(u); } catch (e) { finish({ status: "stuck", at: from, started: false, why: "error" }); return; }
    }
    try { o.onPiece && o.onPiece(from, pieces.length); } catch (e) { /* ignore */ }

    timer = setInterval(() => {
      if (settled) return;
      // Stopped by the app (it already cancelled the engine itself). Do NOT cancel here: by now the engine may be
      // speaking the next line, and cancelling would silence that one.
      if (shouldStop()) { finish({ status: "stopped" }); return; }
      if (!isPaused()) { try { if (synth.paused) synth.resume(); } catch (e) { /* ignore */ } } // stuck in a paused state
      const quiet = Date.now() - lastProgress;
      const budget = expectedMs(pieces[current]) * 1.6 + cfg.graceMs; // far longer than the piece should take
      let engineBusy = true;
      try { engineBusy = !!(synth.speaking || synth.pending); } catch (e) { /* assume busy */ }
      if (!engineBusy && quiet > cfg.idleMs) {
        // The engine is idle yet we never heard the piece end. If it began (or enough time has passed for it to
        // have been spoken) it was probably heard and only the event was lost; otherwise it was dropped.
        const likelySpoken = startedPiece.has(current) || quiet > expectedMs(pieces[current]) * 0.6;
        if (likelySpoken) { advance(); return; }
        finish({ status: "stuck", at: current, started: false, why: "dropped" });
      } else if (quiet > budget) {
        finish({ status: "stuck", at: current, started: startedPiece.has(current), why: "stalled" });
      }
    }, cfg.pollMs);
  });

  let from = 0;
  while (from < pieces.length) {
    if (shouldStop()) return false;
    const r = await runQueue(from);
    if (r.status === "stopped" || shouldStop()) return false;
    if (r.status === "done") return true;
    // Something stuck. Clear the engine, then carry on from the right place.
    cancel();
    trouble(r.why);
    stuckInARow += 1;
    if (stuckInARow >= 3) { trouble("gave-up"); return true; } // clearly broken: let the lecture move on, text stays on screen
    if (r.started || retried.has(r.at)) from = r.at + 1; // it began, or was already retried: do not repeat it again
    else { retried.add(r.at); from = r.at; }
    await sleep(cfg.retryDelayMs);
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
