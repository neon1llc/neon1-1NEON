// apps/web/src/lab/CustomEditor.tsx - Your own phases: rename, reorder, add, remove. Each phase
// names one board state; the rest waits under More


import { useState } from "react";
import { CUSTOM_START, STATES, stateName, stepsOf, type StateId, type Step, type Workflow } from "./model.ts";
import type { LabProps } from "./WorkflowLab.tsx";


const COPIES = [
  { id: "event", name: "Event rollout (saved)", steps: stepsOf(CUSTOM_START) },
  { id: "simple", name: "Three steps", steps: [
    { ...stepsOf(CUSTOM_START)[0]!, id: "s1", name: "Plan", state: "shaping" as const },
    { ...stepsOf(CUSTOM_START)[2]!, id: "s2", name: "Do", state: "doing" as const },
    { ...stepsOf(CUSTOM_START)[5]!, id: "s3", name: "Done", state: "done" as const },
  ] },
];


export function CustomEditor({ projects, save, open, selected }: LabProps) {
  const target = projects.find((p) => p.key === selected) ?? projects.find((p) => p.key === "NET-3")!;
  const [steps, setSteps] = useState<Step[]>(target.workflow.id === "custom" ? stepsOf(target.workflow) : stepsOf(CUSTOM_START));
  const [name, setName] = useState(CUSTOM_START.name);
  const [more, setMore] = useState<string>();
  const [kept, setKept] = useState(false);
  const set = (id: string, patch: Partial<Step>) => setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const next = steps.slice(); const [s] = next.splice(i, 1); next.splice(i + d, 0, s!); setSteps(next); };
  const add = () => {
    // A new phase goes before Done and starts as work in progress
    const s: Step = { id: `c${Date.now()}`, name: "", state: "doing", doneWhen: "", todo: [], action: "Move on", who: "neon1" };
    const at = steps.findIndex((x) => x.state === "done");
    setSteps(at < 0 ? [...steps, s] : [...steps.slice(0, at), s, ...steps.slice(at)]);
  };
  const named = steps.every((s) => s.name.trim());
  const ends = steps.some((s) => s.state === "done");
  const problem = !named ? "Name every phase." : !ends ? "One phase needs the Done state." : steps.length < 2 ? "Use at least two phases." : "";

  const use = () => {
    const w: Workflow = { id: "custom", name: name.trim() || "Custom", hint: "Your own phases", groups: steps.map((s) => ({ id: s.id, name: s.name, hint: "", steps: [s] })) };
    save({ ...target, workflow: w, stepId: steps.some((s) => s.id === target.stepId) ? target.stepId : steps[0]!.id });
    open("neon", target.key);
  };

  return (
    <div className="custom">
      <h1 className="page-title">Your phases</h1>
      <div className="custom-top">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <label>Start from
          <select defaultValue="event" onChange={(e) => setSteps(COPIES.find((c) => c.id === e.target.value)!.steps)}>
            {COPIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {/* The path as it will look, grouped by the board state each phase reports */}
      <ol className="preview" aria-label="Preview">
        {steps.map((s) => <li key={s.id}><b>{s.name || "…"}</b><small>{stateName(s.state)}</small></li>)}
      </ol>
      <ul className="phases">
        {steps.map((s, i) => (
          <li key={s.id} className="card">
            <div className="phase-row">
              <input aria-label={`Phase ${i + 1} name`} value={s.name} placeholder="Phase name" maxLength={40} autoFocus={!s.name} onChange={(e) => set(s.id, { name: e.target.value })} />
              <select aria-label={`Board state for ${s.name || `phase ${i + 1}`}`} value={s.state} onChange={(e) => set(s.id, { state: e.target.value as StateId })}>
                {STATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <span className="phase-ctl">
                <button type="button" className="chip" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`}>↑</button>
                <button type="button" className="chip" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`}>↓</button>
                <button type="button" className="chip" aria-expanded={more === s.id} onClick={() => setMore(more === s.id ? undefined : s.id)}>More</button>
              </span>
            </div>
            {more === s.id && (
              <div className="phase-more">
                <label>Done when<input value={s.doneWhen} maxLength={200} onChange={(e) => set(s.id, { doneWhen: e.target.value })} placeholder="e.g. dates confirmed" /></label>
                <label>Project limit<input inputMode="numeric" value={s.limit ?? ""} onChange={(e) => set(s.id, { limit: Number(e.target.value) || undefined })} /></label>
                <label>Usually with
                  <select value={s.who} onChange={(e) => set(s.id, { who: e.target.value as Step["who"] })}><option value="client">Client</option><option value="neon1">neon1</option></select>
                </label>
                <button type="button" className="btn btn-danger btn-sm" disabled={steps.length <= 2} onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}>Remove phase</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {steps.length < 8 && <button type="button" className="btn btn-ghost btn-sm" onClick={add}>Add a phase</button>}
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={!!problem} onClick={use}>Use for {target.key}</button>
        <button type="button" className="btn btn-ghost" disabled={!!problem} onClick={() => setKept(true)}>{kept ? "Saved for Harborline" : "Save for reuse"}</button>
        {problem && <span className="small warn" role="alert">{problem}</span>}
      </div>
    </div>
  );
}
