import React, { useEffect, useMemo, useState } from "react";
import { summarizeFeel } from "./feel.js";

// Lecturer view: did students feel the AI lecturer was helpful or robotic?
export default function FeelPanel({ loadRows }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    Promise.resolve(loadRows()).then((r) => { if (!cancelled) setRows(Array.isArray(r) ? r : []); }).catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [loadRows]);
  const s = useMemo(() => summarizeFeel(rows || []), [rows]);
  return (
    <div className="flag-section" aria-label="How students found the lecturer">
      <div className="flag-section-title">How students found the AI lecturer</div>
      {rows === null ? <div className="empty-hint" role="status">Loading…</div> : (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {s.lines.map((l, i) => <li key={i} className="account-text" style={{ marginBottom: 4 }}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
