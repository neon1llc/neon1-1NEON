// apps/web/src/components/HomeViews.tsx - Home's View menu, at the end of the greeting row: which cards
// show, grouped by kind like Jira's gadget picker and Grafana's panel rows (To do, Movement, Visuals,
// Shortcuts), each with its urgent, suggested, and general counts. The button counts only what hidden cards
// hold. Arrange
// turns on moving and resizing; Tidy up repacks the cards. A drop-down with neon1's drawn arrow.


import { Check, LayoutGrid, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMenuFit, useTapOutside } from "../lib/menufit.ts";
import { CountPills, type Counts } from "./HomeGrid.tsx";
import { hiddenHeld } from "../lib/homeCounts.ts";
import { Act } from "./Act.tsx";
import { Arr } from "./ui.tsx";


export type Group = "todo" | "movement" | "visuals" | "shortcuts";
// mirror: repeats items another card shows, so it never adds to the button
export interface ViewRow { id: string; title: string; group: Group; shown: boolean; counts: Counts; mirror?: boolean }
// Grouped by what a card is, not how urgent: urgency is each card's own badges
const GROUPS: { key: Group; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "movement", label: "Movement" },
  { key: "visuals", label: "Visuals" },
  { key: "shortcuts", label: "Shortcuts" },
];


/** The button says only what Home isn't showing: what's waiting in hidden cards (urgent first, with
 * "!"), counted once. Cards that repeat another card's items don't count, and what's on screen speaks
 * for itself through its own badges */
function Totals({ rows }: { rows: ViewRow[] }) {
  const held = hiddenHeld(rows);
  if (!held) return null;
  const said = `${held.n} ${held.kind} in hidden cards`;
  return (
    <span className="cpills">
      <span className="sr-only">{said}</span>
      <span className={`cpill ${held.kind}`} aria-hidden="true" title={said}>{held.n}{held.kind === "urgent" ? " !" : ""}</span>
    </span>
  );
}


export function HomeViews({ rows, ready = true, arranging, onToggle, onArrange, onTidy, onReset }: {
  rows: ViewRow[]; ready?: boolean; arranging: boolean; onToggle: (id: string) => void; onArrange: () => void; onTidy: () => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useMenuFit(panel, open);
  useTapOutside(box, open, useCallback(() => setOpen(false), []));

  // Esc closes it and gives focus back to the button
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);

  return (
    <div className="vm" ref={box} data-open={open || undefined}>
      <button ref={btn} type="button" className="vm-btn" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <Arr mixed />
        <span>View</span>
        {/* Totals wait until every count has loaded, so they never show a wrong number first */}
        {ready && <Totals rows={rows} />}
      </button>
      <div ref={panel} className="vm-panel" id={panelId} role="group" aria-label="Cards on Home" hidden={!open}>
        {/* What the badges count, once, at the top */}
        <p className="vm-key"><span><i className="kdot urgent" aria-hidden="true" />Urgent</span><span><i className="kdot suggested" aria-hidden="true" />Suggested</span><span><i className="kdot general" aria-hidden="true" />To know</span></p>
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
                  <CountPills counts={r.counts} />
                </button>
              ))}
            </div>
          );
        })}
        <div className="vm-foot">
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={arranging} onClick={() => { onArrange(); setOpen(false); }}><LayoutGrid size={15} aria-hidden="true" /> {arranging ? "Done arranging" : "Arrange"}</button>
          {/* Round buttons that open leftward to say what they do (one open at a time); a second press does it */}
          <span className="vm-acts">
            <Act icon={Sparkles} label="Tidy up" run={() => { onTidy(); setOpen(false); }} />
            <Act icon={RotateCcw} label="Reset" run={() => onReset()} />
          </span>
        </div>
      </div>
    </div>
  );
}
