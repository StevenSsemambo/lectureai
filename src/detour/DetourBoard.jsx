import React, { useEffect } from "react";
import "./detour.css";
import SlideView from "../slideKit/SlideView.jsx";
import CodePane from "../slideKit/CodePane.jsx";

// The temporary board the AI lecturer puts up to answer a question. It is shown INSTEAD of the lecture
// slide (which stays mounted underneath, untouched) and goes away when the answer is done, when the
// student taps "Back to lecture", or when they press Escape.
export default function DetourBoard({ board, onBack, onTogglePin }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onBack(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack]);

  const isCode = board.kind === "code" || board.kind === "highlight";
  const s = board.slide;
  return (
    <div className="detour" role="region" aria-label="Board drawn for your question">
      <div className="detour-bar">
        <span className="detour-tag" aria-live="polite">✎ {board.kind === "highlight" ? "Pointing at the code" : "Drawn for your question"}</span>
        <span className="detour-actions">
          <button type="button" className="detour-btn" aria-pressed={!!board.pinned} onClick={onTogglePin}>
            {board.pinned ? "Auto-return" : "Keep open"}
          </button>
          <button type="button" className="detour-btn primary" onClick={onBack}>Back to lecture</button>
        </span>
      </div>
      <div className="detour-body">
        {isCode ? (
          <CodePane
            code={s.code || ""}
            language={s.language}
            filename={s.filename}
            activeLines={board.highlight}
            expectedOutput={board.kind === "code" ? s.expectedOutput || "" : ""}
          />
        ) : (
          <SlideView slide={s} unit="" index={0} total={1} hideCounter />
        )}
      </div>
      <div className="detour-note">
        {board.kind === "highlight" ? "This is the lecture's own code, with the lines I'm explaining highlighted." : "Made by the AI lecturer just for your question, so it isn't part of the lecture notes. Check anything important."}
      </div>
    </div>
  );
}
