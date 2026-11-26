// apps/web/src/components/HomeViews.tsx - Home's View menu, at the end of the greeting row: which cards
// show, grouped like GitHub's and Linear's dashboard pickers, each with its urgent, suggested, and general
// counts. The button totals each kind, as shown out of total once a card holding some is hidden. Arrange
// turns on moving and resizing; Tidy up repacks the cards. A drop-down with neon1's drawn arrow.


import { Check, LayoutGrid, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CountPills, type Counts } from "./HomeGrid.tsx";


export type Group = "urgent" | "suggested" | "general";
export interface ViewRow { id: string; title: string; group: Group; shown: boolean; counts: Counts }
const GROUPS: { key: Group; label: string }[] = [
  { key: "urgent", label: "Urgent" },
  { key: "suggested", label: "Suggested" },
  { key: "general", label: "General" },
];
const KINDS: (keyof Counts)[] = ["urgent", "suggested", "general"];


/** The button's counts: each kind's total, or shown out of total when some are in hidden cards; a hidden
 * urgent one adds "!" */
function Totals({ rows }: { rows: ViewRow[] }) {
  const parts = KINDS.map((k) => {
    const total = rows.reduce((n, r) => n + r.counts[k], 0);
    const seen = rows.filter((r) => r.shown).reduce((n, r) => n + r.counts[k], 0);
    return { k, total, seen };
  }).filter((p) => p.total > 0);
  if (!parts.length) return null;
  const said = parts.map((p) => `${p.seen < p.total ? `${p.seen} of ${p.total}` : p.total} ${p.k === "general" ? "to know" : p.k}`).join(", ");
  return (
    <span className="cpills">
      <span className="sr-only">{said}</span>
      {parts.map((p) => <span key={p.k} className={`cpill ${p.k}${p.seen < p.total ? " part" : ""}`} aria-hidden="true" title={`${p.seen < p.total ? `${p.seen} of ${p.total} shown` : p.total}: ${p.k === "general" ? "to know" : p.k}${p.seen < p.total ? ", the rest in hidden cards" : ""}`}>{p.seen < p.total ? `${p.seen}/${p.total}` : p.total}{p.k === "urgent" && p.seen < p.total ? " !" : ""}</span>)}
    </span>
  );
}


export function HomeViews({ rows, ready = true, arranging, onToggle, onArrange, onTidy, onReset }: {
  rows: ViewRow[]; ready?: boolean; arranging: boolean; onToggle: (id: string) => void; onArrange: () => void; onTidy: () => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Which round action is open, waiting for its second press
  const [armed, setArmed] = useState<"tidy" | "reset" | null>(null);
  useEffect(() => { if (!open) setArmed(null); }, [open]);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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
        {/* Totals wait until every count has loaded, so they never show a wrong number first */}
        {ready && <Totals rows={rows} />}
      </button>
      <div className="vm-panel" id={panelId} role="group" aria-label="Cards on Home" hidden={!open}>
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
            {([["tidy", Sparkles, "Tidy up", () => { onTidy(); setOpen(false); }], ["reset", RotateCcw, "Reset", () => onReset()]] as const).map(([k, Icon, label, run]) => (
              <button key={k} type="button" className={`vm-act${armed === k ? " open" : ""}`} aria-label={armed === k ? `${label}: press again` : label} title={label}
                onClick={() => { if (armed === k) { setArmed(null); run(); } else setArmed(k); }}>
                <span className="vm-act-l"><span>{label}</span></span><Icon size={15} aria-hidden="true" />
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
