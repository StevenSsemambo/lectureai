import React, { useEffect, useMemo, useState } from "react";
import { analyzeInterventions, summarizeInterventions } from "./interventions.js";

const pct = (v) => (v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`);

// Lecturer view: after students missed a question, which kinds of extra help were followed by a right answer?
// loadRows() resolves to learning_events rows for the course.
export default function TeachingEffectPanel({ loadRows }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null); setError("");
    Promise.resolve(loadRows())
      .then((r) => { if (!cancelled) setRows(Array.isArray(r) ? r : []); })
      .catch((e) => { if (!cancelled) { setError(String((e && e.message) || "Couldn't load this.")); setRows([]); } });
    return () => { cancelled = true; };
  }, [loadRows]);

  const result = useMemo(() => analyzeInterventions(rows || []), [rows]);
  const lines = useMemo(() => summarizeInterventions(result), [result]);

  return (
    <div className="flag-section" aria-label="What helped students recover">
      <div className="flag-section-title">What helped students recover</div>
      <p className="account-text" style={{ marginTop: 0 }}>
        After a student gets a quiz question wrong, SEMAI may re-explain, remind them of an earlier topic, or give another example. This shows how often the next question on the same concept was then answered correctly.
      </p>
      {rows === null && <div className="empty-hint" role="status">Loading…</div>}
      {error && <div className="empty-hint" role="alert">{error}</div>}
      {rows !== null && !error && (
        <>
          {result.groups.length > 0 && (
            <div className="sk-table-wrap">
              <table className="sk-table" style={{ fontSize: 12.5 }}>
                <thead><tr><th scope="col">Kind of help</th><th scope="col">Cases</th><th scope="col">Got the next one right</th></tr></thead>
                <tbody>
                  {result.groups.map((g) => (
                    <tr key={g.method}>
                      <th scope="row">{g.label}</th>
                      <td>{g.n}</td>
                      <td>{g.enough ? `${pct(g.rate)} (likely ${pct(g.low)}–${pct(g.high)})` : "too few cases"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
            {lines.map((l, i) => <li key={i} className="account-text" style={{ marginBottom: 4 }}>{l}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
