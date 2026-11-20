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
import { listWords, messageProblem, outlineTip, type Outline } from "@1neon/domain";
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
    <section className="card guide-card" aria-labelledby="guide-h">
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


// Next step's answer from routes/requests.ts: when each kind was last asked, and the open projects
type RequestProject = { key: string; name: string; outline: Outline; sentAt?: string };
type Asked = { assessment?: { at: string }; call?: { at: string }; projects: RequestProject[]; limit: number };
// A project sent this recently is still with neon1 (routes/requests.ts RESEND_MS)
const RESEND_MS = 14 * 24 * 60 * 60 * 1000;
const waiting = (p: RequestProject) => Boolean(p.sentAt) && Date.now() - Date.parse(p.sentAt!) < RESEND_MS;
const keys = (list: RequestProject[]) => listWords(list.map((p) => p.key));


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


/** Next step, on Home: outline projects, then ask neon1 to assess any or all of them. The note is
 * required, the projects are chosen by checkbox, and a project that could say more gets one last look
 * before it goes. A call is the other way in, for anyone who'd rather talk first */
export function NextStep({ orgId, slug, prospect }: { orgId: string; slug: string; prospect: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const asked = useQuery({ queryKey: ["requests", orgId], queryFn: () => read<Asked>(`/t/${orgId}/requests`, { projects: "array" }) });
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const base = `/o/${slug}`;
  const list = asked.data?.projects ?? [];
  const limit = asked.data?.limit ?? 3;
  const open = list.filter((p) => !waiting(p));
  const sent = list.filter(waiting);
  // Everything not yet sent starts checked, up to the limit, until the person changes it
  const chosen = (picked ?? open.slice(0, limit).map((p) => p.key)).filter((k) => open.some((p) => p.key === k));
  const short = list.filter((p) => chosen.includes(p.key) && p.outline.missing.length > 0);
  const noteProblem = note.trim() ? messageProblem(note) : undefined;
  const ready = chosen.length > 0 && Boolean(note.trim()) && !noteProblem;
  const toggle = (key: string) => setPicked(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key].slice(-limit));
  const intro = "The assessment is free: my read of what's written here, plausible approaches, and the first questions to settle. I read it before we talk.";
  const call = <span className="muted small next-call">Rather talk first? <OutLink href={BOOK_A_CALL}>Book the free 30-minute call</OutLink></span>;

  const send = async () => {
    setReview(false);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ projects: string[] }>(`/t/${orgId}/requests`, { method: "POST", body: { kind: "assessment", note, projects: chosen } });
      setNote("");
      setPicked(undefined);
      await qc.invalidateQueries({ queryKey: ["requests", orgId] });
      toast(`Sent ${listWords(r?.projects ?? chosen)} for assessment. You'll get a reply by email.`);
    } catch (e) {
      setError(problem(e));
    }
    setBusy(false);
  };

  // Nothing outlined yet: the card says what comes first, dimmed until there's something to assess
  if (asked.data && list.length === 0) {
    return (
      <section className="card next-step-ask is-waiting" aria-labelledby="next-step-h">
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

  return (
    <section className="card next-step-ask" aria-labelledby="next-step-h" aria-busy={asked.isPending}>
      <h2 className="section-h" id="next-step-h">Next step</h2>
      {list.length > 0 && <p>{outlineLine(open.length ? open : list)}{open.length > 0 && " When you're ready for a second pair of eyes, ask for the assessment below."}</p>}
      {list.length > 0 && (
        <ul className="outline-list">
          {list.map((p) => {
            const isSent = waiting(p);
            const total = p.outline.have.length + p.outline.missing.length;
            return (
              <li key={p.key} className={isSent ? "sent" : ""}>
                <label className="outline-pick">
                  <input type="checkbox" disabled={isSent || busy} checked={isSent || chosen.includes(p.key)} onChange={() => toggle(p.key)} />
                  <span><span className="mono">{p.key}</span> {p.name}</span>
                </label>
                <span className="outline-meter" role="img" aria-label={`${p.outline.have.length} of ${total} outlined`}>
                  {Array.from({ length: total }, (_, i) => <i key={i} className={i < p.outline.have.length ? "on" : ""} />)}
                </span>
                <span className="small outline-tip">
                  {isSent
                    ? <>Sent {dateLabel(p.sentAt)}. The reply comes by email.</>
                    : p.outline.missing.length
                      ? <><Link to={`${base}/projects/${p.key}`}>Continue</Link><span className="muted"> · Tip: {outlineTip(p.outline.missing)}.</span></>
                      : <><Link to={`${base}/projects/${p.key}`}>Review</Link><span className="muted"> · Fully outlined.</span></>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
      {open.length > 0 ? (
        <form className="next-form" onSubmit={(e) => { e.preventDefault(); if (!ready) return; if (short.length) setReview(true); else void send(); }}>
          <label className="field-label" htmlFor="ask-note">Final thoughts, concerns, or requirements to keep in mind as I take a look<sup className="req" aria-hidden="true">*</sup></label>
          <textarea id="ask-note" rows={3} maxLength={2000} required value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(noteProblem)} aria-describedby={noteProblem ? "ask-note-e" : undefined} placeholder="e.g. the intake form matters most; we're on Google Workspace; nothing can change during tax season" />
          {noteProblem && <small id="ask-note-e" className="warn" role="alert">{noteProblem}</small>}
          <div className="actions next-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || busy}>{busy ? "Sending…" : chosen.length > 1 ? `Request assessment of ${chosen.length} projects` : "Request assessment"}</button>
            {call}
          </div>
        </form>
      ) : (
        <div className="actions next-actions">
          {prospect && list.length < limit && <Link className="btn btn-sm" to={`${base}/projects/new`}>Outline another project</Link>}
          {call}
        </div>
      )}
      <p className="muted small">{intro}</p>
      {sent.length > 0 && open.length > 0 && <p className="muted small" role="status">{`${keys(sent)} ${sent.length === 1 ? "was" : "were"} sent ${dateLabel(sent[0]!.sentAt)}.`}</p>}
      {/* One last look when a chosen project could say more: what's still optional, and a way to add it */}
      <Dialog open={review} onClose={() => setReview(false)} label="Before it goes" className="ask">
        <h2>Before it goes</h2>
        <p className="muted small">Everything here is optional, and I can work with what's written. If you'd like to add more first:</p>
        <ul className="small review-list">
          {short.map((p) => <li key={p.key}>You can still {outlineTip(p.outline.missing, 6)} to <Link to={`${base}/projects/${p.key}`} onClick={() => setReview(false)}>{p.key}</Link>.</li>)}
        </ul>
        <div className="actions">
          <button className="btn btn-primary" type="button" onClick={() => void send()}>Send it anyway</button>
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
