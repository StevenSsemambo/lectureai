import { withMermaid } from "./mermaidConfig.js";
// Helpers that turn slide visuals into PNGs for the notes PDF. Every function
// is best-effort: if a browser can't rasterise something, the caller falls back
// to a text description instead of failing the whole download.

function svgSize(svg) {
  const m = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  if (m) return { w: Math.max(50, parseFloat(m[1])), h: Math.max(50, parseFloat(m[2])) };
  const w = /width="([\d.]+)/.exec(svg);
  const h = /height="([\d.]+)/.exec(svg);
  return { w: w ? parseFloat(w[1]) : 640, h: h ? parseFloat(h[1]) : 360 };
}

export function svgToPng(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    try {
      const { w, h } = svgSize(svg);
      // Mermaid emits width="100%": an image with no real pixel size rasterises at the wrong size, so force one.
      const withSize = svg.replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${w}" height="${h}">`);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ dataUrl: canvas.toDataURL("image/png"), w, h }); // throws if the canvas is tainted
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("svg load failed"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(withSize);
    } catch (e) {
      reject(e);
    }
  });
}

let counter = 0;
// Light-themed, label-as-SVG-text rendering of a Mermaid diagram (HTML labels
// would taint the canvas). The init directive is per-diagram so it can't disturb
// the dark theme used on screen.
export async function diagramToSvgLight(code) {
  const id = `sk-pdf-${++counter}`;
  // With plain SVG labels Mermaid strips a bare < or >, so write them as entity codes inside quoted labels.
  const safe = String(code).replace(/"([^"\n]*)"/g, (m, t) => `"${t.replace(/>/g, "#gt;").replace(/</g, "#lt;")}"`);
  try {
    // Light PDF settings, applied for this render only (the on-screen dark theme is restored for the next screen render).
    const { svg } = await withMermaid("pdf", (mermaid) => mermaid.render(id, safe));
    return svg;
  } finally {
    const stray = document.getElementById(`d${id}`) || document.getElementById(id);
    if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
  }
}
