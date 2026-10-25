// Lecture-notes study guide PDF: cover + overview, contents, one clearly headed block per
// topic (in brief, key points, explanation, terms, visuals, pitfalls, self-check), then a
// module summary, review questions and glossary. Kept in its own module so it can be tested
// outside the browser; every visual is best-effort and falls back to text.
import { LANGUAGE_LABELS } from "./schema.js";
import { latexToPlain, toPdfSafe } from "./latex.js";
import { buildFunctionPlot, buildCategoryChart } from "./plot.js";
import { compileFunction } from "./mathVerify.js";
import { svgToPng, diagramToSvgLight } from "./pdfAssets.js";
import { fixDiagramShapes } from "./diagramGuide.js";
import { buildGlossary } from "./notesContent.js";

const INK = [25, 28, 32];        // body text
const SOFT = [70, 76, 84];       // captions / secondary (still clearly readable)
const GREEN = [37, 99, 68];
const GREEN_BG = [236, 245, 240];
const AMBER = [150, 90, 10];
const AMBER_BG = [253, 246, 232];
const RULE = [200, 205, 210];

const plain = (t) => latexToPlain(String(t == null ? "" : t).replace(/\$/g, ""));

export async function buildLectureNotesPdf(curriculum, sections, moduleInfo) {
  // Loaded on demand so the PDF library stays out of the app's initial download.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - 56;
  const mod = moduleInfo || {};
  const glossary = buildGlossary(sections);
  let y = 0;

  const newPage = () => { doc.addPage(); y = 62; };
  const ensure = (needed) => { if (y + needed > bottom) newPage(); };
  const setText = (font, style, size, color) => { doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color); };
  const lines = (text, width, font = "helvetica", style = "normal", size = 11) => { doc.setFont(font, style); doc.setFontSize(size); return doc.splitTextToSize(toPdfSafe(text), width); };

  // Heading for a block inside a topic. Keeps heading + first lines together.
  const label = (text, color = GREEN) => {
    y += 6;
    ensure(48);
    setText("helvetica", "bold", 9.5, color);
    doc.text(text.toUpperCase(), margin, y);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.5);
    doc.line(margin, y + 4, margin + contentWidth, y + 4);
    y += 17;
  };
  const para = (text, o = {}) => {
    const { font = "helvetica", style = "normal", size = 11, indent = 0, color = INK, lead = size * 1.45, gap = 0 } = o;
    setText(font, style, size, color);
    lines(text, contentWidth - indent, font, style, size).forEach((ln) => { ensure(lead); setText(font, style, size, color); doc.text(ln, margin + indent, y); y += lead; });
    y += gap;
  };
  const bullets = (items, o = {}) => {
    const { size = 11, color = INK, marker = "•" } = o;
    items.forEach((t) => {
      const ls = lines(plain(t), contentWidth - 18, "helvetica", "normal", size);
      ensure(size * 1.45);
      setText("helvetica", "bold", size, GREEN); doc.text(marker, margin + 4, y);
      ls.forEach((ln, k) => { if (k) ensure(size * 1.45); setText("helvetica", "normal", size, color); doc.text(ln, margin + 18, y); y += size * 1.45; });
      y += 2;
    });
  };
  // Shaded box with a heading and wrapped lines; height measured first so it never splits awkwardly.
  const box = (title, bodyLines, bg, accent, size = 10.5) => {
    const lead = size * 1.45;
    const h = 16 + bodyLines.length * lead + 10;
    ensure(Math.min(h, 160));
    let remaining = bodyLines.slice();
    let first = true;
    while (remaining.length) {
      const fit = Math.max(1, Math.floor((bottom - y - 26) / lead));
      const chunk = remaining.slice(0, fit); remaining = remaining.slice(fit);
      const bh = (first ? 16 : 6) + chunk.length * lead + 8;
      doc.setFillColor(...bg); doc.rect(margin, y, contentWidth, bh, "F");
      doc.setFillColor(...accent); doc.rect(margin, y, 3, bh, "F");
      let yy = y + (first ? 13 : 6);
      if (first && title) { setText("helvetica", "bold", 9, accent); doc.text(title.toUpperCase(), margin + 12, yy); yy += lead - 2; }
      chunk.forEach((ln) => { setText("helvetica", "normal", size, INK); doc.text(ln, margin + 12, yy); yy += lead; });
      y += bh + 8; first = false;
      if (remaining.length) newPage();
    }
  };
  const picture = async (svgPromise, maxW = contentWidth) => {
    try {
      const png = await svgToPng(await svgPromise, 3);
      const w = Math.min(maxW, Math.max(png.w, Math.min(maxW, 380)) , maxW);
      let h = (w * png.h) / png.w;
      let ww = w;
      const maxH = bottom - 62 - 30;
      if (h > maxH) { ww = (ww * maxH) / h; h = maxH; }
      ensure(h + 10);
      doc.addImage(png.dataUrl, "PNG", margin + (contentWidth - ww) / 2, y, ww, h);
      y += h + 8;
      return true;
    } catch (e) { return false; }
  };
  const table = (headers, rows) => {
    const cols = headers.length;
    const colW = contentWidth / cols;
    const size = 10, lead = 13, pad = 5;
    const cellLines = (c) => lines(plain(c), colW - pad * 2, "helvetica", "normal", size);
    const drawRow = (cells, head) => {
      const ls = cells.map(cellLines);
      const rh = Math.max(...ls.map((l) => l.length)) * lead + pad * 2 - 2;
      ensure(rh + 2);
      if (head) { doc.setFillColor(...GREEN); doc.rect(margin, y, contentWidth, rh, "F"); }
      cells.forEach((_, ci) => {
        doc.setDrawColor(...RULE); doc.setLineWidth(0.5);
        doc.rect(margin + ci * colW, y, colW, rh, "S");
        setText("helvetica", head || ci === 0 ? "bold" : "normal", size, head ? [255, 255, 255] : INK);
        ls[ci].forEach((ln, k) => doc.text(ln, margin + ci * colW + pad, y + pad + 8 + k * lead));
      });
      y += rh;
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(headers.map((_, i) => r[i] == null ? "" : r[i]), false));
    y += 10;
  };

  // ---------------------------------------------------------------- cover
  doc.setFillColor(20, 24, 28); doc.rect(0, 0, pageWidth, 170, "F");
  setText("helvetica", "bold", 13, [232, 163, 61]); doc.text("SEMAI  ·  STUDY NOTES", margin, 52);
  setText("helvetica", "bold", 24, [255, 255, 255]);
  const titleLs = lines(curriculum.unit || curriculum.title, contentWidth, "helvetica", "bold", 24);
  titleLs.slice(0, 3).forEach((ln, k) => doc.text(ln, margin, 92 + k * 30));
  setText("helvetica", "normal", 12, [220, 224, 230]);
  doc.text(toPdfSafe(`${curriculum.code} — ${curriculum.title}`), margin, 92 + Math.min(titleLs.length, 3) * 30 + 6);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  setText("helvetica", "normal", 10, [200, 204, 212]); doc.text(dateStr, pageWidth - margin, 52, { align: "right" });
  y = 205;
  if (mod.overview) { label("Module overview"); para(mod.overview, { gap: 8 }); }
  if (mod.objectives && mod.objectives.length) { label("By the end of this module you should be able to"); bullets(mod.objectives); y += 6; }
  // Contents: filled in after layout, once page numbers are known. Reserved on its own page(s).
  const contentsPage = () => { doc.addPage(); y = 62; };
  contentsPage();
  const contentsAt = doc.getNumberOfPages();
  const startPages = [];

  // ---------------------------------------------------------------- topics
  for (const [i, section] of sections.entries()) {
    const n = section.notes || {};
    const sl = section.slide;
    // New topic starts on a fresh page unless plenty of room remains.
    if (i === 0 || y > bottom - 230) newPage(); else y += 14;
    startPages.push(doc.getNumberOfPages());

    // Topic heading band
    const tLs = lines(`${i + 1}. ${plain(section.title)}`, contentWidth - 24, "helvetica", "bold", 15);
    const bandH = tLs.length * 20 + 14;
    ensure(bandH + 60);
    doc.setFillColor(...GREEN); doc.rect(margin, y, contentWidth, bandH, "F");
    tLs.forEach((ln, k) => { setText("helvetica", "bold", 15, [255, 255, 255]); doc.text(ln, margin + 12, y + 20 + k * 20); });
    y += bandH + 12;

    if (n.summary) box("In brief", lines(plain(n.summary), contentWidth - 24, "helvetica", "normal", 10.5), GREEN_BG, GREEN);
    if (n.keyPoints && n.keyPoints.length) { label("Key points"); bullets(n.keyPoints); y += 4; }
    if (n.explanation && n.explanation.length) {
      label("Explanation");
      n.explanation.forEach((p) => para(p, { gap: 6 }));
      y += 2;
    }
    if (sl) {
      if (sl.definition) {
        box(`Definition — ${plain(sl.definition.term)}`, lines(`${plain(sl.definition.text)}${sl.definition.example ? `\nExample: ${plain(sl.definition.example)}` : ""}`, contentWidth - 24, "helvetica", "normal", 10.5), GREEN_BG, GREEN);
      }
      if (sl.formulas && sl.formulas.length) {
        label("Key formulas");
        sl.formulas.forEach((f) => para(`${latexToPlain(f.latex)}${f.caption ? `    (${plain(f.caption)})` : ""}`, { font: "courier", size: 10.5, gap: 3 }));
        y += 4;
      }
      if (sl.table) { label("Comparison"); table(sl.table.headers, sl.table.rows); }
      if (sl.problem || (sl.steps && sl.steps.length)) {
        label("Worked example");
        if (sl.problem) para(`Problem: ${plain(sl.problem.text)}${sl.problem.latex ? "   " + latexToPlain(sl.problem.latex) : ""}`, { style: "bold", gap: 4 });
        (sl.steps || []).forEach((st, k) => {
          para(`Step ${k + 1}${st.label ? " — " + plain(st.label) : ""}: ${plain(st.say)}`, { indent: 6, size: 10.5 });
          if (st.latex) para(latexToPlain(st.latex), { font: "courier", size: 10.5, indent: 26, color: [20, 60, 120], gap: 2 });
        });
        if (sl.finalAnswer) para(`Answer: ${plain(sl.finalAnswer.text)}${sl.finalAnswer.latex ? "   " + latexToPlain(sl.finalAnswer.latex) : ""}`, { style: "bold", color: GREEN, gap: 4 });
        y += 4;
      }
      if (sl.diagram) {
        label("Diagram");
        const ok = await picture(diagramToSvgLight(fixDiagramShapes(sl.diagram.code).code));
        if (!ok) para(`(Diagram: ${plain(sl.diagram.caption || "see the live lecture")})`, { color: SOFT, size: 10 });
        else if (sl.diagram.caption) para(`Figure: ${plain(sl.diagram.caption)}`, { size: 10, color: SOFT, style: "italic" });
        y += 4;
      }
      if (sl.plot) {
        label("Graph");
        const makeSvg = async () => {
          if (sl.plot.kind === "function") {
            const fns = [];
            for (const e of sl.plot.expressions) fns.push({ label: e.label, f: await compileFunction(e.expr) });
            const r = buildFunctionPlot(sl.plot, fns, { light: true });
            if (!r.ok) throw new Error("empty plot");
            return r.svg;
          }
          const r = buildCategoryChart(sl.plot, { light: true });
          if (!r.ok) throw new Error("empty chart");
          return r.svg;
        };
        const ok = await picture(makeSvg(), Math.min(contentWidth, 420));
        if (!ok) para(`(Graph: ${plain(sl.plot.caption || "see the live lecture")})`, { color: SOFT, size: 10 });
        else if (sl.plot.caption) para(`Figure: ${plain(sl.plot.caption)}`, { size: 10, color: SOFT, style: "italic" });
        y += 4;
      }
      if (sl.takeaways && sl.takeaways.length) { label("Takeaways"); bullets(sl.takeaways); y += 4; }
    }
    if (section.code) {
      label(`Code${sl && sl.language ? ` (${LANGUAGE_LABELS[sl.language] || sl.language})` : ""}${sl && sl.filename ? ` — ${sl.filename}` : ""}`);
      doc.setFont("courier", "normal"); doc.setFontSize(9);
      section.code.split("\n").forEach((line, k) => {
        const pieces = doc.splitTextToSize(toPdfSafe(line).replace(/\t/g, "    ") || " ", contentWidth - 34);
        pieces.forEach((piece, pk) => {
          ensure(12);
          doc.setFillColor(243, 244, 246); doc.rect(margin, y - 9, contentWidth, 12, "F");
          if (pk === 0) { setText("courier", "normal", 9, SOFT); doc.text(String(k + 1), margin + 24, y, { align: "right" }); }
          setText("courier", "normal", 9, INK); doc.text(piece, margin + 32, y);
          y += 12;
        });
      });
      y += 8;
      if (sl && sl.expectedOutput) { label("Expected output"); para(sl.expectedOutput, { font: "courier", size: 9.5, lead: 12.5 }); }
    }
    if (n.terms && n.terms.length) {
      label("Key terms");
      n.terms.forEach((t) => {
        const ls = lines(`${plain(t.term)} — ${plain(t.meaning)}`, contentWidth - 18, "helvetica", "normal", 10.5);
        ensure(ls.length * 15);
        setText("helvetica", "bold", 10.5, GREEN); doc.text("•", margin + 4, y);
        const head = `${plain(t.term)}`;
        setText("helvetica", "bold", 10.5, INK); doc.text(toPdfSafe(head), margin + 18, y);
        const hw = doc.getTextWidth(toPdfSafe(head));
        setText("helvetica", "normal", 10.5, INK);
        const rest = doc.splitTextToSize(toPdfSafe(plain(t.meaning)), contentWidth - 18 - hw - 8);
        doc.text(" — " + (rest[0] || ""), margin + 18 + hw, y);
        y += 15;
        rest.slice(1).forEach((ln) => { ensure(15); doc.text(ln, margin + 18, y); y += 15; });
      });
      y += 4;
    }
    if (n.pitfalls && n.pitfalls.length) box("Common mistakes", n.pitfalls.flatMap((p) => lines(`•  ${plain(p)}`, contentWidth - 24, "helvetica", "normal", 10.5)), AMBER_BG, AMBER);
    if (n.review && n.review.length) { label("Check yourself"); bullets(n.review, { marker: "?" }); y += 4; }
  }

  // ---------------------------------------------------------------- module summary / review / glossary
  newPage();
  const endStart = doc.getNumberOfPages();
  doc.setFillColor(...GREEN); doc.rect(margin, y, contentWidth, 30, "F");
  setText("helvetica", "bold", 15, [255, 255, 255]); doc.text("Module summary", margin + 12, y + 20); y += 44;
  if (mod.summary && mod.summary.length) bullets(mod.summary); else para("See the key points of each topic above.", { color: SOFT });
  if (mod.review && mod.review.length) { y += 10; label("Revision questions"); bullets(mod.review.map((q, k) => `${k + 1}. ${q}`), { marker: "" }); }
  if (glossary.length) {
    y += 10; label("Glossary");
    glossary.forEach((t) => {
      const ls = lines(`${plain(t.term)} — ${plain(t.meaning)}`, contentWidth, "helvetica", "normal", 10.5);
      ensure(ls.length * 15);
      setText("helvetica", "bold", 10.5, INK); doc.text(toPdfSafe(plain(t.term)), margin, y);
      const hw = doc.getTextWidth(toPdfSafe(plain(t.term)));
      setText("helvetica", "normal", 10.5, INK);
      const rest = doc.splitTextToSize(toPdfSafe(plain(t.meaning)), contentWidth - hw - 8);
      doc.text(" — " + (rest[0] || ""), margin + hw, y); y += 15;
      rest.slice(1).forEach((ln) => { ensure(15); doc.text(ln, margin, y); y += 15; });
    });
  }

  // ---------------------------------------------------------------- contents page (now that pages are known)
  doc.setPage(contentsAt);
  y = 62;
  doc.setFillColor(...GREEN); doc.rect(margin, y, contentWidth, 30, "F");
  setText("helvetica", "bold", 15, [255, 255, 255]); doc.text("Contents", margin + 12, y + 20); y += 52;
  const toc = [...sections.map((s, i) => ({ t: `${i + 1}. ${plain(s.title)}`, p: startPages[i] })), { t: "Module summary, revision questions and glossary", p: endStart }];
  toc.forEach((e) => {
    const ls = lines(e.t, contentWidth - 40, "helvetica", "normal", 11.5);
    if (y + ls.length * 17 > bottom) return; // very long modules: the list simply stops at the page end
    setText("helvetica", "normal", 11.5, INK);
    ls.forEach((ln, k) => doc.text(ln, margin, y + k * 16));
    setText("helvetica", "bold", 11.5, GREEN); doc.text(String(e.p), margin + contentWidth, y, { align: "right" });
    doc.setDrawColor(...RULE); doc.setLineWidth(0.4); doc.line(margin, y + (ls.length - 1) * 16 + 6, margin + contentWidth, y + (ls.length - 1) * 16 + 6);
    y += ls.length * 16 + 8;
  });

  // ---------------------------------------------------------------- running header + footer
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) {
      setText("helvetica", "normal", 8.5, SOFT);
      doc.text(toPdfSafe(`${curriculum.code}  ·  ${curriculum.unit}`), margin, 34);
      doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(margin, 40, margin + contentWidth, 40);
    }
    setText("helvetica", "normal", 8.5, SOFT);
    doc.text(`SEMAI  ·  Page ${p} of ${total}`, pageWidth / 2, pageHeight - 24, { align: "center" });
  }
  return doc;
}
