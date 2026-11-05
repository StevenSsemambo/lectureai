// The face's download (about 2.3 MB the first time) should never compete with the lecture's own voice for the phone's
// network and attention. This waits until the voice has really started (a first word / piece / recording) or `timeoutMs`
// has passed (e.g. the lecture is paused and nothing is being said), then calls onGo once. Returns a cancel function.
export function waitForSpeech(bus, onGo, timeoutMs = 6000) {
  let done = false, off = () => {}, timer = null;
  const go = () => { if (done) return; done = true; off(); clearTimeout(timer); onGo(); };
  off = bus.subscribe((type) => { if (type === "pieceStart" || type === "boundary" || type === "recording") go(); });
  timer = setTimeout(go, timeoutMs);
  return () => { done = true; off(); clearTimeout(timer); };
}
