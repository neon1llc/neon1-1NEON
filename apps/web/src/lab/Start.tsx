// apps/web/src/lab/Start.tsx - A new project: a name, one of three ways in, and Start


import { useState } from "react";
import { BENCH, CUSTOM_START, NEON, QUICK, stepsOf, type Workflow } from "./model.ts";
import type { LabProps, ScreenId } from "./WorkflowLab.tsx";


type WayId = "bench" | "proposal" | "neon" | "quick" | "custom";
const WAYS: { id: WayId; name: string; line: string; path: string[]; workflow: Workflow; stepId: string; screen: ScreenId }[] = [
  { id: "bench", name: "Work it out together", line: "One shared page for notes, to-dos, and files.", path: ["Open", "Done"], workflow: BENCH, stepId: "open", screen: "bench" },
  { id: "proposal", name: "Build a proposal", line: "Shape scope and price together, then sign.", path: ["Draft", "Sign", "Run it"], workflow: BENCH, stepId: "open", screen: "proposal" },
  { id: "neon", name: "Follow NEON", line: "Options, a signed decision, measured results.", path: NEON.groups.map((g) => g.name), workflow: NEON, stepId: "intake", screen: "neon" },
];
const MORE: typeof WAYS = [
  { id: "quick", name: "Quick fix", line: "A few hours, one signature.", path: ["Quote", "Fix", "Accept"], workflow: QUICK, stepId: "quote", screen: "neon" },
  { id: "custom", name: "Your own phases", line: "Start from a copy and rename.", path: ["Name them"], workflow: CUSTOM_START, stepId: stepsOf(CUSTOM_START)[0]!.id, screen: "custom" },
];


export function Start({ projects, save, as, open }: LabProps) {
  const [name, setName] = useState("");
  // A client starts loose; neon1 starts on NEON
  const [picked, setPicked] = useState<WayId>();
  const way = [...WAYS, ...MORE].find((w) => w.id === (picked ?? (as === "client" ? "bench" : "neon")))!;
  const [more, setMore] = useState(false);

  const start = () => {
    const key = `NEW-${projects.filter((p) => p.key.startsWith("NEW-")).length + 1}`;
    save({ key, org: "Harborline", name: name.trim(), workflow: way.workflow, stepId: way.stepId, approved: false });
    open(way.screen, key);
  };

  const card = (w: (typeof WAYS)[number]) => (
    <label key={w.id} className={`card way${way.id === w.id ? " on" : ""}`}>
      <input type="radio" name="way" className="sr" checked={way.id === w.id} onChange={() => setPicked(w.id)} />
      <b>{w.name}</b>
      <span className="small muted">{w.line}</span>
      <span className="way-path" aria-hidden="true">{w.path.map((s) => <i key={s}>{s}</i>)}</span>
    </label>
  );

  return (
    <form className="start" onSubmit={(e) => { e.preventDefault(); if (name.trim()) start(); }}>
      <h1 className="page-title">New project</h1>
      <label htmlFor="start-name">Name</label>
      <input id="start-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. stop retyping patient forms" autoComplete="off" />
      <fieldset>
        <legend>How should we work?</legend>
        <div className="ways">{WAYS.map(card)}</div>
        {more && <div className="ways ways-more">{MORE.map(card)}</div>}
        {!more && <button type="button" className="linkish small" onClick={() => setMore(true)}>More ways</button>}
      </fieldset>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Start</button>
        <span className="small muted">You can change this later.</span>
      </div>
    </form>
  );
}
