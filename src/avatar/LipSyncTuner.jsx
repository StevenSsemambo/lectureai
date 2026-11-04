import React, { useState } from "react";
import { OFFSET_MIN, OFFSET_MAX, getOffsetMs, setOffsetMs } from "./lipTuning.js";

// A slider for the Voice panel: lets the student line the mouth up with the voice on their own device and speakers.
export default function LipSyncTuner() {
  const [v, setV] = useState(getOffsetMs);
  const set = (n) => { setV(n); setOffsetMs(n); };
  const label = v === 0 ? "Default" : v > 0 ? `+${v} ms (mouth later)` : `${v} ms (mouth earlier)`;
  return (
    <>
      <label className="voice-label" htmlFor="lip-offset">Mouth timing <span className="voice-value">{label}</span></label>
      <input id="lip-offset" type="range" min={OFFSET_MIN} max={OFFSET_MAX} step={50} value={v} onChange={(e) => set(Number(e.target.value))} aria-valuetext={label} />
      <p className="voice-note">
        If the mouth moves before the voice, slide right. If the voice is ahead of the mouth, slide left. Bluetooth speakers usually need about +200 ms.
        {v !== 0 && <> <button type="button" className="pill" onClick={() => set(0)}>Reset timing</button></>}
      </p>
    </>
  );
}
