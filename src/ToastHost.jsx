import React, { useEffect, useState } from "react";
import { subscribe } from "./toast.js";

// Shows up to three messages at the bottom of the screen. It sits outside the app's error boundary, so it
// keeps working even if the app itself crashes.
export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const timers = new Map();
    const off = subscribe((t) => {
      setToasts((list) => [...list.slice(-2), t]);
      timers.set(t.id, setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.ttl));
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (!toasts.length) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{ position: "fixed", left: 0, right: 0, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 12px", zIndex: 2147483000, pointerEvents: "none" }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          style={{ pointerEvents: "auto", maxWidth: 420, width: "100%", display: "flex", alignItems: "center", gap: 10, background: "#1A1F27", color: "#EDEFF2", border: "1px solid #3A4556", borderLeft: `4px solid ${t.kind === "error" ? "#E8A33D" : "#4C9F70"}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.4, boxShadow: "0 6px 24px rgba(0,0,0,.45)", fontFamily: "Inter, system-ui, sans-serif" }}
        >
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
            style={{ background: "transparent", border: 0, color: "#8890A0", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 2 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
