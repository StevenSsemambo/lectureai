// The only avatar file the main app imports. It is tiny: the face itself (three.js + the engine, ~150 kB gzipped) is a
// separate chunk that is downloaded only when the camera is on. If anything about the face fails (chunk can't be
// fetched, a render error), it disappears quietly and the lecture carries on exactly as before.
import React, { Suspense, lazy } from "react";
import { logClientError } from "../errorLogging.jsx";
import "./dock.css";

const LecturerAvatar = lazy(() => import("./LecturerAvatar.jsx"));

class Guard extends React.Component {
  constructor(props) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(error) {
    try { logClientError("react.avatar", error, { label: "lecturer-avatar" }); } catch (e) { /* logging must not throw */ }
    if (this.props.onFail) this.props.onFail();
  }
  render() { return this.state.crashed ? null : this.props.children; }
}

// props: slots {rail, inline} (refs to the two places the face may live), chatOpen, lecturerState, onFail
export default function AvatarGate({ onFail, ...rest }) {
  return (
    <Guard onFail={onFail}>
      <Suspense fallback={null}>
        <LecturerAvatar {...rest} />
      </Suspense>
    </Guard>
  );
}
