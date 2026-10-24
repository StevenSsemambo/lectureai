// Renders the real DetourBoard for each board kind (server-side) to catch crashes. Run via run_all.sh,
// which bundles this file with esbuild first (CSS imports are stubbed out).
import React from "react";
import { renderToString } from "react-dom/server";
import DetourBoard from "../src/detour/DetourBoard.jsx";
import { buildDetourBoard } from "../src/detour/detour.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };
const cur = { type: "code_walkthrough", title: "Loops", hasCode: true, language: "java", filename: "Loop.java", code: "for (int i = 0; i < 3; i++) {\n  System.out.println(i);\n}" };
const render = (visual, extra = {}) => {
  const b = buildDetourBoard(visual, cur);
  return renderToString(React.createElement(DetourBoard, { board: { ...b, id: 1, pinned: false, ...extra }, onBack() {}, onTogglePin() {} }));
};

let html = render({ kind: "diagram", title: "Flow of a loop", mermaid: "flowchart TD\n A[\"Start\"] --> B[\"End\"]", caption: "how it flows" });
ok(html.includes("Back to lecture") && html.includes("Keep open") && html.includes("Flow of a loop"), "diagram board renders with controls + title");
ok(!/\d+ \/ \d+/.test(html), "no slide counter on a detour board");
html = render({ kind: "slide", title: "Arrays", bullets: ["An array holds many values", "Indexes start at zero"] });
ok(html.includes("An array holds many values") && html.includes("Drawn for your question"), "mini slide renders");
html = render({ kind: "code", title: "Hello", language: "java", code: "public class Hello {\n  public static void main(String[] a) {\n    System.out.println(\"hi\");\n  }\n}" });
ok(html.includes("Hello.java") && html.includes("println"), "code board renders in the code pane");
html = render({ kind: "highlight", lines: [1, 2] });
ok(html.includes("Pointing at the code") && html.includes("Loop.java"), "highlight board renders the authored file");
ok(html.includes("own code, with the lines"), "highlight note explains it is the lecture's code");
html = render({ kind: "slide", title: "T", bullets: ["x"] }, { pinned: true });
ok(html.includes("Auto-return"), "pinned state shows the Auto-return label");

console.log(`detour render: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
