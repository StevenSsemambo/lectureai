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
  piece: (text, rate, voice) => emit("piece", { text, rate, voice }),            // piece queued / about to be spoken
  pieceStart: (text, rate, voice) => emit("pieceStart", { text, rate, voice }),  // the engine really started saying it
  boundary: (charIndex, kind) => emit("boundary", { charIndex, kind }),          // word boundary inside the current piece

  // Recorded voice (ElevenLabs): the audio element itself is the clock.
  recordingReady: (blob) => emit("recordingReady", { blob }),  // the recording has arrived (not playing yet): start measuring it
  recording: (text, { durationMs, audio, rate, blob } = {}) => emit("recording", { text, durationMs, audio, rate, blob }),

  pieceEnd: () => emit("pieceEnd"),  // the voice really finished that piece: the mouth shuts at once, however long the guess was
  end: () => emit("end"),    // the line finished
  stop: () => emit("stop"),  // cut off (student asked something, paused, moved slide)
};
