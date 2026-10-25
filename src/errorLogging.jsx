// Client-side error logging (roadmap Phase 0).
//
// Goal: when something breaks in front of a dean or an investor, there is a
// record to read afterwards instead of guessing. Deliberately small:
//  - global handlers for uncaught errors + unhandled promise rejections
//  - a React error boundary so a render crash shows a recovery screen, not a blank page
//  - writes go to the write-only `client_errors` table (see supabase migration);
//    nothing can be read back through the public API
//  - privacy: no emails, no tokens, no lecture/transcript text. URL is logged
//    without query string or hash. See the Privacy Policy ("Error logs").
//  - noise control: de-duplicated and capped per page load so a render loop
//    can't flood the table.

import React from "react";
import { reportFailure } from "./toast.js";

export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

let config = null;
const seen = new Set();
let sent = 0;
const MAX_PER_PAGE_LOAD = 15;

function clip(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function safePage() {
  try {
    return clip(window.location.origin + window.location.pathname, 300);
  } catch (e) {
    return null;
  }
}

export function logClientError(kind, error, context) {
  try {
    if (!config || !config.url || !config.key) return;
    const message = clip((error && error.message) || error || "Unknown error", 1000);
    const stack = clip(error && error.stack, 4000);
    const fingerprint = `${kind}|${message}|${(stack || "").split("\n")[1] || ""}`;
    if (seen.has(fingerprint) || sent >= MAX_PER_PAGE_LOAD) return;
    seen.add(fingerprint);
    sent += 1;

    fetch(`${config.url}/rest/v1/client_errors`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        kind: clip(kind, 40),
        message,
        stack,
        page: safePage(),
        user_agent: clip(navigator.userAgent, 300),
        app_version: APP_VERSION,
        context: context || null,
      }),
    }).catch(() => {
      /* logging must never throw or recurse */
    });
  } catch (e) {
    /* logging must never throw or recurse */
  }
}

export function installErrorLogging({ url, key }) {
  config = { url, key };
  window.addEventListener("error", (event) => {
    // Ignore resource-load errors (images/fonts) that have no JS error object
    if (!event.error && !event.message) return;
    logClientError("window.error", event.error || event.message, {
      file: clip(event.filename, 200),
      line: event.lineno || null,
      col: event.colno || null,
    });
    // Safety net: an error nobody handled (e.g. inside a button click) must not fail silently.
    try {
      // Errors from browser extensions or other sites' scripts are not ours: do not alarm the person about them.
      const fromUs = !event.filename || String(event.filename).startsWith(location.origin);
      if (fromUs) reportFailure(event.error || event.message);
    } catch (e) { /* never throw from here */ }
  });
  window.addEventListener("unhandledrejection", (event) => {
    logClientError("unhandledrejection", event.reason || "Unhandled promise rejection");
    try { reportFailure(event.reason); } catch (e) { /* never throw from here */ }
  });
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    logClientError("react.render", error, {
      componentStack: clip(info && info.componentStack, 1500),
    });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#14181C",
          color: "#EDEFF2",
          fontFamily: "Inter, system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 380 }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#8890A0", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
            SEMAI hit an unexpected problem. It has been logged. Reloading usually fixes it, and your account and saved courses are not affected.
          </p>
          <button
            onClick={() => this.setState({ crashed: false })}
            style={{ background: "transparent", color: "#EDEFF2", border: "1px solid #3A4556", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginRight: 8 }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#EDEFF2", color: "#14181C", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

// A smaller safety net than the root ErrorBoundary: it contains a crash to ONE screen or ONE panel, so the
// rest of the app keeps working and the person is never forced to reload.
//   variant "screen": a whole screen failed -> message + Try again (+ optional exit button)
//   variant "panel":  one section failed     -> compact notice in its place + Try again
// `resetKey` changes (e.g. the person navigates elsewhere) clear the error automatically.
export class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    logClientError(this.props.variant === "screen" ? "react.screen" : "react.panel", error, {
      label: clip(this.props.label, 80),
      componentStack: clip(info && info.componentStack, 1500),
    });
  }

  componentDidUpdate(prevProps) {
    if (this.state.crashed && prevProps.resetKey !== this.props.resetKey) this.setState({ crashed: false });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    const retry = () => this.setState({ crashed: false });
    const btn = { background: "transparent", color: "#EDEFF2", border: "1px solid #3A4556", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
    if (this.props.variant === "screen") {
      return (
        <div role="alert" style={{ minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: "#EDEFF2", textAlign: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
          <div style={{ maxWidth: 380 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>This screen ran into a problem</h2>
            <p style={{ color: "#8890A0", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>It has been logged. Your account and saved courses are not affected.</p>
            <button type="button" onClick={retry} style={btn}>Try again</button>
            {this.props.onExit && (
              <button type="button" onClick={() => { this.props.onExit(); this.setState({ crashed: false }); }} style={{ ...btn, marginLeft: 8, background: "#EDEFF2", color: "#14181C", border: "none" }}>
                {this.props.exitLabel || "Go back"}
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div role="alert" style={{ margin: "10px 0", padding: "12px 14px", border: "1px solid #3A4556", borderRadius: 10, background: "#1A1F27", color: "#C7CCD4", fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 200px" }}>{this.props.title || "This section couldn’t be shown."} The rest of the page still works.</span>
        <button type="button" onClick={retry} style={btn}>Try again</button>
      </div>
    );
  }
}
