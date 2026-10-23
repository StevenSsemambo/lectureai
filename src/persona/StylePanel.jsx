import React, { useEffect, useRef } from "react";
import { FEEDBACK_STYLES } from "./studentPrefs.js";

// "How I like to be taught": the student's own choices, kept on this device. They change tone and how often
// the lecturer offers things, never what is taught or assessed.
export default function StylePanel({ open, onClose, prefs, onChange, lecturerName }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    const first = ref.current && ref.current.querySelector("button");
    if (first) first.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const set = (patch) => onChange(patch);
  return (
    <>
      <div className="voice-scrim" onClick={onClose} />
      <div className="voice-panel" role="dialog" aria-modal="true" aria-label="How I like to be taught" ref={ref}>
        <div className="voice-head">
          <strong>How I like to be taught</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close teaching style settings">✕</button>
        </div>
        <div className="voice-label">Feedback and explanations</div>
        <div className="voice-presets" role="group" aria-label="Feedback style">
          {Object.entries(FEEDBACK_STYLES).map(([id, f]) => (
            <button key={id} className={`pill ${prefs.feedback === id ? "active" : ""}`} aria-pressed={prefs.feedback === id} title={f.blurb} onClick={() => set({ feedback: id })}>{f.label}</button>
          ))}
        </div>
        <p className="voice-note">{FEEDBACK_STYLES[prefs.feedback].blurb}</p>
        <label className="voice-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={prefs.useName} onChange={(e) => set({ useName: e.target.checked })} /> Use my name sometimes
        </label>
        <label className="voice-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={prefs.careOffers} onChange={(e) => set({ careOffers: e.target.checked })} /> Offer to slow down or take a break when things get hard
        </label>
        <p className="voice-note">
          {lecturerName ? `${lecturerName} is` : "The lecturer is"} an AI. These choices stay on this device and only change how it talks to you, never what you are taught or tested on. It only acts on what you tell it (like tapping "I'm lost") and your answers, never on guesses about how you feel.
        </p>
      </div>
    </>
  );
}
