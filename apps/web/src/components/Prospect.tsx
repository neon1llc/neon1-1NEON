// apps/web/src/components/Prospect.tsx - What a new (prospect) account sees on Home: a calm note, its
// expiry, the guide to the sample project, walkthrough, demo, and FAQs, and Next step (outline, then ask
// for an assessment). Also the account-level check for things that never open for it (Neo, texts).


import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { OutLink } from "./OutLink.tsx";
import { api, BASE_PATH, HttpError } from "../lib/api.ts";
import { problem } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";
import { dateLabel, Dialog, useToast } from "./ui.tsx";
import { assessmentNoteProblem, listWords, outlineTip, requestAgainAt, requestOpen, type Outline } from "@1neon/domain";
import { askBlocker, BOOK_A_CALL, prospectEverywhere } from "../lib/prospect.ts";
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
      <span>You're set up as a free account. Other ways to reach neon1 are on <Link to="/contact">Contact</Link>.</span>
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
        <li><OutLink href={`${BASE_PATH}/example`}>A sample project</OutLink><span className="muted small">Three made-up clients, start to finish</span></li>
        {prospect
          ? <li><OutLink href="/1NEON/live?play=free">From free account to client</OutLink><span className="muted small">A six-minute walkthrough</span></li>
          : <li><OutLink href="/1NEON/live">The guided walkthrough</OutLink><span className="muted small">Watch the portal work on its own</span></li>}
        <li><OutLink href="/1NEON/demo/">Try the demo</OutLink><span className="muted small">The same portal with made-up data</span></li>
        <li><OutLink href={`${BASE_PATH}/faqs`}>FAQs</OutLink><span className="muted small">Short answers to common questions</span></li>
        {prospect && <li><OutLink href="/knowledge/guides/free-accounts/">How free accounts work</OutLink><span className="muted small">Limits, keeping, and deleting</span></li>}
      </ul>
    </section>
  );
}


// Next step's answer from routes/requests.ts: the assessment request as saved, when a call was last asked,
// and the open projects
type RequestProject = { key: string; name: string; outline: Outline; sentAt?: string; decided?: boolean };
type Saved = { state: "waiting" | "sent"; note: string; projects: string[]; editedAt?: string; dueAt?: string; sentAt?: string };
type Asked = { assessment?: Saved; call?: { at: string; again: string }; projects: RequestProject[]; limit: number; minNote?: number; sendAfterMinutes?: number };
const keys = (list: { key: string }[]) => listWords(list.map((p) => p.key));
const NOTE_MAX = 2000;
// "Nov 19, 9:45 PM" in the person's own time
const whenLabel = (iso: string | undefined) => (iso ? `${dateLabel(iso)}, ${new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "");


/** Next step, on Home: outline projects, then ask neon1 to assess any or all of them. The note is required,
 * the projects are chosen by checkbox, and the request opens a last look that lists what could still be
 * added. The request is a saved draft: submitting locks it, and it goes to neon1 30 minutes after the last
 * change and never within an hour of the last email (routes/requests.ts), so Edit can change it as often as
 * needed and what was written last is what arrives. A call is the other way in. A free account sees how far
 * each project is outlined; a client keeps the note, the projects, and the button */
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
  const [callOpen, setCallOpen] = useState(false);
  const [callNote, setCallNote] = useState("");
  // One key per attempt at a call request: pressing again after a lost reply is the same request, not a second
  const callKey = useRef("");
  const base = `/o/${slug}`;
  // Projects already agreed are past assessing; a client with none left to assess sees no card at all
  const list = (asked.data?.projects ?? []).filter((p) => !p.decided);
  const limit = asked.data?.limit ?? 3;
  const minNote = asked.data?.minNote ?? 20;
  const wait = asked.data?.sendAfterMinutes ?? 30;
  // Locked while a saved request waits or after it's sent, until Edit; open when there's none
  const locked = Boolean(saved) && !editing;
  // The chosen projects: as saved, or as picked while editing; with nothing saved and one project, that one
  const unsent = list.filter((p) => !p.sentAt);
  const start = saved?.projects ?? (unsent.length === 1 ? [unsent[0]!.key] : list.length === 1 ? [list[0]!.key] : []);
  const chosen = (picked ?? start).filter((k) => list.some((p) => p.key === k));
  const short = prospect ? list.filter((p) => chosen.includes(p.key) && p.outline.missing.length > 0) : [];
  const shownNote = locked ? saved?.note ?? "" : note;
  const noteProblem = note.trim() ? assessmentNoteProblem(note) : undefined;
  const ready = chosen.length > 0 && Boolean(note.trim()) && !noteProblem;
  // Why the button is off, shown beside it and tied to it for a screen reader
  const blocker = askBlocker({ chosen: chosen.length, several: list.length > 1, note, noteProblem });
  const toggle = (key: string) => setPicked(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key].slice(-limit));
  const callAsked = requestOpen(asked.data?.call?.at, "call") ? asked.data!.call! : undefined;
  const intro = prospect
    ? "An assessment is free: my read of what's written here, plausible approaches, and the first questions to settle."
    : "An assessment is my read of what's written here, plausible approaches, and the first questions to settle, before any options or prices.";
  const call = !prospect
    ? <span className="muted small next-call">Rather talk it through? <Link to="/contact">Contact neon1</Link></span>
    : callAsked
      ? <span className="small next-call" role="status">Call requested {dateLabel(callAsked.at)}. I'll reply by email. You can ask again from {dateLabel(callAsked.again)}.</span>
      : <span className="muted small next-call">Rather talk first? <OutLink href={BOOK_A_CALL}>Book a 30-minute call</OutLink> or <button type="button" className="linkish" onClick={() => { setError(""); setCallOpen(true); }}>ask me to reach out</button>.</span>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["requests", orgId] });

  const startEdit = () => {
    setNote(saved?.note ?? "");
    setPicked(saved?.projects);
    setError("");
    setEditing(true);
  };
  const save = async () => {
    setReview(false);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ state: string; dueAt: string }>(`/t/${orgId}/requests/assessment`, { method: "PUT", body: { note, projects: chosen } });
      setEditing(false);
      setPicked(undefined);
      toast(r?.state === "sent" ? "Sent. I'll reply by email." : `Saved. It goes to me at ${new Date(r?.dueAt ?? Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} unless you change it.`);
    } catch (e) {
      setError(problem(e));
    }
    await refresh();
    setBusy(false);
  };
  const withdraw = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/t/${orgId}/requests/assessment`, { method: "DELETE" });
      toast(saved?.sentAt ? "Withdrawn. What was sent before still stands." : "Withdrawn. Nothing was sent.");
    } catch (e) {
      setError(problem(e));
    }
    await refresh();
    setBusy(false);
  };
  const askCall = async () => {
    setCallOpen(false);
    setBusy(true);
    setError("");
    try {
      await api(`/t/${orgId}/requests`, { method: "POST", body: { kind: "call", note: callNote, key: (callKey.current ||= crypto.randomUUID().replace(/-/g, "")) } });
      callKey.current = "";
      setCallNote("");
      toast("Call requested. I'll reply by email.");
    } catch (e) {
      // An answer that says it's already asked is an answer, not something to retry under the same key
      if (e instanceof HttpError && e.status === 409) callKey.current = "";
      setError(problem(e));
    }
    await refresh();
    setBusy(false);
  };

  function callDialog() {
    return (
      <Dialog open={callOpen} onClose={() => setCallOpen(false)} label="Ask for a call" className="ask">
        <h2>Ask me to reach out</h2>
        <p className="muted small">I'll reply by email to set a time. Once it's sent, you can ask again from {dateLabel(requestAgainAt(new Date().toISOString(), "call"))}.</p>
        <label className="field-label" htmlFor="call-note">Good times, or what you'd like to cover (optional)</label>
        <textarea id="call-note" rows={3} maxLength={NOTE_MAX} value={callNote} onChange={(e) => setCallNote(e.target.value)} />
        <div className="actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void askCall()}>Submit request</button>
          <button className="btn btn-ghost" type="button" onClick={() => setCallOpen(false)}>Cancel</button>
        </div>
      </Dialog>
    );
  }

  // A client with nothing waiting for an assessment: no card. Free accounts always see it
  if (!prospect && (!asked.data || (list.length === 0 && !saved))) return null;
  // Nothing outlined yet: the card says what comes first, dimmed until there's something to assess
  if (asked.data && list.length === 0) {
    return (
      <section className="card next-step-ask is-waiting" aria-labelledby="next-step-h" data-tour="next-step-ask">
        <h2 className="section-h" id="next-step-h">Next step</h2>
        <p className="ns-note">You can outline up to {limit} <Link to={`${base}/projects`}>projects</Link>, after which you can request an assessment for any or all right here. Time spent defining your needs before an assessment pays off on our call.</p>
        <p>{intro}</p>
        <div className="actions next-actions">
          <Link className="btn btn-primary btn-sm" to={`${base}/projects/new`}>Start a project</Link>
          {call}
        </div>
        {callDialog()}
      </section>
    );
  }

  // Where the request stands, in a sentence
  const status = !saved || editing ? ""
    : saved.state === "waiting"
      ? `Saved ${whenLabel(saved.editedAt)}. It goes to me at ${whenLabel(saved.dueAt)}, ${wait} minutes after your last change. Edit it as often as you like until then.`
      : `Sent ${whenLabel(saved.sentAt)}. I'll reply by email. Edit it to send me an update.`;
  const sentKeys = list.filter((p) => p.sentAt && !(saved?.state === "waiting" && saved.projects.includes(p.key)));

  return (
    <section className={`card next-step-ask${locked ? " is-locked" : ""}`} aria-labelledby="next-step-h" aria-busy={asked.isPending} data-tour="next-step-ask">
      <h2 className="section-h" id="next-step-h">Next step</h2>
      {prospect && <p className="ns-note">You can outline up to {limit} <Link to={`${base}/projects`}>projects</Link>, after which you can request an assessment for any or all right here. Time spent defining your needs before an assessment pays off on our call.</p>}
      <p>{intro}</p>
      {/* A free account: one line per project, how far along it is, and what would help most */}
      {prospect && list.length > 0 && (
        <ul className="outline-list" aria-label="How your projects are coming along">
          {list.map((p) => {
            const total = p.outline.have.length + p.outline.missing.length;
            return (
              <li key={p.key} className={p.sentAt ? "sent" : ""}>
                <span className="outline-pick"><span className="mono">{p.key}</span> {p.name}</span>
                <span className="outline-meter" role="img" aria-label={`${p.outline.have.length} of ${total} outlined`}>
                  {Array.from({ length: total }, (_, i) => <i key={i} className={i < p.outline.have.length ? "on" : ""} />)}
                </span>
                <span className="small outline-tip">
                  {p.outline.missing.length
                    ? <><Link to={`${base}/projects/${p.key}`}>Continue</Link><span className="muted"> · Tip: {outlineTip(p.outline.missing)}.</span></>
                    : <><Link to={`${base}/projects/${p.key}`}>Review</Link><span className="muted"> · Fully outlined.</span></>}
                  {p.sentAt && <span className="muted"> Sent for assessment {dateLabel(p.sentAt)}.</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {/* A client keeps it simple: only what was sent, and when */}
      {!prospect && sentKeys.length > 0 && <p className="small" role="status">{keys(sentKeys)} sent for assessment {dateLabel(sentKeys[0]!.sentAt)}.</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      <form className="next-form" onSubmit={(e) => { e.preventDefault(); if (ready && !locked) setReview(true); }}>
        {prospect && !saved && <p className="ns-closing">I see you've outlined {keys(unsent.length ? unsent : list)}. If you're ready for eyes, request the assessment below.</p>}
        <label className="field-label" htmlFor="ask-note">Add some final thoughts, concerns, or requirements you'd like me to keep in mind as I take a look:<sup className="req" aria-hidden="true">*</sup></label>
        <textarea id="ask-note" rows={3} maxLength={NOTE_MAX} required readOnly={locked} aria-readonly={locked} value={shownNote} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(noteProblem)} aria-describedby={noteProblem ? "ask-note-e" : "ask-note-h"} placeholder="e.g. the intake form matters most; we're on Google Workspace; nothing can change during tax season" />
        {noteProblem ? <small id="ask-note-e" className="warn" role="alert">{noteProblem}</small> : !locked && <small id="ask-note-h" className="muted">At least {minNote} characters. It reaches me {wait} minutes after you request it, so you can still change it.</small>}
        <fieldset className="ns-projects" disabled={locked || busy}>
          <legend>{list.length === 1 ? "Project to include" : `Projects to include (up to ${limit})`}</legend>
          {/* One project is the only choice, so it is named, not ticked: a ticked box reads as done */}
          {list.length === 1 ? (
            <p className="ns-one"><span className="mono">{list[0]!.key}</span> {list[0]!.name}</p>
          ) : list.map((p) => (
            <label key={p.key} className="field-label ns-pick">
              <input type="checkbox" checked={chosen.includes(p.key)} onChange={() => toggle(p.key)} />
              <span><span className="mono">{p.key}</span> {p.name}</span>
            </label>
          ))}
          {!locked && list.length > 1 && chosen.length === 0 && <small className="muted">Choose at least one.</small>}
        </fieldset>
        {status && <p className="small next-status" role="status">{status}</p>}
        <div className="actions next-actions">
          {locked
            ? <>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={startEdit}>Edit</button>
                {saved?.state === "waiting" && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void withdraw()}>Withdraw</button>}
              </>
            : <>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || busy} aria-describedby={blocker && !busy ? "ask-why" : undefined}>{busy ? "Saving…" : saved ? "Save changes" : "Request assessment"}</button>
                {blocker && !busy && <span id="ask-why" className="ns-why">{blocker}</span>}
                {editing && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setEditing(false); setPicked(undefined); setError(""); }}>Cancel</button>}
              </>}
          {prospect && list.length < limit && <Link className="btn btn-sm" to={`${base}/projects/new`}>Outline another project</Link>}
          {call}
        </div>
      </form>
      {/* The last look: what's being sent, what could still be added, and when it goes. Everything is optional */}
      <Dialog open={review} onClose={() => setReview(false)} label="Request an assessment" className="ask">
        <h2>{saved ? "Save these changes?" : "Request an assessment?"}</h2>
        <p>I'll read what's written in <b>{listWords(chosen)}</b> and reply by email. Your note:</p>
        <blockquote className="ns-quote">{note}</blockquote>
        {short.length > 0 && (
          <>
            <p className="muted small">Everything else is optional, and I can work with what's written.</p>
            <ul className="small review-list">
              {short.map((p) => <li key={p.key}>You can still optionally {outlineTip(p.outline.missing, 6)} to <Link to={`${base}/projects/${p.key}`} onClick={() => setReview(false)}>{p.key}</Link>.</li>)}
            </ul>
          </>
        )}
        <p className="muted small">It reaches me {wait} minutes after your last change, so you can edit or withdraw it until then. After that, an edit sends me an update.</p>
        <div className="actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void save()}>{short.length ? "Submit request anyway" : "Submit request"}</button>
          <button className="btn btn-ghost" type="button" onClick={() => setReview(false)} autoFocus>Keep editing</button>
        </div>
      </Dialog>
      {callDialog()}
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
