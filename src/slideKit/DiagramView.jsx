import React, { useEffect, useMemo, useRef, useState } from "react";
import { fixDiagramShapes } from "./diagramGuide.js";
import { withMermaid } from "./mermaidConfig.js";

// Width the drawing wants, read from the SVG's viewBox. On a phone a wide diagram keeps a readable size and scrolls sideways.
const naturalHeight = (svg) => { const m = /viewBox="[-\d.]+ [-\d.]+ [\d.]+ ([\d.]+)"/.exec(svg || ""); return m ? Math.round(parseFloat(m[1])) : 0; };
const naturalWidth = (svg) => { const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+"/.exec(svg || ""); return m ? Math.round(parseFloat(m[1])) : 0; };

let counter = 0;



// A full-screen view of the drawing, with zoom, for diagrams too detailed to read in the slide.
function EnlargedDiagram({ svg, caption, onClose }) {
  const natural = naturalWidth(svg) || 600;
  const natH = naturalHeight(svg) || 400;
  // "Fit" shows the whole drawing on screen (never smaller than half size or bigger than double)
  const fit = () => {
    const w = (typeof window !== "undefined" ? window.innerWidth : 900) - 48;
    const h = (typeof window !== "undefined" ? window.innerHeight : 700) - 150;
    return Math.max(0.5, Math.min(2, w / natural, h / natH));
  };
  const [zoom, setZoom] = useState(fit);
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
      else if (e.key === "-") setZoom((z) => Math.max(0.4, +(z - 0.25).toFixed(2)));
    };
    document.addEventListener("keydown", onKey, true);
    const btn = ref.current && ref.current.querySelector("button");
    if (btn) btn.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div className="sk-zoom-scrim" role="dialog" aria-modal="true" aria-label={caption ? `Enlarged diagram: ${caption}` : "Enlarged diagram"} ref={ref}>
      <div className="sk-zoom-bar">
        <button type="button" className="sk-zoom-btn" onClick={onClose} aria-label="Close enlarged diagram">✕ Close</button>
        <span className="sk-zoom-tools" role="group" aria-label="Zoom">
          <button type="button" className="sk-zoom-btn" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">−</button>
          <span className="sk-zoom-level" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" className="sk-zoom-btn" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">+</button>
          <button type="button" className="sk-zoom-btn" onClick={() => setZoom(fit())}>Fit</button>
        </span>
      </div>
      <div className="sk-zoom-body">
        <div className="sk-zoom-svg" role="img" aria-label={caption || "Diagram"} style={{ width: `${Math.round(natural * zoom)}px` }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {caption && <div className="sk-zoom-caption">{caption}</div>}
    </div>
  );
}

// Mermaid is large, so it is only fetched the first time a diagram is shown.
export default function DiagramView({ code, caption, focusNodes = null }) {
  const [state, setState] = useState({ status: "loading", svg: "" });
  const [enlarged, setEnlarged] = useState(false);
  const diagRef = useRef(null);
  // the steps the lecturer is on light up; the rest are dimmed
  useEffect(() => {
    const root = diagRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll("g.node");
    const want = focusNodes && focusNodes.length ? focusNodes : null;
    nodes.forEach((n) => {
      const on = !!want && want.some((id) => (n.id || "").replace(/^.*?flowchart-/, "flowchart-").startsWith(`flowchart-${id}-`));
      n.classList.toggle("sk-node-focus", on);
    });
    root.classList.toggle("has-node-focus", !!want && !!root.querySelector("g.node.sk-node-focus"));
  }, [focusNodes, state]);
  // shapes that mean the wrong thing (a parallelogram in a cycle) are swapped for plain boxes, in saved diagrams too
  const drawCode = useMemo(() => fixDiagramShapes(code).code, [code]);
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", svg: "" });
    (async () => {
      const id = `sk-mm-${++counter}`;
      try {
        const { svg } = await withMermaid("screen", (mermaid) => mermaid.render(id, drawCode));
        if (!cancelled) setState({ status: "ok", svg });
      } catch (e) {
        const stray = document.getElementById(`d${id}`) || document.getElementById(id);
        if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
        if (!cancelled) setState({ status: "error", svg: "" });
      }
    })();
    return () => { cancelled = true; };
  }, [drawCode]);

  return (
    <figure className="sk-figure">
      {state.status === "loading" && <div className="sk-skeleton" role="status" aria-label="Drawing diagram">Drawing diagram…</div>}
      {state.status === "ok" && (
        <div className="sk-diagram-wrap">
          <button type="button" className="sk-enlarge" onClick={() => setEnlarged(true)} aria-haspopup="dialog" title="Open the diagram bigger, with zoom">⤢ Enlarge</button>
          <div className="sk-diagram" ref={diagRef} role="img" aria-label={caption || "Diagram"} style={{ "--sk-natural-w": `${naturalWidth(state.svg)}px` }} dangerouslySetInnerHTML={{ __html: state.svg }} />
        </div>
      )}
      {state.status === "error" && (
        <div className="sk-diagram-fallback" role="note">
          This diagram couldn't be drawn on this device.{caption ? ` It shows: ${caption}` : ""}
        </div>
      )}
      {caption && state.status !== "error" && <figcaption className="sk-caption">{caption}</figcaption>}
      {enlarged && state.status === "ok" && <EnlargedDiagram svg={state.svg} caption={caption} onClose={() => setEnlarged(false)} />}
    </figure>
  );
}
