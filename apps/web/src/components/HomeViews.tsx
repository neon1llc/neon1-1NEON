// apps/web/src/components/HomeViews.tsx - Home's View menu, at the end of the greeting row: which cards
// show, with a count on the button of what hidden cards hold (red for things that need action, quiet for
// suggestions), grouped like GitHub's and Linear's dashboard pickers. Choosing a card shows or hides it;
// Arrange turns on moving and resizing. A drop-down with neon1's drawn arrow, the same on every screen.


import { Check, LayoutGrid, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";


export type Group = "attention" | "suggested" | "overview";
export interface ViewRow { id: string; title: string; group: Group; shown: boolean; critical: number; suggested: number }
const GROUPS: { key: Group; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "suggested", label: "Suggested" },
  { key: "overview", label: "Overview" },
];


/** The counts a set of cards holds, as pills: "!" marks what needs action */
function Counts({ critical, suggested, label }: { critical: number; suggested: number; label?: boolean }) {
  if (!critical && !suggested) return null;
  return (
    <span className="vm-counts">
      {critical > 0 && <span className="vm-pill crit" title={`${critical} hidden ${critical === 1 ? "thing needs" : "things need"} action`}>{critical}!</span>}
      {suggested > 0 && <span className="vm-pill sugg" title={`${suggested} hidden ${suggested === 1 ? "suggestion" : "suggestions"}`}>{suggested}</span>}
      {label && <span className="sr-only">{[critical && `${critical} need action`, suggested && `${suggested} suggested`].filter(Boolean).join(", ")} in hidden cards</span>}
    </span>
  );
}


export function HomeViews({ rows, arranging, onToggle, onArrange, onReset }: {
  rows: ViewRow[]; arranging: boolean; onToggle: (id: string) => void; onArrange: () => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const hidden = rows.filter((r) => !r.shown);
  const crit = hidden.reduce((n, r) => n + r.critical, 0);
  const sugg = hidden.reduce((n, r) => n + r.suggested, 0);

  // Esc or a press outside closes it; Esc gives focus back to the button
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    addEventListener("pointerdown", down);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", down); removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="vm" ref={box} data-open={open || undefined}>
      <button ref={btn} type="button" className="vm-btn" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <span className="arr arr-mixed" aria-hidden="true" />
        <span>View</span>
        <Counts critical={crit} suggested={sugg} label />
      </button>
      <div className="vm-panel" id={panelId} role="group" aria-label="Cards on Home" hidden={!open}>
        {GROUPS.map((g) => {
          const list = rows.filter((r) => r.group === g.key);
          if (!list.length) return null;
          return (
            <div key={g.key} className="vm-group">
              <p className="gline vm-h"><span>{g.label}</span></p>
              {list.map((r) => (
                <button key={r.id} type="button" className="vm-row" aria-pressed={r.shown} onClick={() => onToggle(r.id)}>
                  <span className="vm-tick" aria-hidden="true">{r.shown && <Check size={14} />}</span>
                  <span className="vm-t">{r.title}</span>
                  {!r.shown && <Counts critical={r.critical} suggested={r.suggested} />}
                </button>
              ))}
            </div>
          );
        })}
        <div className="vm-foot">
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={arranging} onClick={() => { onArrange(); setOpen(false); }}><LayoutGrid size={15} aria-hidden="true" /> {arranging ? "Done arranging" : "Arrange"}</button>
          <button type="button" className="linkish helper" onClick={onReset}><RotateCcw size={13} aria-hidden="true" /> Reset</button>
        </div>
      </div>
    </div>
  );
}
