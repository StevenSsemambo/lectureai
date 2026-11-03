// A tiny one-way message line from the lecture's voice code to the lecturer's face.
//
// The voice code (speakInterruptible in App.jsx) only ever calls these functions. If nobody is listening (camera off,
// face not loaded, face crashed) every call returns immediately, so the lecture behaves exactly as it did before the
// face existed. Nothing here can throw into the caller.

const listeners = new Set();

function emit(type, data) {
  if (!listeners.size) return;
  for (const fn of Array.from(listeners)) {
    try { fn(type, data || {}); } catch (e) { /* the face must never break the voice */ }
  }
}

export const avatarBus = {
  subscribe(fn) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  hasListeners: () => listeners.size > 0,

  // Browser voice speaks in short queued pieces (see voice/speech.js).
  piece: (text, rate) => emit("piece", { text, rate }),              // piece queued / about to be spoken
  pieceStart: (text, rate) => emit("pieceStart", { text, rate }),    // the engine really started saying it
  boundary: (charIndex) => emit("boundary", { charIndex }),          // word boundary inside the current piece

  // Recorded voice (ElevenLabs): the audio element itself is the clock.
  recording: (text, { durationMs, audio, rate } = {}) => emit("recording", { text, durationMs, audio, rate }),

  end: () => emit("end"),    // the line finished
  stop: () => emit("stop"),  // cut off (student asked something, paused, moved slide)
};
