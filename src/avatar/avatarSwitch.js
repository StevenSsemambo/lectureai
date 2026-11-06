// A master switch for the lecturer's face, kept on this device. OFF means the face code is never even downloaded and the
// lecture runs exactly as it did before the face existed. Default: ON (the face shows when the camera icon is on).
//   Voice panel  → "Show the lecturer's face"      address bar → ?avatar=on / ?avatar=off  (remembered)
import { useEffect, useState } from "react";

const KEY = "semai.avatar.v1";
const EVENT = "semai-avatar-switch";
let urlApplied = false;

function applyUrlOnce() {
  if (urlApplied) return;
  urlApplied = true;
  try {
    const q = new URLSearchParams(window.location.search).get("avatar");
    if (q === "on" || q === "off") localStorage.setItem(KEY, q);
  } catch (e) { /* no address bar / storage: ignore */ }
}

export function getAvatarEnabled() {
  applyUrlOnce();
  try { return localStorage.getItem(KEY) !== "off"; } catch (e) { return true; }
}

export function setAvatarEnabled(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* not remembered, still applies for this visit via the event */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch (e) { /* ignore */ }
}

export function useAvatarEnabled() {
  const [on, setOn] = useState(getAvatarEnabled);
  useEffect(() => {
    const f = () => setOn(getAvatarEnabled());
    window.addEventListener(EVENT, f);
    window.addEventListener("storage", f);
    return () => { window.removeEventListener(EVENT, f); window.removeEventListener("storage", f); };
  }, []);
  return on;
}
