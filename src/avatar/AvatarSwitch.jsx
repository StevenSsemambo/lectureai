import React from "react";
import { useAvatarEnabled, setAvatarEnabled } from "./avatarSwitch.js";

// Voice-panel switch for the lecturer's face.
export default function AvatarSwitch() {
  const on = useAvatarEnabled();
  return (
    <>
      <label className="voice-label" htmlFor="avatar-on" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input id="avatar-on" type="checkbox" checked={on} onChange={(e) => setAvatarEnabled(e.target.checked)} />
        Show the lecturer's face
      </label>
      <p className="voice-note">
        Uses extra data (about 2.3 MB the first time), battery and memory, and appears when the camera icon is on. If the voice ever stops working, try switching this off.
      </p>
    </>
  );
}
