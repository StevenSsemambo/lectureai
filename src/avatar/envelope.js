// Measures a recording's loudness over time (pure maths: Float32Array in, plain numbers out; tested in Node).
// The face uses it to know when the voice is really sounding (mouth open) and when it is silent (mouth shut), and how
// much voice has been heard so far, so the words line up with the real audio instead of an estimate.

export const HOP_S = 0.02; // one measurement every 20 ms

export function analyseSamples(samples, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate * HOP_S));
  const n = Math.floor(samples.length / hop);
  if (n < 5) return null;
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = f * hop, e = i + hop; i < e; i++) s += samples[i] * samples[i];
    rms[f] = Math.sqrt(s / hop);
  }
  const sorted = Float32Array.from(rms).sort();
  const ref = Math.max(sorted[Math.floor(n * 0.95)], 1e-4); // "loud speech" level for this recording
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) env[f] = Math.min(1.2, rms[f] / ref);

  // voiced / silent with hysteresis, then bridge tiny gaps (stop consonants are not pauses)
  const voiced = new Uint8Array(n);
  let on = false;
  for (let f = 0; f < n; f++) {
    if (!on && env[f] > 0.12) on = true; else if (on && env[f] < 0.05) on = false;
    voiced[f] = on ? 1 : 0;
  }
  const GAP = 3; // 60 ms
  for (let f = 0; f < n;) {
    if (voiced[f]) { f++; continue; }
    let e = f; while (e < n && !voiced[e]) e++;
    if (f > 0 && e < n && e - f <= GAP) for (let i = f; i < e; i++) voiced[i] = 1;
    f = e;
  }
  const cum = new Float32Array(n + 1); // voiced frames heard before frame f
  for (let f = 0; f < n; f++) cum[f + 1] = cum[f] + voiced[f];
  if (cum[n] < 5) return null;
  return { hop: hop / sampleRate, n, env, voiced, cum, total: cum[n] };
}

// Decode a recording (mp3 etc.) in the background, without touching playback. Resolves to analyseSamples(...) or null.
export async function analyseBlob(blob) {
  try {
    if (!blob || blob.size > 8 * 1024 * 1024) return null;
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) return null;
    const ctx = new AC(1, 1, 22050);
    const data = await blob.arrayBuffer();
    const buf = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject); // older Safari only has the callback form
      if (p && p.then) p.then(resolve, reject);
    });
    return analyseSamples(buf.getChannelData(0), buf.sampleRate);
  } catch (e) {
    return null; // not decodable: the face falls back to the even-stretch estimate
  }
}
