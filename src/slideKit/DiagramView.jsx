import React, { useEffect, useMemo, useRef, useState } from "react";
import { fixDiagramShapes } from "./diagramGuide.js";

// Width the drawing wants, read from the SVG's viewBox. On a phone a wide diagram keeps a readable size and scrolls sideways.
const naturalHeight = (svg) => { const m = /viewBox="[-\d.]+ [-\d.]+ [\d.]+ ([\d.]+)"/.exec(svg || ""); return m ? Math.round(parseFloat(m[1])) : 0; };
const naturalWidth = (svg) => { const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+"/.exec(svg || ""); return m ? Math.round(parseFloat(m[1])) : 0; };

let initialised = false;
let counter = 0;

const THEME = {
  background: "transparent", primaryColor: "#2A3340", primaryTextColor: "#EDEFF2", primaryBorderColor: "#E8A33D",
  lineColor: "#E8A33D", secondaryColor: "#25303B", tertiaryColor: "#1E2530", textColor: "#EDEFF2",
  nodeTextColor: "#EDEFF2", edgeLabelBackground: "#1E2530", clusterBkg: "#222A35", clusterBorder: "#3A4452",
  fontSize: "17px", actorBkg: "#2A3340", actorBorder: "#E8A33D", actorTextColor: "#EDEFF2", signalColor: "#C7CCD4",
  noteBkgColor: "#3A3322", noteTextColor: "#EDEFF2", labelBoxBkgColor: "#2A3340",
  // Pie charts
  pie1: "#E8A33D", pie2: "#6FD3A4", pie3: "#6CA8F0", pie4: "#E57A8A", pie5: "#B79CF0", pie6: "#F0D56C", pie7: "#5CC8D6", pie8: "#F09A6C",
  pieTitleTextColor: "#EDEFF2", pieSectionTextColor: "#14181F", pieLegendTextColor: "#EDEFF2",
  pieStrokeColor: "#1B222C", pieOuterStrokeColor: "#3A4452", pieOpacity: "0.95",
  // Bar / line graphs (xychart-beta)
  xyChart: {
    backgroundColor: "transparent", titleColor: "#EDEFF2",
    xAxisLabelColor: "#C7CCD4", xAxisTitleColor: "#C7CCD4", xAxisTickColor: "#8890A0", xAxisLineColor: "#8890A0",
    yAxisLabelColor: "#C7CCD4", yAxisTitleColor: "#C7CCD4", yAxisTickColor: "#8890A0", yAxisLineColor: "#8890A0",
    plotColorPalette: "#E8A33D,#6FD3A4,#6CA8F0,#E57A8A,#B79CF0",
  },
  // Mind maps and timelines colour their branches from this scale
  cScale0: "#E8A33D", cScale1: "#6FD3A4", cScale2: "#6CA8F0", cScale3: "#E57A8A", cScale4: "#B79CF0", cScale5: "#F0D56C", cScale6: "#5CC8D6", cScale7: "#F09A6C",
  cScaleLabel0: "#14181F", cScaleLabel1: "#14181F", cScaleLabel2: "#14181F", cScaleLabel3: "#14181F",
  cScaleLabel4: "#14181F", cScaleLabel5: "#14181F", cScaleLabel6: "#14181F", cScaleLabel7: "#14181F",
  // Quadrant charts
  quadrant1Fill: "#2A3340", quadrant2Fill: "#25303B", quadrant3Fill: "#222A35", quadrant4Fill: "#2A3340",
  quadrant1TextFill: "#EDEFF2", quadrant2TextFill: "#EDEFF2", quadrant3TextFill: "#EDEFF2", quadrant4TextFill: "#EDEFF2",
  quadrantPointFill: "#E8A33D", quadrantPointTextFill: "#EDEFF2", quadrantTitleFill: "#EDEFF2",
  quadrantXAxisTextFill: "#C7CCD4", quadrantYAxisTextFill: "#C7CCD4",
  quadrantInternalBorderStrokeFill: "#3A4452", quadrantExternalBorderStrokeFill: "#3A4452",
};

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
export default function DiagramView({ code, caption }) {
  const [state, setState] = useState({ status: "loading", svg: "" });
  const [enlarged, setEnlarged] = useState(false);
  // shapes that mean the wrong thing (a parallelogram in a cycle) are swapped for plain boxes, in saved diagrams too
  const drawCode = useMemo(() => fixDiagramShapes(code).code, [code]);
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", svg: "" });
    (async () => {
      const id = `sk-mm-${++counter}`;
      try {
        const mermaid = (await import("mermaid")).default;
        if (!initialised) {
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: THEME, fontFamily: "Inter, system-ui, sans-serif", flowchart: { curve: "basis", htmlLabels: true, padding: 14, nodeSpacing: 44, rankSpacing: 54 } });
          initialised = true;
        }
        const { svg } = await mermaid.render(id, drawCode);
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
          <div className="sk-diagram" role="img" aria-label={caption || "Diagram"} style={{ "--sk-natural-w": `${naturalWidth(state.svg)}px` }} dangerouslySetInnerHTML={{ __html: state.svg }} />
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
