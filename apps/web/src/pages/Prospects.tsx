// apps/web/src/pages/Prospects.tsx - Prospects, neon1 only: everyone who signed themselves up and isn't a
// client yet. Who they are, when they came and were last here, what they hold, and what neon1 can do:
// promote, suspend or resume, keep, delete, and pause or reopen sign-up. Changes here need a confirmed
// session, so the API's "Confirm it's you" answer opens that dialog as it does for other admin actions.


import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { useTopBar } from "../components/Shell.tsx";
import { gate, Stale } from "../components/Reads.tsx";
import { ago, dateLabel, Dialog, Empty, useAsk, useToast } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { problem, useSubmit } from "../lib/hooks.ts";
import { prospectState, stateLabel, type ProspectRow, type ProspectsResponse } from "../lib/prospect.ts";
import { read } from "../lib/reads.ts";


// The list, refreshed every 30 seconds like the board beside it
const KEY = ["prospects"];

export function Prospects() {
  const toast = useToast();
  const ask = useAsk();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => read<ProspectsResponse>("/prospects", { prospects: "array", signup: "object" }), refetchInterval: 30_000 });
  const [pending, run] = useSubmit();
  // The prospect being deleted and the name typed so far
  const [doomed, setDoomed] = useState<ProspectRow>();
  const [typed, setTyped] = useState("");
  useTopBar(<span>Potentials</span>, []);
  const wait = gate([q]);
  const data = wait ? undefined : q.data;

  // One action at a time: call, say what happened, then read the list again. A failure (including the
  // need to confirm it's you) is said in the API's own words
  const act = (done: string, call: () => Promise<unknown>) => run(async () => {
    try {
      await call();
      toast(done);
    } catch (e) {
      toast(problem(e));
    }
    await qc.invalidateQueries({ queryKey: KEY });
    // The organization list in the menu changes when a prospect becomes a client or goes
    await qc.invalidateQueries({ queryKey: ["me"] });
  });
  const post = (p: ProspectRow, verb: string) => api(`/prospects/${p.id}/${verb}`, { method: "POST", body: verb === "delete" ? { confirm: typed.trim() } : {} });

  const promote = async (p: ProspectRow) => {
    if (await ask({ title: `Make ${p.name} a client?`, body: "It gets the next client ID and every limit lifts. Nothing in its work changes.", yes: "Promote" })) void act(`${p.name} is a client`, () => post(p, "promote"));
  };
  const suspend = async (p: ProspectRow) => {
    if (await ask({ title: `Suspend ${p.name}?`, body: "Its people are turned away at once. Nothing is deleted, and you can resume it.", yes: "Suspend", danger: true })) void act(`${p.name} is suspended`, () => post(p, "suspend"));
  };
  const setSignup = async (paused: boolean) => {
    if (paused && !(await ask({ title: "Pause sign-up?", body: "The form says sign-up is paused, and nobody new can start until you reopen it.", yes: "Pause", danger: true }))) return;
    void act(paused ? "Sign-up is paused" : "Sign-up is open", () => api("/signup", { method: "PUT", body: { paused } }));
  };

  const s = data?.signup;
  return (
    <>
      <h1 className="page-title">Potentials</h1>
      <p className="lead">People who signed themselves up. They stay limited until you promote them.</p>
      <Stale reads={[q]} />
      {wait}
      {/* The sign-up switch: whether the form takes new people right now */}
      {s && (
        <div className="card signup-switch" role="group" aria-label="Sign-up">
          <span>
            <b>{s.open ? "Sign-up is open" : "Sign-up is paused"}</b>
            <small className="muted">
              {!s.configured ? " Switched off in the server's settings." : s.paused ? " You paused it." : s.open ? "" : " Full for today."}
              {s.pending > 0 && ` ${s.pending} waiting on a code.`}
            </small>
          </span>
          {s.configured && (s.paused
            ? <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => void setSignup(false)}>Reopen</button>
            : <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => void setSignup(true)}>Pause</button>)}
        </div>
      )}
      {data && data.prospects.length === 0 && <Empty text="No potentials yet." />}
      {data?.prospects.map((p) => {
        const state = prospectState(p.prospect);
        return (
          <section className="card prospect" key={p.id} aria-label={p.name}>
            <div className="prospect-head">
              {/* Into the organization itself, where neon1 can act as in any client's */}
              <h2><Link to={`/o/${p.slug}/workspace`}>{p.name}</Link> <span className="tag">{p.clientId}</span></h2>
              <span className={`tag${state === "suspended" || state === "final" ? " warn" : state === "kept" ? " client" : ""}`}>{stateLabel(p.prospect)}</span>
            </div>
            <p className="small muted prospect-people">{p.people.length ? p.people.map((x) => `${x.name || x.email} (${x.email})`).join(", ") : "No one has joined."}</p>
            <dl className="prospect-facts small">
              <div><dt>Signed up</dt><dd>{dateLabel(p.prospect.since.slice(0, 10))}</dd></div>
              <div><dt>Last active</dt><dd>{p.lastActive ? ago(p.lastActive) : "never"}</dd></div>
              <div><dt>Projects</dt><dd>{p.projects}</dd></div>
              <div><dt>Files</dt><dd>{p.files}</dd></div>
            </dl>
            <div className="prospect-actions">
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => void promote(p)} title="Promote to client">Promote</button>
              {p.prospect.suspendedAt
                ? <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => void act(`${p.name} is resumed`, () => post(p, "resume"))}>Resume</button>
                : <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => void suspend(p)}>Suspend</button>}
              {/* Keep: no check-in emails and no deletion while neon1 is talking with them elsewhere */}
              {p.prospect.heldAt
                ? <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => void act(`Stopped keeping ${p.name}`, () => post(p, "release"))}>Stop keeping</button>
                : <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => void act(`Keeping ${p.name}`, () => post(p, "hold"))}>Keep</button>}
              <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => { setTyped(""); setDoomed(p); }}>Delete</button>
            </div>
          </section>
        );
      })}
      {/* Delete is for good, so the organization's name is typed first */}
      <Dialog open={Boolean(doomed)} onClose={() => setDoomed(undefined)} label="Delete potential" className="ask">
        <h2>Delete {doomed?.name}?</h2>
        <p className="muted small">This removes the organization, its projects, and its files for good. Type its name to confirm.</p>
        <form onSubmit={(e) => { e.preventDefault(); const p = doomed; if (p && typed.trim() === p.name) { setDoomed(undefined); void act(`${p.name} is deleted`, () => post(p, "delete")); } }}>
          <label htmlFor="del-name" className="sr">Organization name</label>
          <input id="del-name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={doomed?.name} autoComplete="off" autoFocus />
          <div className="actions">
            <button className="btn btn-danger" disabled={typed.trim() !== doomed?.name}>Delete</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDoomed(undefined)}>Cancel</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
