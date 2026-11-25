// apps/web/src/lab/BoardView.tsx - One board for every workflow: five states. Wide screens show the
// columns; phones show one state at a time


import { useState } from "react";
import { GateDialog } from "./Switch.tsx";
import { STATES, isReady, needsReason, nextStep, stateName, stepOf, stepsOf, type Project, type StateId, type Step } from "./model.ts";
import type { LabProps } from "./WorkflowLab.tsx";


export function BoardView({ projects, save, as, open }: LabProps) {
  // A phone opens on the first state that has something in it for this viewer
  const [tab, setTab] = useState<StateId>(() => (STATES.find((s) => projects.some((p) => !p.archived && stepOf(p).state === s.id && stepOf(p).who === as))?.id ?? "shaping"));
  const [only, setOnly] = useState(false);
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<StateId>();
  const [pending, setPending] = useState<{ p: Project; to: Step }>();
  const [said, setSaid] = useState("");
  const [shelf, setShelf] = useState(false);
  const waiting = (p: Project) => (stepOf(p).state === "done" ? undefined : stepOf(p).who);
  const list = projects.filter((p) => !p.archived && (!only || waiting(p) === as));
  const archived = projects.filter((p) => p.archived);

  const apply = (p: Project, to: Step) => {
    save({ ...p, stepId: to.id });
    setTab(to.state);
    setSaid("");
  };
  // A move to a state lands on that workflow's first step in it
  const move = (key: string, state: StateId) => {
    const p = projects.find((x) => x.key === key);
    if (!p || stepOf(p).state === state) return;
    const to = stepsOf(p.workflow).find((s) => s.state === state);
    if (!to) return setSaid(`${p.workflow.name} has no ${stateName(state)} step.`);
    if (needsReason(p, to)) return setPending({ p, to });
    apply(p, to);
  };

  return (
    <>
      <h1 className="page-title">Board</h1>
      <div className="chips">
        <button type="button" className={`chip${only ? " on" : ""}`} aria-pressed={only} onClick={() => setOnly(!only)}>Waiting on me</button>
        {archived.length > 0 && <button type="button" className={`chip${shelf ? " on" : ""}`} aria-pressed={shelf} onClick={() => setShelf(!shelf)}>Archived {archived.length}</button>}
      </div>
      {/* Phones: pick a state */}
      <div className="state-tabs" role="group" aria-label="Board state">
        {STATES.map((s) => (
          <button key={s.id} type="button" className={`chip${tab === s.id ? " on" : ""}`} aria-pressed={tab === s.id} onClick={() => setTab(s.id)}>{s.name} <b>{list.filter((p) => stepOf(p).state === s.id).length}</b></button>
        ))}
      </div>
      <p className="small muted board-said" role="status">{said}</p>
      <div className="board states">
        {STATES.map((s) => {
          const cards = list.filter((p) => stepOf(p).state === s.id);
          return (
            <section key={s.id} className={`col${tab === s.id ? " picked" : ""}${over === s.id ? " drop" : ""}`} aria-label={`${s.name}, ${cards.length}`}
              onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(s.id); } }}
              onDragLeave={() => setOver((o) => (o === s.id ? undefined : o))}
              onDrop={(e) => { e.preventDefault(); setOver(undefined); if (dragging) move(dragging, s.id); setDragging(undefined); }}>
              <header><h3 title={s.hint}>{s.name}</h3><span className="n">{cards.length}</span></header>
              {cards.map((p) => {
                const steps = stepsOf(p.workflow);
                const at = steps.indexOf(stepOf(p));
                const who = waiting(p);
                return (
                  <article key={p.key} className="pcard" draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.key); setDragging(p.key); }} onDragEnd={() => { setDragging(undefined); setOver(undefined); }}>
                    <div className="k"><span>{p.key}</span><span>{p.org}</span></div>
                    <button type="button" className="name" onClick={() => open(p.workflow.id === "bench" ? "bench" : "neon", p.key)}>{p.name}</button>
                    <div className="mini" aria-hidden="true">{steps.map((x, i) => <i key={x.id} className={i < at ? "done" : i === at ? "now" : ""} />)}</div>
                    <div className="meta"><span>{p.workflow.name} · {stepOf(p).name}</span></div>
                    {/* Its list is done: the move is one tap, from the board */}
                    {isReady(p) && <button type="button" className="btn btn-primary btn-sm ready-move" onClick={() => { const to = nextStep(p)!; if (needsReason(p, to)) setPending({ p, to }); else apply(p, to); }}>Move to {nextStep(p)!.name}</button>}
                    <div className="pfoot">
                      {who ? <span className={`tag${who === as ? " rec" : ""}`}>{who === as ? "Your turn" : who === "neon1" ? "neon1" : p.org}</span> : <span />}
                      <label className="move"><span className="sr">Move {p.key} to</span>
                        <select value="" onChange={(e) => e.target.value && move(p.key, e.target.value as StateId)}>
                          <option value="">Move…</option>
                          {STATES.filter((x) => x.id !== s.id && steps.some((y) => y.state === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </article>
                );
              })}
              {cards.length === 0 && <p className="muted small none">{s.hint}</p>}
            </section>
          );
        })}
      </div>
      {shelf && (
        <section aria-label="Archived">
          <h2 className="section-h">Archived</h2>
          <ul className="shelf">
            {archived.map((p) => (
              <li key={p.key}>
                <span><b>{p.name}</b><small>{p.key} · {p.org} · {p.workflow.name} · {stepOf(p).name}</small></span>
                <span className="tag">{p.archived}</span>
                <button type="button" className="chip" onClick={() => save({ ...p, archived: undefined })}>Restore</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <GateDialog open={!!pending} to={pending?.to.name ?? ""} onClose={() => setPending(undefined)} onMove={() => { if (pending) apply(pending.p, pending.to); setPending(undefined); }} />
    </>
  );
}
