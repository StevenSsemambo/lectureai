// Choosing the right picture, and drawing it with shapes that mean what they say.
//
// Two jobs:
//  1. DIAGRAM_CHOICE_GUIDE: text added to every prompt that asks the AI for a diagram, so it picks the diagram TYPE by
//     the idea being explained (a cycle is drawn as a ring, a hierarchy as a tree, a conversation as a sequence diagram...)
//     and uses flowchart shapes only for what they stand for (a parallelogram is for input/output, nothing else).
//  2. fixDiagramShapes: a safety net applied whenever a diagram is drawn, including diagrams already saved in courses.
//     It swaps a shape that has the wrong meaning for a plain rounded box. It never changes the wording or the arrows.

export const DIAGRAM_CHOICE_GUIDE = `CHOOSING THE DIAGRAM: pick the type from the idea being explained, never from what looks varied.
 - A cycle or repeating process (water cycle, life cycle, feedback loop, a loop running again and again, a pipeline that returns to its start): flowchart in a ring. Every step is a rounded node A("Step"), the arrows follow the order, and the LAST arrow goes back to the FIRST step. Label the arrows when the change between steps is not obvious. No input/output shapes, no decision diamond unless there really is a yes/no question.
 - Steps of an algorithm or program: flowchart. Start and end are stadium nodes A(["Start"]); steps are rectangles; a real yes/no question is a diamond with -->|Yes| and -->|No| edges (a loop is a diamond whose "Yes" arrow returns to an earlier step); a parallelogram is ONLY for reading input or printing/showing output.
 - A hierarchy, classification or family tree (types of something, inheritance, an organisation): top-down tree, flowchart TD with rectangles (or classDiagram for classes and inheritance).
 - Messages passing between people or systems over time (login, a request and its reply, a protocol): sequenceDiagram.
 - Something that moves between named states (order status, a traffic light, an object's life): stateDiagram-v2.
 - Data tables and how they relate: erDiagram. Parts of a program and how they connect: classDiagram, or a flowchart with a subgraph per layer.
 - A network of connected things (graph theory, computer networks): graph LR with circle nodes A(("Name")) and plain lines.
 - Numbers to compare or track: bar/line (xychart-beta) or pie. Events in time order: timeline. A topic and its sub-topics: mindmap.
 SHAPES MUST MEAN SOMETHING: use a shape only for its meaning, and plain rectangles or rounded nodes when nothing special is going on. Parallelogram = input/output only. Diamond = a yes/no decision only. Cylinder = stored data only. Stadium = start/end only. Never choose a shape to add variety. Keep labels short (at most about five words) so they stay readable.`;

const IO_WORDS = /\b(input|output|read|reads|reading|print|prints|printing|display|displays|show|shows|enter|enters|scan|scans|prompt|prompts|write|writes|keyboard|screen|console|user|file|send|sends|receive|receives|request|response|get|gets|return|returns|result|results|accept|accepts|ask|asks|report)\b/i;
const STORE_WORDS = /\b(data|database|db|store|stores|storage|file|files|disk|cache|table|tables|queue|repository|repo|log|logs|memory|records?|bucket)\b/i;
const DECISION_WORDS = /\b(if|whether|is|are|does|do|did|has|have|can|could|should|equal|equals|greater|less|true|false|valid|exists|empty|done|more|any|yes|no|check|checks|match|matches|found|enough|ready)\b/i;
const MANUAL_WORDS = /\b(manual|manually|by hand)\b/i;

const isFlow = (code) => /^\s*(flowchart|graph)\b/i.test(String(code || "").trim());

// -> { code, changes: string[] }   (changes lists what was swapped, for tests and debugging)
export function fixDiagramShapes(code) {
  const src = String(code || "");
  if (!isFlow(src)) return { code: src, changes: [] };
  const changes = [];
  let out = src;

  // parallelograms [/x/] [\x\] and trapezoids [/x\] [\x/]
  out = out.replace(/(\b[A-Za-z_][\w]*)\[(\/|\\)\s*("?)([^\]"]*?)\3\s*(\/|\\)\]/g, (m, id, open, _q, label, close) => {
    const isParallelogram = (open === "/" && close === "/") || (open === "\\" && close === "\\");
    const keep = isParallelogram ? IO_WORDS.test(label) : MANUAL_WORDS.test(label);
    if (keep) return m;
    changes.push(`${isParallelogram ? "parallelogram" : "trapezoid"} "${label}" -> rounded`);
    return `${id}("${label.replace(/"/g, "'")}")`;
  });

  // cylinders [("x")] used for something that is not stored data
  out = out.replace(/(\b[A-Za-z_][\w]*)\[\(\s*("?)([^")]*?)\2\s*\)\]/g, (m, id, _q, label) => {
    if (STORE_WORDS.test(label)) return m;
    changes.push(`cylinder "${label}" -> rounded`);
    return `${id}("${label.replace(/"/g, "'")}")`;
  });

  // diamonds {x} that are not decisions: no question, no decision words, and no yes/no labelled edges anywhere
  const hasYesNoEdges = /\|\s*(yes|no|true|false|y|n)\s*\|/i.test(out);
  out = out.replace(/(\b[A-Za-z_][\w]*)\{(?!\{)\s*("?)([^{}"]*?)\2\s*\}(?!\})/g, (m, id, _q, label) => {
    if (/\?/.test(label) || DECISION_WORDS.test(label) || hasYesNoEdges) return m;
    changes.push(`diamond "${label}" -> rounded`);
    return `${id}("${label.replace(/"/g, "'")}")`;
  });

  return { code: out, changes };
}
