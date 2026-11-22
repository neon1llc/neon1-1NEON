// apps/web/src/components/Wordmark.tsx - "neon1" as a mark in live text: neon-sized so its lowercase meets the 1's height (neon1.tech's shared .wm rule).


/** The wordmark; `sans` for text that is Figtree in every look, otherwise it follows the look. Never size it here: the parent sets size, color and spacing */
export function Wm({ sans }: { sans?: boolean }) {
  return <span className={sans ? "wm wm-sans" : "wm"}><span className="ne">neon</span><span className="one">1</span></span>;
}
