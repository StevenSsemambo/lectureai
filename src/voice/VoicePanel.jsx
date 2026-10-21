import React, { useEffect, useRef } from "react";
import { RATE_MIN, RATE_MAX, RATE_PRESETS, classifyVoice, voicesForLanguage, genderAvailable, rateLabel, clampRate } from "./voicePrefs.js";

const GENDERS = [["any", "Any"], ["female", "Female"], ["male", "Male"]];
const tag = (v) => { const g = classifyVoice(v); return g === "female" ? " · female" : g === "male" ? " · male" : ""; };

// Lets a student change how the AI lecturer sounds: speed, and a male or female voice.
export default function VoicePanel({ open, onClose, prefs, onChange, voices, lang, canPreview, onPreview }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Depends on `open` only: re-running on every change would steal focus from the slider mid-drag.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    const first = ref.current && ref.current.querySelector("input, button, select");
    if (first) first.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;

  const list = voicesForLanguage(voices, lang);
  const noVoices = !voices || voices.length === 0;
  const set = (patch) => onChange({ ...prefs, ...patch });

  return (
    <>
      <div className="voice-scrim" onClick={onClose} />
      <div className="voice-panel" role="dialog" aria-modal="true" aria-label="Lecturer voice settings" ref={ref}>
        <div className="voice-head">
          <strong>Lecturer voice</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close voice settings">✕</button>
        </div>

        <label className="voice-label" htmlFor="voice-speed">Speed <span className="voice-value">{rateLabel(prefs.rate)}</span></label>
        <input id="voice-speed" type="range" min={RATE_MIN} max={RATE_MAX} step={0.05} value={prefs.rate} onChange={(e) => set({ rate: clampRate(e.target.value) })} aria-valuetext={`${rateLabel(prefs.rate)} speed`} />
        <div className="voice-presets" role="group" aria-label="Speed presets">
          {RATE_PRESETS.map((r) => (
            <button key={r} className={`pill ${Math.abs(prefs.rate - r) < 0.01 ? "active" : ""}`} onClick={() => set({ rate: r })} aria-pressed={Math.abs(prefs.rate - r) < 0.01}>{rateLabel(r)}</button>
          ))}
        </div>

        <div className="voice-label">Voice</div>
        {noVoices ? (
          <p className="voice-note">Your device doesn't list any voices, so the lecturer will use its default voice. Speed still applies.</p>
        ) : (
          <>
            <div className="voice-presets" role="group" aria-label="Voice type">
              {GENDERS.map(([id, label]) => {
                const available = id === "any" || genderAvailable(voices, id, lang);
                return (
                  <button key={id} className={`pill ${prefs.gender === id && !prefs.voiceURI ? "active" : ""}`} disabled={!available} title={available ? "" : `No ${label.toLowerCase()} voice found on this device`} aria-pressed={prefs.gender === id && !prefs.voiceURI} onClick={() => set({ gender: id, voiceURI: "" })}>{label}</button>
                );
              })}
            </div>
            <select className="voice-select" aria-label="Choose a specific voice" value={prefs.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })}>
              <option value="">Automatic ({prefs.gender === "any" ? "device default" : prefs.gender})</option>
              {list.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{tag(v)}</option>)}
            </select>
            <p className="voice-note">Available voices depend on your device and browser. Changes apply from the lecturer's next sentence.</p>
          </>
        )}

        <div className="voice-actions">
          <button className="nav-btn" onClick={onPreview} disabled={!canPreview} title={canPreview ? "Hear a sample" : "Pause the lecture to hear a sample"}>▶ Preview</button>
          <button className="nav-btn" onClick={() => onChange({ rate: 1, gender: "any", voiceURI: "" })}>Reset</button>
        </div>
        {!canPreview && <p className="voice-note">Pause the lecture to preview a voice.</p>}
      </div>
    </>
  );
}
