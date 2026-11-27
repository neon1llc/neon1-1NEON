// apps/web/src/lab/Path.tsx - A project on one path: groups across the top, the current step open
// below with its one action, everything else folded. Serves NEON, quick fix, and custom workflows


import { useState } from "react";
import { Dialog } from "../components/ui.tsx";
import { SwitchDialog, GateDialog } from "./Switch.tsx";
import { ArchiveDialog } from "./Switch.tsx";
import { isReady, isTicked, needsReason, stateName, stepOf, stepsOf, type Group, type Project } from "./model.ts";
import type { LabProps } from "./WorkflowLab.tsx";


// The records each NEON part holds, with made-up counts; folded until asked for
const SECTIONS: Record<string, [string, string[]][]> = {
  needs: [
    ["Questions", ["How does this work today? Tomas reconciles counts by hand.", "What would better look like? One list by 7 am."]],
    ["Requirements", ["Must: a list of differences every morning", "Should: no new tool for store leads"]],
    ["Options", ["A. Checklist and shared sheet, $600 to $840", "B. Morning exception report, $4,500 fixed", "C. Vendor stock-sync add-on, $750 fixed"]],
    ["Files", ["A week of stock exports, item names only"]],
  ],
  execute: [["Tasks", ["Nightly comparison job", "Morning email", "Exception reasons"]], ["Hours and invoices", ["Deposit invoice, $2,250"]]],
  observe: [["Measures", ["Mismatched items a week: 38, target 5", "Oversold web orders a month: 11, target 1"]], ["Checks", ["Restore tested once"]]],
  normalize: [["Handover", ["Accounts in your name", "Walkthrough done", "neon1 access reduced"]], ["Care", ["Monthly check"]]],
};


export function Path({ projects, save, as, open, selected }: LabProps) {
  // The asked-for project when it runs on a path, else the NEON sample
  const p = projects.find((x) => x.key === selected && x.workflow.id !== "bench") ?? projects.find((x) => x.key === "FLOW-1" && x.workflow.id !== "bench") ?? projects.find((x) => x.key === "SEC-1") ?? projects.find((x) => x.workflow.id !== "bench")!;
  return <PathPage key={`${p.key}-${p.workflow.id}`} p={p} save={save} as={as} open={open} />;
}


function PathPage({ p, save, as, open }: { p: Project } & Pick<LabProps, "save" | "as" | "open">) {
  const steps = stepsOf(p.workflow);
  const now = stepOf(p);
  const at = steps.indexOf(now);
  const next = steps[at + 1];
  const groupOf = (id: string) => p.workflow.groups.find((g) => g.steps.some((s) => s.id === id))!;
  const current = groupOf(now.id);
  // The group being read; it follows the project when the step moves on
  const [seen, setSeen] = useState<string>();
  const shown = p.workflow.groups.find((g) => g.id === seen) ?? current;
  const [gate, setGate] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [about, setAbout] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const ready = isReady(p);
  const tick = (item: string, on: boolean) => {
    const id = `${now.id}:${item}`;
    save({ ...p, ticked: on ? [...(p.ticked ?? []), id] : (p.ticked ?? []).filter((x) => x !== id) });
  };
  const mine = now.who === as;

  const advance = (reason?: string) => {
    if (!next) return;
    // Signing is what approves the project
    const approves = now.event === "signed";
    if (needsReason(p, next) && !approves && !reason) return setGate(true);
    setSeen(undefined);
    save({ ...p, stepId: next.id, approved: p.approved || approves });
  };

  return (
    <>
      <p className="mono small muted lab-key">{p.key} · {p.org}</p>
      <h1 className="page-title">{p.name}</h1>
      <p className="lab-meta">
        <span className="tag">{p.workflow.name}</span>
        <span className="small muted">{p.archived ? `Archived: ${p.archived}` : stateName(now.state)}</span>
        <button type="button" className="linkish small" onClick={() => setSwitching(true)}>Change workflow</button>
      </p>

      {/* The one path: it shows progress and is the navigation */}
      <ol className="path" aria-label="Project path">
        {p.workflow.groups.map((g) => (
          <PathGroup key={g.id} g={g} steps={steps.map((s) => s.id)} at={at} shown={g === shown} current={g === current} pick={() => setSeen(g.id)} />
        ))}
      </ol>

      <div className={p.workflow.id === "neon" ? "project-cols" : undefined}>
      {shown === current ? (
        <section className="now card" aria-label={`Current step: ${now.name}`}>
          <p className="eyebrow">{mine ? "Your turn" : `With ${now.who === "client" ? p.org : "neon1"}`}</p>
          <h2>{now.name}</h2>
          {now.doneWhen && <p className="small muted">Done when: {now.doneWhen.toLowerCase()}</p>}
          {now.todo.length > 0 && (
            <ul className="now-list">
              {now.todo.map((t) => (
                <li key={t}><label><input type="checkbox" checked={isTicked(p, t)} disabled={!mine} onChange={(e) => tick(t, e.target.checked)} /><span>{t}</span></label></li>
              ))}
            </ul>
          )}
          {ready && <p className="ready" role="status">All ticked. Ready for {next!.name}.</p>}
          <div className="actions">
            {/* An event step has its own button; the record it makes moves the card */}
            {next && mine && now.event && <button type="button" className="btn btn-primary" onClick={() => advance()}>{now.action}</button>}
            {next && !now.event && (ready
              ? <button type="button" className="btn btn-primary" onClick={() => advance()}>Move to {next.name}</button>
              : (mine || as === "neon1") && <button type="button" className="btn btn-ghost" onClick={() => advance()}>Move early</button>)}
            {next && <span className="small muted">{now.event ? `Moves to ${next.name} when ${now.event}` : ready ? "" : `Next: ${next.name}`}</span>}
          </div>
        </section>
      ) : (
        <section className="now card now-other" aria-label={shown.name}>
          <h2>{shown.name}</h2>
          <p className="small muted">{steps.indexOf(shown.steps[0]!) < at ? "Finished." : "Not started."}</p>
          <div className="actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeen(undefined)}>Back to {now.name}</button></div>
        </section>
      )}

      {/* The part's records, each folded to a line with its count */}
      {p.workflow.id === "neon" && (
        <div className="folds">
          {(SECTIONS[shown.id] ?? []).map(([name, rows], i) => (
            <details key={shown.id + name} className="fold n1-fold" open={shown.id === "needs" && now.id === "decide" && i === 2}>
              <summary><span>{name}</span><small>{rows.length}</small></summary>
              <ul>{rows.map((r) => <li key={r}>{r}</li>)}</ul>
            </details>
          ))}
        </div>
      )}

      </div>

      <div className="actions lab-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbout(true)}>About this project</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => open("board")}>See it on the board</button>
        <button type="button" className="linkish small" onClick={() => (p.archived ? save({ ...p, archived: undefined }) : setArchiving(true))}>{p.archived ? "Restore" : "Archive"}</button>
      </div>

      <Dialog open={about} onClose={() => setAbout(false)} label="About this project">
        <h2>About</h2>
        <p>Stock counts drift between the stores, the web store, and the warehouse.</p>
        <p><b>Done when:</b> by 7 am, one short list shows which counts disagree and why.</p>
        <div className="actions"><button type="button" className="btn btn-primary" onClick={() => setAbout(false)}>Close</button></div>
      </Dialog>
      <ArchiveDialog open={archiving} onClose={() => setArchiving(false)} onArchive={(r) => { setArchiving(false); save({ ...p, archived: r }); }} />
      <GateDialog open={gate} to={next?.name ?? ""} onClose={() => setGate(false)} onMove={(why) => { setGate(false); advance(why); }} />
      <SwitchDialog open={switching} project={p} onClose={() => setSwitching(false)} onSwitch={(n) => { setSwitching(false); save(n); open(n.workflow.id === "bench" ? "bench" : "neon", n.key); }} />
    </>
  );
}


// One part of the path, with its steps as ticks under its name
function PathGroup({ g, steps, at, shown, current, pick }: { g: Group; steps: string[]; at: number; shown: boolean; current: boolean; pick: () => void }) {
  const first = steps.indexOf(g.steps[0]!.id);
  const last = first + g.steps.length - 1;
  const state = current ? "now" : last < at ? "done" : "ahead";
  const where = current ? g.steps[at - first]!.name : "";
  return (
    <li className={`path-g ${state}${shown ? " shown" : ""}`} style={{ flexGrow: g.steps.length > 1 ? 1.4 : 1 }}>
      <button type="button" onClick={pick} aria-current={current ? "step" : undefined} aria-pressed={shown}>
        <span className="path-bar" aria-hidden="true">
          {g.steps.map((s, i) => <i key={s.id} className={first + i < at ? "done" : first + i === at ? "now" : ""} />)}
        </span>
        <b>{g.name}</b>
        <small>{state === "done" ? "Done" : where && where !== g.name ? where : g.hint}</small>
      </button>
    </li>
  );
}
