// The lecturer's face as a small picture-in-picture tile. It is one persistent DOM node that is moved between two
// slots owned by the lecture room, so the slides are never covered:
//   rail   - its own column beside the slide (wide screens)
//   inline - a small round tile on the Slides / Code-editor row (phones and tablets)
// Which slot is used is decided by CSS (which slot is displayed); this component just follows it.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LecturerFace } from "./engine.js";
import { avatarBus } from "./avatarBus.js";
import { logClientError } from "../errorLogging.jsx";
import { debugEnabled } from "./lipTuning.js";
import { waitForSpeech } from "./startGate.js";

const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
const MODEL_URL = `${BASE}avatars/avatar-f1.glb`;
const MODEL_MB = "2.3";

// Data Saver on, or a 2G connection: ask before downloading the model.
function onSlowData() {
  try { const c = navigator.connection; return !!(c && (c.saveData || /2g$/.test(c.effectiveType || ""))); } catch (e) { return false; }
}
function wantsLessMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
}

export default function LecturerAvatar({ slots, chatOpen, lecturerState }) {
  // the persistent tile: <div.avatar-card> holds the canvas box; React renders status text into it via a portal
  const [host] = useState(() => {
    const card = document.createElement("div");
    card.className = "avatar-card";
    card.setAttribute("role", "img");
    card.setAttribute("aria-label", "The lecturer");
    const box = document.createElement("div");
    box.className = "avatar-box";
    card.appendChild(box);
    return { card, box };
  });
  const faceRef = useRef(null);
  const modeRef = useRef("inline");
  const [mode, setMode] = useState("inline");
  const [status, setStatus] = useState(onSlowData() ? "tap" : "loading"); // tap | loading | ready | error
  const [run, setRun] = useState(onSlowData() ? 0 : 1); // bump to (re)start the engine

  // follow whichever slot is displayed
  useEffect(() => {
    const place = () => {
      const rail = slots.rail.current, inline = slots.inline.current;
      const railShown = !!rail && window.getComputedStyle(rail).display !== "none";
      const target = railShown ? rail : inline;
      if (target && host.card.parentNode !== target) target.appendChild(host.card);
      modeRef.current = railShown ? "rail" : "inline";
      setMode(modeRef.current);
      if (faceRef.current) faceRef.current.setFraming(railShown ? "bust" : "face");
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [chatOpen, slots, host]);

  useEffect(() => () => { if (host.card.parentNode) host.card.parentNode.removeChild(host.card); }, [host]);

  // Do not start downloading the face until the lecture's voice has begun (or 6 s have passed): the two must not compete
  // for a weak connection. A student who tapped "Show the lecturer" is not made to wait.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!run || settled) return undefined;
    return waitForSpeech(avatarBus, () => setSettled(true), 6000);
  }, [run, settled]);

  // the engine lives only while this component is mounted (camera on)
  useEffect(() => {
    if (!run || !settled) return undefined;
    let cancelled = false, face = null, off = null;
    setStatus("loading");
    try {
      face = new LecturerFace({
        container: host.box,
        modelUrl: MODEL_URL,
        framing: modeRef.current === "rail" ? "bust" : "face",
        reducedMotion: wantsLessMotion(),
        onStatus: (s) => { if (!cancelled) setStatus(s); },
      });
    } catch (e) {
      logClientError("avatar.init", e, { label: "lecturer-avatar" });
      setStatus("error");
      return undefined;
    }
    faceRef.current = face;
    off = avatarBus.subscribe((type, data) => face.handle(type, data));
    face.load().catch((e) => {
      if (cancelled) return;
      logClientError("avatar.load", e, { label: "lecturer-avatar" });
      setStatus("error");
    });
    return () => { cancelled = true; if (off) off(); face.dispose(); faceRef.current = null; };
  }, [run, settled, host]);

  // thinking while the AI is preparing an answer; amber glow while speaking (same cue as the old tile)
  const speaking = lecturerState === "explaining" || lecturerState === "answering";
  useEffect(() => { if (faceRef.current) faceRef.current.setThinking(lecturerState === "loading"); }, [lecturerState, status]);
  useEffect(() => { host.card.classList.toggle("speaking", speaking); }, [speaking, host]);

  // ?lipdebug: a small text box with what the face knows about the voice's timing (for tuning)
  const [debugOn] = useState(debugEnabled);
  const [dbg, setDbg] = useState("");
  useEffect(() => {
    if (!debugOn) return undefined;
    const id = setInterval(() => { if (faceRef.current) setDbg(faceRef.current.debugLine()); }, 400);
    return () => clearInterval(id);
  }, [debugOn]);

  const start = () => { setSettled(true); setRun((r) => r + 1); };
  const label = lecturerState === "loading" ? "Thinking…" : speaking ? "Speaking" : "Lecturer";

  const face = createPortal(
    status === "ready" ? (
      <div className="avatar-label">{label}</div>
    ) : (
      <button type="button" className="avatar-tap" onClick={status === "loading" ? undefined : start} disabled={status === "loading"}
        aria-label={status === "tap" ? `Load the lecturer's face (about ${MODEL_MB} MB)` : status === "error" ? "The lecturer's face could not start. Tap to try again" : "Loading the lecturer's face"}>
        <span className="avatar-initial">{status === "loading" ? <span className="avatar-spin" /> : "L"}</span>
        <span className="avatar-msg">
          {status === "tap" ? `Show the lecturer (${MODEL_MB} MB)` : status === "error" ? "Face unavailable — tap to retry" : "Loading…"}
        </span>
      </button>
    ),
    host.card
  );
  return (
    <>
      {face}
      {debugOn && createPortal(<pre className="avatar-debug">{dbg}</pre>, document.body)}
    </>
  );
}
