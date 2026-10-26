// One place that owns Mermaid's global settings. Mermaid keeps a single global configuration, so the
// dark on-screen look must never leak into the light PDF render (it did: near-white labels on white paper).
// Every render goes through withMermaid(mode, fn), which applies the right settings and runs one render at a time.

export const APP_THEME = {
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

const SCREEN_CONFIG = { startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: APP_THEME, fontFamily: "Inter, system-ui, sans-serif", flowchart: { curve: "basis", htmlLabels: true, padding: 14, nodeSpacing: 44, rankSpacing: 54 } };

// Light, print-friendly theme: dark text on pale fills, plain SVG labels (HTML labels are dropped when the SVG is rasterised).
const INK = "#191c20", PALE = "#e6f2ec", GREEN = "#256344", LINE = "#3f4650";
export const PDF_THEME = {
  background: "#ffffff", primaryColor: PALE, primaryTextColor: INK, primaryBorderColor: GREEN,
  lineColor: LINE, secondaryColor: "#fdf3df", tertiaryColor: "#eef1f4", textColor: INK,
  nodeTextColor: INK, edgeLabelBackground: "#ffffff", clusterBkg: "#f3f6f4", clusterBorder: "#9db8aa",
  fontSize: "16px", actorBkg: PALE, actorBorder: GREEN, actorTextColor: INK, actorLineColor: "#9aa3ad", signalColor: LINE, signalTextColor: INK,
  noteBkgColor: "#fdf3df", noteTextColor: INK, noteBorderColor: "#c9a24a", labelBoxBkgColor: PALE, labelBoxBorderColor: GREEN, labelTextColor: INK, loopTextColor: INK,
  titleColor: INK, labelColor: INK, classText: INK, mainBkg: PALE, nodeBorder: GREEN, border2: GREEN,
  pie1: "#3f8f6b", pie2: "#e8a33d", pie3: "#4f86c6", pie4: "#d4647a", pie5: "#8f77c9", pie6: "#d8b93c", pie7: "#3fa9b8", pie8: "#d9803f",
  pieTitleTextColor: INK, pieSectionTextColor: "#ffffff", pieLegendTextColor: INK, pieStrokeColor: "#ffffff", pieOuterStrokeColor: "#9aa3ad", pieOpacity: "1",
  xyChart: {
    backgroundColor: "#ffffff", titleColor: INK,
    xAxisLabelColor: INK, xAxisTitleColor: INK, xAxisTickColor: LINE, xAxisLineColor: LINE,
    yAxisLabelColor: INK, yAxisTitleColor: INK, yAxisTickColor: LINE, yAxisLineColor: LINE,
    plotColorPalette: "#3f8f6b,#e8a33d,#4f86c6,#d4647a,#8f77c9",
  },
  cScale0: "#3f8f6b", cScale1: "#e8a33d", cScale2: "#4f86c6", cScale3: "#d4647a", cScale4: "#8f77c9", cScale5: "#d8b93c", cScale6: "#3fa9b8", cScale7: "#d9803f",
  cScaleLabel0: "#ffffff", cScaleLabel1: INK, cScaleLabel2: "#ffffff", cScaleLabel3: "#ffffff", cScaleLabel4: "#ffffff", cScaleLabel5: INK, cScaleLabel6: INK, cScaleLabel7: INK,
  quadrant1Fill: PALE, quadrant2Fill: "#f3f6f4", quadrant3Fill: "#eef1f4", quadrant4Fill: PALE,
  quadrant1TextFill: INK, quadrant2TextFill: INK, quadrant3TextFill: INK, quadrant4TextFill: INK,
  quadrantPointFill: GREEN, quadrantPointTextFill: INK, quadrantTitleFill: INK,
  quadrantXAxisTextFill: INK, quadrantYAxisTextFill: INK,
  quadrantInternalBorderStrokeFill: "#9db8aa", quadrantExternalBorderStrokeFill: "#9db8aa",
};
const PDF_CONFIG = {
  startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: PDF_THEME, fontFamily: "Helvetica, Arial, sans-serif", htmlLabels: false,
  flowchart: { htmlLabels: false, useMaxWidth: false, curve: "basis", padding: 14 }, state: { htmlLabels: false }, class: { htmlLabels: false },
};

let applied = null;
let chain = Promise.resolve();

// Runs fn(mermaid) with the settings for "screen" or "pdf" applied, one render at a time.
export function withMermaid(mode, fn) {
  const run = chain.then(async () => {
    const mermaid = (await import("mermaid")).default;
    if (applied !== mode) {
      mermaid.initialize(mode === "pdf" ? PDF_CONFIG : SCREEN_CONFIG);
      applied = mode;
    }
    return fn(mermaid);
  });
  chain = run.catch(() => {});
  return run;
}
