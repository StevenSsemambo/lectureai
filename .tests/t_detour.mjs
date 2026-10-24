// Tests for src/detour/detour.js (run: node .tests/t_detour.mjs)
import { parseAnswerWithVisual, buildDetourBoard, checkBoard, cleanMermaid, holdMs, detoursEnabled, boardContext, VISUAL_PROMPT } from "../src/detour/detour.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };
const FB = "fallback line";

// ---- parser: backwards compatible with the old {confidence, answer} shape ----
let r = parseAnswerWithVisual('{"confidence":"high","answer":"Because it is stored."}', FB);
ok(r.answer === "Because it is stored." && r.confidence === "high" && r.visual === null, "plain answer unchanged");
r = parseAnswerWithVisual('```json\n{"confidence":"low","answer":"Not sure."}\n```', FB);
ok(r.confidence === "low" && r.answer === "Not sure.", "fenced json + low confidence");
r = parseAnswerWithVisual("Just plain text, no JSON.", FB);
ok(r.answer === "Just plain text, no JSON." && r.visual === null, "plain text kept");
r = parseAnswerWithVisual("", FB);
ok(r.answer === FB, "empty -> fallback");
r = parseAnswerWithVisual(null, FB);
ok(r.answer === FB, "null -> fallback");

// ---- parser: visual accepted / rejected ----
r = parseAnswerWithVisual('{"confidence":"high","answer":"Look.","visual":{"kind":"diagram","title":"T","mermaid":"flowchart TD\\nA-->B"}}', FB);
ok(r.visual && r.visual.kind === "diagram", "diagram visual parsed");
r = parseAnswerWithVisual('{"confidence":"high","answer":"Look.","visual":{"kind":"video","url":"x"}}', FB);
ok(r.visual === null && r.answer === "Look.", "unknown visual kind ignored, answer kept");
r = parseAnswerWithVisual('{"confidence":"high","answer":"Look.","visual":"nope"}', FB);
ok(r.visual === null, "non-object visual ignored");

// ---- parser: truncated JSON never gets spoken as raw JSON ----
const cut = '{"confidence":"high","answer":"A stack is last in, first out.","visual":{"kind":"diagram","title":"Stack","mermaid":"flowchart TD\\n A[\\"Pu';
r = parseAnswerWithVisual(cut, FB);
ok(r.answer === "A stack is last in, first out." && r.visual === null, "truncated json: answer rescued, visual dropped: " + JSON.stringify(r));
r = parseAnswerWithVisual('{"confidence":"high","ans', FB);
ok(r.answer === FB, "hopelessly truncated -> fallback, not raw json");

// ---- board builder ----
const cur = { type: "code_walkthrough", title: "Loops", hasCode: true, language: "java", filename: "Loop.java", code: "for (int i = 0; i < 3; i++) {\n  System.out.println(i);\n}\n// end" };
let b = buildDetourBoard({ kind: "diagram", title: "Flow", mermaid: "flowchart TD\n  A[\"Start\"] --> B[\"End\"]", caption: "cap" }, cur);
ok(b && b.kind === "diagram" && b.slide.diagram.code.startsWith("flowchart TD"), "diagram board built");
ok(buildDetourBoard({ kind: "diagram", mermaid: "x" }, cur) === null, "one-line mermaid rejected");
ok(buildDetourBoard({ kind: "diagram", mermaid: "flowchart TD\n" + "A-->B\n".repeat(600) }, cur) === null, "oversized mermaid rejected");
b = buildDetourBoard({ kind: "diagram", mermaid: "```mermaid\nflowchart TD\n A-->B\n click A callback\n```" }, cur);
ok(b && !/click/.test(b.slide.diagram.code) && !/```/.test(b.slide.diagram.code), "fences + click directives stripped");
b = buildDetourBoard({ kind: "diagram", mermaid: "flowchart TD\n A-->B\n<script>alert(1)</script>" }, cur);
ok(b && !/<script/i.test(b.slide.diagram.code), "script tags stripped from diagram");

b = buildDetourBoard({ kind: "slide", title: "Arrays", bullets: ["one", "two", "", "three", "4", "5", "6", "7", "8"] }, cur);
ok(b && b.kind === "slide" && b.slide.bullets.length === 6, "slide bullets capped at 6");
ok(buildDetourBoard({ kind: "slide", title: "Empty", bullets: [] }, cur) === null, "slide with no bullets rejected");

b = buildDetourBoard({ kind: "code", title: "Hello", language: "java", code: "public class Hello {\n  public static void main(String[] a) {\n    System.out.println(\"hi\");\n  }\n}" }, cur);
ok(b && b.kind === "code" && b.slide.hasCode && b.slide.language === "java" && /\.java$/.test(b.slide.filename), "code board built with java filename");
ok(buildDetourBoard({ kind: "code", code: "x\n".repeat(100) }, cur) === null, "too-long code rejected");
ok(buildDetourBoard({ kind: "code", code: "   " }, cur) === null, "blank code rejected");

b = buildDetourBoard({ kind: "highlight", lines: [2, 3] }, cur);
ok(b && b.kind === "highlight" && b.highlight[0] === 2 && b.highlight[1] === 3, "highlight lines");
ok(b.slide.code === cur.code, "highlight shows the AUTHORED code verbatim");
b = buildDetourBoard({ kind: "highlight", lines: [3, 99] }, cur);
ok(b && b.highlight[1] === 4, "highlight end clamped to last line");
b = buildDetourBoard({ kind: "highlight", lines: [2] }, cur);
ok(b && b.highlight[0] === 2 && b.highlight[1] === 2, "single-line highlight");
ok(buildDetourBoard({ kind: "highlight", lines: [50, 60] }, cur) === null, "highlight past the end rejected");
ok(buildDetourBoard({ kind: "highlight", lines: [1, 2] }, { type: "concept", title: "x", hasCode: false }) === null, "highlight on a slide without code rejected");
ok(buildDetourBoard(null, cur) === null && buildDetourBoard("str", cur) === null && buildDetourBoard({}, cur) === null, "garbage visuals rejected");
const frozen = JSON.parse(JSON.stringify(cur));
buildDetourBoard({ kind: "highlight", lines: [1, 2] }, cur);
ok(JSON.stringify(cur) === JSON.stringify(frozen), "building a board never mutates the lecture slide");

// ---- checkBoard (mermaid parser injected so this runs without a browser) ----
const dia = buildDetourBoard({ kind: "diagram", title: "D", mermaid: "flowchart TD\n A-->B" }, cur);
let c = await checkBoard(dia, { checkMermaid: async () => null });
ok(c.ok && c.board, "valid diagram passes");
c = await checkBoard(dia, { checkMermaid: async () => "Parse error on line 2" });
ok(!c.ok && c.issues.length === 1 && /invalid Mermaid/.test(c.issues[0]), "invalid diagram fails with an issue");
c = await checkBoard(buildDetourBoard({ kind: "code", language: "c", code: "int main(){\n return 0;\n}" }, cur));
ok(c.ok, "code boards pass without the diagram checker");
c = await checkBoard(null);
ok(!c.ok && c.board === null, "null board fails safely");

// ---- helpers ----
ok(cleanMermaid("```mermaid\nA-->B\n```") === "A-->B", "cleanMermaid strips fences");
ok(holdMs("diagram") > 0 && holdMs("code") >= holdMs("diagram"), "hold times sane");
ok(detoursEnabled({ getItem: () => "off" }) === false, "kill switch off");
ok(detoursEnabled({ getItem: () => null }) === true, "default on");
ok(detoursEnabled({ getItem: () => { throw new Error("blocked"); } }) === true, "storage errors default to on");
ok(/highlight/.test(VISUAL_PROMPT) && /answer.*BEFORE|visual/.test(VISUAL_PROMPT), "prompt documents the shapes");
ok(boardContext(dia).includes("diagram") && boardContext(null) === "", "boardContext");

console.log(`detour: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
