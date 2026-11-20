// apps/web/src/components/NextStep.tsx - Next step, on Home: ask neon1 for an assessment of what's written
// down, or for a call. On a free account it also says how far along each project is (the rubric is
// packages/domain/src/caliber.ts) and what to add. An assessment names its projects and carries a note,
// goes out only after a check, and holds one open request at a time: the API enforces the window
// (routes/requests.ts) and this card says it as it is, with the dates.


import { outlineOf, REQUEST_COOLDOWN_DAYS, REQUEST_PROJECTS_MAX, requestAgainAt, type Outline, type Project } from "@1neon/domain";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { OutLink } from "./OutLink.tsx";
import { useOrg, useSession } from "./Shell.tsx";
import { Dialog, dateLabel, layerSlug, useToast } from "./ui.tsx";
import { api, HttpError } from "../lib/api.ts";
import { problem, qk, useProjects } from "../lib/hooks.ts";
import { outlineStatus, shortNotes, tipPath } from "../lib/outline.ts";
import { BOOK_A_CALL } from "../lib/prospect.ts";
import { read } from "../lib/reads.ts";
import type { ProjectDetail } from "../lib/types.ts";


// One kind's latest request, as GET /requests tells it: while open, `again` is when it can go out again
type Ask = { at: string; by: string; open: boolean; again?: string; projects?: string[] };
type Asked = Partial<Record<"assessment" | "call", Ask>>;
type Kind = "assessment" | "call";

const NOTE_MAX = 1000;
// One word for each live project's level, on its checkbox
const LEVEL = { begun: "begun", ready: "has the basics", strong: "well outlined" } as const;


/** The live projects, and for a free account how far along each is. Reads the same cached project
 * queries the project pages use, so an edit there changes the tips here at once */
function useOutlines(orgId: string, free: boolean) {
  const projects = useProjects(orgId);
  const live = useMemo(() => (projects.data ?? []).filter((p) => !p.deletedAt && !p.archived), [projects.data]);
  const details = useQueries({
    queries: live.map((p) => ({
      queryKey: qk.project(orgId, p.id),
      queryFn: () => read<ProjectDetail>(`/t/${orgId}/projects/${p.id}`, { project: "object", items: "array", docs: "array", edits: "array" }),
      refetchInterval: 15_000,
      enabled: free,
    })),
  });
  const outlines: Outline[] = live.flatMap((p, i) => {
    const d = details[i]?.data;
    return free && d ? [outlineOf(d.project, d.items)] : [];
  });
  // Every project, trashed ones too, so a request made for one that's gone since can still be named
  const names = new Map((projects.data ?? []).map((p) => [p.id, p.key]));
  const loading = projects.isPending || (free && details.some((d) => d.isPending));
  return { live, outlines, names, loading };
}


/** "ABC-1, ABC-2, and XYZ-1" as a sentence part */
const sayKeys = (keys: string[]) => (keys.length <= 2 ? keys.join(" and ") : `${keys.slice(0, -1).join(", ")}, and ${keys.at(-1)}`);


export function NextStep({ orgId, slug, free }: { orgId: string; slug: string; free: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useSession();
  const { canWrite } = useOrg();
  const base = `/o/${slug}`;
  const asked = useQuery({ queryKey: ["requests", orgId], queryFn: () => read<Asked>(`/t/${orgId}/requests`, {}) });
  const { live, outlines, names, loading } = useOutlines(orgId, free);
  const status = outlineStatus(outlines);
  const cap = free ? 3 : REQUEST_PROJECTS_MAX;

  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [noteError, setNoteError] = useState("");
  const [pickError, setPickError] = useState("");
  const [checking, setChecking] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callNote, setCallNote] = useState("");
  const [busy, setBusy] = useState<"" | Kind>("");
  const [error, setError] = useState("");
  // One key per attempt at one request: pressing Send again after a lost reply is the same request
  const keys = useRef<Record<Kind, string>>({ assessment: "", call: "" });
  const keyFor = (kind: Kind) => (keys.current[kind] ||= crypto.randomUUID().replace(/-/g, ""));
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // One project is the obvious choice, so it starts chosen; with several the person picks. A project that
  // goes away (or an older choice that no longer fits) drops out of the choice
  const ids = live.map((p) => p.id).join();
  useEffect(() => {
    setPicked((was) => {
      const kept = new Set([...was].filter((id) => live.some((p) => p.id === id)));
      return live.length === 1 && kept.size === 0 && was.size === 0 ? new Set([live[0]!.id]) : kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const a = asked.data?.assessment;
  const c = asked.data?.call;
  const open = (x?: Ask) => Boolean(x?.open);
  const chosen = live.filter((p) => picked.has(p.id));
  const chosenOutlines = outlines.filter((o) => picked.has(o.id));
  const short = free ? shortNotes(chosenOutlines) : [];
  const projectNames = (list: Project[]) => sayKeys(list.map((p) => p.key));

  const toggle = (id: string) => {
    setPickError("");
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else if (next.size < cap) next.add(id);
      return next;
    });
  };

  // The note and a project are what an assessment needs; say which is missing, where it goes
  const review = () => {
    setError("");
    const noNote = !note.trim();
    const noPick = picked.size === 0;
    setNoteError(noNote ? "Add a few words for me to keep in mind before you send it." : "");
    setPickError(noPick ? "Choose at least one project." : "");
    if (noNote) noteRef.current?.focus();
    else if (!noPick) setChecking(true);
  };

  const send = async (kind: Kind) => {
    setBusy(kind);
    setError("");
    try {
      await api(`/t/${orgId}/requests`, { method: "POST", body: kind === "assessment" ? { kind, note, projects: [...picked], key: keyFor(kind) } : { kind, note: callNote, key: keyFor(kind) } });
      keys.current[kind] = "";
      if (kind === "assessment") { setNote(""); setChecking(false); } else { setCallNote(""); setCallOpen(false); }
      toast(kind === "assessment" ? "Assessment requested. I'll reply by email." : "Call requested. I'll reply by email.");
    } catch (e) {
      // A refusal that says it's already asked is an answer, not a failure to retry: the card shows it
      if (e instanceof HttpError && e.status === 409) keys.current[kind] = "";
      setError(problem(e));
      setChecking(false);
      setCallOpen(false);
    }
    await qc.invalidateQueries({ queryKey: ["requests", orgId] });
    setBusy("");
  };

  const again = (x: Ask) => dateLabel(x.again ?? requestAgainAt(x.at));
  // What the person is told the window is, before they send: the same seven days the API holds
  const windowEnds = dateLabel(requestAgainAt(new Date().toISOString()));
  const forProjects = (x: Ask) => {
    const keysOf = (x.projects ?? []).flatMap((id) => (names.get(id) ? [names.get(id)!] : []));
    return keysOf.length ? ` for ${sayKeys(keysOf)}` : "";
  };

  return (
    <section className="card next-step-ask" aria-labelledby="next-step-h" aria-busy={loading}>
      <h2 className="section-h" id="next-step-h">Next step</h2>
      {free && <p className="muted small">You can outline up to 3 <Link to={`${base}/projects`}>projects</Link>. Then ask for a free assessment of any or all of them right here. Time spent defining what you need first pays off on the call.</p>}
      <p className="ns-what">An assessment is free: my read of what's written here, plausible approaches, and the first questions to settle.</p>
      {error && <p className="notice" role="alert">{error}</p>}

      {/* How far along each project is, and the one thing to add next */}
      {free && live.length === 0 && !loading && (
        <p className="ns-lines-empty">You haven't outlined a project yet. <Link to={`${base}/projects/new`}>Start one</Link>, even a few lines.</p>
      )}
      {free && (status.lines.length > 0 || status.strong) && (
        <ul className="ns-lines" aria-label="How your projects are coming along">
          {status.lines.map((l) => (
            <li key={l.outline.id}>
              <span className="ns-lead">{l.lead}</span>
              <Link to={tipPath(base, l.outline, l.next, layerSlug)}>Continue</Link>
              {l.tip && <small className="muted">{l.tip}</small>}
            </li>
          ))}
          {status.strong && (
            <li>
              <span className="ns-lead">{status.strong.text}</span>
              <Link to={status.strong.outlines.length === 1 ? tipPath(base, status.strong.outlines[0]!, undefined, layerSlug) : `${base}/projects`}>Review {status.strong.outlines.length === 1 ? "it" : "them"}</Link>
            </li>
          )}
        </ul>
      )}

      {open(a) ? (
        // Asked, and the window hasn't ended: the state, said as it is, and nothing to press
        <div className="ns-asked" role="status">
          <p><b>Assessment requested {dateLabel(a!.at)}</b>{forProjects(a!)}. I'll reply by email. You can ask again from {again(a!)}.</p>
          <p className="muted small">What you add to these projects before I read them is what I'll see.</p>
        </div>
      ) : canWrite && (!free || live.length > 0) ? (
        <form className="ns-form" onSubmit={(e) => { e.preventDefault(); review(); }} noValidate>
          {free && <p className="ns-closing">{status.closing}</p>}
          <label className="field-label ns-label" htmlFor="ask-note">Add some final thoughts, concerns, or requirements you'd like me to keep in mind as I take a look:</label>
          <textarea ref={noteRef} id="ask-note" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setNoteError(""); }} aria-required="true" aria-invalid={Boolean(noteError)} aria-describedby={noteError ? "ask-note-e" : undefined} />
          {noteError && <small id="ask-note-e" className="field-error" role="alert">{noteError}</small>}
          {live.length > 0 && (
            <fieldset className="ns-projects" aria-describedby={pickError ? "ask-pick-e" : undefined}>
              <legend>{live.length === 1 ? "Project to include" : "Projects to include"}</legend>
              {live.map((p) => {
                const o = outlines.find((x) => x.id === p.id);
                return (
                  <label key={p.id} className="field-label ns-pick">
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} disabled={!picked.has(p.id) && picked.size >= cap} />
                    <span><span className="mono">{p.key}</span> {p.name}{o && <small className="tag">{LEVEL[o.level]}</small>}</span>
                  </label>
                );
              })}
              {pickError && <small id="ask-pick-e" className="field-error" role="alert">{pickError}</small>}
            </fieldset>
          )}
          <div className="actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={Boolean(busy)}>Request assessment</button>
          </div>
          {a && <p className="muted small">Last asked {dateLabel(a.at)}{forProjects(a)}.</p>}
        </form>
      ) : null}

      {/* For people who'd rather talk first: a booked call, or a request that I reach out */}
      <div className="ns-call">
        <h3 className="ns-sub">Rather start with a call?</h3>
        <p className="muted small">Book a free 30-minute call, or ask me to reach out. Other ways to reach me are on <Link to="/contact">Contact</Link>.</p>
        <div className="actions">
          <OutLink className="btn btn-sm" href={BOOK_A_CALL}>Book a call</OutLink>
          {canWrite && !open(c) && <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => { setError(""); setCallOpen(true); }}>Ask for a call</button>}
        </div>
        {open(c) && <p className="small" role="status"><b>Call requested {dateLabel(c!.at)}.</b> I'll reply by email. You can ask again from {again(c!)}.</p>}
      </div>

      {/* The check before an assessment goes: what's being sent, what's still thin, and the window */}
      <Dialog open={checking} onClose={() => setChecking(false)} label="Check your assessment request">
        <h2>Request an assessment?</h2>
        <p>I'll read what's written in <b>{projectNames(chosen)}</b> and reply by email to {me.user.email}. Your note:</p>
        <blockquote className="ns-quote">{note}</blockquote>
        {short.length > 0 && (
          <div className="notice small ns-short" role="note">
            <div>
              <b>Some of this is still short.</b>
              <ul>
                {short.map((n) => <li key={n.key}>{n.text} <Link to={`${base}/projects/${n.key}`} onClick={() => setChecking(false)}>Open {n.key}</Link></li>)}
              </ul>
            </div>
          </div>
        )}
        <p className="muted small">Once it's sent, you can ask again from {windowEnds}, {REQUEST_COOLDOWN_DAYS} days from now. Changes you make before I read it are what I'll see.</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy === "assessment"} onClick={() => void send("assessment")}>{busy === "assessment" ? "Sending…" : short.length ? "Submit request anyway" : "Send request"}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setChecking(false)}>Keep editing</button>
        </div>
      </Dialog>

      <Dialog open={callOpen} onClose={() => setCallOpen(false)} label="Ask for a call">
        <h2>Ask for a call</h2>
        <p className="muted small">I'll reply by email to {me.user.email} to set a time. You can ask again from {windowEnds}.</p>
        <label htmlFor="call-note">Good times, or what you'd like to cover (optional)</label>
        <textarea id="call-note" rows={3} maxLength={NOTE_MAX} value={callNote} onChange={(e) => setCallNote(e.target.value)} />
        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-primary" disabled={busy === "call"} onClick={() => void send("call")}>{busy === "call" ? "Sending…" : "Send request"}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setCallOpen(false)}>Cancel</button>
        </div>
      </Dialog>
    </section>
  );
}
