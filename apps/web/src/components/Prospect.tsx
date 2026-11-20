// apps/web/src/components/Prospect.tsx - What a new (prospect) account sees on Home: a calm note, its
// expiry, the guide to the sample project, walkthrough, demo, and FAQs, and Next step (outline, then ask
// for an assessment). Also the account-level check for things that never open for it (Neo, texts).


import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { OutLink } from "./OutLink.tsx";
import { api } from "../lib/api.ts";
import { problem } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";
import { dateLabel, Dialog, useToast } from "./ui.tsx";
import { assessmentNoteProblem, listWords, outlineTip, type Outline } from "@1neon/domain";
import { BOOK_A_CALL, prospectEverywhere } from "../lib/prospect.ts";
import type { Me, OrgResponse } from "../lib/types.ts";


/** Is this person limited as a prospect in every organization they belong to? Reads the same cached
 * organization queries the pages use; `undefined` until they've all loaded, so nothing flashes away */
export function useProspectEverywhere(me: Me): boolean | undefined {
  const reads = useQueries({
    // neon1's own people are never limited, so they ask for nothing
    queries: me.operator ? [] : me.orgs.map((o) => ({ queryKey: ["org", o.id], queryFn: () => read<OrgResponse>(`/t/${o.id}`, { org: "object", access: "string" }) })),
  });
  if (me.operator) return false;
  if (reads.some((r) => r.isPending)) return undefined;
  return prospectEverywhere(reads.map((r) => r.data?.org), false);
}


/** The note on a new account's workspace: what this account is for */
export function ProspectNote() {
  return (
    <p className="notice prospect-note" role="note">
      <span>You're set up as a free account. Outline what your projects need, then ask for a free assessment under Next step. Other ways to reach neon1 are on <Link to="/contact">Contact</Link>.</span>
    </p>
  );
}


/** Home's "Get to know 1NEON": the sample project, the walkthrough, the demo, and the FAQs, for anyone
 * who hasn't put it away. Hide sets the profile's `guide`; the profile's Tutorial brings it back */
export function GuideCard({ me, prospect }: { me: Me; prospect: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (me.user.guide === "hidden") return null;
  const hide = async () => {
    setBusy(true);
    try {
      await api("/me", { method: "PATCH", body: { version: me.user.version, guide: "hidden" } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Hidden. Bring it back from your profile, under Tutorial.");
    } catch (e) {
      toast(problem(e));
      setBusy(false);
    }
  };
  return (
    <section className="card guide-card" aria-labelledby="guide-h" data-tour="get-to-know">
      <h2 className="section-h" id="guide-h">Get to know 1NEON <button type="button" className="linkish small" disabled={busy} onClick={() => void hide()}>Hide</button></h2>
      <ul className="guide-links">
        <li><Link to="/example">A sample project</Link><span className="muted small">Three made-up clients, start to finish</span></li>
        {prospect
          ? <li><a href="/1NEON/live?play=free">From free account to client</a><span className="muted small">A six-minute walkthrough</span></li>
          : <li><a href="/1NEON/live">The guided walkthrough</a><span className="muted small">Watch the portal work on its own</span></li>}
        <li><a href="/1NEON/demo/">Try the demo</a><span className="muted small">The same portal with made-up data</span></li>
        <li><Link to="/faqs">FAQs</Link><span className="muted small">Short answers to common questions</span></li>
        {prospect && <li><OutLink href="/knowledge/guides/free-accounts/">How free accounts work</OutLink><span className="muted small">Limits, keeping, and deleting</span></li>}
      </ul>
    </section>
  );
}


// Next step's answer from routes/requests.ts: the assessment request as it stands, and the open projects
type RequestProject = { key: string; name: string; outline: Outline; sentAt?: string; decided?: boolean };
type Saved = { state: "waiting" | "sent"; note: string; projects: string[]; editedAt?: string; dueAt?: string; sentAt?: string };
type Asked = { assessment?: Saved; call?: { at: string }; projects: RequestProject[]; limit: number; minNote?: number; sendAfterMinutes?: number };
const keys = (list: { key: string }[]) => listWords(list.map((p) => p.key));
// "Nov 19, 9:45 PM" in the person's own time
const whenLabel = (iso: string | undefined) => (iso ? `${dateLabel(iso)}, ${new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "");


/** One line on how far the outlining has come, by what's been written, newest first */
function outlineLine(list: RequestProject[]) {
  const done = list.filter((p) => p.outline.level === "complete");
  const begun = list.filter((p) => p.outline.level !== "complete");
  const parts = [
    begun.length ? `You've begun outlining ${begun.length === 1 ? "project" : "projects"} ${keys(begun)}.` : "",
    done.length ? `${keys(done)} ${done.length === 1 ? "is" : "are"} fully outlined.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}


/** Next step, on Home: outline projects, then ask neon1 to assess any or all of them. The request is a
 * saved draft: Request locks it, and it goes to neon1 30 minutes after the last change (routes/requests.ts),
 * so Edit can change it as often as needed and what was written last is what arrives. A project that
 * could say more gets one last look before saving. A call is the other way in */
export function NextStep({ orgId, slug, prospect }: { orgId: string; slug: string; prospect: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const asked = useQuery({ queryKey: ["requests", orgId], queryFn: () => read<Asked>(`/t/${orgId}/requests`, { projects: "array" }), refetchInterval: 60_000 });
  const saved = asked.data?.assessment;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const base = `/o/${slug}`;
  // Projects already agreed are past assessing; a client with none left to assess sees no card at all
  const list = (asked.data?.projects ?? []).filter((p) => !p.decided);
  const limit = asked.data?.limit ?? 3;
  const minNote = asked.data?.minNote ?? 20;
  const wait = asked.data?.sendAfterMinutes ?? 30;
  // Locked while a saved request waits or after it's sent, until Edit; open when there's none
  const locked = Boolean(saved) && !editing;
  // The checked projects: as saved, or as picked while editing; with nothing saved, every project not yet
  // sent, up to the limit
  const start = saved?.projects ?? list.filter((p) => !p.sentAt).slice(0, limit).map((p) => p.key);
  const chosen = (picked ?? start).filter((k) => list.some((p) => p.key === k));
  const short = list.filter((p) => chosen.includes(p.key) && p.outline.missing.length > 0);
  const noteProblem = note.trim() ? assessmentNoteProblem(note) : undefined;
  const ready = chosen.length > 0 && Boolean(note.trim()) && !noteProblem;
  const toggle = (key: string) => setPicked(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key].slice(-limit));
  const intro = prospect
    ? "The assessment is free: my read of what's written here, plausible approaches, and the first questions to settle. I read it before we talk."
    : "An assessment is my read of what's written here, plausible approaches, and the first questions to settle, before any options or prices.";
  const call = prospect
    ? <span className="muted small next-call">Rather talk first? <OutLink href={BOOK_A_CALL}>Book the free 30-minute call</OutLink></span>
    : <span className="muted small next-call">Rather talk it through? <Link to="/contact">Contact neon1</Link></span>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["requests", orgId] });

  const startEdit = () => {
    setNote(saved?.note ?? "");
    setPicked(saved?.projects);
    setError("");
    setEditing(true);
  };
  const send = async () => {
    setReview(false);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ state: string; dueAt: string }>(`/t/${orgId}/requests/assessment`, { method: "PUT", body: { note, projects: chosen } });
      setEditing(false);
      setPicked(undefined);
      await refresh();
      toast(r?.state === "sent" ? "Sent. You'll get a reply by email." : `Saved. It goes to neon1 at ${new Date(r?.dueAt ?? Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} unless you change it.`);
    } catch (e) {
      setError(problem(e));
    }
    setBusy(false);
  };
  const withdraw = async () => {
    setBusy(true);
    try {
      await api(`/t/${orgId}/requests/assessment`, { method: "DELETE" });
      await refresh();
      toast(saved?.sentAt ? "Withdrawn. What was sent before still stands." : "Withdrawn. Nothing was sent.");
    } catch (e) {
      setError(problem(e));
    }
    setBusy(false);
  };

  // A client with nothing waiting for an assessment: no card. Free accounts always see it
  if (!prospect && (!asked.data || (list.length === 0 && !saved))) return null;
  // Nothing outlined yet: the card says what comes first, dimmed until there's something to assess
  if (asked.data && list.length === 0) {
    return (
      <section className="card next-step-ask is-waiting" aria-labelledby="next-step-h" data-tour="next-step-ask">
        <h2 className="section-h" id="next-step-h">Next step</h2>
        <p>{prospect
          ? <>Outline up to {limit} <Link to={`${base}/projects`}>projects</Link>, then ask here for a free assessment of any or all of them. Take as much or as little time as you like: the clearer the needs, the more our call can cover.</>
          : <>Outline a <Link to={`${base}/projects`}>project</Link>, then ask here for an assessment of it. The clearer the needs, the more our call can cover.</>}</p>
        <p className="muted small">{intro}</p>
        <div className="actions next-actions">
          <Link className="btn btn-primary btn-sm" to={`${base}/projects/new`}>Start a project</Link>
          {call}
        </div>
      </section>
    );
  }

  // Where the request stands, in a sentence
  const status = !saved || editing ? ""
    : saved.state === "waiting"
      ? `Saved ${whenLabel(saved.editedAt)}. It goes to neon1 at ${whenLabel(saved.dueAt)}, ${wait} minutes after your last change. Edit it as often as you like until then.`
      : `Sent ${whenLabel(saved.sentAt)}. The reply comes by email. Edit it to send an update.`;

  return (
    <section className={`card next-step-ask${locked ? " is-locked" : ""}`} aria-labelledby="next-step-h" aria-busy={asked.isPending} data-tour="next-step-ask">
      <h2 className="section-h" id="next-step-h">Next step</h2>
      {list.length > 0 && <p>{outlineLine(list)}{!saved && " When you're ready for a second pair of eyes, ask for the assessment below."}</p>}
      {list.length > 0 && (
        <ul className="outline-list">
          {list.map((p) => {
            const total = p.outline.have.length + p.outline.missing.length;
            return (
              <li key={p.key}>
                <label className="outline-pick">
                  <input type="checkbox" disabled={locked || busy} checked={chosen.includes(p.key)} onChange={() => toggle(p.key)} />
                  <span><span className="mono">{p.key}</span> {p.name}</span>
                </label>
                <span className="outline-meter" role="img" aria-label={`${p.outline.have.length} of ${total} outlined`}>
                  {Array.from({ length: total }, (_, i) => <i key={i} className={i < p.outline.have.length ? "on" : ""} />)}
                </span>
                <span className="small outline-tip">
                  {p.outline.missing.length
                    ? <><Link to={`${base}/projects/${p.key}`}>Continue</Link><span className="muted"> · Tip: {outlineTip(p.outline.missing)}.</span></>
                    : <><Link to={`${base}/projects/${p.key}`}>Review</Link><span className="muted"> · Fully outlined.</span></>}
                  {p.sentAt && <span className="muted"> Last sent {dateLabel(p.sentAt)}.</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
      <form className="next-form" onSubmit={(e) => { e.preventDefault(); if (!ready || locked) return; if (short.length) setReview(true); else void send(); }}>
        <label className="field-label" htmlFor="ask-note">Final thoughts, concerns, or requirements to keep in mind as I take a look<sup className="req" aria-hidden="true">*</sup></label>
        <textarea id="ask-note" rows={3} maxLength={2000} required readOnly={locked} aria-readonly={locked} value={locked ? saved?.note ?? "" : note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(noteProblem)} aria-describedby={noteProblem ? "ask-note-e" : "ask-note-h"} placeholder="e.g. the intake form matters most; we're on Google Workspace; nothing can change during tax season" />
        {noteProblem ? <small id="ask-note-e" className="warn" role="alert">{noteProblem}</small> : !locked && <small id="ask-note-h" className="muted">At least {minNote} characters. It goes to neon1 {wait} minutes after you request it, so you can still change it.</small>}
        {status && <p className="small next-status" role="status">{status}</p>}
        <div className="actions next-actions">
          {locked
            ? <>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={startEdit}>Edit</button>
                {saved?.state === "waiting" && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void withdraw()}>Withdraw</button>}
              </>
            : <>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || busy}>{busy ? "Saving…" : saved ? "Save changes" : chosen.length > 1 ? `Request assessment of ${chosen.length} projects` : "Request assessment"}</button>
                {editing && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setEditing(false); setPicked(undefined); setError(""); }}>Cancel</button>}
              </>}
          {call}
        </div>
      </form>
      <p className="muted small">{intro}</p>
      {/* One last look when a chosen project could say more: what's still optional, and a way to add it */}
      <Dialog open={review} onClose={() => setReview(false)} label="Before it goes" className="ask">
        <h2>Before it goes</h2>
        <p className="muted small">Everything here is optional, and I can work with what's written. If you'd like to add more first:</p>
        <ul className="small review-list">
          {short.map((p) => <li key={p.key}>You can still {outlineTip(p.outline.missing, 6)} to <Link to={`${base}/projects/${p.key}`} onClick={() => setReview(false)}>{p.key}</Link>.</li>)}
        </ul>
        <p className="muted small">Either way, it waits {wait} minutes after you save, and you can edit it until then.</p>
        <div className="actions">
          <button className="btn btn-primary" type="button" onClick={() => void send()}>{saved ? "Save it anyway" : "Request it anyway"}</button>
          <button className="btn btn-ghost" type="button" onClick={() => setReview(false)} autoFocus>Keep outlining</button>
        </div>
      </Dialog>
    </section>
  );
}


// A free account's expiry, as routes/prospects.ts keepRoutes tells it
type Keep = { free: boolean; held?: boolean; deleteOn?: string; kept?: string; canKeep?: boolean };


/** On a free account's Home: the day it's deleted if nothing changes, one "Keep it 30 more days", and a
 * way to download everything first. Held accounts (neon1 is talking with them) show nothing */
export function KeepCard({ orgId, slug, canKeep: mayKeep }: { orgId: string; slug: string; canKeep: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const keep = useQuery({ queryKey: ["keep", orgId], queryFn: () => read<Keep>(`/t/${orgId}/keep`, {}) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const k = keep.data;
  if (!k?.free || k.held || !k.deleteOn) return null;
  const extend = async () => {
    setBusy(true);
    setError("");
    try {
      // 30 days past the date shown, so pressing it early never loses days (routes/prospects.ts)
      const r = await api<{ deleteOn: string }>(`/t/${orgId}/keep`, { method: "POST", body: {} });
      await qc.invalidateQueries({ queryKey: ["keep", orgId] });
      toast(r?.deleteOn ? `Kept until ${dateLabel(r.deleteOn)}.` : "Kept for 30 more days.");
    } catch (e) {
      setError(problem(e));
    }
    setBusy(false);
  };
  return (
    <section className="card keep-card" aria-labelledby="keep-h">
      <h2 className="section-h" id="keep-h">Your free account</h2>
      <p className="small">Kept until <strong>{dateLabel(k.deleteOn)}</strong>. Any change you make here keeps it longer, and I'll email you before anything is deleted.</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="actions">
        {k.canKeep && mayKeep && <button type="button" className="btn btn-sm" disabled={busy} title={`Adds 30 days to ${dateLabel(k.deleteOn)}`} onClick={() => void extend()}>{busy ? "Keeping…" : "Keep it 30 more days"}</button>}
        <Link className="btn btn-sm" to={`/o/${slug}/settings#your-data`}>Download a copy</Link>
      </div>
    </section>
  );
}
