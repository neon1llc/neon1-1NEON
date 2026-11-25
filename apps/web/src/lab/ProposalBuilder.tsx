// apps/web/src/lab/ProposalBuilder.tsx - The proposal as the workspace: both sides edit lines in
// place, neon1 prices and issues, the client signs and picks how the work runs


import { useState } from "react";
import { Dialog } from "../components/ui.tsx";
import { BENCH, NEON, QUICK } from "./model.ts";
import type { LabProps } from "./WorkflowLab.tsx";


interface Line { id: number; text: string }
interface Option { id: string; title: string; price: string; time: string }
const PARTS = [
  { id: "needs", name: "What you need", add: "Add a need", hint: "e.g. one list each morning of counts that disagree" },
  { id: "learned", name: "What we learned", add: "Add a finding", hint: "e.g. each system keeps its own count" },
  { id: "must", name: "Requirements", add: "Add a requirement", hint: "e.g. nothing is retyped" },
] as const;
type PartId = (typeof PARTS)[number]["id"];

const RUNS = [
  { w: NEON, stepId: "build" },
  { w: BENCH, stepId: "open" },
  { w: QUICK, stepId: "fix" },
];


export function ProposalBuilder({ projects, save, as, open, selected }: LabProps) {
  const p = projects.find((x) => x.key === selected) ?? { key: "FLOW-9", org: "Harborline", name: "Stock reconciliation report", workflow: NEON, stepId: "propose", approved: false };
  const [lines, setLines] = useState<Record<PartId, Line[]>>({
    needs: [{ id: 1, text: "By 7 am, one short list of counts that disagree, with a likely reason" }],
    learned: [{ id: 2, text: "Each store, the web store, and the warehouse keep their own count" }],
    must: [],
  });
  const [options, setOptions] = useState<Option[]>([{ id: "A", title: "Morning exception report", price: "$4,500 fixed", time: "4 weeks" }]);
  const [chosen, setChosen] = useState("A");
  const [rev, setRev] = useState(0);
  // Any edit after issuing makes the next revision a draft again
  const [dirty, setDirty] = useState(true);
  const [signing, setSigning] = useState(false);
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState(0);
  const neon1 = as === "neon1";

  const edit = (part: PartId, id: number, text: string) => { setDirty(true); setLines({ ...lines, [part]: lines[part].map((l) => (l.id === id ? { ...l, text } : l)) }); };
  const add = (part: PartId) => { setDirty(true); setLines({ ...lines, [part]: [...lines[part], { id: Date.now(), text: "" }] }); };
  const drop = (part: PartId, id: number) => { setDirty(true); setLines({ ...lines, [part]: lines[part].filter((l) => l.id !== id) }); };
  const editOption = (id: string, patch: Partial<Option>) => { setDirty(true); setOptions(options.map((o) => (o.id === id ? { ...o, ...patch } : o))); };
  const priced = options.length > 0 && options.every((o) => o.title.trim() && o.price.trim());
  const parts = [...PARTS.map((x) => ({ id: x.id, name: x.name, ready: lines[x.id].some((l) => l.text.trim()) })), { id: "options", name: "Options and price", ready: priced }];
  const ref = `0042-r${rev}`;
  const signable = rev > 0 && !dirty;

  const sign = () => {
    const to = RUNS[run]!;
    save({ ...p, workflow: to.w, stepId: to.stepId, approved: true });
    setSigning(false);
    open(to.w.id === "bench" ? "bench" : "neon", p.key);
  };

  return (
    <div className="prop">
      <nav className="prop-outline" aria-label="Proposal sections">
        <ul>
          {parts.map((x) => (
            <li key={x.id}><a href={`#prop-${x.id}`} className={x.ready ? "ready" : ""} onClick={(e) => { e.preventDefault(); document.getElementById(`prop-${x.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><i aria-hidden="true" />{x.name}<span className="sr">{x.ready ? ", filled" : ", empty"}</span></a></li>
          ))}
        </ul>
      </nav>
      <article className="prop-doc card">
        <p className="mono small muted">{rev ? `Proposal ${ref}${dirty ? " · changed since issued" : ""}` : "Proposal draft"}</p>
        <h1>{p.name}</h1>
        <p className="muted">Prepared for {p.org}</p>
        {PARTS.map((x) => (
          <section key={x.id} id={`prop-${x.id}`}>
            <h2>{x.name}</h2>
            <ul className="prop-lines">
              {lines[x.id].map((l) => (
                <li key={l.id}>
                  <textarea rows={1} aria-label={x.name} value={l.text} placeholder={x.hint} autoFocus={!l.text} onChange={(e) => edit(x.id, l.id, e.target.value)} />
                  <button type="button" className="prop-x" aria-label={`Remove: ${l.text || "empty line"}`} onClick={() => drop(x.id, l.id)}>×</button>
                </li>
              ))}
            </ul>
            <button type="button" className="prop-add" onClick={() => add(x.id)}>+ {x.add}</button>
          </section>
        ))}
        <section id="prop-options">
          <h2>Options and price</h2>
          <div className="prop-options">
            {options.map((o) => (
              <div key={o.id} className={`prop-option${chosen === o.id ? " on" : ""}`}>
                <label className="prop-pick"><input type="radio" name="option" checked={chosen === o.id} onChange={() => setChosen(o.id)} /><span className="mono small">{rev ? `${ref}-${o.id}` : `Option ${o.id}`}</span></label>
                <input aria-label={`Option ${o.id} title`} value={o.title} placeholder="What you get" onChange={(e) => editOption(o.id, { title: e.target.value })} />
                {neon1 ? (
                  <div className="prop-price">
                    <input aria-label={`Option ${o.id} price`} value={o.price} placeholder="Price" onChange={(e) => editOption(o.id, { price: e.target.value })} />
                    <input aria-label={`Option ${o.id} timeline`} value={o.time} placeholder="How long" onChange={(e) => editOption(o.id, { time: e.target.value })} />
                  </div>
                ) : <p className="mono">{o.price ? `${o.price}${o.time ? ` · ${o.time}` : ""}` : "neon1 is pricing this"}</p>}
              </div>
            ))}
          </div>
          <button type="button" className="prop-add" onClick={() => { setDirty(true); setOptions([...options, { id: "ABCDEF"[options.length] ?? "G", title: "", price: "", time: "" }]); }}>+ {neon1 ? "Add an option" : "Suggest an option"}</button>
        </section>
      </article>
      <div className="prop-bar">
        <span className="small muted">{signable ? "Ready to sign" : neon1 ? (priced ? "Draft" : "Price every option to issue") : "Waiting on neon1 to issue"}</span>
        {neon1
          ? <button type="button" className="btn btn-primary" disabled={!priced || !dirty} onClick={() => {
              setRev(rev + 1);
              setDirty(false);
              // Issuing is the event: an undecided NEON project moves to Decide by itself
              const known = projects.find((x) => x.key === p.key);
              if (known && !known.approved && known.workflow.id === "neon" && known.stepId !== "decide") save({ ...known, stepId: "decide" });
            }}>Issue r{dirty ? rev + 1 : rev}</button>
          : <button type="button" className="btn btn-primary" disabled={!signable} onClick={() => { setTyped(""); setSigning(true); }}>Sign option {chosen}</button>}
      </div>
      <Dialog open={signing} onClose={() => setSigning(false)} label="Sign">
        <h2>Sign {ref}-{chosen}</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) sign(); }}>
          <label htmlFor="prop-name">Your full name</label>
          <input id="prop-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="name" />
          <fieldset className="prop-run">
            <legend>How should we run it?</legend>
            {RUNS.map((r, i) => (
              <label key={r.w.id} className="pick-row"><input type="radio" name="run" checked={run === i} onChange={() => setRun(i)} /><b>{r.w.name}</b><span className="small muted">{r.w.hint}</span></label>
            ))}
          </fieldset>
          <p className="small muted">Prototype: nothing is signed.</p>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={!typed.trim()}>Sign and start</button>
            <button type="button" className="btn btn-ghost" onClick={() => setSigning(false)}>Cancel</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
