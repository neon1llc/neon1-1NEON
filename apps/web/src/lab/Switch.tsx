// apps/web/src/lab/Switch.tsx - Dialogs: changing a workflow, the one approval gate, and archiving


import { useEffect, useState } from "react";
import { Dialog } from "../components/ui.tsx";
import { BENCH, CUSTOM_START, NEON, QUICK, REASONS, landing, stepOf, stepsOf, type Project, type Reason, type WorkflowId } from "./model.ts";


export const ALL = [NEON, BENCH, QUICK, CUSTOM_START];


// Pick a workflow, see where the project lands, change the landing step if wanted
export function SwitchDialog({ open, project, onClose, onSwitch }: { open: boolean; project: Project; onClose: () => void; onSwitch: (p: Project) => void }) {
  const [to, setTo] = useState<WorkflowId>();
  const [step, setStep] = useState("");
  useEffect(() => { if (open) { setTo(undefined); setStep(""); } }, [open]);
  const target = ALL.find((w) => w.id === to);
  const land = target ? (stepsOf(target).find((s) => s.id === step) ?? landing(project, target)) : undefined;
  return (
    <Dialog open={open} onClose={onClose} label="Change workflow">
      <h2>Change workflow</h2>
      <div className="pick-list" role="radiogroup" aria-label="Workflow">
        {ALL.filter((w) => w.id !== project.workflow.id).map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={to === w.id} className="pick-row" onClick={() => { setTo(w.id); setStep(""); }}>
            <b>{w.name}</b><span className="small muted">{w.hint}</span>
          </button>
        ))}
      </div>
      {target && land && (
        <div className="map">
          <span className="tag">{project.workflow.name} · {stepOf(project).name}</span>
          <span aria-hidden="true">→</span>
          <label><span className="sr">Lands on</span>
            <select value={land.id} onChange={(e) => setStep(e.target.value)}>
              {stepsOf(target).map((s) => <option key={s.id} value={s.id}>{target.name} · {s.name}</option>)}
            </select>
          </label>
          <p className="small muted">Records, files, and signatures stay.</p>
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={!target} onClick={() => target && land && onSwitch({ ...project, workflow: target, stepId: land.id })}>Change</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}


export function GateDialog({ open, to, onClose, onMove }: { open: boolean; to: string; onClose: () => void; onMove: (reason: string) => void }) {
  const [why, setWhy] = useState("");
  useEffect(() => { if (open) setWhy(""); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} label="Reason needed">
      <h2>Start without an approval?</h2>
      <form onSubmit={(e) => { e.preventDefault(); if (why.trim()) onMove(why.trim()); }}>
        <label htmlFor="gate-why">Why move to {to}?</label>
        <textarea id="gate-why" rows={3} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} required />
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={!why.trim()}>Move</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}


// One tap on why. The project leaves the board and keeps everything
export function ArchiveDialog({ open, onClose, onArchive }: { open: boolean; onClose: () => void; onArchive: (r: Reason) => void }) {
  return (
    <Dialog open={open} onClose={onClose} label="Archive">
      <h2>Archive as</h2>
      <div className="actions">
        {REASONS.map((r) => <button key={r} type="button" className="btn btn-ghost" onClick={() => onArchive(r)}>{r}</button>)}
        <button type="button" className="linkish" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}
