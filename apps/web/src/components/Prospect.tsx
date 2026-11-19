// apps/web/src/components/Prospect.tsx - What a new (prospect) account sees: a calm note on its
// workspace, and the account-level check for things that never open for it (Neo, texts).


import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { OutLink } from "./OutLink.tsx";
import { api } from "../lib/api.ts";
import { problem } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";
import { dateLabel, useToast } from "./ui.tsx";
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
      <span>You're set up as a free account. Write down what your projects need, then ask for an assessment under Next step and book the 30-minute call. Other ways to reach neon1 are on <Link to="/contact">Contact</Link>.</span>
    </p>
  );
}


// When each kind was last asked for, by kind
type Asked = Partial<Record<"assessment" | "call", { at: string }>>;


/** Next step, on Home: ask neon1 for an assessment of what's written down, or for a call. Each sends neon1
 * an email (routes/requests.ts) and then says when it was asked */
export function NextStep({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const asked = useQuery({ queryKey: ["requests", orgId], queryFn: () => read<Asked>(`/t/${orgId}/requests`, {}) });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "assessment" | "call">("");
  const [error, setError] = useState("");
  const ask = async (kind: "assessment" | "call") => {
    setBusy(kind);
    setError("");
    try {
      await api(`/t/${orgId}/requests`, { method: "POST", body: { kind, note } });
      setNote("");
      await qc.invalidateQueries({ queryKey: ["requests", orgId] });
      toast("Assessment requested. You'll get a reply by email.");
    } catch (e) {
      setError(problem(e));
    }
    setBusy("");
  };
  const when = (kind: "assessment" | "call") => asked.data?.[kind]?.at;
  return (
    <section className="card next-step-ask" aria-labelledby="next-step-h">
      <h2 className="section-h" id="next-step-h">Next step</h2>
      <p className="muted small">The assessment is free: my read of what's written here, with a likely approach and the first questions to settle. Ask for it, then book the free 30-minute call, which is about your needs. I read the assessment request before we talk.</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <label className="field-label" htmlFor="ask-note">Anything to look at first, or good times to talk <span className="muted">(optional)</span></label>
      <textarea id="ask-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => void ask("assessment")}>{busy === "assessment" ? "Sending…" : "Ask for an assessment"}</button>
        <OutLink className="btn btn-sm" href={BOOK_A_CALL}>Book the 30-minute call</OutLink>
      </div>
      {when("assessment") && (
        <p className="muted small" role="status">
          {`Assessment asked for ${dateLabel(when("assessment"))}`}. The reply comes by email.
        </p>
      )}
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
